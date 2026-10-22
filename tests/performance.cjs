/* Real WebGL/browser regressions. Runtime game has no npm/build requirement. */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "test-results");
fs.mkdirSync(artifacts, { recursive: true });
const results = [],
  errors = [];
const mime = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".webp": "image/webp",
  ".ogg": "audio/ogg",
  ".css": "text/css",
  ".html": "text/html",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const relative = decodeURIComponent(url.pathname).replace(
    /^\/monster-rush-mobile\//,
    "/",
  );
  const file = path.resolve(
    root,
    "." + (relative.endsWith("/") ? relative + "index.html" : relative),
  );
  if (
    !file.startsWith(root + path.sep) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": mime[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(file).pipe(res);
});
let browser;
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/monster-rush-mobile/`;
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(base + "?test=1");
  await page.waitForFunction(() => !!window.__MR_TEST__);
  await page.evaluate(() => window.__MR_TEST__.freeze());
  await page.locator("#start").click();
  await page.evaluate(async () => {
    await __MR_TEST__.silence();
  });
  const report = {
    renderer: await page.evaluate(() => {
      const c = document.querySelector("#game"),
        gl = c.getContext("webgl2"),
        ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        userAgent: navigator.userAgent,
        devicePixelRatio,
        pixelRatio: c.width / c.clientWidth,
        renderer: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      };
    }),
    scenarios: [],
  };
  for (const stress of [false, true]) {
    await page.evaluate(async (stress) => {
      const t = __MR_TEST__;
      await t.start();
      await t.silence();
      t.freeze();
      t.configure({
        spawnTimer: 999,
        gateTimer: 999,
        crateTimer: 999,
        nextBoss: 9999,
        invuln: 999,
      });
      t.runModel().nextDraft = t.runModel().eventTimer = 9999;
      if (stress) {
        for (const role of ["assault", "heavy", "guard", "assault"])
          t.recruit(role);
        t.equipPet("owl");
        t.armor("thunder");
        t.setWeapon("machine", true);
        for (let i = 0; i < 32; i++)
          t.spawnEnemy(
            ["grunt", "runner", "heavy", "charger", "ranged", "elite"][i % 6],
            ((i % 7) - 3) * 1.3,
            -10 - Math.floor(i / 7) * 5,
          );
        t.collectReward({ type: "lanes", amount: 2 });
        t.collectReward({ type: "pellets", amount: 2 });
        t.step(0.025);
        for (let i = 0; i < 30; i++) t.fire();
        t.emit(0, 1, -6, "#aff", 64);
      }
    }, stress);
    await page.waitForTimeout(300);
    report.scenarios.push(
      await page.evaluate(async (stress) => {
        const intervals = [];
        let previous = performance.now();
        for (let i = 0; i < 75; i++)
          await new Promise((resolve) =>
            requestAnimationFrame((now) => {
              if (i >= 5) intervals.push(now - previous);
              previous = now;
              resolve();
            }),
          );
        const sorted = [...intervals].sort((a, b) => a - b),
          average = intervals.reduce((a, b) => a + b, 0) / intervals.length,
          t = __MR_TEST__,
          render = t.metrics(),
          state = t.state();
        const start = performance.now();
        t.step(5);
        const simulationMs = performance.now() - start;
        return {
          scenario: stress
            ? "frozen worst-case render"
            : "frozen initial render",
          frames: intervals.length,
          meanFrameMs: +average.toFixed(2),
          p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
          observedFps: +(1000 / average).toFixed(1),
          drawCalls: render.drawCalls,
          memory: render.memory,
          enemies: state.enemies,
          bullets: state.bullets,
          particles: t.effects().active,
          simulation5SecondsMs: +simulationMs.toFixed(1),
        };
      }, stress),
    );
  }
  assert.deepEqual(errors, []);
  assert.ok(
    report.scenarios[1].bullets <= 160 && report.scenarios[1].enemies === 32,
  );
  assert.ok(report.scenarios[1].drawCalls < 200);
  report.limitation =
    "Cloud Chromium software WebGL; frozen rendering and synchronous simulation timings are separate measurements. This is not Android hardware FPS, input latency, thermal, battery, or full frame workload evidence.";
  fs.writeFileSync(
    path.join(artifacts, "performance-results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    server.close();
  });
