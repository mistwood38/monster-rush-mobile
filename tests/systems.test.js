import test from "node:test";
import assert from "node:assert/strict";
import { RunSystems } from "../systems.js";
import { AFFIXES, ROLES, PETS, ARMORS, RULES } from "../config/catalog.js";
const base = { lanes: 1, pellets: 1, fireRate: 1, bulletSpeed: 1, damage: 1 };
function withAffix(id) {
  const r = new RunSystems();
  assert.equal(r.selectAffix(id), true);
  return r;
}
test("catalog: 20 distinct affixes across five systems; no permanent combat progression", () => {
  assert.equal(AFFIXES.length, 20);
  assert.equal(new Set(AFFIXES.map((a) => a.id)).size, 20);
  assert.equal(new Set(AFFIXES.map((a) => a.category)).size, 5);
});
test("four permanent teammates retain roles, promote to 3, fall and refill", () => {
  const r = new RunSystems();
  for (const role of ["assault", "heavy", "guard", "assault"]) r.recruit(role);
  assert.equal(r.team.length, 4);
  r.recruit("heavy");
  assert.equal(r.team.length, 4);
  for (let i = 0; i < 12; i++) r.promote();
  assert.ok(r.team.every((m) => m.level === 3));
  assert.equal(r.team[1].role, "heavy");
  for (let i = 0; i < 100; i++) r.tick(1);
  assert.equal(r.team.length, 4);
  const id = r.team[0].id;
  r.hurtMember(r.team[0], 999);
  assert.equal(r.team.length, 3);
  assert.equal(r.totals.fallen, 1);
  r.recruit("guard");
  assert.equal(r.team.length, 4);
  assert.ok(!r.team.some((m) => m.id === id));
});
for (const kind of Object.keys(PETS))
  test("pet " + kind + ": single slot, level cap, cooldown", () => {
    const r = new RunSystems();
    for (let i = 0; i < 7; i++) r.equipPet(kind);
    assert.equal(r.pet.level, 3);
    const first = r.tick(2);
    assert.equal(first.pet, kind);
    assert.equal(r.tick(0.01).pet, null);
    assert.equal(r.tick(PETS[kind].cooldown).pet, kind);
    r.equipPet(kind === "owl" ? "dragon" : "owl");
    assert.equal(r.pet.level, 1);
  });
for (const kind of Object.keys(ARMORS))
  test(
    "armor " + kind + ": expires at 12s without mutating base attributes",
    () => {
      const r = new RunSystems(),
        original = { ...base };
      r.activateArmor(kind);
      const stats = r.stats(base, false, 100);
      assert.ok(stats.damage > 1);
      assert.equal(r.tick(11.9).armorEnded, false);
      assert.ok(r.armor.remaining > 0);
      assert.equal(r.tick(0.11).armorEnded, true);
      assert.equal(r.armor, null);
      assert.deepEqual(base, original);
      assert.deepEqual(r.stats(base, false, 100), base);
    },
  );
for (const [id, key] of [
  ["volley", "lanes"],
  ["burst", "pellets"],
  ["haste", "fireRate"],
  ["velocity", "bulletSpeed"],
])
  test("affix " + id + " increases independent projectile property", () => {
    const r = withAffix(id);
    assert.ok(r.stats(base, false, 100)[key] > base[key]);
  });
test("rally + drill have bounded team synergy; laststand activates under 35 hp", () => {
  const r = new RunSystems(),
    m = r.recruit("assault");
  const before = r.teamDamage(m);
  r.selectAffix("rally");
  r.selectAffix("drill");
  assert.ok(r.teamDamage(m) > before * 1.2);
  r.selectAffix("laststand");
  assert.ok(r.teamDamage(m, 34) > r.teamDamage(m, 35));
  assert.ok(r.stats(base, false, 34).damage > r.stats(base, false, 35).damage);
});
test("medic heals real teammate hp; recovery heals on 6-second cadence", () => {
  const r = new RunSystems(),
    m = r.recruit();
  m.hp = 10;
  r.selectAffix("medic");
  r.selectAffix("recovery");
  assert.equal(r.tick(5.9).heal, 0);
  assert.equal(m.hp, 10);
  assert.equal(r.tick(0.11).heal, 2);
  assert.equal(m.hp, 12);
});
test("plating, owl and armor reduce received damage", () => {
  const r = withAffix("plating");
  assert.ok(r.mitigate(100) < 100);
  r.equipPet("owl");
  assert.ok(r.mitigate(100) < 90);
  r.activateArmor("thunder");
  assert.ok(r.mitigate(100) < 75);
});
test("barrier + capacitor cap replenishment; shield absorbs real damage", () => {
  const r = withAffix("barrier");
  r.selectAffix("capacitor");
  assert.equal(r.shield, 8);
  for (let i = 0; i < 30; i++) r.tick(8);
  assert.equal(r.shield, r.shieldCap());
  assert.equal(r.absorb(10), 0);
  assert.ok(r.shield < r.shieldCap());
  assert.ok(r.absorb(100) > 0);
  assert.equal(r.shield, 0);
});
test("salvage cannot infinitely heal on simultaneous kills", () => {
  const r = withAffix("salvage");
  assert.equal(r.onKill(), 1);
  for (let i = 0; i < 100; i++) assert.equal(r.onKill(), 0);
  r.tick(2.5);
  assert.equal(r.onKill(), 1);
});
test("overclock only boosts active overdrive; no stat accumulation", () => {
  const r = withAffix("overclock");
  assert.equal(r.stats(base, false, 100).damage, 1);
  assert.ok(r.stats(base, true, 100).damage > 1);
  assert.equal(r.stats(base, false, 100).damage, 1);
});
test("four-slot replacement, level cap and three unique offers", () => {
  const r = new RunSystems();
  for (const a of ["burn", "frost", "arc", "blast"]) r.selectAffix(a);
  assert.equal(r.selectAffix("magnet"), "replace");
  assert.equal(r.affixes.length, 4);
  assert.equal(r.selectAffix("magnet", "burn"), true);
  assert.equal(r.level("burn"), 0);
  assert.equal(r.level("magnet"), 1);
  r.selectAffix("magnet");
  r.selectAffix("magnet");
  assert.equal(r.selectAffix("magnet"), false);
  assert.equal(r.level("magnet"), 3);
  assert.equal(new Set(r.rollOffers(() => 0.4)).size, 3);
  assert.ok(!r.offers.includes("magnet"));
});
test("dragon, drone and fairy provide real damage, shield and healing", () => {
  const r = new RunSystems();
  r.equipPet("dragon");
  assert.ok(r.stats(base, false, 100).damage > 1);
  r.equipPet("drone");
  r.tick(2);
  assert.ok(r.shield > 0);
  r.equipPet("fairy");
  const m = r.recruit();
  m.hp = 1;
  assert.ok(r.tick(2).heal > 0);
  assert.ok(m.hp > 1);
});
test("restart clears every run-only upgrade and companion", () => {
  const r = new RunSystems();
  r.recruit();
  r.equipPet("owl");
  r.activateArmor("molten");
  r.selectAffix("burst");
  r.addShield(20);
  r.reset();
  assert.equal(r.team.length, 0);
  assert.equal(r.pet, null);
  assert.equal(r.armor, null);
  assert.equal(r.affixes.length, 0);
  assert.equal(r.shield, 0);
  assert.deepEqual(r.stats(base, false, 100), base);
});
