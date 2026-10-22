import { RULES, ROLES, PETS, ARMORS, AFFIXES } from "./config/catalog.js";
const cap = (v, a, b) => Math.max(a, Math.min(b, v));
export class RunSystems {
  constructor() {
    this.reset();
  }
  reset() {
    this.team = [];
    this.serial = 0;
    this.pet = null;
    this.armor = null;
    this.armorFade = 0;
    this.affixes = [];
    this.offers = [];
    this.pendingReplacement = null;
    this.nextDraft = 18;
    this.shield = 0;
    this.teamPower = 0;
    this.healClock = 0;
    this.barrierClock = 0;
    this.salvageCD = 0;
    this.arcCD = 0;
    this.blastCD = 0;
    this.eventTimer = 12;
    this.eventIndex = 0;
    this.event = null;
    this.totals = {
      recruits: 0,
      fallen: 0,
      petSkills: 0,
      armors: 0,
      breaches: 0,
    };
  }
  level(id) {
    return this.affixes.find((a) => a.id === id)?.level || 0;
  }
  shieldCap() {
    return 26 + this.level("capacitor") * 8;
  }
  addShield(n) {
    this.shield = Math.min(this.shieldCap(), this.shield + n);
  }
  recruit(role = "assault") {
    if (!ROLES[role]) return null;
    if (this.team.length >= RULES.teamLimit) {
      this.promote(role);
      return null;
    }
    const c = ROLES[role],
      member = {
        id: ++this.serial,
        role,
        level: 1,
        hp: c.hp,
        maxHp: c.hp,
        fire: 0.3,
        invuln: 0,
        x: 0,
        z: 0,
      };
    this.team.push(member);
    this.totals.recruits++;
    return member;
  }
  promote(role) {
    const eligible = this.team.filter(
      (m) => m.level < 3 && (!role || m.role === role),
    );
    const m = eligible.sort((a, b) => a.level - b.level)[0];
    if (!m) {
      this.team.forEach((a) => (a.hp = Math.min(a.maxHp, a.hp + 12)));
      return false;
    }
    m.level++;
    m.maxHp += 24;
    m.hp = Math.min(m.maxHp, m.hp + 32);
    return true;
  }
  hurtMember(m, amount) {
    if (m.invuln > 0 || !this.team.includes(m)) return false;
    m.hp = Math.max(0, m.hp - this.mitigate(amount));
    m.invuln = 0.65;
    if (m.hp <= 0) {
      this.team.splice(this.team.indexOf(m), 1);
      this.totals.fallen++;
    }
    return true;
  }
  equipPet(kind) {
    if (!PETS[kind]) return false;
    if (this.pet?.kind === kind)
      this.pet.level = Math.min(3, this.pet.level + 1);
    else this.pet = { kind, level: 1, cooldown: 2, flash: 0 };
    return true;
  }
  activateArmor(kind) {
    if (!ARMORS[kind]) return false;
    this.armor = { kind, remaining: RULES.armorDuration, pulse: 0 };
    this.armorFade = 0.8;
    this.totals.armors++;
    return true;
  }
  selectAffix(id, replaceId) {
    if (!AFFIXES.some((a) => a.id === id)) return false;
    const old = this.affixes.find((a) => a.id === id);
    if (old) {
      if (old.level >= 3) return false;
      old.level++;
    } else if (this.affixes.length < 4) this.affixes.push({ id, level: 1 });
    else {
      const i = this.affixes.findIndex((a) => a.id === replaceId);
      if (i < 0) {
        this.pendingReplacement = id;
        return "replace";
      }
      this.affixes.splice(i, 1, { id, level: 1 });
    }
    if (id === "capacitor") this.addShield(8);
    this.pendingReplacement = null;
    this.offers = [];
    return true;
  }
  rollOffers(random = Math.random) {
    const pool = AFFIXES.filter((a) => this.level(a.id) < 3),
      picked = [];
    while (picked.length < 3 && pool.length)
      picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0].id);
    this.offers = picked;
    return picked;
  }
  stats(base, overdrive, hp) {
    const armor = this.armor ? ARMORS[this.armor.kind] : null;
    return {
      lanes: Math.min(5, base.lanes + this.level("volley")),
      pellets: Math.min(8, base.pellets + this.level("burst") * 2),
      fireRate: Math.min(
        3.2,
        base.fireRate * (1 + this.level("haste") * 0.12) * (armor?.rate || 1),
      ),
      bulletSpeed: Math.min(
        2.8,
        base.bulletSpeed * (1 + this.level("velocity") * 0.18),
      ),
      damage:
        base.damage *
        (armor?.damage || 1) *
        (1 + (this.pet?.kind === "dragon" ? this.pet.level * 0.06 : 0)) *
        (1 + (hp < 35 ? this.level("laststand") * 0.2 : 0)) *
        (1 + (overdrive ? this.level("overclock") * 0.1 : 0)),
    };
  }
  teamDamage(m, hp = 100) {
    return (
      (1 + (hp < 35 ? this.level("laststand") * 0.2 : 0)) *
      (1 + (m.level - 1) * 0.32) *
      (1 + this.teamPower * 0.08) *
      (1 + this.level("rally") * 0.15) *
      (this.level("rally") && this.level("drill") ? 1.1 : 1)
    );
  }
  mitigate(amount) {
    return (
      amount *
      (1 - this.level("plating") * 0.08) *
      (this.pet?.kind === "owl" ? 1 - this.pet.level * 0.07 : 1) *
      (this.armor?.kind === "phantom"
        ? 0.72
        : this.armor?.kind === "thunder"
          ? 0.8
          : 1)
    );
  }
  absorb(amount) {
    let n = this.mitigate(amount);
    const absorbed = Math.min(this.shield, n);
    this.shield -= absorbed;
    return n - absorbed;
  }
  onKill() {
    if (this.salvageCD <= 0 && this.level("salvage")) {
      this.salvageCD = 2.5;
      return this.level("salvage");
    }
    return 0;
  }
  tick(dt) {
    const out = { heal: 0, pet: null, armorPulse: null, armorEnded: false };
    this.salvageCD = Math.max(0, this.salvageCD - dt);
    this.arcCD = Math.max(0, this.arcCD - dt);
    this.blastCD = Math.max(0, this.blastCD - dt);
    this.armorFade = Math.max(0, this.armorFade - dt);
    for (const m of this.team) m.invuln = Math.max(0, m.invuln - dt);
    this.healClock += dt;
    this.barrierClock += dt;
    if (this.healClock >= 6) {
      this.healClock %= 6;
      out.heal += 2 * this.level("recovery");
      this.team.forEach(
        (m) => (m.hp = Math.min(m.maxHp, m.hp + 2 * this.level("medic"))),
      );
    }
    if (this.barrierClock >= 8) {
      this.barrierClock %= 8;
      this.addShield(5 * this.level("barrier"));
    }
    if (this.pet) {
      this.pet.cooldown -= dt;
      this.pet.flash = Math.max(0, this.pet.flash - dt);
      if (this.pet.cooldown <= 0) {
        out.pet = this.pet.kind;
        this.pet.cooldown = PETS[this.pet.kind].cooldown;
        this.pet.flash = 0.65;
        this.totals.petSkills++;
        if (out.pet === "drone") this.addShield(10 + 6 * this.pet.level);
        if (out.pet === "fairy") {
          out.heal += 5 + 4 * this.pet.level;
          this.team.forEach(
            (m) => (m.hp = Math.min(m.maxHp, m.hp + 4 + 3 * this.pet.level)),
          );
        }
      }
    }
    if (this.armor) {
      this.armor.remaining -= dt;
      this.armor.pulse -= dt;
      if (this.armor.pulse <= 0) {
        out.armorPulse = this.armor.kind;
        this.armor.pulse = 2.4;
      }
      if (this.armor.remaining <= 0) {
        this.armor = null;
        this.armorFade = 0.8;
        out.armorEnded = true;
      }
    }
    this.shield = cap(this.shield, 0, this.shieldCap());
    return out;
  }
  snapshot() {
    return JSON.parse(
      JSON.stringify({
        team: this.team,
        pet: this.pet,
        armor: this.armor,
        affixes: this.affixes,
        shield: this.shield,
        offers: this.offers,
        pendingReplacement: this.pendingReplacement,
        event: this.event,
        totals: this.totals,
        teamPower: this.teamPower,
      }),
    );
  }
}
