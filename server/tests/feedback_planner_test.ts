import { assert, assertEquals, assertRejects } from "@std/assert";
import { _feedbackPlannerInternals as P } from "../utils/feedback_planner.ts";

async function makeRepo(): Promise<{ root: string; outside: string }> {
  const base = await Deno.realPath(await Deno.makeTempDir());
  const root = `${base}/repo`;
  const outside = `${base}/secret.txt`;
  await Deno.mkdir(`${root}/server/routes`, { recursive: true });
  await Deno.writeTextFile(
    `${root}/server/routes/emails.ts`,
    "line one\nexport function sendHelpEmail() {}\nline three\n",
  );
  await Deno.writeTextFile(`${root}/CLAUDE.md`, "# Docs\n");
  await Deno.writeTextFile(outside, "TOP SECRET\n");
  await Deno.symlink(outside, `${root}/link_out.txt`);
  await Deno.symlink(base, `${root}/link_dir`);
  return { root, outside };
}

Deno.test("feedback planner: tools stay inside the repo copy", async () => {
  const { root } = await makeRepo();
  for (
    const path of [
      "../secret.txt",
      "/../secret.txt",
      "server/../../secret.txt",
      "link_out.txt",
      "link_dir/secret.txt",
    ]
  ) {
    await assertRejects(
      () => P.runTool(root, "read_file", { path }),
      Error,
      undefined,
      path,
    );
  }
  await assertRejects(() => P.runTool(root, "list_dir", { path: ".." }));
  await assertRejects(() =>
    P.runTool(root, "grep", { pattern: "x", path: "../" })
  );

  // grep and find_files never surface the symlinked secret.
  const grep = await P.runTool(root, "grep", { pattern: "TOP SECRET" });
  assertEquals(grep, "No matches.");

  // Leading slash is read as repo-relative.
  const read = await P.runTool(root, "read_file", {
    path: "/server/routes/emails.ts",
    offset: 2,
    limit: 1,
  });
  assert(read.includes("2\texport function sendHelpEmail"), read);
});

Deno.test("feedback planner: grep, list_dir, find_files", async () => {
  const { root } = await makeRepo();
  const grep = await P.runTool(root, "grep", {
    pattern: "sendhelpemail",
    ignore_case: true,
    glob: "*.ts",
  });
  assertEquals(
    grep,
    "server/routes/emails.ts:2: export function sendHelpEmail() {}",
  );
  const list = await P.runTool(root, "list_dir", {});
  assert(list.includes("server/") && list.includes("CLAUDE.md"), list);
  const found = await P.runTool(root, "find_files", { glob: "emails*" });
  assertEquals(found, "server/routes/emails.ts");
  const deep = await P.runTool(root, "find_files", { glob: "server/**/*.ts" });
  assertEquals(deep, "server/routes/emails.ts");
  await assertRejects(() => P.runTool(root, "grep", { pattern: "(" }));
  await assertRejects(() => P.runTool(root, "write_file", { path: "x" }));
});

Deno.test("feedback planner: model output cannot inject HTML", () => {
  const html = P.renderSafeMarkdown(
    [
      "## Plan",
      "<script>alert(1)</script>",
      '<img src="https://evil.example/x.png">',
      "[click](https://evil.example)",
      "1. Edit `emails.ts` **now**",
      "```",
      "<b>code</b>",
      "```",
    ].join("\n"),
  );
  assert(!html.includes("<script"), html);
  assert(!html.includes("<img"), html);
  assert(!html.includes("<a "), html);
  assert(html.includes("&lt;script&gt;"), html);
  assert(html.includes("[click](https://evil.example)"), html);
  assert(html.includes("<h3>Plan</h3>"), html);
  assert(html.includes("<strong>now</strong>"), html);
  assert(html.includes("&lt;b&gt;code&lt;/b&gt;"), html);

  const email = P.buildEmail(
    {
      feedbackType: "bug",
      description: '<img src="x" onerror="alert(1)">',
      userEmail: "user@example.org",
      instanceId: "testing",
      serverVersion: "2.9.3",
      imageCount: 0,
    },
    {
      plan: "TITLE: Fix <b>it</b>\n\n## Triage\nok",
      turns: 3,
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    },
    undefined,
    1000,
  );
  assert(!email.html.includes("<img"), email.html);
  assert(email.subject.endsWith("(testing): Fix <b>it</b>"), email.subject);
  assert(email.html.includes("AI-generated from a user report"), email.html);
  assert(!email.html.includes("TITLE:"), email.html);

  const bold = P.buildEmail(
    {
      feedbackType: "suggestion",
      description: "x",
      userEmail: "user@example.org",
      instanceId: "testing",
      serverVersion: "2.9.3",
      imageCount: 0,
    },
    {
      plan: "**TITLE: Map is blank**\n\n## Verdict\nok",
      turns: 1,
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    },
    undefined,
    1000,
  );
  assert(bold.subject.endsWith("(testing): Map is blank"), bold.subject);
  assert(!bold.html.includes("TITLE:"), bold.html);
});

Deno.test("feedback planner: daily caps", () => {
  const day = new Date("2030-01-01T10:00:00Z");
  assert(P.claimSlot("a@x.org", day));
  assert(P.claimSlot("A@x.org ", day));
  assert(P.claimSlot("a@x.org", day));
  assertEquals(P.claimSlot("a@x.org", day), false, "4th from one reporter");
  for (let i = 0; i < 12; i++) assert(P.claimSlot(`u${i}@x.org`, day));
  assertEquals(P.claimSlot("new@x.org", day), false, "16th on the instance");
  assert(P.claimSlot("a@x.org", new Date("2030-01-02T00:00:01Z")), "resets");
});
