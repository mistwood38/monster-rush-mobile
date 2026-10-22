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
      t.runModel().nextDraft=9999;t.runModel().eventTimer=9999;
      let seed = 12345;
      Math.random = () =>
        (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    });
  await check("360×800 and 393×873 layouts + menu", async () => {
    for (const [width, height] of [
      [360, 800],
      [393, 873],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight,
        ),
        true,
      );
      await page.screenshot({
        path: path.join(artifacts, `menu-${width}.png`),
      });
    }
  });
  await check(
    "Audio starts on a real user click, pauses and resumes",
    async () => {
      await page.locator("#start").click();
      await page.waitForFunction(() => window.__MR_TEST__.getAudio().playing);
      await page.locator("#pause").click();
      await page.waitForFunction(() => !window.__MR_TEST__.getAudio().playing);
      await page.locator("#resume").click();
      await page.waitForFunction(() => window.__MR_TEST__.getAudio().playing);
    },
  );
  await reset();
  await check(
    "Drag is relative, moves smoothly and stays within road",
    async () => {
      const canvas = page.locator("#game");
      await canvas.dispatchEvent("pointerdown", {
        clientX: 30,
        clientY: 650,
        pointerType: "touch",
        pointerId: 1,
        buttons: 1,
      });
      assert.equal(
        await page.evaluate(() => window.__MR_TEST__.state().targetX),
        0,
      );
      await canvas.dispatchEvent("pointermove", {
        clientX: 340,
        clientY: 650,
        pointerType: "touch",
        pointerId: 1,
        buttons: 1,
      });
      const moved = await page.evaluate(() => window.__MR_TEST__.step(0.5));
      assert.ok(moved.playerX > 4 && moved.playerX <= 4.8);
      await canvas.dispatchEvent("pointerup", {
        pointerId: 1,
        pointerType: "touch",
      });
    },
  );
  await check(
    "Every upgrade changes real combat output independently",
    async () => {
      const output = {};
      for (const [type, amount] of [
        ["lanes", 1],
        ["pellets", 2],
        ["rate", 0.25],
        ["speed", 0.35],
        ["damage", 0.5],
      ]) {
        await reset();
        const before = await page.evaluate(() => {
          const t = window.__MR_TEST__;
          t.fire();
          return t.metrics();
        });
        await reset();
        const after = await page.evaluate(
          (r) => {
            const t = window.__MR_TEST__;
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
          assert.ok(after.totalDamage > before.totalDamage * 2);
        }
        if (type === "rate") assert.ok(after.interval < before.interval);
        if (type === "speed") assert.ok(after.avgSpeed > before.avgSpeed);
        if (type === "damage")
          assert.ok(after.totalDamage > before.totalDamage);
        output[type] = {
          count: after.count,
          damage: after.totalDamage,
          interval: after.interval,
          speed: after.avgSpeed,
        };
      }
      return output;
    },
  );
  await check("All five weapons kill an off-center target", async () => {
    const output = {};
    for (const weapon of ["rifle", "machine", "shotgun", "plasma", "laser"]) {
      await reset();
      const state = await page.evaluate((weapon) => {
        const t = window.__MR_TEST__;
        t.forcePlayerX(-2);
        t.spawnEnemy("grunt", -2, -9);
        t.setWeapon(weapon, true);
        return t.step(3);
      }, weapon);
      assert.ok(state.kills >= 1, weapon + " failed to kill");
      output[weapon] = state.kills;
    }
    return output;
  });
  await reset();
  await check(
    "Fast projectile swept collision + target-positioned damage text",
    async () => {
      const result = await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.spawnEnemy("heavy", 2, -6);
        const e = t.getEnemy(),
          hp = e.hp;
        t.fire();
        const b = t.shots()[0];
        Object.assign(b, { prevX: 2, x: 2, prevZ: -2, z: -12 });
        const hit = t.processBulletCollisions(b, 0.04);
        return { hit, damage: hp - e.hp, text: t.effects().floating[0] };
      });
      assert.ok(result.hit && result.damage > 0);
      assert.ok(Math.abs(result.text.x - 2) < 0.3);
      assert.equal(result.text.z, -6);
    },
  );
  await reset();
  await check("Plasma splash kills adjacent enemies", async () => {
    const state = await page.evaluate(() => {
      const t = window.__MR_TEST__;
      t.setWeapon("plasma", true);
      t.spawnEnemy("grunt", -0.6, -9);
      t.spawnEnemy("grunt", 0.6, -9);
      return t.step(1.2);
    });
    assert.equal(state.kills, 2);
  });
  await reset();
  await check(
    "Portals charge without blocking shots; one reward per pair",
    async () => {
      const charged = await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.forcePlayerX(-2.45);
        t.configure({gateSequence:2});
        t.previewGates(-8);
        t.spawnEnemy("grunt", -2.45, -15);
        t.step(1.3);
        return { charge: t.getGate().charge, kills: t.state().kills };
      });
      assert.ok(
        charged.charge > 0 && charged.kills === 1,
        JSON.stringify(charged),
      );
      await reset();
      const pickup = await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.forcePlayerX(-2.45);
        t.previewGates(1.2);
        t.updateGatesCrates(0.04);
        return {
          state: t.state(),
          toast: document.querySelector("#upgradeToast").textContent,
        };
      });
      assert.equal(pickup.state.stats.lanes, 1);
      assert.equal(pickup.state.stats.pellets, 1);
      assert.ok(pickup.toast.includes("队员 +1"));
      assert.ok(!pickup.toast.includes("错过"));
    },
  );
  await reset();
  await check(
    "Laser damages Boss; lane/pellet/speed upgrades affect beams",
    async () => {
      const output = await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.spawnBoss();
        t.configure({ shootTimer: 999 });
        t.step(1.9);
        t.setWeapon("laser", true);
        const initial = t.boss().hp;
        t.fire();
        const base = initial - t.boss().hp;
        for (const r of [
          { type: "lanes", amount: 2 },
          { type: "pellets", amount: 2 },
          { type: "speed", amount: 0.35 },
        ])
          t.collectReward(r);
        const hp = t.boss().hp;
        t.fire();
        return {
          base,
          upgraded: hp - t.boss().hp,
          lanes: t.laser().beams.filter((b) => b.ray.visible).length,
          range: t.laser().beams[0].outer.scale.y,
        };
      });
      assert.ok(output.base > 0 && output.upgraded > output.base * 3);
      assert.equal(output.lanes, 3);
      assert.ok(output.range > 32);
      return output;
    },
  );
  await reset();
  await check(
    "Kill-charge overdrive boosts output, then expires; medkit heals",
    async () => {
      const output = await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.fire();
        const base = t.metrics();
        t.clearBullets();
        t.charge(10);
        t.fire();
        const boosted = t.metrics();
        const active = t.state().overdrive;
        t.step(6.2);
        const expired = t.state().overdrive;
        t.configure({ hp: 50 });
        t.forceCrate("medkit");
        return {
          base: base.interval,
          boosted: boosted.interval,
          damage: boosted.totalDamage,
          active,
          expired,
          hp: t.state().hp,
        };
      });
      assert.ok(output.boosted < output.base && output.damage > 12);
      assert.equal(output.active, 6);
      assert.equal(output.expired, 0);
      assert.equal(output.hp, 75);
      return output;
    },
  );
  await reset();
  await check(
    "Boss arrives at 95 seconds, warns, attacks, hurts and can die",
    async () => {
      const output = await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.configure({ time: 94.9, nextBoss: 95 });
        t.step(0.2);
        const spawned = t.state().boss;
        t.step(2.3);
        const warned = t.boss().phase === "warn";
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
          shots,
          hp,
          cleared: !t.state().boss,
          score: t.state().score,
        };
      });
      assert.ok(
        output.spawned &&
          output.warned &&
          output.shots > 0 &&
          output.hp < 100 &&
          output.cleared &&
          output.score > 1400,
      );
      return output;
    },
  );
  await reset();
  await check(
    "Recycled impact particles remain attached and are bounded",
    async () => {
      const result = await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.emit(3, 1, -9, "#ffcc99", 12);
        const initial = t.effects().active;
        t.updateEffects(1);
        const pooled = t.effects().pooled;
        t.emit(3, 1, -9, "#ffcc99", 8);
        const reused = t.effects().active;
        for (let i = 0; i < 30; i++) t.emit(0, 1, -5, "#ffffff", 24);
        return { initial, pooled, reused, capped: t.effects().active };
      });
      assert.equal(result.initial, 12);
      assert.ok(result.pooled >= 12);
      assert.equal(result.reused, 8);
      assert.ok(result.capped <= 100);
      return result;
    },
  );
  await check(
    "Weapon noise goes to effects volume, drum noise to music volume",
    async () => {
      const routing = await page.evaluate(async () => {
        const { BattleAudio } = await import("./audio.js");
        const a = new BattleAudio(),
          routes = [];
        a.enabled = true;
        a.sfxGain = "effects";
        a.musicGain = "music";
        const node = () => ({
          connect() {},
          start() {},
          stop() {},
          frequency: { value: 0 },
        });
        a.context = {
          createBufferSource: node,
          createBiquadFilter: node,
          createGain: () => ({
            gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect(out) {
              routes.push(out);
            },
          }),
        };
        a.noiseHit(0, 0.1, 0.4);
        a.noiseHit(0, 0.1, 0.4, 3400, a.musicGain);
        return routes;
      });
      assert.deepEqual(routing, ["effects", "music"]);
    },
  );
  await reset();
  await check(
    "Death, score persistence, restart and both mixer readouts",
    async () => {
      await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.configure({ score: 321 });
        t.hurtPlayer(100, 0);
      });
      assert.equal(await page.locator("#endPanel").isVisible(), true);
      assert.equal(
        await page.evaluate(() => localStorage.getItem("mr2-best")),
        "321",
      );
      await page.locator("#again").click();
      await page.waitForFunction(() => window.__MR_TEST__.getAudio().playing);
      assert.equal(
        await page.evaluate(() => window.__MR_TEST__.state().hp),
        100,
      );
      await page.locator("#pause").click();
      await page.locator("#musicVolume").fill("32");
      await page.locator("#musicVolume").dispatchEvent("input");
      const values = await page.evaluate(() => [
        localStorage.getItem("mr2-music"),
        document.querySelector("#musicValue").textContent,
        document.querySelector("#menuMusicValue").textContent,
      ]);
      assert.deepEqual(values, ["0.32", "32%", "32%"]);
      await page.locator("#resume").click();
    },
  );
  await reset();
  await check(
    "180-second combat soak: bounds, wave relief and automatic Boss",
    async () => {
      const output = await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.configure({
          spawnTimer: 0.1,
          gateTimer: 1,
          crateTimer: 10,
          invuln: 10000,
        });
        t.setWeapon("machine", true);
        t.collectReward({ type: "lanes", amount: 2 });
        t.collectReward({ type: "damage", amount: 0.5 });
        const cap = { enemies: 0, bullets: 0, particles: 0 };
        let sawBoss = false;
        for (let i = 0; i < 720; i++) {
          t.configure({hp:100});t.setTarget(Math.sin(i * 0.11) * 3.2);
          t.step(0.25);
          const s = t.state();
          sawBoss ||= s.boss;
          cap.enemies = Math.max(cap.enemies, s.enemies);
          cap.bullets = Math.max(cap.bullets, s.bullets);
          cap.particles = Math.max(cap.particles, t.effects().active);
        }
        return {
          time: t.state().time,
          kills: t.state().kills,
          cap,
          sawBoss,
          activeInterval: t.interval(18),
          reliefInterval: t.interval(21),
        };
      });
      assert.ok(output.time >= 179 && output.kills > 20 && output.sawBoss);
      assert.ok(
        output.cap.enemies <= 24 &&
          output.cap.bullets <= 260 &&
          output.cap.particles <= 110,
      );
      assert.ok(output.reliefInterval > output.activeInterval * 3);
      return output;
    },
  );
  await reset();
  await check(
    "Boss phase shields prevent a maximum-damage instant kill",
    async () => {
      const output = await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.configure({ shootTimer: 999 });
        t.spawnBoss();
        const full = t.boss().hp;
        t.damageBoss(100000);
        const guarded = t.boss().hp;
        t.step(1.9);
        t.damageBoss(100000);
        const first = t.boss().hp;
        t.damageBoss(100000);
        const blocked = t.boss().hp;
        t.step(2.3);
        t.damageBoss(100000);
        const second = t.boss().hp;
        return {
          full,
          guarded,
          first,
          blocked,
          second,
          phase: t.boss().armorPhase,
        };
      });
      assert.equal(output.guarded, output.full);
      assert.equal(output.first, output.blocked);
      assert.ok(output.second > 0 && output.second < output.first);
      assert.equal(output.phase, 2);
      return output;
    },
  );
  await check(
    "Normal-health simulation rewards movement and collecting upgrades",
    async () => {
      const output = await page.evaluate(async () => {
        const t = window.__MR_TEST__,
          runs = [];
        for (const active of [false, true]) {
          await t.start();
          await t.silence();
          t.runModel().nextDraft=9999;t.runModel().eventTimer=9999;
          let seed = 17;
          Math.random = () =>
            (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
          let dodgeUntil = 0,
            dodgeX = 0,
            sawBoss = false;
          for (let i = 0; i < 1200 && t.state().mode === "playing"; i++) {
            const s = t.state();
            sawBoss ||= s.boss;
            if (active) {
              const boss = t.boss();
              if (
                boss?.phase === "warn" &&
                Math.abs(boss.targetX - s.playerX) < 1.6
              ) {
                dodgeUntil = s.time + 2.1;
                dodgeX = boss.targetX > 0 ? -4.2 : 4.2;
              }
              const danger = t
                  .enemyList()
                  .find(
                    (e) =>
                      !e.dead && e.z > -4 && Math.abs(e.x - s.playerX) < 1.5,
                  ),
                supplies = t.supply();
              const pickup = [
                ...supplies.crates,
                ...supplies.gates.filter((g) => !g.resolved),
              ]
                .filter((x) => x.z > -20)
                .sort((a, b) => b.z - a.z)[0];
              const enemy = t
                .enemyList()
                .filter((e) => !e.dead)
                .sort((a, b) => b.z - a.z)[0];
              const target =
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
                          : 0;
              t.setTarget(target);
            }
            t.step(0.1);
          }
          const s = t.state();
          runs.push({
            active,
            seconds: +s.time.toFixed(1),
            kills: s.kills,
            hp: s.hp,
            sawBoss,
          });
        }
        return runs;
      });
      assert.equal(output[0].hp, 0);
      assert.ok(
        output[1].seconds > output[0].seconds &&
          output[1].kills > output[0].kills &&
          output[1].sawBoss,
      );
      return output;
    },
  );
  await reset();
  await check(
    "Lower-tier supplies cannot downgrade weapons; capped gates become repairs",
    async () => {
      const output = await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.setWeapon("laser", true);
        t.configure({ hp: 50 });
        t.forceCrate("rifle");
        const weapon = t.state().weapon,
          damage = t.state().stats.damage;
        for (let i = 0; i < 4; i++)
          t.collectReward({ type: "lanes", amount: 1 });
        t.configure({ hp: 50 });
        t.collectReward({ type: "lanes", amount: 3 });
        return {
          weapon,
          damage,
          lanes: t.state().stats.lanes,
          hp: t.state().hp,
          toast: document.querySelector("#upgradeToast").textContent,
        };
      });
      assert.equal(output.weapon, "laser");
      assert.ok(output.damage > 1);
      assert.equal(output.lanes, 5);
      assert.equal(output.hp, 62);
      assert.ok(output.toast.includes("装甲修复"));
      return output;
    },
  );
  await reset();
  await check('Uploaded art decodes; scrolling road changes without moving the camera',async()=>{
    await page.waitForFunction(()=>window.__MR_TEST__.artStatus().loaded);
    const r=await page.evaluate(()=>{const t=window.__MR_TEST__,before=t.roadOffset();t.step(1);return {art:t.artStatus(),before,after:t.roadOffset(),projection:t.playerProjection()};});
    assert.deepEqual(r.art.errors,[]);assert.notEqual(r.before,r.after);assert.ok(r.projection.headY>400);return r;
  });
  await reset();
  await check('Four teammates persist, fire role weapons, promote, collide, fall and refill',async()=>{
    const r=await page.evaluate(()=>{
      const t=window.__MR_TEST__;t.configure({shootTimer:999});for(const role of ['assault','heavy','guard','assault'])t.recruit(role);t.promote('heavy');t.promote('heavy');t.step(.03);
      const roles=t.systems().team.map(m=>[m.role,m.level]);
      t.spawnEnemy('heavy',0,-9);const e=t.getEnemy();e.hp=e.maxHp=1500;t.step(2);
      const dealt=1500-e.hp, shots=t.shots().filter(b=>b.owner==='team').length;
      const model=t.runModel(),victim=model.team[0],id=victim.id;victim.hp=1;t.spawnEnemy('grunt',victim.x,victim.z);t.step(.025);
      const fallen=!model.team.some(m=>m.id===id);t.recruit('guard');
      // remove hostile objects, retain squad; waiting never despawns them.
      for(const en of t.enemyList()){en.hp=1;t.damageEnemy(en,999,false);}t.step(2);
      t.configure({spawnTimer:9999,gateTimer:9999,crateTimer:9999,nextBoss:9999,hp:100});t.step(100);
      return {roles,dealt,shots,fallen,team:t.systems().team.length,totals:t.systems().totals};
    });
    assert.deepEqual(r.roles.map(a=>a[0]),['assault','heavy','guard','assault']);assert.equal(r.roles[1][1],3);assert.ok(r.dealt>0&&r.shots>0&&r.fallen);assert.equal(r.team,4);return r;
  });
  await reset();
  await check('Recruit, team and promotion gates change real squad attributes',async()=>{
    const r=await page.evaluate(()=>{const t=window.__MR_TEST__;t.collectReward({type:'recruit',role:'heavy',value:'招募 +1'});const a=t.systems();t.collectReward({type:'team',value:'团队 +8%'});t.collectReward({type:'promote',value:'职业 +1'});return {a,b:t.systems()};});
    assert.equal(r.a.team.length,1);assert.equal(r.b.teamPower,1);assert.equal(r.b.team[0].level,2);
  });
  await reset();
  await check('Every pet has actual skills, bounded levels, cooldown and replacement',async()=>{
    const outputs=await page.evaluate(async()=>{
      const t=window.__MR_TEST__,results=[];t.configure({shootTimer:999});
      for(const kind of ['dragon','owl','drone','fairy']){
        for(let i=0;i<4;i++)t.equipPet(kind);
        t.spawnEnemy('heavy',0,-12);const e=t.enemyList().at(-1);e.hp=e.maxHp=1000;
        t.configure({hp:50,invuln:0});const model=t.runModel();model.pet.cooldown=.01;
        t.updateRunSystems(.02);const hpAfterSkill=t.state().hp,shield=model.shield,slow=e.slowTime||0,damage=1000-e.hp;
        t.hurtPlayer(10,.1);const hpAfterHit=t.state().hp;
        results.push({kind,level:model.pet.level,cooldown:model.pet.cooldown,hpAfterSkill,hpAfterHit,shield,slow,damage});
      }
      return results;
    });
    assert.ok(outputs.every(p=>p.level===3&&p.cooldown>5));assert.ok(outputs[0].damage>0);assert.ok(outputs[1].hpAfterHit>40&&outputs[1].slow>0);assert.ok(outputs[2].shield>0&&outputs[2].hpAfterHit===50);assert.ok(outputs[3].hpAfterSkill>50);return outputs;
  });
  await reset();
  await check('All three armors transform firepower, expire and restore the exact base weapon/stats',async()=>{
    const r=await page.evaluate(()=>{const t=window.__MR_TEST__,out=[];t.setWeapon('plasma',true);t.collectReward({type:'damage',amount:.5});const base=t.combatStats();
      for(const kind of ['thunder','molten','phantom']){t.armor(kind);const boosted=t.combatStats();t.step(.1);const active=t.systems().armor.remaining,visible=document.querySelector('#armorStatus').textContent;t.step(12);out.push({kind,base,boosted,active,visible,ended:t.systems().armor,after:t.combatStats(),weapon:t.state().weapon});}return out;
    });
    for(const x of r){assert.ok(x.boosted.damage>x.base.damage&&x.active>11);assert.equal(x.ended,null);assert.deepEqual(x.after,x.base);assert.equal(x.weapon,'plasma');}return r.map(x=>({kind:x.kind,active:x.active,restored:true}));
  });
  await reset();
  await check('Elemental affixes apply DOT, movement slow, bounded chain and splash without recursion',async()=>{
    const r=await page.evaluate(()=>{const t=window.__MR_TEST__;t.configure({shootTimer:999});for(const a of ['burn','frost','arc','blast'])t.affix(a);
      for(const x of [0,1,1.6]){t.spawnEnemy('heavy',x,-10);const e=t.enemyList().at(-1);e.hp=e.maxHp=1000;}
      const [a,b,c]=t.enemyList();t.damageEnemy(a,10,false);const direct={a:a.hp,b:b.hp,c:c.hp,burn:a.burnTime,slow:a.slow};t.step(.6);const after={a:a.hp,b:b.hp,c:c.hp};return {direct,after,cd:{arc:t.runModel().arcCD,blast:t.runModel().blastCD}};
    });
    assert.ok(r.direct.b<1000&&r.direct.c<1000&&r.direct.a===990);assert.ok(r.direct.burn>0&&r.direct.slow>0);assert.ok(r.after.a<r.direct.a);assert.ok(r.after.b===r.direct.b&&r.after.c===r.direct.c);return r;
  });
  await reset();
  await check('Survival and tech affixes heal on cadence, absorb damage, execute and expand pickup range',async()=>{
    const r=await page.evaluate(()=>{const t=window.__MR_TEST__;t.configure({hp:40,shootTimer:999});t.affix('recovery');t.affix('barrier');t.affix('capacitor');t.affix('salvage');t.step(8.1);const healed=t.state().hp,shield=t.systems().shield;t.hurtPlayer(8,.8);const blocked=t.state().hp;
      t.spawnEnemy('grunt',0,-12);t.damageEnemy(t.getEnemy(),1000,false);const killHeal=t.state().hp;t.spawnEnemy('grunt',0,-13);t.damageEnemy(t.enemyList().at(-1),1000,false);const secondKill=t.state().hp;
      t.affix('execution','salvage');t.spawnEnemy('heavy',0,-15);const e=t.enemyList().at(-1);e.maxHp=100;e.hp=20;t.damageEnemy(e,10,false);const execution=e.hp;
      t.configure({hp:50});t.spawnCrate('medkit',1.7,1.2);t.updateGatesCrates(.01);const before=t.state().hp;t.affix('magnet','execution');t.updateGatesCrates(.01);return {healed,shield,blocked,killHeal,secondKill,execution,before,after:t.state().hp};
    });
    assert.ok(r.healed>40&&r.shield>0);assert.equal(r.blocked,r.healed);assert.equal(r.killHeal,r.secondKill);assert.equal(r.execution,8);assert.equal(r.before,50);assert.equal(r.after,75);return r;
  });
  await reset();
  await check('Three-choice UI freezes combat; four-slot replacement and skip resume safely',async()=>{
    await page.evaluate(()=>{const t=window.__MR_TEST__;for(const a of ['burn','frost','arc','blast'])t.affix(a);t.runModel().nextDraft=.02;t.step(.1);});
    assert.equal(await page.locator('#draftPanel').isVisible(),true);assert.equal(await page.locator('.draft-card').count(),3);
    const frozen=await page.evaluate(()=>{const t=window.__MR_TEST__,before=t.state().time;t.step(3);return before===t.state().time;});assert.equal(frozen,true);
    await page.evaluate(()=>{const t=window.__MR_TEST__,r=t.runModel();r.offers=['magnet'];t.choose('magnet');});
    assert.equal(await page.locator('.draft-card').count(),4);await page.locator('.draft-card').first().click();
    assert.equal(await page.evaluate(()=>window.__MR_TEST__.systems().affixes.length),4);assert.equal(await page.evaluate(()=>window.__MR_TEST__.state().mode),'playing');
    await page.evaluate(()=>window.__MR_TEST__.draft());await page.locator('#skipDraft').click();assert.equal(await page.evaluate(()=>window.__MR_TEST__.state().mode),'playing');
  });
  await reset();
  await check('Flanking enemies breach the defense and cause damage even during contact invulnerability',async()=>{
    const r=await page.evaluate(()=>{const t=window.__MR_TEST__;t.forcePlayerX(-4.8);t.configure({shootTimer:999,hp:100,invuln:999});t.spawnEnemy('grunt',4.8,4.3);t.step(.025);return {hp:t.state().hp,breaches:t.systems().totals.breaches,enemies:t.state().enemies};});
    assert.ok(r.hp<100);assert.equal(r.breaches,1);assert.equal(r.enemies,0);return r;
  });
  await reset();
  await check('Weapon crates use a generous swept pickup window consistent with their size',async()=>{
    const r=await page.evaluate(()=>{const t=window.__MR_TEST__;t.spawnCrate('machine',1.45,.9);t.updateGatesCrates(.4);return t.state();});assert.equal(r.weapon,'machine');assert.equal(r.crates,0);
  });
  await reset();
  await check('Road event cycle produces rescues, pets, an armed truck and elite bounty',async()=>{
    const r=await page.evaluate(()=>{const t=window.__MR_TEST__,out=[];t.configure({shootTimer:999});for(let i=0;i<4;i++){for(const c of t.supply().crates)c.z=10;t.updateGatesCrates(.01);t.runModel().eventTimer=0;t.step(.025);out.push({event:t.systems().event,kind:t.supply().crates.at(-1)?.system?.kind,bounty:t.enemyList().some(e=>e.bounty)});}return out;});
    assert.deepEqual(r.map(x=>x.kind),['rescue','pet','truck','armor']);assert.equal(r[3].bounty,true);return r;
  });
  await reset();
  await check('Boss schedule follows 95, 180 and 270 seconds with escalating health',async()=>{
    const out=[];for(const time of [95,180,270]){await reset();out.push(await page.evaluate(time=>{const t=window.__MR_TEST__;t.configure({time:time-.01,nextBoss:time});t.step(.025);return {time,hp:t.boss()?.hp,nextBoss:t.state().boss};},time));}
    assert.ok(out.every(x=>x.nextBoss));assert.ok(out[2].hp>out[1].hp&&out[1].hp>out[0].hp);return out;
  });
  await reset();
  await check('Integrated 300-second formation/pet/armor/affix simulation stays within object limits',async()=>{
    const r=await page.evaluate(()=>{const t=window.__MR_TEST__;t.configure({spawnTimer:.1,gateTimer:1,crateTimer:8});t.runModel().eventTimer=8;t.runModel().nextDraft=18;t.recruit('assault');t.recruit('heavy');t.recruit('guard');t.recruit('assault');t.equipPet('dragon');t.setWeapon('plasma',true);
      const max={enemies:0,bullets:0,particles:0,shots:0},seen={drafts:0,boss:false,armor:false};
      for(let i=0;i<3000;i++){
        if(t.state().mode==='draft'){const r=t.runModel();if(r.pendingReplacement)t.choose(r.affixes[0].id);else t.choose(r.offers[0]);seen.drafts++;}
        t.configure({hp:100,invuln:1});if(i%700===0)t.armor(['thunder','molten','phantom'][Math.floor(i/700)%3]);
        t.setTarget(Math.sin(i*.03)*3.6);t.step(.1);const s=t.state();seen.boss||=s.boss;seen.armor||=!!t.systems().armor;
        max.enemies=Math.max(max.enemies,s.enemies);max.bullets=Math.max(max.bullets,s.bullets);max.particles=Math.max(max.particles,t.effects().active);max.shots=Math.max(max.shots,s.enemyShots);
      }
      return {time:t.state().time,max,seen,systems:t.systems(),drawCalls:t.metrics().drawCalls};
    });
    assert.ok(r.time>295&&r.seen.drafts>5&&r.seen.boss&&r.seen.armor);assert.ok(r.max.enemies<=24&&r.max.bullets<=220&&r.max.particles<=110&&r.max.shots<=60);assert.ok(r.systems.team.length<=4&&r.systems.affixes.length<=4);return {time:r.time,max:r.max,seen:r.seen};
  });
  await reset();
  await reset();
  await check('Pet road choice upgrades the current companion or replaces it, never both',async()=>{
    const r=await page.evaluate(()=>{const t=window.__MR_TEST__;t.equipPet('dragon');t.runModel().eventIndex=5;t.runModel().eventTimer=0;t.step(.025);const boxes=t.supply().crates.filter(c=>c.system?.kind==='pet');const upgrade=boxes.find(c=>c.system.value==='dragon');t.forcePlayerX(upgrade.x);for(const c of boxes)c.z=1.3;t.updateGatesCrates(.025);t.updateGatesCrates(.025);return {pet:t.systems().pet,unresolved:t.supply().crates.filter(c=>c.choiceId&&!c.resolved).length};});
    assert.equal(r.pet.kind,'dragon');assert.equal(r.pet.level,2);assert.equal(r.unresolved,0);return r;
  });
  await reset();
  await check('Full squad and extreme player positions stay within the mobile camera',async()=>{
    const all=[];for(const width of [360,393]){
      await page.setViewportSize({width,height:width===360?800:873});
      for(const x of [-4.8,0,4.8])all.push(await page.evaluate(x=>{const t=window.__MR_TEST__;if(!t.systems().team.length)for(let i=0;i<4;i++)t.recruit('assault');t.forcePlayerX(x);t.step(.8);const p=t.project(x,1.2,2.4);return {width:innerWidth,x,player:p,team:t.systems().team.map(m=>t.project(m.x,1.2,m.z))};},x));
    }
    for(const f of all)for(const p of [f.player,...f.team])assert.ok(p.x>8&&p.x<f.width-8,JSON.stringify(f));return all.map(f=>({width:f.width,x:f.x,playerX:f.player.x}));
  });
  await reset();
  await check('Projectile instancing renders the maximum pool in two draws and restart releases actor resources',async()=>{
    await page.evaluate(()=>{const t=window.__MR_TEST__;t.collectReward({type:'lanes',amount:4});t.collectReward({type:'pellets',amount:7});for(let i=0;i<10;i++)t.fire();});
    await page.waitForTimeout(100);const stress=await page.evaluate(()=>window.__MR_TEST__.metrics());assert.equal(stress.count,220);assert.ok(stress.drawCalls<130,JSON.stringify(stress));
    const memories=[];
    for(let i=0;i<6;i++){
      await reset();await page.evaluate(i=>{const t=window.__MR_TEST__;t.recruit('guard');t.equipPet(['dragon','owl','drone','fairy'][i%4]);t.armor(['thunder','molten','phantom'][i%3]);t.spawnEnemy('heavy',0,-12);t.step(.1);},i);await page.waitForTimeout(50);await reset();await page.waitForTimeout(50);memories.push(await page.evaluate(()=>window.__MR_TEST__.metrics().memory));
    }
    assert.ok(memories.at(-1).textures<=memories[2].textures+5,JSON.stringify(memories));assert.ok(memories.at(-1).geometries<=memories[2].geometries+5,JSON.stringify(memories));return {active:stress.count,drawCalls:stress.drawCalls,memories};
  });
  await reset();
  await check('Final formation, draft, pet, armor and Boss screenshots at both phone sizes',async()=>{
    for(const [width,height]of [[360,800],[393,873]]){
      await page.setViewportSize({width,height});await reset();await page.evaluate(()=>{const t=window.__MR_TEST__;t.setWeapon('plasma',true);t.recruit('assault');t.recruit('heavy');t.recruit('guard');t.recruit('assault');t.equipPet('owl');t.armor('thunder');for(const id of ['burn','arc','rally','barrier'])t.affix(id);for(const [type,x,z]of [['grunt',-3,-8],['charger',2,-12],['heavy',-2,-17],['ranged',3,-23],['elite',0,-24]])t.spawnEnemy(type,x,z);t.step(.1);});
      await page.waitForTimeout(250);await page.screenshot({path:path.join(artifacts,`formation-${width}.png`)});
      await page.evaluate(()=>window.__MR_TEST__.draft());await page.screenshot({path:path.join(artifacts,`draft-${width}.png`)});await page.locator('#skipDraft').click();
      await reset();await page.evaluate(()=>{const t=window.__MR_TEST__;t.setWeapon('laser',true);t.recruit('heavy');t.equipPet('dragon');t.armor('molten');t.spawnBoss();t.step(2.5);});await page.waitForTimeout(200);await page.screenshot({path:path.join(artifacts,`final-boss-${width}.png`)});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight));
    }
  });

  await check(
    "Representative upgrade, heavy-weapon and Boss screenshots",
    async () => {
      await reset();
      await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.previewGates(-14);
        t.step(0.1);
      });
      await page.screenshot({ path: path.join(artifacts, "upgrade-393.png") });
      await reset();
      await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.setWeapon("laser", true);
        t.configure({ time: 42 });
        t.charge(6);
        for (const [type, x, z] of [
          ["grunt", -2, -9],
          ["runner", 3, -12],
          ["heavy", -4, -19],
          ["ranged", 2, -25],
          ["elite", 0, -20],
        ])
          t.spawnEnemy(type, x, z);
        t.step(0.025);
        t.fire();
      });
      await page.waitForTimeout(1050);
      await page.screenshot({ path: path.join(artifacts, "battle-393.png") });
      await reset();
      await page.evaluate(() => {
        const t = window.__MR_TEST__;
        t.configure({ time: 78 });
        t.spawnBoss();
        t.setWeapon("plasma", true);
        t.step(2.5);
      });
      await page.waitForTimeout(1050);
      await page.screenshot({ path: path.join(artifacts, "boss-393.png") });
    },
  );
  await check(
    "Nested Pages path + normal mode + offline assets and PNG icons",
    async () => {
      await page.goto(base);
      await page.evaluate(async () => navigator.serviceWorker.ready);
      assert.equal(
        await page.evaluate(() => typeof window.__MR_TEST__),
        "undefined",
      );
      const manifest = await page.evaluate(async () =>
        (await fetch("./manifest.webmanifest")).json(),
      );
      assert.equal(manifest.orientation, "portrait");
      assert.ok(
        manifest.icons.some((i) => i.sizes === "192x192") &&
          manifest.icons.some((i) => i.sizes === "512x512"),
      );
      const cached = await page.evaluate(async () => {
        const cache = await caches.open("monster-rush-road-squad-review-1");
        return Promise.all(
          [
            "./",
            "./game.js",
            "./audio.js",
            "./systems.js",
            "./config/catalog.js",
            "./assets/characters/player_soldier_back.webp",
            "./assets/pets/dragon.svg",
            "./vendor/three/three.module.min.js",
            "./icons/icon-192.png",
            "./icons/icon-512.png",
          ].map(async (url) => !!(await cache.match(url))),
        );
      });
      assert.ok(cached.every(Boolean));
      await context.setOffline(true);
      await page.reload();
      assert.equal(await page.locator("#start").isVisible(), true);
      await page.locator("#start").click();
      assert.equal(await page.locator("#hud").isVisible(), true);
      await context.setOffline(false);
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
