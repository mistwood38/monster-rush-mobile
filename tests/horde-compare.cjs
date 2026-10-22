// Same controllers/seeds on the rollback commit; no source patches to the baseline.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { open, pilot } = require("./horde-harness.cjs");
(async () => {
  if (!process.env.BASELINE_ROOT)
    throw Error("Set BASELINE_ROOT to a detached checkout of 5b01820");
  const h = await open({ width: 393, height: 873 }, process.env.BASELINE_ROOT);
  try {
    await h.page.evaluate("window.hordePilot=" + pilot.toString());
    const runs = [],
      cases = [
        { skill: "stationary", build: "barrage", loadout: "natural" },
        { skill: "novice", build: "barrage", loadout: "natural" },
        { skill: "medium", build: "barrage", loadout: "natural" },
        { skill: "expert", build: "element", loadout: "natural" },
        {
          skill: "stationary",
          build: "squad",
          loadout: "supplied-max",
          team: "mixed",
        },
        {
          skill: "medium",
          build: "squad",
          loadout: "supplied-max",
          team: "mixed",
        },
      ];
    for (const config of cases)
      for (let seed0 = 1; seed0 <= 3; seed0++) {
        const row = await h.page.evaluate(
          async ({ config, seed0 }) => {
            const t = __MR_TEST__;
            await t.start();
            await t.silence();
            t.freeze();
            let seed = seed0;
            Math.random = () =>
              (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) /
              4294967296;
            if (config.skill === "stationary" && config.loadout === "natural")
              t.blockPickups();
            if (config.loadout === "supplied-max") {
              t.setWeapon("laser", true);
              for (const role of ["assault", "heavy", "guard", "assault"])
                t.recruit(role);
              for (let i = 0; i < 2; i++)
                for (const role of ["assault", "heavy", "guard"])
                  t.promote(role);
              for (let i = 0; i < 3; i++) t.equipPet("drone");
              for (const [type, amount] of [
                ["lanes", 2],
                ["pellets", 2],
                ["rate", 1],
                ["damage", 1.2],
                ["speed", 1],
              ])
                t.collectReward({ type, amount });
            }
            let peak = 0,
              lastHp = t.state().hp,
              netLoss = 0,
              boss = null,
              fights = [],
              samples = [],
              next = 30;
            const c = {};
            for (let i = 0; i < 3000 && t.state().mode !== "ended"; i++) {
              hordePilot(t, config.skill, config.build, c);
              t.step(0.1);
              const s = t.state(),
                n = t.enemyList().filter((e) => !e.dead).length;
              peak = Math.max(peak, n);
              netLoss += Math.max(0, lastHp - s.hp);
              lastHp = s.hp;
              if (t.boss() && !boss) {
                boss = { started: s.time, ended: null };
                fights.push(boss);
              }
              if (boss && t.boss()?.dead && boss.ended === null)
                boss.ended = s.time;
              if (!t.boss()) boss = null;
              if (s.time >= next) {
                samples.push({
                  time: s.time,
                  aliveEnemies: n,
                  hp: s.hp,
                  stats: s.stats,
                  weapon: s.weapon,
                });
                next += 30;
              }
            }
            return {
              ...config,
              seed: seed0,
              seconds: t.state().time,
              alive: t.state().hp > 0,
              hp: t.state().hp,
              kills: t.state().kills,
              peak,
              netLossLowerBound: netLoss,
              fights,
              samples,
            };
          },
          { config, seed0 },
        );
        runs.push(row);
        console.log(
          config.skill,
          config.loadout,
          seed0,
          Math.round(row.seconds),
        );
      }
    assert.deepEqual(h.errors, []);
    const dir = path.resolve(__dirname, "../test-results/horde");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "baseline-comparison.json"),
      JSON.stringify(
        {
          baseline: "5b01820",
          note: "Same controllers, seed integers and 3000x0.1s observation budget as new balance data; visual/audio RNG differs between versions. Not paired statistical proof. Old code has no precise hit/TTK instrumentation, netLossLowerBound excludes heal-masked damage and is not comparable to new damageTaken.",
          runs,
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
