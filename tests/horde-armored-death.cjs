const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { open } = require("./horde-harness.cjs");
(async () => {
  const h = await open();
  try {
    await h.page.evaluate(() => {
      const t = __MR_TEST__;
      t.armor("thunder");
      t.step(0.1);
      t.configure({ hp: 1, invuln: 0 });
      t.hurtPlayer(10);
    });
    await h.page.waitForFunction(
      () =>
        __MR_TEST__
          .modelAudit()
          .rigs.every((x) => x.action === "down" && x.hipAngle < -0.5),
      null,
      { timeout: 10000 },
    );
    const r = await h.page.evaluate(() => ({
      state: __MR_TEST__.state().mode,
      model: __MR_TEST__.modelAudit(),
    }));
    assert.equal(r.state, "ended");
    assert.ok(
      r.model.rigs.every((x) => x.action === "down" && x.hipAngle < -0.5),
    );
    assert.deepEqual(h.errors, []);
    fs.writeFileSync(
      path.resolve(__dirname, "../test-results/horde/armored-death.json"),
      JSON.stringify({ passed: true, ...r }, null, 2),
    );
    console.log(
      "PASS actual armored death collapses both underlying and visible rigs",
    );
  } finally {
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
