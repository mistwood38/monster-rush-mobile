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
  const network = [];
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().includes("monster-rush-review.html")
    )
      network.push(r.url());
  });
  await page.goto(base + "test-results/monster-rush-review.html?test=1");
  await page.waitForFunction(() => !!window.__MR_TEST__);
  await page.evaluate(() => window.__MR_TEST__.freeze());
  await page.locator("#start").click();
  await page.waitForFunction(() => __MR_TEST__.getAudio().samples === 15);
  const result = await page.evaluate(async () => {
    const t = __MR_TEST__;
    t.freeze();
    await t.silence();
    t.configure({ spawnTimer: 999, gateTimer: 999, crateTimer: 999 });
    t.runModel().nextDraft = t.runModel().eventTimer = 9999;
    t.spawnEnemy("grunt", 0, -8);
    t.step(2);
    t.draft();
    return { state: t.state(), art: t.artStatus(), audio: t.getAudio() };
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".draft-card img")].every(
      (img) => img.naturalWidth > 0,
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  assert.ok(result.state.kills >= 1);
  assert.equal(result.state.mode, "draft");
  assert.deepEqual(result.audio.sampleErrors, []);
  await page.screenshot({ path: path.join(artifacts, "standalone-360.png") });
  fs.writeFileSync(
    path.join(artifacts, "standalone-results.json"),
    JSON.stringify(
      {
        errors,
        network,
        ...result,
        limitation:
          "Self-contained HTML tested over local HTTP with zero external requests. file:// navigation is blocked by the environment administrator; Android file opening has not been tested. The review artifact does not register a PWA service worker.",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS standalone combat, embedded audio and draft icons; no extra network requests",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    server.close();
  });
