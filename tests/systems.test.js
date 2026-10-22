import test from "node:test";
import assert from "node:assert/strict";
import { RunSystems } from "../systems.js";
import {
  AFFIXES,
  ROLES,
  PETS,
  ARMORS,
  RULES,
  BALANCE,
} from "../config/catalog.js";
const base = { lanes: 1, pellets: 1, fireRate: 1, bulletSpeed: 1, damage: 1 };
const add = (r, id, n = 1) => {
  for (let i = 0; i < n; i++) assert.equal(r.selectAffix(id), true);
};
test("Official catalog is exactly the delivered 20 IDs with two levels and real icon paths", () => {
  assert.deepEqual(
    AFFIXES.map((a) => a.id),
    BALANCE.trait_catalog.map((a) => a.id),
  );
  assert.equal(new Set(AFFIXES.map((a) => a.category)).size, 5);
  assert.equal(RULES.maxLevel, 2);
  assert.ok(AFFIXES.every((a) => a.icon.endsWith(".webp")));
});
test("Numeric gate caps and 40-DPS starting rifle formula are independent", () => {
  const r = new RunSystems();
  assert.deepEqual(r.stats(base), base);
  assert.deepEqual(
    r.stats({
      lanes: 99,
      pellets: 99,
      fireRate: 99,
      bulletSpeed: 99,
      damage: 99,
    }),
    { lanes: 3, pellets: 3, fireRate: 2, bulletSpeed: 2, damage: 2.2 },
  );
  assert.equal(
    BALANCE.player.rifle_damage * BALANCE.player.rifle_shots_per_second,
    40,
  );
});
test("Four permanent teammates: role caps, true HP, death, no auto resurrection, refill", () => {
  const r = new RunSystems();
  r.recruit("guard");
  r.recruit("heavy");
  r.recruit("heavy");
  assert.equal(r.recruit("guard"), null);
  assert.equal(r.recruit("heavy"), null);
  r.recruit();
  assert.equal(r.team.length, 4);
  r.recruit();
  for (let i = 0; i < 100; i++) r.tick(1);
  assert.equal(r.team.length, 4);
  const id = r.team[0].id;
  r.hurtMember(r.team[0], 9999);
  r.tick(100);
  assert.equal(r.team.length, 3);
  assert.ok(!r.team.some((m) => m.id === id));
  r.recruit();
  assert.equal(r.team.length, 4);
});
test("Promotion chooses one lowest eligible member and never lowers HP percentage", () => {
  const r = new RunSystems();
  for (let i = 0; i < 4; i++) r.recruit();
  r.team[0].hp = 20;
  r.promote("heavy");
  assert.equal(r.team[0].role, "heavy");
  assert.equal(r.team[0].level, 2);
  assert.equal(r.team[0].hp / r.team[0].maxHp, 0.5);
  r.promote("guard");
  assert.equal(r.team.filter((m) => m.role === "guard").length, 1);
  r.promote("heavy");
  assert.equal(r.team.filter((m) => m.role === "heavy").length, 2);
  for (let i = 0; i < 15; i++) r.promote();
  assert.ok(r.team.every((m) => m.level === 3));
});
test("DPS example: each assault I inherits 50% damage/rate gate increment only", () => {
  const r = new RunSystems(),
    m = r.recruit();
  const d =
    r.teamDamage(m, { damage: 1.6, fireRate: 1.5 }) *
    r.teamRate({ damage: 1.6, fireRate: 1.5 }) *
    15;
  assert.equal(d, 24.375);
  r.activateArmor("thunder");
  r.equipPet("dragon");
  assert.equal(
    r.teamDamage(m, { damage: 1.6, fireRate: 1.5 }) *
      r.teamRate({ damage: 1.6, fireRate: 1.5 }) *
      15,
    d,
  );
});
for (const kind of Object.keys(PETS))
  test(
    "Pet " + kind + " waits for a valid target and has official cooldown",
    () => {
      const r = new RunSystems();
      r.equipPet(kind);
      r.tick(30, { hp: 100, enemiesNearby: false });
      assert.equal(r.totals.petSkills, 0);
      const o = r.tick(0.01, {
        hp: kind === "fairy" ? 40 : 100,
        enemiesNearby: true,
      });
      assert.equal(o.pet, kind);
      assert.equal(r.pet.cooldown, PETS[kind].cooldown);
      assert.equal(r.tick(0.01, { hp: 40, enemiesNearby: true }).pet, null);
    },
  );
test("Pet swap preserves slot level and normalized cooldown; no reset exploit", () => {
  const r = new RunSystems();
  r.equipPet("dragon");
  r.equipPet("dragon");
  r.equipPet("dragon");
  r.tick(0.1, { hp: 100, enemiesNearby: true });
  r.tick(5, { hp: 100, enemiesNearby: true });
  const progress = r.pet.cooldown / 20;
  r.equipPet("fairy");
  assert.equal(r.pet.level, 3);
  assert.equal(r.pet.cooldown / 28, progress);
  r.equipPet("fairy");
  assert.equal(r.pet.level, 3);
  assert.equal(r.pet.cooldown / 28, progress);
});
test("Dragon buffs are temporary; owl mitigation is halved against bosses", () => {
  const r = new RunSystems();
  r.equipPet("dragon");
  r.tick(0.1, { hp: 100, enemiesNearby: true });
  assert.equal(r.stats(base).damage, 1.15);
  r.tick(5.1, { hp: 100, enemiesNearby: true });
  assert.equal(r.stats(base).damage, 1);
  r.equipPet("owl");
  r.pet.cooldown = 0;
  r.tick(0.1, { hp: 100, enemiesNearby: true });
  assert.equal(r.mitigate(100), 80);
  assert.equal(r.mitigate(100, null, true), 90);
});
test("Healer and shield target the most endangered unit; shields do not stack", () => {
  const r = new RunSystems(),
    m = r.recruit();
  m.hp = 2;
  r.equipPet("fairy");
  r.tick(0.1, { hp: 100, enemiesNearby: true });
  assert.equal(m.hp, 12);
  r.equipPet("drone");
  r.pet.cooldown = 0;
  r.tick(0.1, { hp: 100, enemiesNearby: true });
  assert.equal(m.shield, 20);
  r.addShield(10, m);
  assert.equal(m.shield, 20);
  r.addShield(26, m);
  assert.equal(m.shield, 26);
});
for (const kind of Object.keys(ARMORS))
  test(
    "Armor " +
      kind +
      " expires in 12s, preserves baseline, cannot stack/refresh",
    () => {
      const r = new RunSystems();
      r.activateArmor(kind);
      assert.ok(r.stats(base).damage > 1);
      r.tick(5);
      const remaining = r.armor.remaining;
      assert.equal(r.activateArmor("phantom"), false);
      assert.equal(r.armor.remaining, remaining);
      r.tick(7.01);
      assert.equal(r.armor, null);
      assert.deepEqual(r.stats(base), base);
    },
  );
test("Armor roll: not eligible before 45s, three misses then fourth actual box guaranteed", () => {
  const r = new RunSystems();
  assert.equal(
    r.rollArmor(44, () => 0.9),
    null,
  );
  assert.equal(r.eligibleCrates, 0);
  for (let i = 0; i < 3; i++)
    assert.equal(
      r.rollArmor(46, () => 0.9),
      null,
    );
  assert.ok(r.rollArmor(46, () => 0.9));
  assert.equal(r.eligibleCrates, 4);
  assert.equal(r.armorDrops, 1);
  assert.equal(r.armorMisses, 0);
});
test("Four slots, two levels, replacement, and prerequisite-filtered diverse three choices", () => {
  const r = new RunSystems();
  const blocked = [
    "guardian_line",
    "pet_resonance",
    "energy_recycling",
    "armor_overclock",
    "armor_endurance",
  ];
  assert.ok(blocked.every((id) => !r.eligible(id)));
  for (const id of [
    "piercing_core",
    "spread_shot",
    "focus_combo",
    "critical_calibration",
  ])
    add(r, id);
  assert.equal(r.selectAffix("armor_training"), "replace");
  assert.equal(r.selectAffix("armor_training", "focus_combo"), true);
  add(r, "armor_training");
  assert.equal(r.selectAffix("armor_training"), false);
  const offers = r.rollOffers(() => 0.5);
  assert.equal(new Set(offers).size, 3);
  assert.ok(!offers.some((id) => blocked.includes(id)));
  assert.ok(
    offers.some((id) => AFFIXES.find((a) => a.id === id).category !== "弹幕"),
  );
});
test("Focus caps, crit is 1.5x, and direct hit accounting is per target", () => {
  const r = new RunSystems(),
    a = {},
    b = {};
  add(r, "focus_combo", 2);
  add(r, "critical_calibration", 2);
  let h;
  for (let i = 0; i < 30; i++) h = r.directHit(a, 100, () => 1);
  assert.ok(Math.abs(h.damage - 112) < 1e-8);
  assert.equal(r.directHit(b, 100, () => 0).damage, 150);
});
test("Lightning: every ten direct hits, 2/3 neighbors, cooldown; splash never self-counts", () => {
  const r = new RunSystems();
  add(r, "chain_lightning");
  for (let i = 0; i < 9; i++)
    assert.equal(r.directHit({}, 10, () => 1).chain, 0);
  assert.equal(r.directHit({}, 10, () => 1).chain, 2);
  for (let i = 0; i < 20; i++)
    assert.equal(r.directHit({}, 10, () => 1).chain, 0);
  r.tick(3.01);
  assert.equal(r.directHit({}, 10, () => 1).chain, 2);
});
test("Explosive hits, frost caps and burn probability match the formal data", () => {
  const r = new RunSystems();
  add(r, "explosive_round");
  add(r, "frost_round", 2);
  add(r, "scorch_mag", 2);
  let hit;
  for (let i = 0; i < 12; i++) hit = r.directHit({}, 10, () => 0);
  assert.equal(hit.explode, true);
  assert.equal(hit.slow, 0.2);
  assert.equal(hit.burn, 3);
  assert.equal(r.directHit({}, 10, () => 0.23).burn, 0);
});
test("Command affects teammates only, reload is 4 seconds per 20, guard prerequisite works", () => {
  const r = new RunSystems(),
    m = r.recruit();
  add(r, "squad_command", 2);
  assert.equal(r.teamDamage(m, base), 1.18);
  assert.equal(r.stats(base).damage, 1);
  add(r, "squad_reload", 2);
  r.tick(20);
  assert.equal(r.teamRate(base), 1.2);
  r.tick(4.01);
  assert.equal(r.teamRate(base), 1);
  r.promote("guard");
  assert.equal(r.eligible("guardian_line"), true);
});
test("Fallen counterattack only triggers on real death and has 25s cooldown", () => {
  const r = new RunSystems();
  const a = r.recruit(),
    b = r.recruit(),
    c = r.recruit();
  add(r, "last_stand", 2);
  r.hurtMember(a, 1000);
  assert.equal(r.fallenBuff, 6);
  assert.equal(r.teamDamage(b, base), 1.18);
  r.tick(2);
  r.hurtMember(c, 1000);
  assert.equal(r.fallenBuff, 4);
  r.tick(4.1);
  assert.equal(r.teamDamage(b, base), 1);
});
test("Defense ceiling 45%, emergency at most two and rearm, counter pulse bounded", () => {
  const r = new RunSystems();
  r.recruit("guard");
  add(r, "armor_training", 2);
  add(r, "guardian_line", 2);
  r.equipPet("owl");
  for (let i = 0; i < 2; i++) r.equipPet("owl");
  r.petBuff = 5;
  assert.ok(r.mitigate(100) >= 55 - 1e-6);
  r.affixes = [];
  add(r, "emergency_repair", 2);
  add(r, "counter_pulse", 2);
  const first = r.onPlayerHurt(20);
  assert.equal(first.heal, 20);
  assert.equal(first.pulse, true);
  assert.equal(r.onPlayerHurt(20).heal, 0);
  r.onPlayerHurt(50);
  assert.equal(r.onPlayerHurt(20).heal, 20);
  r.onPlayerHurt(50);
  assert.equal(r.onPlayerHurt(20).heal, 0);
  assert.equal(r.onPlayerHurt(20).pulse, false);
  r.tick(8);
  assert.equal(r.onPlayerHurt(50).pulse, true);
});
test("Toughness adds only the delta HP, replacement decreases max HP without farming", () => {
  const r = new RunSystems();
  add(r, "toughness_core");
  assert.equal(r.maxHp, 115);
  assert.equal(r.tick(0).heal, 15);
  add(r, "toughness_core");
  assert.equal(r.maxHp, 125);
  assert.equal(r.tick(0).heal, 10);
  assert.equal(r.selectAffix("toughness_core"), false);
  assert.equal(r.tick(0).heal, 0);
});
test("Resonance, recycle, overclock and endurance all have bounded actual effects", () => {
  const r = new RunSystems();
  r.equipPet("dragon");
  add(r, "pet_resonance", 2);
  r.tick(0.1, { hp: 100, enemiesNearby: true });
  assert.ok(r.stats(base).damage > 1.15);
  add(r, "energy_recycling", 2);
  const cd = r.pet.cooldown;
  for (let i = 0; i < 120; i++) r.onKill();
  assert.equal(r.pet.cooldown, cd - 1.5);
  r.activateArmor("thunder");
  add(r, "armor_overclock", 2);
  assert.ok(r.stats(base).damage > 1.3);
  r.tick(12.01);
  r.selectAffix("armor_endurance", "pet_resonance");
  r.selectAffix("armor_endurance");
  r.activateArmor("thunder");
  assert.equal(r.armor.duration, 15);
});
test("Run reset clears all combat upgrades, armor pity and pet levels", () => {
  const r = new RunSystems();
  r.recruit();
  r.equipPet("dragon");
  r.activateArmor("molten");
  r.selectAffix("frost_round");
  r.rollArmor(50, () => 0.9);
  r.reset();
  assert.equal(r.team.length, 0);
  assert.equal(r.pet, null);
  assert.equal(r.armor, null);
  assert.equal(r.eligibleCrates, 0);
  assert.equal(r.affixes.length, 0);
  assert.deepEqual(r.stats(base), base);
});
