// Dev-boot self-checks (main.ts, `_IS_DEV` only): the server test suite runs
// on every dev boot and a failure fail-stops the boot, exactly like
// validateAllRoutesDefined. Tests are NOT run in production boots.
//
// A subprocess, not an in-process import: the tests need `BYPASS_AUTH`
// cleared (the credential seam is what several of them exercise), which the
// booting server has set; and `deno test` owns their module graph, so the
// suite the boot runs is byte-for-byte the one `deno task test` runs by hand.
// `deno task test` is the single definition of the command; --no-check keeps
// it ~2 s (their typecheck is `deno task typecheck`'s job).
export async function runServerTestSuiteOrExit(): Promise<void> {
  console.log("🧪 Running server tests (dev boot)...\n");
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["task", "test"],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  const out = new TextDecoder().decode(stdout);
  const err = new TextDecoder().decode(stderr);
  const summary = out.split("\n").findLast((l) => /passed|failed/.test(l)) ??
    "(no summary line)";
  if (code !== 0) {
    console.error(out);
    console.error(err);
    console.error(
      "💥 Server tests failed at dev boot — fix them (or run `deno task test` alone) before continuing.\n",
    );
    Deno.exit(1);
  }
  const skipped = out.split("\n").filter((l) => l.includes("SKIPPED"));
  for (const line of skipped) console.warn(`   ⚠️  ${line.trim()}`);
  console.log(`✅ Server tests: ${summary.trim()}\n`);
}
