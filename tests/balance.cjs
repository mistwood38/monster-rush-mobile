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
  const policies = {
    baseline: [],
    reasonable: [
      "focus_combo",
      "armor_training",
      "critical_calibration",
      "toughness_core",
    ],
    squad: ["squad_command", "squad_reload", "guardian_line", "last_stand"],
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
    defense: [
      "armor_training",
      "emergency_repair",
      "counter_pulse",
      "toughness_core",
    ],
    armor: [
      "armor_overclock",
      "armor_endurance",
      "pet_resonance",
      "energy_recycling",
    ],
  };
  const count = Number(process.env.BALANCE_SEEDS || 50),
    seconds = Number(process.env.BALANCE_SECONDS || 180),
    runs = [];
  for (const [policy, preferred] of Object.entries(policies).filter(
    ([p]) =>
      !process.env.BALANCE_POLICIES ||
      process.env.BALANCE_POLICIES.split(",").includes(p),
  )) {
    for (let seed0 = 1; seed0 <= count; seed0++) {
      runs.push(
        await page.evaluate(
          async ({ policy, preferred, seed0, seconds }) => {
            const t = __MR_TEST__;
            await t.start();
            await t.silence();
            if (policy === "baseline") t.blockPickups();
            let seed = seed0;
            Math.random = () =>
              (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) /
              4294967296;
            let dodgeUntil = 0,
              dodgeX = 0,
              bossAt = null,
              bossDeadAt = null,
              peakSquad = 0,
              firstRecruit = null,
              firstWeapon = null,
              firstPet = null;
            const samples = [],
              begin = performance.now(),
              active = policy !== "baseline";
            for (
              let i = 0;
              i < seconds * 10 && t.state().mode !== "ended";
              i++
            ) {
              if (t.state().mode === "draft") {
                const r = t.runModel();
                if (!active) {
                  document.querySelector("#skipDraft").click();
                } else {
                  const offered = [...r.offers].sort(
                    (a, b) =>
                      (preferred.includes(a) ? preferred.indexOf(a) : 100) -
                      (preferred.includes(b) ? preferred.indexOf(b) : 100),
                  );
                  const chosen = offered[0];
                  t.choose(chosen);
                  if (r.pendingReplacement) {
                    const worst = [...r.affixes].sort(
                      (a, b) =>
                        (preferred.includes(b.id)
                          ? preferred.indexOf(b.id)
                          : 100) -
                        (preferred.includes(a.id)
                          ? preferred.indexOf(a.id)
                          : 100),
                    )[0];
                    t.choose(worst.id);
                  }
                }
              }
              const s = t.state(),
                r = t.runModel(),
                boss = t.boss();
              if (s.boss && bossAt === null) bossAt = s.time;
              if (boss?.dead && bossDeadAt === null) bossDeadAt = s.time;
              peakSquad = Math.max(peakSquad, r.team.length);
              if (r.team.length && firstRecruit === null) firstRecruit = s.time;
              if (s.weapon !== "rifle" && firstWeapon === null)
                firstWeapon = s.time;
              if (r.pet && firstPet === null) firstPet = s.time;
              if (i % 300 === 0)
                samples.push({
                  time: +s.time.toFixed(1),
                  hp: s.hp,
                  crew: r.team.length,
                  kills: s.kills,
                  weapon: s.weapon,
                });
              if (active) {
                if (
                  boss?.phase === "warn" &&
                  Math.abs(boss.targetX - s.playerX) < (boss.sweep ? 3.2 : 2.2)
                ) {
                  dodgeUntil = s.time + 2.3;
                  dodgeX = boss.targetX > 0 ? -4.2 : 4.2;
                }
                const danger = t
                    .enemyList()
                    .find(
                      (e) =>
                        !e.dead && e.z > -3 && Math.abs(e.x - s.playerX) < 1.4,
                    ),
                  supplies = t.supply();
                const score = (c) => {
                  let n = c.z;
                  const k = c.reward?.type;
                  if (
                    policy === "squad" &&
                    ["recruit", "promote", "team"].includes(k)
                  )
                    n += 3;
                  if (
                    policy === "barrage" &&
                    ["lanes", "pellets", "rate"].includes(k)
                  )
                    n += 3;
                  if (policy === "element" && ["damage", "rate"].includes(k))
                    n += 3;
                  if (
                    policy === "defense" &&
                    ["repair", "regroup", "recruit"].includes(k)
                  )
                    n += 3;
                  if (
                    policy === "armor" &&
                    (c.grade === "high" || c.system?.kind === "armor")
                  )
                    n += 4;
                  return n;
                };
                const pickup = [
                  ...supplies.crates.filter((c) => !c.resolved),
                  ...supplies.gates.filter((g) => !g.resolved),
                ]
                  .filter((x) => x.z > -20 && x.z < 5)
                  .sort((a, b) => score(b) - score(a))[0];
                const enemy = t
                  .enemyList()
                  .filter((e) => !e.dead)
                  .sort((a, b) => b.z - a.z)[0];
                t.setTarget(
                  s.time < dodgeUntil
                    ? dodgeX
                    : danger
                      ? danger.x > 0
                        ? -4.1
                        : 4.1
                      : pickup
                        ? pickup.x
                        : enemy
                          ? enemy.x
                          : boss
                            ? boss.x
                            : 0,
                );
              }
              t.step(0.1);
            }
            const s = t.state(),
              r = t.runModel();
            return {
              policy,
              seed: seed0,
              seconds: +s.time.toFixed(1),
              alive: s.hp > 0,
              hp: s.hp,
              kills: s.kills,
              breaches: r.totals.breaches,
              bossAt,
              bossDeadAt,
              bossDuration:
                bossDeadAt === null ? null : +(bossDeadAt - bossAt).toFixed(1),
              peakSquad,
              firstRecruit,
              firstWeapon,
              firstPet,
              petSkills: r.totals.petSkills,
              armorDrops: r.armorDrops,
              armorSeconds: r.totals.armorSeconds,
              affixes: r.affixes,
              stats: s.stats,
              weapon: s.weapon,
              samples,
              simulationMs: Math.round(performance.now() - begin),
            };
          },
          { policy, preferred, seed0, seconds },
        ),
      );
      if (seed0 % 10 === 0) {
        console.log(`${policy}: ${seed0}/${count}`);
        fs.writeFileSync(
          path.join(artifacts, "balance-progress.json"),
          JSON.stringify({ policy, seed: seed0, runs }, null, 2),
        );
      }
    }
  }
  const quantile = (a, p) =>
    [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * p)];
  const summary = Object.keys(policies)
    .filter((p) => runs.some((r) => r.policy === p))
    .map((policy) => {
      const rows = runs.filter((r) => r.policy === policy),
        durations = rows
          .filter((r) => r.bossDuration !== null)
          .map((r) => r.bossDuration);
      return {
        policy,
        runs: rows.length,
        meanSurvival: +(
          rows.reduce((a, r) => a + r.seconds, 0) / rows.length
        ).toFixed(1),
        p10: quantile(
          rows.map((r) => r.seconds),
          0.1,
        ),
        median: quantile(
          rows.map((r) => r.seconds),
          0.5,
        ),
        p90: quantile(
          rows.map((r) => r.seconds),
          0.9,
        ),
        survivedToCap: rows.filter((r) => r.alive).length,
        bossReached: rows.filter((r) => r.bossAt !== null).length,
        bossDefeated: durations.length,
        bossMedianSeconds: durations.length ? quantile(durations, 0.5) : null,
        meanKills: +(
          rows.reduce((a, r) => a + r.kills, 0) / rows.length
        ).toFixed(1),
        armorDrops: rows.reduce((a, r) => a + r.armorDrops, 0),
      };
    });
  assert.deepEqual(errors, []);
  const baseline = summary.find((s) => s.policy === "baseline");
  if (baseline) {
    assert.equal(
      baseline.survivedToCap,
      0,
      "Unupgraded stationary baseline must fail",
    );
    assert.ok(
      summary
        .filter((s) => s.policy !== "baseline")
        .every((s) => s.meanSurvival > baseline.meanSurvival),
      "Rewards should improve survival",
    );
    assert.ok(
      runs
        .filter((r) => r.policy === "baseline")
        .every(
          (r) =>
            r.weapon === "rifle" &&
            r.affixes.length === 0 &&
            JSON.stringify(r.stats) ===
              JSON.stringify({
                lanes: 1,
                pellets: 1,
                fireRate: 1,
                bulletSpeed: 1,
                damage: 1,
              }),
        ),
      "Strict baseline must receive no equipment or numeric upgrades",
    );
  }
  fs.writeFileSync(
    path.join(artifacts, process.env.BALANCE_OUTPUT || "balance-results.json"),
    JSON.stringify(
      {
        method:
          "Actual game logic, seeded reward-seeking controller, normal HP, no forced equipment or invulnerability. Policy labels describe reward preferences; random offers can prevent a completed build. 180-second cap is right censoring, not a survival estimate.",
        count,
        seconds,
        summary,
        runs,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(summary, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    server.close();
  });
