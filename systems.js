import {
  RULES,
  ROLES,
  PETS,
  ARMORS,
  AFFIXES,
  BALANCE as B,
} from "./config/catalog.js";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export class RunSystems {
  constructor() {
    this.reset();
  }
  reset() {
    Object.assign(this, {
      team: [],
      serial: 0,
      pet: null,
      petBuff: 0,
      petTarget: null,
      armor: null,
      armorFade: 0,
      hadArmor: false,
      affixes: [],
      offers: [],
      pendingReplacement: null,
      nextDraft: 43,
      draftIndex: 0,
      shield: 0,
      teamPower: 0,
      eventTimer: 24,
      eventIndex: 0,
      event: null,
      arcCD: 0,
      blastCD: 0,
      hitCount: 0,
      explosiveHits: 0,
      focusTarget: null,
      focusHits: 0,
      fallenBuff: 0,
      fallenCD: 0,
      reloadClock: 0,
      reloadBuff: 0,
      guardClock: 0,
      repairUses: 0,
      repairArmed: true,
      pulseCD: 0,
      pendingHeal: 0,
      recycleKills: 0,
      recycleCD: 0,
      armorMisses: 0,
      eligibleCrates: 0,
      armorDrops: 0,
      playerX: 0,
      breachRescue: 0,
      lastRoleChange: null,
    });
    this.totals = {
      recruits: 0,
      fallen: 0,
      petSkills: 0,
      armors: 0,
      breaches: 0,
      armorSeconds: 0,
    };
  }
  level(id) {
    return this.affixes.find((a) => a.id === id)?.level || 0;
  }
  value(key, id) {
    const level = this.level(id);
    return level ? B.traits[key][level - 1] : 0;
  }
  get maxHp() {
    return 100 + this.value("extra_hp", "toughness_core");
  }
  shieldCap() {
    return 32 * (1 + this.value("pet_resonance_effect", "pet_resonance"));
  }
  addShield(n, target = null) {
    if (target)
      target.shield = Math.max(
        target.shield || 0,
        Math.min(this.shieldCap(), n),
      );
    else this.shield = Math.max(this.shield, Math.min(this.shieldCap(), n));
  }
  recruit(role = "assault") {
    if (this.team.length >= 4) {
      this.team.forEach((m) => (m.hp = Math.min(m.maxHp, m.hp + 15)));
      return null;
    }
    if (!ROLES[role]) return null;
    if (
      role === "heavy" &&
      this.team.filter((m) => m.role === "heavy").length >= 2
    )
      return null;
    if (role === "guard" && this.team.some((m) => m.role === "guard"))
      return null;
    const level = role === "assault" ? 1 : 2,
      c = ROLES[role],
      hp = c.hps[level - 1];
    const m = {
      id: ++this.serial,
      role,
      level,
      hp,
      maxHp: hp,
      shield: 0,
      fire: 0.3,
      invuln: 0,
      x: this.playerX,
      z: 0,
    };
    this.team.push(m);
    this.totals.recruits++;
    return m;
  }
  canPromote(role) {
    return this.team.some(
      (m) =>
        m.level < 3 &&
        (!role || m.role === role || m.role === "assault") &&
        (m.role === role ||
          role !== "heavy" ||
          this.team.filter((n) => n.role === "heavy").length < 2) &&
        (m.role === role ||
          role !== "guard" ||
          !this.team.some((n) => n.role === "guard")),
    );
  }
  promote(role) {
    if (role && !ROLES[role]) return false;
    const eligible = this.team
      .filter(
        (m) =>
          m.level < 3 &&
          (!role || m.role === role || m.role === "assault") &&
          (m.role === role ||
            role !== "heavy" ||
            this.team.filter((n) => n.role === "heavy").length < 2) &&
          (m.role === role ||
            role !== "guard" ||
            !this.team.some((n) => n.role === "guard")),
      )
      .sort((a, b) => a.level - b.level || a.id - b.id);
    const m = eligible[0];
    if (!m) return false;
    const ratio = m.hp / m.maxHp;
    if (role && m.role !== role) {
      m.role = role;
      m.level = Math.max(2, m.level);
    } else m.level++;
    m.maxHp = ROLES[m.role].hps[m.level - 1];
    m.hp = Math.max(1, m.maxHp * ratio);
    this.lastRoleChange = m.id;
    return true;
  }
  hurtMember(m, amount, boss = false) {
    if (!m || m.invuln > 0 || !this.team.includes(m)) return false;
    let n = this.mitigate(amount, m, boss),
      s = Math.min(m.shield || 0, n);
    m.shield = (m.shield || 0) - s;
    m.hp = Math.max(0, m.hp - n + s);
    m.invuln = 0.65;
    if (m.hp <= 0) {
      this.team.splice(this.team.indexOf(m), 1);
      this.totals.fallen++;
      if (this.level("last_stand") && this.fallenCD <= 0) {
        this.fallenBuff = 6;
        this.fallenCD = 25;
      }
      if (!this.team.length) this.breachRescue = 16;
    }
    return true;
  }
  equipPet(kind) {
    if (!PETS[kind]) return false;
    if (!this.pet) {
      this.pet = { kind, level: 1, cooldown: 0, flash: 0 };
      return true;
    }
    const p = this.pet;
    if (p.kind === kind) {
      if (p.level < 3) p.level++;
      else this.pendingHeal += 5;
      return true;
    }
    const remaining = p.cooldown / PETS[p.kind].cooldown;
    p.kind = kind;
    p.cooldown = clamp(remaining, 0, 1) * PETS[kind].cooldown;
    this.petBuff = 0;
    return true;
  }
  activateArmor(kind) {
    if (!ARMORS[kind]) return false;
    if (this.armor) {
      this.pendingHeal += 15;
      return false;
    }
    const duration = Math.min(
      15,
      12 + this.value("armor_extension_seconds", "armor_endurance"),
    );
    this.armor = { kind, remaining: duration, duration, pulse: 2.4 };
    this.armorFade = 0.8;
    this.hadArmor = true;
    this.totals.armors++;
    return true;
  }
  rollArmor(time, random = Math.random) {
    if (time < 45) return null;
    this.eligibleCrates++;
    if (random() < 0.12 || this.armorMisses >= 3) {
      this.armorMisses = 0;
      this.armorDrops++;
      return ["thunder", "molten", "phantom"][
        Math.min(2, Math.floor(random() * 3))
      ];
    }
    this.armorMisses++;
    return null;
  }
  selectAffix(id, replaceId) {
    if (!AFFIXES.some((a) => a.id === id)) return false;
    const beforeHp = this.maxHp,
      old = this.affixes.find((a) => a.id === id);
    if (old) {
      if (old.level >= 2) return false;
      old.level++;
    } else if (this.affixes.length < 4) this.affixes.push({ id, level: 1 });
    else {
      const index = this.affixes.findIndex((a) => a.id === replaceId);
      if (index < 0) {
        this.pendingReplacement = id;
        return "replace";
      }
      this.affixes.splice(index, 1, { id, level: 1 });
    }
    this.pendingHeal += Math.max(0, this.maxHp - beforeHp);
    this.pendingReplacement = null;
    this.offers = [];
    return true;
  }
  eligible(id, context = {}) {
    const a = AFFIXES.find((a) => a.id === id);
    if (!a || this.level(id) >= 2) return false;
    if (
      a.prerequisite === "has_guardian" &&
      !this.team.some((m) => m.role === "guard")
    )
      return false;
    if (a.prerequisite === "has_pet" && !this.pet) return false;
    if (a.prerequisite === "has_obtained_armor" && !this.hadArmor) return false;
    if (
      ["squad_command", "squad_reload", "last_stand"].includes(id) &&
      !this.team.length
    )
      return false;
    if (id === "piercing_core" && context.weapon === "laser") return false;
    return true;
  }
  rollOffers(random = Math.random, context = {}) {
    const pool = AFFIXES.filter((a) => this.eligible(a.id, context)),
      picked = [];
    // At least one different category survives selection when a build is already established.
    const used = new Set(
      this.affixes.map((a) => AFFIXES.find((d) => d.id === a.id).category),
    );
    if (used.size) {
      const alternatives = pool.filter((a) => !used.has(a.category));
      if (alternatives.length) {
        const a = alternatives[Math.floor(random() * alternatives.length)];
        picked.push(a.id);
        pool.splice(pool.indexOf(a), 1);
      }
    }
    while (picked.length < 3 && pool.length)
      picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0].id);
    this.offers = picked;
    return picked;
  }
  stats(base) {
    const a = this.armor ? ARMORS[this.armor.kind] : null;
    const dragon =
      this.pet?.kind === "dragon" && this.petBuff > 0
        ? B.pets.dragon.buff_damage_by_level[this.pet.level - 1] *
          (1 + this.value("pet_resonance_effect", "pet_resonance"))
        : 0;
    return {
      lanes: Math.min(3, base.lanes),
      pellets: Math.min(3, base.pellets),
      fireRate: Math.min(2, base.fireRate) * (a?.rate || 1),
      bulletSpeed: Math.min(2, base.bulletSpeed),
      damage:
        Math.min(2.2, base.damage) *
        (a?.damage || 1) *
        (1 + dragon) *
        (1 +
          (a
            ? this.value("armor_overload_extra_damage", "armor_overclock")
            : 0)),
    };
  }
  teamDamage(m, base = { damage: 1, fireRate: 1 }) {
    return (
      (1 + (base.damage - 1) * 0.5) *
      (1 + this.value("tactical_command_bonus", "squad_command")) *
      (1 +
        (this.fallenBuff > 0
          ? this.value("fallen_counterattack_bonus", "last_stand")
          : 0))
    );
  }
  teamRate(base) {
    return (
      (1 + (base.fireRate - 1) * 0.5) *
      (1 + Math.min(0.3, this.teamPower)) *
      (1 +
        (this.reloadBuff > 0
          ? this.value("coordinated_reload_bonus", "squad_reload")
          : 0))
    );
  }
  mitigate(amount, target = null, boss = false) {
    let remaining =
      1 - (target ? 0 : this.value("armor_damage_reduction", "armor_training"));
    if (
      this.level("guardian_line") &&
      this.team.some(
        (g) =>
          g.role === "guard" &&
          Math.abs(g.x - (target?.x ?? this.playerX)) < 2.6,
      )
    )
      remaining *= 1 - this.value("guard_line_reduction", "guardian_line");
    if (this.pet?.kind === "owl" && this.petBuff > 0)
      remaining *=
        1 -
        B.pets.owl.enemy_damage_reduction_by_level[this.pet.level - 1] *
          (boss ? 0.5 : 1) *
          (1 + this.value("pet_resonance_effect", "pet_resonance"));
    return amount * Math.max(0.55, remaining);
  }
  absorb(amount, boss = false) {
    const n = this.mitigate(amount, null, boss),
      s = Math.min(n, this.shield);
    this.shield -= s;
    return n - s;
  }
  onPlayerHurt(hp) {
    const out = { heal: 0, pulse: false };
    if (hp / this.maxHp > 0.3) this.repairArmed = true;
    if (
      hp > 0 &&
      hp / this.maxHp < 0.25 &&
      this.repairArmed &&
      this.repairUses < 2 &&
      this.level("emergency_repair")
    ) {
      out.heal = this.value("emergency_repair_heal", "emergency_repair");
      this.repairUses++;
      this.repairArmed = false;
    }
    if (this.level("counter_pulse") && this.pulseCD <= 0) {
      out.pulse = true;
      this.pulseCD = this.value(
        "counter_pulse_cooldown_seconds",
        "counter_pulse",
      );
    }
    return out;
  }
  onKill() {
    this.recycleKills++;
    if (
      this.recycleKills >= 12 &&
      this.pet &&
      this.level("energy_recycling") &&
      this.recycleCD <= 0
    ) {
      this.recycleKills = 0;
      this.recycleCD = 10;
      this.pet.cooldown = Math.max(
        0,
        this.pet.cooldown -
          this.value("pet_energy_recovery_seconds", "energy_recycling"),
      );
    }
    return 0;
  }
  directHit(target, damage, random = Math.random) {
    const out = {
      damage,
      critical: false,
      chain: 0,
      explode: false,
      burn: 0,
      slow: 0,
    };
    if (this.focusTarget !== target) {
      this.focusTarget = target;
      this.focusHits = 0;
    } else this.focusHits++;
    out.damage *=
      1 +
      Math.min(
        this.value("focus_bonus_cap", "focus_combo"),
        this.focusHits * 0.02,
      );
    if (
      this.level("critical_calibration") &&
      random() < this.value("critical_chance", "critical_calibration")
    ) {
      out.damage *= 1.5;
      out.critical = true;
    }
    if (this.level("frost_round"))
      out.slow = this.value("frost_slow_cap", "frost_round");
    if (
      this.level("scorch_mag") &&
      random() < this.value("burn_chance", "scorch_mag")
    )
      out.burn = 3;
    this.hitCount++;
    this.explosiveHits++;
    if (
      this.level("chain_lightning") &&
      this.hitCount >= 10 &&
      this.arcCD <= 0
    ) {
      out.chain = this.value("chain_lightning_max_targets", "chain_lightning");
      this.hitCount = 0;
      this.arcCD = 3;
    }
    if (
      this.level("explosive_round") &&
      this.explosiveHits >= 12 &&
      this.blastCD <= 0
    ) {
      out.explode = true;
      this.explosiveHits = 0;
      this.blastCD = 3;
    }
    return out;
  }
  tick(dt, context = { hp: this.maxHp, enemiesNearby: false }) {
    const out = {
      heal: this.pendingHeal,
      pet: null,
      armorPulse: null,
      armorEnded: false,
      guardShield: null,
    };
    this.pendingHeal = 0;
    for (const key of [
      "arcCD",
      "blastCD",
      "fallenBuff",
      "fallenCD",
      "recycleCD",
      "pulseCD",
      "petBuff",
      "armorFade",
    ])
      this[key] = Math.max(0, this[key] - dt);
    for (const m of this.team) m.invuln = Math.max(0, m.invuln - dt);
    if (context.hp / this.maxHp > 0.3) this.repairArmed = true;
    this.reloadClock += dt;
    this.reloadBuff = Math.max(0, this.reloadBuff - dt);
    if (this.reloadClock >= 20) {
      this.reloadClock %= 20;
      if (this.level("squad_reload")) this.reloadBuff = 4;
    }
    this.guardClock += dt;
    if (this.guardClock >= 12) {
      this.guardClock %= 12;
      const g = this.team.find((m) => m.role === "guard");
      if (g) {
        const weak = [...this.team].sort(
          (a, b) => a.hp / a.maxHp - b.hp / b.maxHp,
        )[0];
        this.addShield(g.level === 3 ? 12 : 8, weak);
        out.guardShield = weak.id;
      }
    }
    if (this.pet) {
      const p = this.pet;
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.flash = Math.max(0, p.flash - dt);
      if (p.cooldown <= 0) {
        const units = [
            { id: null, hp: context.hp ?? this.maxHp, maxHp: this.maxHp },
            ...this.team,
          ].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp),
          target = units[0];
        const can = ["dragon", "owl"].includes(p.kind)
          ? context.enemiesNearby
          : p.kind === "fairy"
            ? target.hp < target.maxHp
            : context.enemiesNearby &&
              ((target.id === null
                ? this.shield
                : this.team.find((m) => m.id === target.id).shield) || 0) < 1;
        if (can) {
          out.pet = p.kind;
          p.cooldown = PETS[p.kind].cooldown;
          p.flash = 0.7;
          this.totals.petSkills++;
          this.petTarget = target.id;
          const resonance =
            1 + this.value("pet_resonance_effect", "pet_resonance");
          if (p.kind === "dragon")
            this.petBuff = B.pets.dragon.buff_duration_by_level[p.level - 1];
          if (p.kind === "owl") this.petBuff = 5;
          if (p.kind === "drone")
            this.addShield(
              B.pets.shieldbot.shield_by_level[p.level - 1] * resonance,
              this.team.find((m) => m.id === target.id) || null,
            );
          if (p.kind === "fairy") {
            const heal = B.pets.healer.heal_by_level[p.level - 1] * resonance;
            if (target.id === null) out.heal += heal;
            else {
              const m = this.team.find((m) => m.id === target.id);
              m.hp = Math.min(m.maxHp, m.hp + heal);
            }
          }
        }
      }
    }
    if (this.armor) {
      this.totals.armorSeconds += dt;
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
    if (this.breachRescue > 0)
      this.breachRescue = Math.max(0.001, this.breachRescue - dt);
    return out;
  }
  snapshot() {
    return JSON.parse(
      JSON.stringify({
        team: this.team,
        pet: this.pet,
        petBuff: this.petBuff,
        petTarget: this.petTarget,
        armor: this.armor,
        hadArmor: this.hadArmor,
        affixes: this.affixes,
        shield: this.shield,
        maxHp: this.maxHp,
        offers: this.offers,
        pendingReplacement: this.pendingReplacement,
        event: this.event,
        totals: this.totals,
        teamPower: this.teamPower,
        eligibleCrates: this.eligibleCrates,
        armorDrops: this.armorDrops,
      }),
    );
  }
}
