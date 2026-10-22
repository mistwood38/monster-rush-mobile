const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { open } = require("./horde-harness.cjs");
const dir = path.resolve(__dirname, "../test-results/horde");
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const h = await open();
  try {
    const report = [];
    for (const [width, height] of [
      [360, 800],
      [393, 873],
    ]) {
      await h.page.setViewportSize({ width, height });
      await h.page.evaluate(async () => {
        const t = __MR_TEST__;
        await t.start();
        await t.silence();
        t.freeze();
        t.setQuality(0, true);
        t.configure({
          time: 180,
          spawnTimer: 999,
          gateTimer: 999,
          crateTimer: 999,
          nextBoss: 9999,
        });
        t.runModel().nextDraft = t.runModel().eventTimer = 9999;
        for (const role of ["assault", "heavy", "guard", "assault"])
          t.recruit(role);
        for (let i = 0; i < 140; i++)
          t.spawnEnemy(
            ["grunt", "runner", "heavy", "ranged", "charger", "elite"][i % 6],
            ((i % 10) - 4.5) * 1.1,
            -9 - Math.floor(i / 10) * 2.3,
          );
        t.spawnBoss();
        t.step(2.3);
        t.collectReward({ type: "team", amount: 0.1, value: "全队射速 +10%" });
        t.renderFrame();
      });
      await h.page.waitForTimeout(80);
      const r = await h.page.evaluate(() => {
        const a = document
            .querySelector("#upgradeToast")
            .getBoundingClientRect(),
          b = document.querySelector("#bossHud").getBoundingClientRect();
        return {
          width: innerWidth,
          height: innerHeight,
          notification: { x: a.x, y: a.y, width: a.width, height: a.height },
          boss: { x: b.x, y: b.y, width: b.width, height: b.height },
          overlap:
            a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y,
          overflow: document.documentElement.scrollWidth > innerWidth,
          model: __MR_TEST__.modelAudit(),
        };
      });
      assert.ok(!r.overlap && !r.overflow);
      assert.ok(r.model.batches.every((x) => x.finite));
      report.push(r);
      await h.page.screenshot({
        path: path.join(dir, `visual-hud-${width}.png`),
      });
    }
    await h.page.setViewportSize({ width: 393, height: 873 });
    for (const kind of ["thunder", "molten", "phantom"]) {
      await h.page.evaluate(async (kind) => {
        const t = __MR_TEST__;
        await t.start();
        await t.silence();
        t.freeze();
        t.configure({
          time: 150,
          spawnTimer: 999,
          gateTimer: 999,
          crateTimer: 999,
          nextBoss: 9999,
        });
        t.runModel().nextDraft = t.runModel().eventTimer = 9999;
        for (let i = 0; i < 80; i++)
          t.spawnEnemy(
            ["grunt", "heavy", "runner", "ranged"][i % 4],
            ((i % 8) - 3.5) * 1.1,
            -8 - Math.floor(i / 8) * 3,
          );
        t.setWeapon(
          { thunder: "machine", molten: "plasma", phantom: "laser" }[kind],
          true,
        );
        t.armor(kind);
        t.step(1.1);
        t.renderFrame();
      }, kind);
      await h.page.screenshot({
        path: path.join(dir, `armor-${kind}-active-393.png`),
      });
    }
    assert.deepEqual(h.errors, []);
    fs.writeFileSync(
      path.join(dir, "visual-audit.json"),
      JSON.stringify(
        {
          note: "Actual high-quality WebGL captures of controlled scenes, not elapsed-time or performance evidence. Human visual judgment still needed.",
          layouts: report,
          errors: h.errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
