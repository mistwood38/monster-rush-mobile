// Run alone, after other browser jobs. Software WebGL measurements are not Android FPS.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { open } = require("./horde-harness.cjs");
const dir = path.resolve(__dirname, "../test-results/horde");
fs.mkdirSync(dir, { recursive: true });
async function observe(page, frames = 50) {
  return page.evaluate(async (frames) => {
    const ms = [];
    let last = performance.now();
    for (let i = 0; i < frames + 5; i++)
      await new Promise((resolve) =>
        requestAnimationFrame((now) => {
          if (i >= 5) ms.push(now - last);
          last = now;
          resolve();
        }),
      );
    const a = [...ms].sort((a, b) => a - b);
    return {
      frames: ms.length,
      meanFrameMs: ms.reduce((a, b) => a + b) / ms.length,
      p95FrameMs: a[Math.floor(a.length * 0.95)],
      observedFps: (1000 * ms.length) / ms.reduce((a, b) => a + b),
      ...__MR_TEST__.metrics(),
      horde: __MR_TEST__.hordeReport?.(),
      model: __MR_TEST__.modelAudit?.(),
    };
  }, frames);
}
async function run(root, label) {
  const h = await open({ width: 393, height: 873 }, root);
  try {
    const renderer = await h.page.evaluate(() => {
      const gl = document.querySelector("#game").getContext("webgl2"),
        e = gl.getExtension("WEBGL_debug_renderer_info");
      return gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    });
    const rows = [];
    for (const count of label === "old-5b01820" ? [32] : [32, 160, 240, 320]) {
      await h.page.evaluate(async (count) => {
        const t = __MR_TEST__;
        await t.start();
        await t.silence();
        t.freeze();
        t.setQuality?.(0, true);
        t.configure({
          time: 240,
          spawnTimer: 999,
          gateTimer: 999,
          crateTimer: 999,
          nextBoss: 9999,
          shootTimer: 999,
        });
        t.runModel().nextDraft = t.runModel().eventTimer = 9999;
        for (const r of ["assault", "heavy", "guard", "assault"]) t.recruit(r);
        t.step(0.025);
        for (let i = 0; i < count; i++)
          t.spawnEnemy(
            ["grunt", "runner", "heavy", "charger", "ranged", "elite"][i % 6],
            ((i % 10) - 4.5) * 1.05,
            -3 - Math.floor(i / 10) * 1.7,
          );
        t.collectReward({ type: "lanes", amount: 2 });
        t.collectReward({ type: "pellets", amount: 2 });
        for (let i = 0; i < 30; i++) t.fire();
        t.emit(0, 1, -6, "#aff", 64);
        t.renderFrame?.();
      }, count);
      await h.page.waitForTimeout(150);
      const before = await h.page.evaluate(() => __MR_TEST__.state());
      const row = await observe(h.page);
      rows.push({
        scenario: "frozen rendering only",
        requestedEnemies: count,
        actualEnemies: before.enemies,
        ...row,
      });
      await h.page.screenshot({
        path: path.join(dir, `performance-${label}-${count}.png`),
      });
    }
    if (label !== "old-5b01820") {
      // Frozen same 240 live enemies, three DPR/animation/particle tiers; no deletion allowed.
      const quality = [];
      for (const tier of [0, 1, 2]) {
        await h.page.evaluate(
          (tier) => __MR_TEST__.setQuality(tier, true),
          tier,
        );
        quality.push({ tier, ...(await observe(h.page, 35)) });
      }
      rows.push({ scenario: "quality tiers on same 320 live actors", quality });
      await h.page.evaluate(() => {
        const t = __MR_TEST__;
        t.setQuality(0, false);
        t.configure({ shootTimer: 0, hp: 100 });
        t.setWeapon("machine", true);
        window.perfTimer = setInterval(() => {
          t.configure({ hp: 100 });
          t.setTarget(Math.sin(t.state().time * 0.8) * 3.8);
          if (t.state().mode === "draft")
            document.querySelector("#skipDraft").click();
        }, 100);
        t.freeze(false);
      });
      const dynamic = await observe(h.page, 100);
      await h.page.evaluate(() => {
        clearInterval(perfTimer);
        __MR_TEST__.freeze();
      });
      rows.push({
        scenario: "real rAF movement, shooting, collision and AI; HP restored",
        ...dynamic,
      });
    }
    assert.deepEqual(h.errors, []);
    return { label, renderer, viewport: "393x873", rows, errors: h.errors };
  } finally {
    await h.close();
  }
}
(async () => {
  const runs = [await run(path.resolve(__dirname, ".."), "rework")];
  if (process.env.BASELINE_ROOT)
    runs.push(await run(process.env.BASELINE_ROOT, "old-5b01820"));
  fs.writeFileSync(
    path.join(dir, "performance-results.json"),
    JSON.stringify(
      {
        limitation:
          "Isolated cloud Chromium/SwiftShader software rasterization. Frozen snapshots, quality-tier render and dynamic frame workloads are separated. No Android hardware, touch latency, thermals or battery verification.",
        runs,
      },
      null,
      2,
    ),
  );
  console.log(
    runs.map((r) => ({
      label: r.label,
      renderer: r.renderer,
      rows: r.rows.map((x) => ({
        scenario: x.scenario,
        count: x.actualEnemies,
        drawCalls: x.drawCalls,
        triangles: x.triangles,
        fps: x.observedFps,
        quality: x.horde?.quality,
      })),
    })),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
