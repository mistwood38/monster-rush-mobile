const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { open, pilot } = require("./horde-harness.cjs");
const dir = path.resolve(__dirname, "../test-results/horde");
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const h = await open();
  try {
    await h.page.evaluate("window.hordePilot=" + pilot.toString());
    const seeds = Number(process.env.HORDE_SEEDS || 5),
      seconds = Number(process.env.HORDE_SECONDS || 300),
      runs = [];
    const cases = [
      ...["stationary", "novice", "medium", "expert"].flatMap((skill) =>
        ["barrage", "element", "squad"].map((build) => ({
          skill,
          build,
          loadout: "natural",
        })),
      ),
      ...["stationary", "medium", "expert"].flatMap((skill) =>
        ["assault", "guard", "mixed"].map((team) => ({
          skill,
          build: "squad",
          loadout: "supplied-max",
          team,
        })),
      ),
    ];
    const selectedCases = cases.filter(c => !process.env.HORDE_CASE_FILTER ||
      `${c.loadout}:${c.build}` === process.env.HORDE_CASE_FILTER);
    assert.ok(selectedCases.length, "Case filter must select at least one scenario");
    for (const config of selectedCases) {
      for (let seed0 = 1; seed0 <= seeds; seed0++) {
        const row = await h.page.evaluate(
          async ({ config, seed0, seconds }) => {
            const t = __MR_TEST__;
            await t.start();
            await t.silence();
            t.freeze();
            let seed = seed0;
            Math.random = () =>
              (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) /
              4294967296;
            if (config.loadout === "supplied-max") {
              t.setWeapon("laser", true);
              for (const role of config.team === "mixed"
                ? ["assault", "heavy", "guard", "assault"]
                : Array(4).fill(config.team))
                t.recruit(role);
              for (let i = 0; i < 2; i++)
                for (const role of ["assault", "heavy", "guard"])
                  t.promote(role);
              t.equipPet("drone");
              t.equipPet("drone");
              t.equipPet("drone");
              for (const [type, amount] of [
                ["lanes", 2],
                ["pellets", 2],
                ["rate", 1],
                ["damage", 1.2],
                ["speed", 1],
              ])
                t.collectReward({ type, amount });
            }
            if (config.skill === "stationary" && config.loadout === "natural")
              t.blockPickups();
            const control = {},
              samples = [],
              boundaries = [30, 60, 90, 150, 210, 270, 300],
              begin = performance.now();
            let next = 0;
            for (
              let i = 0;
              i < seconds * 10 && t.state().mode !== "ended";
              i++
            ) {
              hordePilot(t, config.skill, config.build, control);
              t.step(0.1);
              if (t.state().time >= (boundaries[next] || Infinity)) {
                samples.push({
                  ...t.hordeReport(),
                  hp: t.state().hp,
                  weapon: t.state().weapon,
                  affixes: t.systems().affixes,
                });
                next++;
              }
            }
            return {
              ...config,
              seed: seed0,
              seconds: t.state().time,
              alive: t.state().hp > 0,
              hp: t.state().hp,
              final: t.hordeReport(),
              run: t.systems(),
              samples,
              simulationMs: performance.now() - begin,
            };
          },
          { config, seed0, seconds },
        );
        runs.push(row);
      }
      console.log(
        config,
        runs.slice(-seeds).map((r) => Math.round(r.seconds)),
      );
      fs.writeFileSync(
        path.join(dir, "balance-progress.json"),
        JSON.stringify({ runs }, null, 2),
      );
    }
    assert.deepEqual(h.errors, []);
    const summary = selectedCases.map((c) => {
      const rows = runs.filter(
        (r) =>
          r.skill === c.skill &&
          r.build === c.build &&
          r.loadout === c.loadout &&
          r.team === c.team,
      );
      return {
        ...c,
        n: rows.length,
        meanSurvival: rows.reduce((a, r) => a + r.seconds, 0) / rows.length,
        survived300: rows.filter((r) => r.alive).length,
        meanDamage:
          rows.reduce((a, r) => a + r.final.damageTaken, 0) / rows.length,
        meanDirectHits:
          rows.reduce((a, r) => a + r.final.directHits, 0) / rows.length,
        meanBreaches:
          rows.reduce((a, r) => a + r.final.breached, 0) / rows.length,
        bossDefeated: rows.reduce(
          (a, r) =>
            a + r.final.bossFights.filter((b) => b.ended !== null).length,
          0,
        ),
      };
    });
    fs.writeFileSync(
      path.join(dir, "balance-results.json"),
      JSON.stringify(
        {
          seedMethod:
            "LCG; visual RNG can affect draw sequence; synchronous simulation, not real-time FPS",
          seconds,
          runs,
          summary,
        },
        null,
        2,
      ),
    );
    console.log(summary);
  } finally {
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
