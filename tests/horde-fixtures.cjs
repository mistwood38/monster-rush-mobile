const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { open, pilot } = require("./horde-harness.cjs");
(async () => {
  const h = await open();
  try {
    await h.page.evaluate("window.hordePilot=" + pilot.toString());
    const weapons = [],
      builds = [];
    for (const weapon of ["rifle", "machine", "shotgun", "plasma", "laser"])
      for (let seed = 1; seed <= 3; seed++) {
        const row = await h.page.evaluate(
          async ({ weapon, seed }) => {
            const t = __MR_TEST__;
            await t.start();
            await t.silence();
            t.freeze();
            let r = seed;
            Math.random = () =>
              (r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296;
            t.configure({
              time: 150,
              spawnTimer: 999,
              gateTimer: 999,
              crateTimer: 999,
              nextBoss: 9999,
            });
            t.runModel().nextDraft = t.runModel().eventTimer = 9999;
            for (let i = 0; i < 120; i++)
              t.spawnEnemy(
                ["grunt", "runner", "heavy", "charger", "ranged", "elite"][
                  i % 6
                ],
                ((i % 10) - 4.5) * 1.05,
                -5 - Math.floor(i / 10) * 2.2,
              );
            t.setWeapon(weapon, true);
            for (const [type, amount] of [
              ["lanes", 1],
              ["pellets", 1],
              ["rate", 0.25],
              ["damage", 0.3],
            ])
              t.collectReward({ type, amount });
            const before = t.hordeReport();
            for (let i = 0; i < 100; i++) {
              t.configure({ hp: 100 });
              t.setTarget(Math.sin(i * 0.06) * 2.8);
              t.step(0.1);
            }
            const after = t.hordeReport();
            return {
              weapon,
              seed,
              seconds: after.time - before.time,
              kills: after.killed - before.killed,
              damage: after.damageDealt - before.damageDealt,
              report: after,
            };
          },
          { weapon, seed },
        );
        weapons.push(row);
      }
    const recipes = {
      barrage: [
        "piercing_core",
        "spread_shot",
        "focus_combo",
        "critical_calibration",
      ],
      element: [
        "chain_lightning",
        "frost_round",
        "explosive_round",
        "scorch_mag",
      ],
      squad: ["squad_command", "squad_reload", "guardian_line", "last_stand"],
      defense: [
        "armor_training",
        "emergency_repair",
        "counter_pulse",
        "toughness_core",
      ],
    };
    for (const [build, affixes] of Object.entries(recipes))
      for (let seed = 1; seed <= 3; seed++) {
        const row = await h.page.evaluate(
          async ({ build, affixes, seed }) => {
            const t = __MR_TEST__;
            await t.start();
            await t.silence();
            t.freeze();
            let r = seed;
            Math.random = () =>
              (r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296;
            t.setWeapon("machine", true);
            t.recruit("heavy");
            t.recruit("guard");
            for (const [type, amount] of [
              ["lanes", 1],
              ["pellets", 1],
              ["rate", 0.25],
              ["damage", 0.3],
            ])
              t.collectReward({ type, amount });
            for (const id of affixes) t.affix(id);
            t.runModel().nextDraft = 9999;
            const c = {};
            for (let i = 0; i < 3000 && t.state().mode !== "ended"; i++) {
              hordePilot(t, "medium", build, c);
              t.step(0.1);
            }
            return {
              build,
              seed,
              seconds: t.state().time,
              alive: t.state().hp > 0,
              hp: t.state().hp,
              report: t.hordeReport(),
              systems: t.systems(),
            };
          },
          { build, affixes, seed },
        );
        builds.push(row);
        console.log("build", build, seed, Math.round(row.seconds));
      }
    assert.deepEqual(h.errors, []);
    const dir = path.resolve(__dirname, "../test-results/horde");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "controlled-fixtures.json"),
      JSON.stringify(
        {
          weaponMethod:
            "120 enemies, time150, identical legal numeric upgrades, 10 simulated seconds, sinusoidal movement, HP restored, no new waves. Damage/kill efficiency fixture, not survival or FPS.",
          buildMethod:
            "Normal HP, medium controller, supplied four level-I traits, machine gun + modest numeric upgrades + heavy/guard at start. Natural drops afterward; draft disabled to keep recipes fixed. Not naturally earned build probabilities.",
          weapons,
          builds,
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
