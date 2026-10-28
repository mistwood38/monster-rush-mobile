const fs = require('node:fs');
const assert = require('node:assert/strict');
const { open } = require('./horde-harness.cjs');
const { loadArt, dir } = require('./art-rebuild.cjs');
const counts = (process.env.ART_PERF_COUNTS || '64,160,320').split(',').map(Number);
const qualities = (process.env.ART_PERF_QUALITIES || '0,2').split(',').map(Number);
assert.ok(counts.every(n => Number.isInteger(n) && n > 0 && n <= 320));
assert.ok(qualities.every(n => [0, 1, 2].includes(n)));

// Run alone; another browser test contaminates software-renderer timing.
// Frozen simulation keeps workloads equal. This is not an Android FPS test.
(async () => {
  const h = await open({ width: 393, height: 873 });
  try {
    await loadArt(h);
    const context = await h.page.evaluate(() => {
      const canvas = document.querySelector('canvas'), gl = canvas.getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        userAgent: navigator.userAgent,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        width: canvas.width, height: canvas.height, dpr: devicePixelRatio,
        antialias: gl.getContextAttributes().antialias,
      };
    });
    const rows = [];
    for (const count of counts) for (const quality of qualities) {
      const row = await h.page.evaluate(async ({ count, quality }) => {
        const t = __MR_TEST__;
        await t.start(); await t.silence(); t.freeze(); t.setQuality(quality, true);
        t.configure({ spawnTimer: 999, gateTimer: 999, crateTimer: 999, nextBoss: 9999 });
        t.runModel().nextDraft = t.runModel().eventTimer = 9999;
        for (const role of ['heavy', 'guard', 'assault', 'assault']) t.recruit(role);
        for (let i = 0; i < count; i++)
          t.spawnEnemy(i % 3 === 0 ? 'heavy' : 'grunt', ((i % 10) - 4.5) * 1.05, -7 - Math.floor(i / 10) * 1.25);
        t.step(.025);
        const gl = document.querySelector('canvas').getContext('webgl2');
        const summary = values => {
          values.sort((a, b) => a - b);
          return { samples: values.length, p50: values[Math.ceil(values.length * .5) - 1], p95: values[Math.ceil(values.length * .95) - 1] };
        };
        // The game keeps rendering while frozen. Do not render twice here.
        // Never queue a synchronous batch before this sample: queued work can
        // leak into the next quality tier and invalidate comparisons.
        const intervals = []; let previous = await new Promise(requestAnimationFrame);
        for (let f = 0; f < 40; f++) {
          const stamp = await new Promise(requestAnimationFrame);
          if (f > 9) intervals.push(stamp - previous);
          previous = stamp;
        }
        return {
          count, quality, alive: t.hordeReport().alive, visible: t.hordeReport().visible,
          frozenFrameIntervalMs: summary(intervals),
          renderSize: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
          metrics: t.metrics(), batches: t.modelAudit().batches, contextLost: gl.isContextLost(),
        };
      }, { count, quality });
      assert.equal(row.alive, count);
      assert.equal(row.contextLost, false);
      rows.push(row);
      console.log(JSON.stringify({ count, quality, frameInterval: row.frozenFrameIntervalMs, drawCalls: row.metrics.drawCalls, triangles: row.metrics.triangles, alive: row.alive }));
    }
    assert.deepEqual(h.errors, []);
    fs.writeFileSync(dir + '/performance.json', JSON.stringify({
      environment: 'Desktop Chromium / ANGLE SwiftShader, 393x873, DPR 1; no Android hardware',
      context,
      method: 'Five-member squad; frozen combat entities. Each workload: 10 warm-up + 30 samples of consecutive requestAnimationFrame timestamps in the ordinary render loop, including browser scheduling. No synthetic batch of render calls before the interval sample. Short static workloads; excludes combat simulation, input, audio, thermal and power costs. Not an Android frame-rate measurement.',
      rows, errors: h.errors,
    }, null, 2));
  } finally { await h.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
