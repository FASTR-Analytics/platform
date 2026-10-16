// Screen recordings of the demo instance for the demo video, driven through
// the Playwright MCP: pass this file as `filename` to browser_run_code_unsafe
// with SNIPPET set to the take you want. The runner has no `require`, so the
// whole script is one self-contained function. The take lands as a .webm
// under src/_rec/<take>/; ffmpeg with `-ss 2.0` (the page load) turns it into
// snippets/<take>.mp4.
(async (page) => {
  const SNIPPET = "explore"; // explore | results_wizard | data | scheduled_import
  // The demo instance. Sign in once in the Playwright browser window; each
  // recording context inherits that session through the copied cookies.
  const APP = "https://demo-v2-testing.fastr-analytics.org/";

  // Runs before the app: expands the nav rail (collapsed by default in a
  // fresh profile), hides the onboarding tours, and draws a cursor that
  // follows the mouse, since headless video has none.
  const INIT = `(() => {
    try { localStorage.setItem('navCollapsed', 'false'); } catch {}
    const css = '[class*="roadtrip-"]{display:none!important;pointer-events:none!important}';
    const addStyle = () => { if (!document.head) return false; const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); return true; };
    if (!addStyle()) document.addEventListener('DOMContentLoaded', addStyle);
    const hide = (el) => { el.style.setProperty('display', 'none', 'important'); el.style.setProperty('pointer-events', 'none', 'important'); };
    const zap = (root) => { if (root.nodeType !== 1) return; if (String(root.className || '').includes('roadtrip-')) hide(root); for (const el of root.querySelectorAll('[class*="roadtrip-"]')) hide(el); };
    new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) zap(n); }).observe(document.documentElement, { childList: true, subtree: true });
    const c = document.createElement('div');
    c.id = '__cur';
    c.style.cssText = 'position:fixed;left:-50px;top:-50px;width:26px;height:26px;z-index:2147483647;pointer-events:none;';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 3l14 9-6 1.5L16.5 20l-2.5 1-3.5-6.5L6 18z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    const mount = () => { if (document.body && !document.getElementById('__cur')) document.body.appendChild(c); };
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  })();`;

  const browser = page.context().browser();
  for (const c of browser.contexts()) {
    if (c !== page.context()) await c.close().catch(() => {});
  }
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: `demo_video/src/_rec/${SNIPPET}`,
      size: { width: 1920, height: 1080 },
    },
  });
  await ctx.addCookies(await page.context().cookies());
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  const dlg = () => p.getByRole("dialog");
  const wait = (ms) => p.waitForTimeout(ms);
  const glide = (x, y, ms = 600) =>
    p.mouse.move(x, y, { steps: Math.max(10, Math.round(ms / 16)) });
  const clickOn = async (loc, ms = 600) => {
    await loc.waitFor({ state: "visible", timeout: 20000 });
    const b = await loc.boundingBox();
    await glide(b.x + b.width / 2, b.y + b.height / 2, ms);
    await wait(200);
    await p.mouse.down();
    await wait(70);
    await p.mouse.up();
  };
  const hoverOn = async (loc, ms = 500) => {
    const b = await loc.boundingBox();
    await glide(b.x + Math.min(b.width / 2, 160), b.y + b.height / 2, ms);
  };
  // Native selects open an OS popup the video cannot see, so the cursor goes
  // to the control and the value is set directly.
  const pick = async (sel, label, ms = 700) => {
    const b = await sel.boundingBox();
    if (b) await glide(b.x + b.width / 2, b.y + b.height / 2, ms);
    await wait(300);
    await sel.selectOption({ label });
  };
  const nav = (name) => p.getByText(name, { exact: true }).first();
  const btn = (name) => p.getByRole("button", { name, exact: true });
  const tickRows = async (ids) => {
    for (const id of ids) {
      await clickOn(
        dlg().locator("tr", { hasText: id }).first().locator(
          "input[type=checkbox]",
        ).first(),
        450,
      );
      await wait(350);
    }
  };

  const takes = {
    explore: async () => {
      await clickOn(nav("Explore"), 800);
      await wait(4000);
      await glide(600, 420, 900);
      await wait(600);
      await glide(1300, 520, 1200);
      await wait(1200);
      await clickOn(btn("Over time"), 900);
      await wait(4000);
      await glide(1000, 700, 600);
      await p.mouse.wheel(0, 600);
      await wait(1800);
      await p.mouse.wheel(0, -600);
      await wait(1200);
      await clickOn(btn("Table"), 800);
      await wait(2000);
      await clickOn(nav("Indicator values"), 800);
      await wait(900);
      await clickOn(
        p.getByText("Data quality assessment", { exact: true }).last(),
        700,
      );
      await wait(4500);
      await glide(700, 450, 900);
      await wait(1500);
      await clickOn(btn("Over time"), 900);
      await wait(4500);
      await glide(1100, 650, 800);
      await wait(1500);
    },
    results_wizard: async () => {
      await clickOn(nav("Results"), 800);
      await wait(3000);
      await glide(700, 262, 800);
      await wait(1200);
      await glide(1640, 262, 900);
      await wait(1200);
      await clickOn(
        p.getByRole("button", { name: /Generate new results package/ }),
        900,
      );
      await wait(2500);
      await hoverOn(p.getByText("HMIS data", { exact: true }).first(), 700);
      await wait(1200);
      await clickOn(btn("Next"), 800);
      await wait(2000);
      for (
        const t of [
          "Indicator values",
          "Data quality adjustments",
          "Disruption detection",
          "Coverage estimates",
        ]
      ) {
        await hoverOn(p.getByText(t, { exact: true }).first(), 600);
        await wait(700);
      }
      await wait(800);
      await clickOn(btn("Next"), 800);
      await wait(2500);
      await hoverOn(p.getByText("Modules", { exact: true }).last(), 600);
      await wait(1500);
      await hoverOn(p.getByRole("button", { name: /Launch generation/ }), 800);
      await wait(1800);
      await clickOn(btn("Cancel"), 700);
      await wait(1500);
    },
    data: async () => {
      await clickOn(nav("Data"), 800);
      await wait(2500);
      await glide(700, 170, 800);
      await wait(500);
      await glide(700, 340, 1400);
      await wait(500);
      await glide(700, 600, 1200);
      await wait(1200);
      await clickOn(nav("Has data"), 900);
      await wait(3000);
      await glide(900, 500, 900);
      await wait(400);
      await glide(1500, 800, 1200);
      await wait(1200);
      await clickOn(btn("By year"), 900);
      await wait(2500);
      await clickOn(btn("By month"), 600);
      await wait(1500);
      await clickOn(p.getByRole("button", { name: "Imports" }), 900);
      await wait(2000);
      await clickOn(p.getByRole("button", { name: "New DHIS2 import" }), 900);
      await wait(2500);
      await tickRows(["cnp1", "cnp4", "BCG", "Penta1", "Penta3"]);
      await wait(800);
      await clickOn(
        dlg().getByRole("button", { name: "Next", exact: true }),
        800,
      );
      await wait(1800);
      await glide(560, 330, 600);
      await wait(1200);
      await clickOn(
        dlg().getByRole("button", { name: "Next", exact: true }),
        800,
      );
      await wait(1800);
      const r0 = dlg().locator("input[type=range]").first();
      const rb = await r0.boundingBox();
      if (rb) {
        await glide(rb.x + 20, rb.y + rb.height / 2, 700);
        await r0.focus();
        for (let i = 0; i < 6; i++) {
          await p.keyboard.press("ArrowRight");
          await wait(140);
        }
        await wait(800);
        for (let i = 0; i < 6; i++) {
          await p.keyboard.press("ArrowLeft");
          await wait(140);
        }
      }
      await wait(1200);
      await clickOn(
        dlg().getByRole("button", { name: "Next", exact: true }),
        800,
      );
      await wait(3000);
      await glide(900, 500, 900);
      await wait(1500);
      await clickOn(
        dlg().getByRole("button", { name: "Cancel", exact: true }),
        700,
      );
      await wait(1200);
    },
    scheduled_import: async () => {
      await clickOn(nav("Data"), 700);
      await wait(2000);
      await clickOn(nav("Has data"), 800);
      await wait(2200);
      await clickOn(p.getByRole("button", { name: "Imports" }), 800);
      await wait(1800);
      await clickOn(nav("Future"), 700);
      await wait(2500);
      await clickOn(p.getByRole("button", { name: "New DHIS2 import" }), 900);
      await wait(2200);
      await tickRows(["cnp1", "cnp4", "Penta1", "Penta3"]);
      await wait(600);
      await clickOn(
        dlg().getByRole("button", { name: "Next", exact: true }),
        800,
      );
      await wait(1600);
      await clickOn(dlg().getByText("Recurring", { exact: true }), 800);
      await wait(1500);
      await pick(
        dlg().locator("select").filter({
          has: p.locator("option", { hasText: "Monthly" }),
        }).first(),
        "Monthly",
        800,
      );
      await wait(1800);
      const tz = dlg().locator("select").filter({
        has: p.locator("option", { hasText: "Africa/Maputo" }),
      }).first();
      if (await tz.count()) {
        await pick(tz, "Africa/Maputo", 800);
        await wait(1200);
      }
      await glide(700, 520, 700);
      await wait(1200);
      await clickOn(
        dlg().getByRole("button", { name: "Next", exact: true }),
        800,
      );
      await wait(2000);
      await glide(700, 330, 700);
      await wait(1200);
      await clickOn(
        dlg().getByRole("button", { name: "Next", exact: true }),
        800,
      );
      await wait(3000);
      await glide(900, 450, 900);
      await wait(2000);
      await clickOn(
        dlg().getByRole("button", { name: "Cancel", exact: true }),
        700,
      );
      await wait(1200);
    },
  };

  await p.goto(APP, { waitUntil: "networkidle", timeout: 60000 });
  await p.mouse.move(900, 700);
  await wait(1500);
  await takes[SNIPPET]();
  const video = p.video();
  await ctx.close();
  return await video.path();
});
