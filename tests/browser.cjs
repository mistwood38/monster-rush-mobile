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
  const check = async (name, test) => {
    const detail = await test();
    results.push({ name, passed: true, detail });
    console.log("PASS " + name + (detail ? " " + JSON.stringify(detail) : ""));
  };
  const reset = async () =>
    page.evaluate(async () => {
      const t = window.__MR_TEST__;
      await t.start();
      await t.silence();
      t.configure({ spawnTimer: 999, gateTimer: 999, crateTimer: 999 });
      t.runModel().nextDraft = 9999;
      t.runModel().eventTimer = 9999;
      let seed = 12345;
      Math.random = () =>
        (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    });
  const evalGame = (fn, arg) => page.evaluate(fn, arg);
  await check("Two phone layouts and real menu", async () => {
    for (const [width, height] of [
      [360, 800],
      [393, 873],
    ]) {
      await page.setViewportSize({ width, height });
      assert.ok(
        await evalGame(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight,
        ),
      );
      await page.screenshot({
        path: path.join(artifacts, `menu-${width}.png`),
      });
    }
  });
  await check(
    "User gesture audio, pause, resume and separate mixer",
    async () => {
      await page.locator("#start").click();
      await page.waitForFunction(
        () =>
          __MR_TEST__.getAudio().playing &&
          __MR_TEST__.getAudio().samples === 15,
      );
      assert.deepEqual(
        await evalGame(() => __MR_TEST__.getAudio().sampleErrors),
        [],
      );
      assert.equal(
        await evalGame(() => __MR_TEST__.getAudio().loop),
        "normal_loop",
      );
      await page.locator("#pause").click();
      await page.waitForFunction(() => !__MR_TEST__.getAudio().playing);
      await page.locator("#musicVolume").fill("32");
      await page.locator("#musicVolume").dispatchEvent("input");
      assert.equal(
        await evalGame(() => localStorage.getItem("mr2-music")),
        "0.32",
      );
      await page.locator("#resume").click();
      await page.waitForFunction(() => __MR_TEST__.getAudio().playing);
    },
  );
  await reset();
  await check("Relative touch drag and bounded movement", async () => {
    const c = page.locator("#game");
    await c.dispatchEvent("pointerdown", {
      clientX: 30,
      clientY: 650,
      pointerType: "touch",
      pointerId: 1,
      buttons: 1,
    });
    assert.equal(await evalGame(() => __MR_TEST__.state().targetX), 0);
    await c.dispatchEvent("pointermove", {
      clientX: 390,
      clientY: 650,
      pointerType: "touch",
      pointerId: 1,
      buttons: 1,
    });
    const s = await evalGame(() => __MR_TEST__.step(0.5));
    assert.ok(s.playerX > 4 && s.playerX <= 4.8);
    await c.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch" });
  });
  await check(
    "All five numeric gates independently affect real projectiles",
    async () => {
      const out = {};
      for (const [type, amount] of [
        ["lanes", 1],
        ["pellets", 2],
        ["rate", 0.25],
        ["speed", 0.35],
        ["damage", 0.5],
      ]) {
        await reset();
        const before = await evalGame(() => {
          __MR_TEST__.fire();
          return __MR_TEST__.metrics();
        });
        await reset();
        const after = await evalGame(
          (r) => {
            const t = __MR_TEST__;
            t.collectReward(r);
            t.clearBullets();
            t.fire();
            return t.metrics();
          },
          { type, amount },
        );
        if (type === "lanes") assert.equal(after.count, before.count + 1);
        if (type === "pellets") {
          assert.equal(after.count, before.count + 2);
          assert.ok(
            after.totalDamage > before.totalDamage &&
              after.totalDamage < before.totalDamage * 2,
          );
        }
        if (type === "rate") assert.ok(after.interval < before.interval);
        if (type === "speed") assert.ok(after.avgSpeed > before.avgSpeed);
        if (type === "damage")
          assert.ok(after.totalDamage > before.totalDamage);
        out[type] = {
          count: after.count,
          damage: after.totalDamage,
          interval: after.interval,
          speed: after.avgSpeed,
        };
      }
      return out;
    },
  );
  await check(
    "Five distinct weapons kill actual off-center enemies",
    async () => {
      const out = {};
      for (const weapon of ["rifle", "machine", "shotgun", "plasma", "laser"]) {
        await reset();
        out[weapon] = await evalGame((w) => {
          const t = __MR_TEST__;
          t.forcePlayerX(-2);
          t.spawnEnemy("grunt", -2, -9);
          t.setWeapon(w, true);
          t.step(3);
          return { kills: t.state().kills, metrics: t.metrics() };
        }, weapon);
        assert.ok(out[weapon].kills >= 1, weapon);
      }
      assert.notEqual(out.rifle.metrics.interval, out.machine.metrics.interval);
      assert.notEqual(out.plasma.metrics.kinds[0], out.rifle.metrics.kinds[0]);
      return out;
    },
  );
  await reset();
  await check(
    "Swept projectile damage and target-positioned numbers",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.spawnEnemy("heavy", 2, -6);
        const e = t.getEnemy(),
          hp = e.hp;
        t.fire();
        const b = t.shots()[0];
        Object.assign(b, { prevX: 2, x: 2, prevZ: -2, z: -12 });
        const hit = t.processBulletCollisions(b, 0.04);
        return { hit, damage: hp - e.hp, text: t.effects().floating[0] };
      });
      assert.ok(r.hit && r.damage > 0);
      assert.ok(Math.abs(r.text.x - 2) < 0.3);
      assert.equal(r.text.z, -6);
    },
  );
  await reset();
  await check("Plasma splash kills multiple neighbors", async () => {
    const s = await evalGame(() => {
      const t = __MR_TEST__;
      t.setWeapon("plasma", true);
      t.spawnEnemy("grunt", -0.6, -9);
      t.spawnEnemy("grunt", 0.6, -9);
      return t.step(1.2);
    });
    assert.equal(s.kills, 2);
  });
  await reset();
  await check(
    "Gate charging is capped, shots pass, choices exclude each other",
    async () => {
      const charge = await evalGame(() => {
        const t = __MR_TEST__;
        t.forcePlayerX(-2.45);
        t.configure({ gateSequence: 2 });
        t.previewGates(-8);
        t.spawnEnemy("grunt", -2.45, -15);
        t.step(1.3);
        return { charge: t.getGate().charge, kills: t.state().kills };
      });
      assert.ok(charge.charge > 0 && charge.kills === 1);
      await reset();
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.forcePlayerX(-2.45);
        t.previewGates(1.2);
        t.updateGatesCrates(0.04);
        t.forcePlayerX(2.45);
        t.updateGatesCrates(0.04);
        return {
          team: t.systems().team.length,
          stats: t.state().stats,
          gates: t.supply().gates.map((g) => g.resolved),
        };
      });
      assert.equal(r.team, 1);
      assert.equal(r.stats.damage, 1);
      assert.ok(r.gates.every(Boolean));
      return r;
    },
  );
  await reset();
  await check(
    "Laser upgrades widen beams and increase effective damage",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.configure({ shootTimer: 999 });
        t.spawnBoss();
        t.step(1.9);
        t.setWeapon("laser", true);
        const hp = t.boss().hp;
        t.fire();
        const base = hp - t.boss().hp;
        t.collectReward({ type: "lanes", amount: 2 });
        t.collectReward({ type: "pellets", amount: 2 });
        t.collectReward({ type: "speed", amount: 0.35 });
        const hp2 = t.boss().hp;
        t.fire();
        return {
          base,
          upgraded: hp2 - t.boss().hp,
          lanes: t.laser().beams.filter((b) => b.ray.visible).length,
        };
      });
      assert.ok(r.base > 0 && r.upgraded > r.base);
      assert.equal(r.lanes, 3);
      return r;
    },
  );
  await reset();
  await check(
    "Breach on opposite flank hurts even during contact invulnerability",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.forcePlayerX(-4.8);
        t.configure({ shootTimer: 999, invuln: 999 });
        t.spawnEnemy("grunt", 4.8, 4.3);
        t.step(0.025);
        return { hp: t.state().hp, breaches: t.systems().totals.breaches };
      });
      assert.ok(r.hp < 100);
      assert.equal(r.breaches, 1);
    },
  );
  await reset();
  await check(
    "Generous swept crate pickup, healing, no lower-tier downgrade",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.spawnCrate("machine", 1.45, 0.9);
        t.updateGatesCrates(0.4);
        const picked = t.state().weapon;
        t.setWeapon("laser", true);
        t.forceCrate("rifle");
        t.configure({ hp: 50 });
        t.forceCrate("medkit");
        for (let i = 0; i < 5; i++)
          t.collectReward({ type: "lanes", amount: 1 });
        return {
          picked,
          weapon: t.state().weapon,
          hp: t.state().hp,
          lanes: t.state().stats.lanes,
        };
      });
      assert.equal(r.picked, "machine");
      assert.equal(r.weapon, "laser");
      assert.ok(r.hp > 50);
      assert.equal(r.lanes, 3);
    },
  );
  await reset();
  await check(
    "Source atlas animation advances, hit takes priority, road scrolls",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.configure({ shootTimer: 999 });
        const before = t.roadOffset();
        t.step(0.14);
        const frame = t.spriteAudit().frames[0];
        t.spriteTrigger("hit");
        t.step(0.02);
        const hit = t.spriteAudit().frames[0];
        t.step(0.7);
        return {
          before,
          after: t.roadOffset(),
          frame,
          hit,
          restored: t.spriteAudit().frames[0],
          audit: t.spriteAudit(),
          projection: t.playerProjection(),
        };
      });
      assert.equal(r.audit.atlases, 25);
      assert.deepEqual(r.audit.errors, []);
      assert.ok(r.frame.index > 0);
      assert.equal(r.hit.state, "hit");
      assert.equal(r.restored.state, "run");
      assert.notEqual(r.before, r.after);
      return r;
    },
  );
  await reset();
  await check(
    "Squad role weapons persist, promotion, damage, death and refill",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.configure({ shootTimer: 999 });
        t.recruit("heavy");
        t.promote("heavy");
        for (const role of ["assault", "guard", "assault"]) t.recruit(role);
        t.step(0.03);
        t.spawnEnemy("heavy", 0, -9);
        const e = t.getEnemy();
        e.hp = e.maxHp = 1500;
        let shots = 0;
        for (let i = 0; i < 20; i++) {
          t.step(0.1);
          shots = Math.max(
            shots,
            t.shots().filter((b) => b.owner === "team").length,
          );
        }
        const damage = 1500 - e.hp;
        const m = t.runModel().team.find((m) => m.role === "assault"),
          id = m.id;
        m.invuln = 0;
        t.hurtMember(id, 999);
        t.step(0.7);
        const fallen = !t.systems().team.some((m) => m.id === id);
        t.recruit("assault");
        for (const e of t.enemyList()) t.damageEnemy(e, 9999, false);
        t.step(100);
        return {
          damage,
          shots,
          fallen,
          team: t.systems().team,
          active: t.spriteAudit().active,
        };
      });
      assert.ok(r.damage > 0 && r.shots > 0 && r.fallen, JSON.stringify(r));
      assert.equal(r.team.length, 4);
      assert.ok(r.team.some((m) => m.role === "heavy" && m.level === 3));
      return { damage: r.damage, shots: r.shots, team: r.team.length };
    },
  );
  await reset();
  await check(
    "Recruitment, promotion and team-rate gates apply formal caps",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.collectReward({ type: "recruit" });
        t.collectReward({ type: "promote", role: "heavy" });
        for (let i = 0; i < 5; i++) t.collectReward({ type: "team" });
        return t.systems();
      });
      assert.equal(r.team.length, 1);
      assert.equal(r.team[0].role, "heavy");
      assert.ok(r.teamPower <= 0.3 && r.teamPower > 0.29);
    },
  );
  await check(
    "Four pet skills affect real combat and wait on cooldown",
    async () => {
      const out = [];
      for (const kind of ["dragon", "owl", "drone", "fairy"]) {
        await reset();
        out.push(
          await evalGame((kind) => {
            const t = __MR_TEST__;
            t.configure({ shootTimer: 999, hp: 50 });
            t.equipPet(kind);
            t.equipPet(kind);
            t.equipPet(kind);
            t.spawnEnemy("heavy", 0, -12);
            t.updateRunSystems(0.02);
            const model = t.runModel(),
              stats = t.combatStats(),
              shield = model.shield,
              hp = t.state().hp;
            t.hurtPlayer(10, 0);
            return {
              kind,
              stats,
              shield,
              hp,
              after: t.state().hp,
              pet: t.systems().pet,
            };
          }, kind),
        );
      }
      assert.ok(out.every((x) => x.pet.level === 3 && x.pet.cooldown > 5));
      assert.ok(out[0].stats.damage > 1);
      assert.ok(out[1].after > 40);
      assert.ok(out[2].shield >= 32 && out[2].after === 50);
      assert.equal(out[3].hp, 68);
      return out;
    },
  );
  await reset();
  await check(
    "Pet two-choice pickups exclude the other and preserve slot level",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.equipPet("dragon");
        t.runModel().eventIndex = 0;
        t.runModel().eventTimer = 0;
        t.step(0.025);
        const boxes = t.supply().crates.filter((c) => c.system?.kind === "pet"),
          c = boxes.find((c) => c.system.value === "dragon");
        t.forcePlayerX(c.x);
        for (const c of boxes) c.z = 1.3;
        t.updateGatesCrates(0.025);
        t.updateGatesCrates(0.025);
        return {
          pet: t.systems().pet,
          remaining: t.supply().crates.filter((c) => c.choiceId && !c.resolved)
            .length,
        };
      });
      assert.equal(r.pet.kind, "dragon");
      assert.equal(r.pet.level, 2);
      assert.equal(r.remaining, 0);
    },
  );
  await reset();
  await check(
    "All three armor animations and multipliers expire and restore exact stats",
    async () => {
      const out = await evalGame(() => {
        const t = __MR_TEST__,
          out = [];
        t.setWeapon("plasma", true);
        t.collectReward({ type: "damage", amount: 0.5 });
        const base = t.combatStats();
        for (const kind of ["thunder", "molten", "phantom"]) {
          t.armor(kind);
          t.step(0.1);
          const boosted = t.combatStats(),
            active = t
              .spriteAudit()
              .frames.find((a) => a.key.startsWith("armor/"));
          t.step(12);
          const ended = t.systems().armor;
          t.step(1);
          out.push({
            kind,
            base,
            boosted,
            active,
            ended,
            after: t.combatStats(),
            weapon: t.state().weapon,
          });
        }
        return out;
      });
      for (const r of out) {
        assert.ok(r.boosted.damage > r.base.damage);
        assert.ok(r.active);
        assert.equal(r.ended, null);
        assert.deepEqual(r.after, r.base);
        assert.equal(r.weapon, "plasma");
      }
      return out.map((r) => ({ kind: r.kind, state: r.active.state }));
    },
  );
  await reset();
  await check(
    "Elemental direct hits proc bounded chain, explosion, frost and burn",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.configure({ shootTimer: 999 });
        for (const a of [
          "scorch_mag",
          "frost_round",
          "chain_lightning",
          "explosive_round",
        ])
          t.affix(a);
        Math.random = () => 0.1;
        for (const x of [0, 1, 1.6]) {
          t.spawnEnemy("heavy", x, -10);
          const e = t.enemyList().at(-1);
          e.hp = e.maxHp = 10000;
        }
        const [a, b, c] = t.enemyList();
        for (let i = 0; i < 12; i++) t.damageEnemy(a, 10, true);
        const direct = {
          a: a.hp,
          b: b.hp,
          c: c.hp,
          burn: a.burnTime,
          slow: a.slow,
        };
        t.step(0.6);
        return {
          direct,
          after: a.hp,
          counters: t.runModel().hitCount,
          arc: t.runModel().arcCD,
          blast: t.runModel().blastCD,
        };
      });
      assert.ok(r.direct.b < 10000 && r.direct.c < 10000);
      assert.ok(r.direct.burn > 0 && r.direct.slow > 0);
      assert.ok(r.after < r.direct.a);
      assert.equal(r.counters, 2);
      assert.ok(r.arc > 0 && r.blast > 0);
      return r;
    },
  );
  await reset();
  await check(
    "Survival traits affect actual HP, repair and knockback",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        for (const a of [
          "armor_training",
          "toughness_core",
          "emergency_repair",
          "counter_pulse",
        ])
          t.affix(a);
        t.updateRunSystems(0.01);
        const max = t.runModel().maxHp;
        t.configure({ hp: 30, invuln: 0 });
        t.spawnEnemy("heavy", 0, -2);
        const e = t.getEnemy(),
          z = e.z;
        t.hurtPlayer(10, 0);
        t.updateRunSystems(0.01);
        return {
          hp: t.state().hp,
          max,
          z,
          afterZ: e.z,
          repairs: t.runModel().repairUses,
        };
      });
      assert.equal(r.max, 115);
      assert.ok(r.hp > 30);
      assert.ok(r.afterZ < r.z);
      assert.equal(r.repairs, 1);
      return r;
    },
  );
  await reset();
  await check(
    "Three-choice UI pauses combat and supports four-slot replacement",
    async () => {
      await evalGame(() => {
        for (const a of [
          "scorch_mag",
          "frost_round",
          "chain_lightning",
          "explosive_round",
        ])
          __MR_TEST__.affix(a);
        __MR_TEST__.draft();
      });
      assert.equal(await page.locator(".draft-card").count(), 3);
      assert.ok(
        await evalGame(() => {
          const t = __MR_TEST__,
            s = t.state().time;
          t.step(3);
          return t.state().time === s;
        }),
      );
      await evalGame(() => {
        const t = __MR_TEST__;
        t.runModel().offers = ["toughness_core"];
        t.choose("toughness_core");
      });
      assert.equal(await page.locator(".draft-card").count(), 4);
      await page.locator(".draft-card").first().click();
      assert.equal(
        await evalGame(() => __MR_TEST__.systems().affixes.length),
        4,
      );
      assert.equal(await evalGame(() => __MR_TEST__.state().mode), "playing");
      await evalGame(() => __MR_TEST__.draft());
      await page.locator("#skipDraft").click();
    },
  );
  await reset();
  await check(
    "Armed truck must be shot open; armor pity counts opened high crates",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.configure({ time: 60 });
        const c = t.roadReward("truck", 0, 1.2, "plasma");
        t.updateGatesCrates(0.01);
        const lockedWeapon = t.state().weapon;
        c.z = -9;
        c.group.position.z = -9;
        const initial = c.hp;
        for (let i = 0; i < 20; i++) {
          t.fire();
          const b = t.shots().at(-1);
          if (b) {
            b.prevX = b.x = 0;
            b.prevZ = -2;
            b.z = -12;
            t.processBulletCollisions(b, 0.04);
          }
        }
        const eligible = t.runModel().eligibleCrates;
        c.z = 1.2;
        t.updateGatesCrates(0.01);
        return {
          initial,
          hp: c.hp,
          opened: c.opened,
          lockedWeapon,
          weapon: t.state().weapon,
          eligible,
          afterEligible: t.runModel().eligibleCrates,
        };
      });
      assert.equal(r.lockedWeapon, "rifle");
      assert.ok(r.opened && r.hp === 0);
      assert.equal(r.weapon, "plasma");
      assert.equal(r.eligible, 1);
      assert.equal(r.afterEligible, 1);
      return r;
    },
  );
  await reset();
  await check(
    "Road events include pet choice, destructible truck, elite bounty and rescue",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__,
          out = [];
        for (let i = 0; i < 3; i++) {
          for (const c of t.supply().crates) c.z = 10;
          t.updateGatesCrates(0.01);
          t.runModel().eventTimer = 0;
          t.step(0.025);
          out.push({
            event: t.systems().event,
            kinds: t.supply().crates.map((c) => c.system?.kind),
            bounty: t.enemyList().some((e) => e.bounty),
          });
        }
        return out;
      });
      assert.ok(r[0].kinds.includes("pet"));
      assert.ok(r[1].kinds.includes("truck"));
      assert.ok(r[2].kinds.includes("rescue") && r[2].bounty);
      return r;
    },
  );
  await reset();
  await check(
    "Boss arrival, native windup, attack, actual damage and death",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.configure({ time: 94.9, nextBoss: 95 });
        t.step(0.2);
        const spawned = t.state().boss;
        t.step(2.3);
        const warned = t.boss().phase === "warn",
          anim = t.spriteAudit().frames.find((a) => a.key === "boss");
        t.step(0.8);
        const shots = t.state().enemyShots;
        t.step(1.6);
        const hp = t.state().hp;
        for (let i = 0; i < 3; i++) {
          t.damageBoss(10000);
          if (t.boss()?.shield > 0) t.step(2.3);
        }
        t.step(1.5);
        return {
          spawned,
          warned,
          anim,
          shots,
          hp,
          cleared: !t.state().boss,
          score: t.state().score,
        };
      });
      assert.ok(
        r.spawned && r.warned && r.shots > 0 && r.hp < 100 && r.cleared,
      );
      assert.ok(r.score > 1400);
      return r;
    },
  );
  await reset();
  await check(
    "Boss late-phase wave leaves a dodge lane and summons real enemies",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.configure({ shootTimer: 999 });
        t.spawnBoss();
        const b = t.boss();
        b.armorPhase = 2;
        b.shield = 0;
        b.attack = 0;
        b.skillCycle = 1;
        t.forcePlayerX(3);
        t.step(0.025);
        const target = b.targetX;
        t.forcePlayerX(-4);
        t.step(1.1);
        const wave = t.hostileShots().find((s) => s.wave);
        const width = wave?.width;
        t.step(2.3);
        const dodged = t.state().hp === 100;
        b.phase = "idle";
        b.attack = 0;
        b.skillCycle = 2;
        t.step(1.2);
        return {
          target,
          width,
          dodged,
          summons: t.enemyList().filter((e) => e.type === "runner").length,
        };
      });
      assert.equal(r.width, 5.2);
      assert.ok(r.target > 0 && r.dodged);
      assert.equal(r.summons, 2);
      return r;
    },
  );
  await check("Boss schedule 95/180/270 and increasing HP", async () => {
    const out = [];
    for (const time of [95, 180, 270]) {
      await reset();
      out.push(
        await evalGame((time) => {
          const t = __MR_TEST__;
          t.configure({ time: time - 0.01, nextBoss: time });
          t.step(0.025);
          return { time, hp: t.boss()?.hp };
        }, time),
      );
    }
    assert.ok(out[2].hp > out[1].hp && out[1].hp > out[0].hp);
    return out;
  });
  await reset();
  await check("Boss phase guards prevent one-shot deletion", async () => {
    const r = await evalGame(() => {
      const t = __MR_TEST__;
      t.configure({ shootTimer: 999 });
      t.spawnBoss();
      const full = t.boss().hp;
      t.damageBoss(100000);
      const guarded = t.boss().hp;
      t.step(1.9);
      t.damageBoss(100000);
      const first = t.boss().hp;
      t.damageBoss(100000);
      return {
        full,
        guarded,
        first,
        blocked: t.boss().hp,
        phase: t.boss().armorPhase,
      };
    });
    assert.equal(r.full, r.guarded);
    assert.equal(r.first, r.blocked);
    assert.ok(r.first > 0 && r.first < r.full);
    assert.equal(r.phase, 1);
  });
  await check(
    "Five weapons defeat Boss using actual capped firepower and phase transitions",
    async () => {
      const out = [];
      for (const weapon of ["rifle", "machine", "shotgun", "plasma", "laser"]) {
        await reset();
        out.push(
          await evalGame((w) => {
            const t = __MR_TEST__;
            t.setWeapon(w, true);
            for (const r of [
              { type: "lanes", amount: 2 },
              { type: "pellets", amount: 2 },
              { type: "rate", amount: 1 },
              { type: "damage", amount: 1.2 },
              { type: "speed", amount: 1 },
            ])
              t.collectReward(r);
            t.configure({ invuln: 999 });
            t.spawnBoss();
            for (let i = 0; i < 600 && t.boss() && !t.boss().dead; i++) {
              t.forcePlayerX(t.boss().x);
              t.step(0.1);
            }
            return {
              weapon: w,
              time: t.state().time,
              dead: !!t.boss()?.dead,
              phase: t.boss()?.armorPhase,
            };
          }, weapon),
        );
      }
      assert.ok(
        out.every((x) => x.dead && x.phase === 2),
        JSON.stringify(out),
      );
      return out;
    },
  );
  await reset();
  await check("Pooled particles are reused and capped", async () => {
    const r = await evalGame(() => {
      const t = __MR_TEST__;
      t.emit(0, 1, -8, "#fff", 12);
      const before = t.effects().active;
      t.updateEffects(1);
      const pooled = t.effects().pooled;
      for (let i = 0; i < 30; i++) t.emit(0, 1, -8, "#fff", 24);
      return { before, pooled, after: t.effects().active };
    });
    assert.equal(r.before, 12);
    assert.ok(r.pooled >= 12);
    assert.ok(r.after <= 64);
    return r;
  });
  await reset();
  await check(
    "Death, record saving and restart reset run-only systems",
    async () => {
      await evalGame(() => {
        const t = __MR_TEST__;
        t.recruit("assault");
        t.equipPet("owl");
        t.affix("toughness_core");
        t.configure({ score: 321 });
        t.hurtPlayer(1000, 0);
      });
      assert.ok(await page.locator("#endPanel").isVisible());
      assert.equal(
        await evalGame(() => localStorage.getItem("mr2-best")),
        "321",
      );
      await page.locator("#again").click();
      assert.equal(await evalGame(() => __MR_TEST__.state().hp), 100);
      assert.equal(await evalGame(() => __MR_TEST__.systems().team.length), 0);
      await evalGame(() => __MR_TEST__.silence());
    },
  );
  await reset();
  await check(
    "Full formation remains inside both phone viewports at road edges",
    async () => {
      for (const [width, height] of [
        [360, 800],
        [393, 873],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(100);
        for (const x of [-4.8, 0, 4.8]) {
          const r = await evalGame((x) => {
            const t = __MR_TEST__;
            if (!t.systems().team.length)
              for (let i = 0; i < 4; i++) t.recruit("assault");
            t.forcePlayerX(x);
            t.step(0.8);
            return t.formationBounds();
          }, x);
          for (const b of r)
            assert.ok(
              b.minX >= -1 && b.maxX <= width + 1,
              JSON.stringify({ width, x, r }),
            );
        }
      }
    },
  );
  await reset();
  await check(
    "Enemy budget stops spawning without silently deleting existing threats",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.configure({ shootTimer: 999 });
        for (let i = 0; i < 40; i++)
          t.spawnEnemy(
            "heavy",
            ((i % 7) - 3) * 1.2,
            -30 - Math.floor(i / 7) * 3,
          );
        const before = t.state().enemies;
        const ids = t.enemyList().map((e) => e.group.id);
        t.step(0.025);
        return {
          before,
          after: t.state().enemies,
          retained: t.enemyList().every((e) => ids.includes(e.group.id)),
          hp: t.state().hp,
        };
      });
      assert.equal(r.before, 32);
      assert.equal(r.after, 32);
      assert.ok(r.retained && r.hp === 100);
      return r;
    },
  );
  await reset();
  await check(
    "Integrated 300-second soak: objects, drafts, Boss and armor stay bounded",
    async () => {
      const r = await evalGame(() => {
        const t = __MR_TEST__;
        t.configure({ spawnTimer: 0.1, gateTimer: 1, crateTimer: 8 });
        t.runModel().eventTimer = 8;
        t.runModel().nextDraft = 18;
        for (const role of ["assault", "heavy", "guard", "assault"])
          t.recruit(role);
        t.equipPet("dragon");
        t.setWeapon("plasma", true);
        const max = { enemies: 0, bullets: 0, particles: 0, shots: 0 },
          seen = { drafts: 0, boss: false, armor: false };
        for (let i = 0; i < 3000; i++) {
          if (t.state().mode === "draft") {
            const r = t.runModel();
            t.choose(r.pendingReplacement ? r.affixes[0].id : r.offers[0]);
            seen.drafts++;
          }
          t.configure({ hp: 100, invuln: 1 });
          if (i % 700 === 0)
            t.armor(["thunder", "molten", "phantom"][Math.floor(i / 700) % 3]);
          t.setTarget(Math.sin(i * 0.03) * 3.6);
          t.step(0.1);
          const s = t.state();
          seen.boss ||= s.boss;
          seen.armor ||= !!t.systems().armor;
          max.enemies = Math.max(max.enemies, s.enemies);
          max.bullets = Math.max(max.bullets, s.bullets);
          max.particles = Math.max(max.particles, t.effects().active);
          max.shots = Math.max(max.shots, s.enemyShots);
        }
        return {
          time: t.state().time,
          max,
          seen,
          team: t.systems().team.length,
          affixes: t.systems().affixes.length,
          intervals: [t.interval(18), t.interval(21)],
        };
      });
      assert.ok(
        r.time > 295 && r.seen.drafts >= 3 && r.seen.boss && r.seen.armor,
      );
      assert.ok(
        r.max.enemies <= 32 &&
          r.max.bullets <= 160 &&
          r.max.particles <= 64 &&
          r.max.shots <= 60,
        JSON.stringify(r),
      );
      assert.ok(r.team <= 4 && r.affixes <= 4);
      assert.ok(r.intervals[1] > r.intervals[0] * 3);
      return r;
    },
  );
  await reset();
  await check(
    "Maximum projectile pool uses instancing; repeated resets release actors",
    async () => {
      await evalGame(() => {
        const t = __MR_TEST__;
        t.collectReward({ type: "lanes", amount: 2 });
        t.collectReward({ type: "pellets", amount: 2 });
        for (let i = 0; i < 30; i++) t.fire();
      });
      await page.waitForTimeout(100);
      const stress = await evalGame(() => __MR_TEST__.metrics());
      assert.equal(stress.count, 160);
      assert.ok(stress.drawCalls < 150, JSON.stringify(stress));
      const memories = [];
      for (let i = 0; i < 6; i++) {
        await reset();
        await evalGame((i) => {
          const t = __MR_TEST__;
          t.recruit("guard");
          t.equipPet(["dragon", "owl", "drone", "fairy"][i % 4]);
          t.armor(["thunder", "molten", "phantom"][i % 3]);
          t.spawnEnemy("heavy", 0, -12);
          t.step(0.1);
        }, i);
        await page.waitForTimeout(50);
        await reset();
        await page.waitForTimeout(50);
        memories.push(
          await evalGame(() => ({
            ...__MR_TEST__.metrics().memory,
            actors: __MR_TEST__.spriteAudit().active,
          })),
        );
      }
      assert.ok(
        memories.at(-1).textures <= memories[2].textures + 5,
        JSON.stringify(memories),
      );
      assert.ok(
        memories.at(-1).geometries <= memories[2].geometries + 5,
        JSON.stringify(memories),
      );
      assert.equal(memories.at(-1).actors, 1);
      return { stress: stress.count, drawCalls: stress.drawCalls, memories };
    },
  );
  await check(
    "Review screenshots: initial, gate, weapons, formation, armor, draft and Boss",
    async () => {
      for (const [width, height] of [
        [360, 800],
        [393, 873],
      ]) {
        await page.setViewportSize({ width, height });
        await reset();
        await page.screenshot({
          path: path.join(artifacts, `initial-${width}.png`),
        });
        await evalGame(() => {
          const t = __MR_TEST__;
          t.previewGates(-8);
          t.spawnEnemy("grunt", -2, -16);
          t.spawnEnemy("heavy", 3, -22);
          t.step(0.1);
        });
        await page.waitForTimeout(150);
        await page.screenshot({
          path: path.join(artifacts, `upgrade-${width}.png`),
        });
        await reset();
        await evalGame(() => {
          const t = __MR_TEST__;
          for (const role of ["assault", "heavy", "guard", "assault"])
            t.recruit(role);
          t.equipPet("owl");
          t.setWeapon("plasma", true);
          t.affix("scorch_mag");
          t.affix("chain_lightning");
          t.spawnEnemy("ranged", -2, -15);
          t.spawnEnemy("elite", 2, -21);
          t.step(0.1);
        });
        await page.waitForTimeout(150);
        await page.screenshot({
          path: path.join(artifacts, `formation-${width}.png`),
        });
        await evalGame(() => {
          __MR_TEST__.armor("thunder");
          __MR_TEST__.step(0.25);
        });
        await page.waitForTimeout(120);
        await page.screenshot({
          path: path.join(artifacts, `armor-${width}.png`),
        });
        await evalGame(() => __MR_TEST__.draft());
        await page.screenshot({
          path: path.join(artifacts, `draft-${width}.png`),
        });
        await page.locator("#skipDraft").click();
        await reset();
        await evalGame(() => {
          const t = __MR_TEST__;
          t.setWeapon("laser", true);
          t.recruit("heavy");
          t.equipPet("dragon");
          t.spawnBoss();
          t.step(2.5);
        });
        await page.waitForTimeout(150);
        await page.screenshot({
          path: path.join(artifacts, `boss-${width}.png`),
        });
      }
    },
  );
  await check(
    "Nested Pages path, manifest and all V1.7 files launch offline",
    async () => {
      await page.goto(base);
      await page.waitForFunction(
        async () => !!(await navigator.serviceWorker.getRegistration())?.active,
        { timeout: 20000 },
      );
      await page.evaluate(async () => navigator.serviceWorker.ready);
      assert.equal(
        await evalGame(() => typeof window.__MR_TEST__),
        "undefined",
      );
      const r = await evalGame(async () => {
        const manifest = await (await fetch("./manifest.webmanifest")).json();
        const cache = await caches.open("monster-rush-road-squad-v17-2");
        const catalog = await (await fetch("./assets/v17/catalog.json")).json();
        const missing = [];
        for (const def of Object.values(catalog.actors))
          if (!(await cache.match("./assets/v17/" + def.file)))
            missing.push(def.file);
        for (const u of [
          "./",
          "./game.js",
          "./sprites.js",
          "./sprite-state.mjs",
          "./config/balance-v17.js",
          "./icons/icon-192.png",
        ])
          if (!(await cache.match(u))) missing.push(u);
        return {
          orientation: manifest.orientation,
          missing,
          count: (await cache.keys()).length,
        };
      });
      assert.equal(r.orientation, "portrait");
      assert.deepEqual(r.missing, []);
      await context.setOffline(true);
      await page.reload();
      await page.locator("#start").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#hud") &&
          !document.querySelector("#hud").classList.contains("hidden"),
      );
      await context.setOffline(false);
      return r;
    },
  );
  assert.deepEqual(errors, [], "Browser or WebGL errors");
  fs.writeFileSync(
    path.join(artifacts, "results.json"),
    JSON.stringify({ passed: results.length, results, errors }, null, 2),
  );
  console.log(
    `All ${results.length} browser checks passed. Artifacts: ${artifacts}`,
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    server.close();
  });
