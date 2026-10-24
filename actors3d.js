import * as THREE from "./vendor/three/three.module.min.js";
import { qualityProfile, enemyDetail } from "./horde.js";
import { SpriteStateMachine } from "./sprite-state.mjs";
// Original geometry. A single colored mesh per rig / enemy family; no commercial models.
class ShapeBuilder {
  constructor(refined = false) {
    this.refined = refined;
    this.p = [];
    this.n = [];
    this.c = [];
    this.limb = [];
    this.pivot = [];
    this.skin = [];
  }
  add(
    geometry,
    pos,
    scale,
    color,
    bone = 0,
    pivot = [0, 0, 0],
    rotation = [0, 0, 0],
  ) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone(),
      m = new THREE.Matrix4().compose(
        new THREE.Vector3(...pos),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      );
    g.applyMatrix4(m);
    const p = g.attributes.position,
      n = g.attributes.normal,
      c = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) {
      this.p.push(p.getX(i), p.getY(i), p.getZ(i));
      this.n.push(n.getX(i), n.getY(i), n.getZ(i));
      this.c.push(c.r, c.g, c.b);
      this.limb.push(bone);
      this.pivot.push(...pivot);
      this.skin.push(bone, 0, 0, 0);
    }
    g.dispose();
    geometry.dispose();
    return this;
  }
  box(pos, scale, color, bone = 0, pivot = [0, 0, 0], rot = [0, 0, 0]) {
    let g;
    if (this.refined) {
      const shape = new THREE.Shape();
      shape.moveTo(-0.44, -0.44);
      shape.lineTo(0.44, -0.44);
      shape.lineTo(0.44, 0.44);
      shape.lineTo(-0.44, 0.44);
      shape.closePath();
      g = new THREE.ExtrudeGeometry(shape, {
        depth: 0.88,
        bevelEnabled: true,
        bevelSize: 0.06,
        bevelThickness: 0.06,
        bevelSegments: 1,
        steps: 1,
      });
      g.translate(0, 0, -0.44);
    } else g = new THREE.BoxGeometry(1, 1, 1);
    return this.add(g, pos, scale, color, bone, pivot, rot);
  }
  sphere(pos, scale, color, bone = 0, pivot = [0, 0, 0]) {
    return this.add(
      this.refined
        ? new THREE.SphereGeometry(1, 12, 8)
        : new THREE.IcosahedronGeometry(1, 0),
      pos,
      scale,
      color,
      bone,
      pivot,
    );
  }
  cone(pos, scale, color, bone = 0, pivot = [0, 0, 0], rot = [0, 0, 0]) {
    return this.add(
      new THREE.ConeGeometry(1, 1, 7),
      pos,
      scale,
      color,
      bone,
      pivot,
      rot,
    );
  }
  finish(skinned = false) {
    const g = new THREE.BufferGeometry();
    for (const [k, v, size] of [
      ["position", this.p, 3],
      ["normal", this.n, 3],
      ["color", this.c, 3],
      ["aLimb", this.limb, 1],
      ["aPivot", this.pivot, 3],
    ])
      g.setAttribute(k, new THREE.Float32BufferAttribute(v, size));
    if (skinned) {
      g.setAttribute(
        "skinIndex",
        new THREE.Uint16BufferAttribute(this.skin, 4),
      );
      const weights = new Float32Array((this.p.length / 3) * 4);
      for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
      g.setAttribute("skinWeight", new THREE.BufferAttribute(weights, 4));
    }
    g.computeBoundingSphere();
    return g;
  }
}
const clips = Object.fromEntries(
  Object.entries({
    run: [8, 8, true],
    idle: [4, 5, true],
    shoot: [3, 18, false],
    hit: [3, 16, false],
    down: [6, 12, false],
    windup: [10, 12, false],
    attack: [5, 14, false],
    recover: [5, 12, false],
    activate: [10, 15, false],
    deactivate: [10, 15, false],
  }).map(([k, [n, fps, loop]]) => [
    k,
    { fps, loop, frames: Array.from({ length: n }, (_, i) => i) },
  ]),
);
function actorState(key, tick) {
  const machine = new SpriteStateMachine(
    clips,
    key === "boss" ? "idle" : "run",
  );
  return {
    key,
    machine,
    frame: 0,
    time: 0,
    trigger(state) {
      if (!clips[state]) return false;
      if (
        machine.state === state &&
        machine.elapsed < (1000 * clips[state].frames.length) / clips[state].fps
      )
        return false;
      return machine.trigger(state);
    },
    tick(dt) {
      machine.tick(dt * 1000);
      this.time += dt;
      this.frame = machine.frame().index;
      tick?.(dt, this);
    },
  };
}
function dummyParts(root, actor) {
  const parts = {
    actor,
    kind: actor.key,
    asset: false,
    instanced: true,
    disposables: [],
  };
  for (const k of ["body", "head", "gun", "legL", "legR", "armL", "armR"])
    parts[k] = new THREE.Object3D();
  parts.body.material = { color: new THREE.Color(), opacity: 1, dispose() {} };
  root.userData = parts;
  return root;
}
export class CombatModels {
  constructor(scene, sprites, limit) {
    this.scene = scene;
    this.sprites = sprites;
    this.limit = limit;
    this.batches = new Map();
    this.proxyPool = [];
    this.time = 0;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    this.uniform = { value: 0 };
    this.animationHz = { value: 30 };
    this.geometries = new Map();
    this.guns = new Map();
  }
  gun(type) {
    let geometry = this.guns.get(type);
    if (!geometry) {
      const s = new ShapeBuilder(),
        dark = "#24354b",
        steel = "#a1b8c6",
        accent = {
          rifle: "#51e6f2",
          machine: "#ffc36a",
          shotgun: "#ff8c5f",
          plasma: "#b39cff",
          laser: "#ed86ff",
        }[type];
      s.box([0, 0, -0.25], [0.22, 0.19, 0.7], dark)
        .box([0, 0.1, -0.21], [0.12, 0.08, 0.5], steel)
        .box([0, -0.15, -0.05], [0.12, 0.24, 0.16], dark, 0)
        .box([0.12, 0, -0.4], [0.04, 0.09, 0.36], accent);
      if (type === "machine")
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          s.add(
            new THREE.CylinderGeometry(0.035, 0.035, 0.65, 6),
            [Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.83],
            [1, 1, 1],
            steel,
            1,
            [0, 0, 0],
            [Math.PI / 2, 0, 0],
          );
        }
      else if (type === "shotgun")
        for (const x of [-0.065, 0.065])
          s.add(
            new THREE.CylinderGeometry(0.055, 0.055, 0.7, 8),
            [x, 0, -0.85],
            [1, 1, 1],
            steel,
            0,
            [0, 0, 0],
            [Math.PI / 2, 0, 0],
          );
      else if (type === "plasma") {
        s.sphere([0, 0, -0.48], [0.21, 0.2, 0.37], dark);
        for (let i = 0; i < 3; i++)
          s.add(
            new THREE.TorusGeometry(0.17, 0.035, 5, 10),
            [0, 0, -0.4 - i * 0.17],
            [1, 1, 1],
            accent,
          );
      } else if (type === "laser") {
        s.box([0, 0, -0.75], [0.16, 0.16, 0.65], steel);
        for (const x of [-0.14, 0.14])
          s.box([x, 0.05, -0.66], [0.05, 0.12, 0.7], accent);
        s.sphere([0, 0, -1.03], [0.11, 0.11, 0.09], "#f4dfff");
      } else
        s.add(
          new THREE.CylinderGeometry(0.045, 0.045, 0.65, 7),
          [0, 0, -0.76],
          [1, 1, 1],
          steel,
          0,
          [0, 0, 0],
          [Math.PI / 2, 0, 0],
        );
      geometry = s.finish();
      this.guns.set(type, geometry);
    }
    const group = new THREE.Group(),
      material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.48,
        metalness: 0.38,
      });
    if (type === "machine") {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uSpinTime = this.uniform;
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nattribute float aLimb;uniform float uSpinTime;",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nif(aLimb>.5){float a=uSpinTime*32.;mat2 r=mat2(cos(a),-sin(a),sin(a),cos(a));transformed.xy=r*transformed.xy;}",
          );
      };
      material.customProgramCacheKey = () => "rotary-barrels-1";
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.sharedGeometry = true;
    group.add(mesh);
    group.userData = {
      weaponType: type,
      disposables: [material],
      sharedGeometry: true,
    };
    return group;
  }
  soldier(role = "hero") {
    const armored = role.startsWith("armor/"),
      palette = role.includes("molten")
        ? ["#eb6a3f", "#ffd69a"]
        : role.includes("phantom")
          ? ["#6747ad", "#78fff2"]
          : armored
            ? ["#4b68b8", "#b3f8ff"]
            : role === "heavy"
              ? ["#d39d3e", "#ffe9a6"]
              : role === "guardian"
                ? ["#3b9382", "#c3ffdc"]
                : ["#2488b4", "#83f4f7"];
    const s = new ShapeBuilder(true),
      root = new THREE.Group(),
      bones = [],
      pivots = [],
      addBone = (name, parent, p) => {
        const b = new THREE.Bone();
        b.name = name;
        b.position.set(...p);
        if (parent >= 0) {
          b.position.sub(pivots[parent]);
          bones[parent].add(b);
        }
        pivots.push(new THREE.Vector3(...p));
        bones.push(b);
        return bones.length - 1;
      };
    addBone("hips", -1, [0, 1.03, 0]);
    addBone("spine", 0, [0, 1.18, 0]);
    addBone("head", 1, [0, 2.0, 0]);
    addBone("thighL", 0, [-0.23, 1.0, 0]);
    addBone("shinL", 3, [-0.23, 0.53, 0]);
    addBone("thighR", 0, [0.23, 1.0, 0]);
    addBone("shinR", 5, [0.23, 0.53, 0]);
    addBone("armR", 1, [0.45, 1.8, 0]);
    addBone("forearmR", 7, [0.35, 1.65, -0.18]);
    addBone("handR", 8, [0.18, 1.57, -0.43]);
    addBone("armL", 1, [-0.45, 1.8, 0]);
    addBone("forearmL", 10, [-0.32, 1.63, -0.24]);
    addBone("handL", 11, [0.18, 1.57, -0.86]);
    const navy = "#20334d",
      white = "#e4eced",
      skin = "#dba77c",
      blue = palette[0],
      glow = palette[1];
    s.sphere([0, 1.08, 0], [0.36, 0.25, 0.25], navy, 0)
      .box([0, 1.44, 0], [0.69, 0.6, 0.4], blue, 1)
      .box([0, 1.48, -0.23], [0.54, 0.4, 0.12], white, 1)
      .box([0, 1.52, 0.24], [0.56, 0.43, 0.18], navy, 1)
      .box([0, 1.53, 0.34], [0.15, 0.29, 0.05], glow, 1);
    for (const x of [-0.25, 0.25])
      s.box([x, 1.07, -0.14], [0.17, 0.18, 0.22], white, 0).box(
        [x, 1.55, 0.35],
        [0.1, 0.35, 0.08],
        blue,
        1,
      );
    s.sphere([0, 2.02, 0], [0.3, 0.34, 0.28], skin, 2)
      .sphere([0, 2.16, 0.025], [0.36, 0.31, 0.34], blue, 2)
      .box([0, 2.12, -0.26], [0.53, 0.14, 0.12], navy, 2)
      .box([0, 2.12, -0.33], [0.46, 0.085, 0.04], glow, 2)
      .box([0, 2.16, 0.33], [0.24, 0.11, 0.06], white, 2)
      .box([0, 1.91, 0.17], [0.28, 0.22, 0.14], navy, 2);
    for (const [side, thigh, shin] of [
      [-1, 3, 4],
      [1, 5, 6],
    ]) {
      const x = side * 0.23;
      s.sphere([x, 0.78, 0], [0.18, 0.28, 0.19], navy, thigh)
        .box([x, 0.8, -0.12], [0.27, 0.33, 0.15], white, thigh)
        .sphere([x, 0.53, -0.04], [0.18, 0.14, 0.18], blue, shin)
        .box([x, 0.33, 0.02], [0.24, 0.32, 0.24], navy, shin)
        .box([x, 0.1, -0.1], [0.3, 0.19, 0.46], navy, shin)
        .box([x, 0.13, -0.31], [0.27, 0.11, 0.1], white, shin);
    }
    for (const [side, upper, lower, hand] of [
      [1, 7, 8, 9],
      [-1, 10, 11, 12],
    ]) {
      s.sphere([side * 0.45, 1.78, 0], [0.25, 0.22, 0.24], white, upper)
        .sphere([side * 0.4, 1.73, -0.09], [0.14, 0.15, 0.15], blue, upper)
        .sphere(
          [side * 0.33, 1.64, side === 1 ? -0.18 : -0.24],
          [0.15, 0.13, 0.16],
          navy,
          lower,
        )
        .sphere(
          [side === 1 ? 0.27 : -0.04, 1.59, side === 1 ? -0.31 : -0.57],
          [0.15, 0.12, side === 1 ? 0.22 : 0.35],
          blue,
          lower,
        )
        .sphere(
          [0.18, 1.57, side === 1 ? -0.43 : -0.86],
          [0.12, 0.115, 0.12],
          navy,
          hand,
        );
    }
    if (armored) {
      s.box([0, 1.52, 0.41], [0.7, 0.5, 0.15], blue, 1);
      for (const x of [-0.48, 0.48])
        s.cone([x, 1.99, 0], [0.19, 0.55, 0.22], glow, x < 0 ? 10 : 7);
      s.box([0, 2.45, 0.02], [0.15, 0.28, 0.16], glow, 2);
    }
    const geometry = s.finish(true),
      material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.7,
        metalness: 0.14,
        transparent: true,
      });
    const body = new THREE.SkinnedMesh(geometry, material);
    body.add(bones[0]);
    root.add(body);
    body.bind(new THREE.Skeleton(bones));
    body.castShadow = true;
    body.receiveShadow = true;
    // A depth-tested silhouette reveals only occluded pixels, sharing the live skeleton.
    // Crew remain normally occluded; only the controlled hero/armor gets this cue.
    let silhouette = null;
    if (role === "hero" || armored) {
      const cue = new THREE.MeshBasicMaterial({ color: "#77f6ff", transparent: true,
        opacity: 0.42, depthFunc: THREE.GreaterDepth, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      silhouette = new THREE.SkinnedMesh(geometry, cue);
      silhouette.bind(body.skeleton, body.bindMatrix);
      silhouette.visible = false;
      silhouette.renderOrder = 12;
      silhouette.frustumCulled = false;
      root.add(silhouette);
    }
    const gun = new THREE.Group();
    bones[9].add(gun);
    gun.position.z = -0.03;
    const actor = actorState("rig/" + role, (dt, a) => {
      const t = a.time,
        phase = t * 9,
        hit =
          a.machine.state === "hit"
            ? Math.sin(Math.min(1, a.machine.elapsed / 180) * Math.PI)
            : 0,
        dead =
          a.machine.state === "down" ? Math.min(1, a.machine.elapsed / 480) : 0;
      bones[0].position.y =
        1.03 + Math.abs(Math.sin(phase)) * 0.035 - dead * 0.75;
      bones[0].rotation.x = -dead * 1.35;
      bones[1].rotation.y = root.userData.aim || 0;
      bones[1].rotation.z = Math.sin(phase) * 0.025 + hit * 0.13;
      bones[3].rotation.x = Math.sin(phase) * 0.5;
      bones[5].rotation.x = -Math.sin(phase) * 0.5;
      bones[4].rotation.x = Math.max(0, -Math.sin(phase)) * 0.65;
      bones[6].rotation.x = Math.max(0, Math.sin(phase)) * 0.65;
      const recoil = ["shoot", "attack"].includes(a.machine.state)
        ? Math.exp(-a.machine.elapsed / 55) * 0.12
        : 0;
      bones[9].position.z = -0.25 + recoil;
      bones[8].rotation.x = -recoil * 0.7;
      bones[2].rotation.y = (root.userData.aim || 0) * 0.25;
      if (a.machine.state === "activate") {
        const v = Math.min(1, a.machine.elapsed / 600);
        bones[7].rotation.z = (1 - v) * -0.5;
        bones[10].rotation.z = (1 - v) * 0.5;
      } else {
        bones[7].rotation.z = 0;
        bones[10].rotation.z = 0;
      }
    });
    root.scale.setScalar(1.23);
    root.userData = {
      actor,
      body,
      gun,
      head: new THREE.Object3D(),
      legL: new THREE.Object3D(),
      legR: new THREE.Object3D(),
      armL: new THREE.Object3D(),
      armR: new THREE.Object3D(),
      rig: true,
      bones,
      silhouette,
      disposables: [geometry, material, body.skeleton, ...(silhouette ? [silhouette.material] : [])],
      aim: 0,
    };
    this.sprites.active.add(actor);
    actor.tick(0);
    return root;
  }
  proxy(kind) {
    const root = this.proxyPool.pop() || new THREE.Group(),
      actor = actorState(kind === "boss" ? "boss" : "horde/" + kind);
    root.clear();
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.setScalar(1);
    dummyParts(root, actor);
    this.sprites.active.add(actor);
    return root;
  }
  releaseProxy(root) {
    this.sprites.release(root);
    root.removeFromParent();
    this.proxyPool.push(root);
  }
  enemyGeometry(type, detail = "near") {
    if (detail === "far") return this.distantEnemyGeometry(type);
    const s = new ShapeBuilder(),
      heavy = type === "heavy",
      spider = type === "ranged",
      elite = type === "elite",
      boss = type === "boss",
      runner = type === "runner",
      charger = type === "charger";
    const color = boss
        ? "#614b80"
        : heavy
          ? "#914c48"
          : spider
            ? "#6c647f"
            : elite
              ? "#ad5145"
              : runner
                ? "#e79539"
                : "#d96f56",
      dark = "#393347",
      armor = "#e7b77a",
      eye = "#fff58e";
    s.sphere(
      [0, 0.93, runner ? -0.1 : 0],
      [
        heavy ? 0.6 : runner ? 0.3 : 0.43,
        runner ? 0.48 : 0.55,
        heavy ? 0.6 : 0.35,
      ],
      color,
    )
      .sphere([0, 1.53, -0.04], [0.37, 0.35, 0.34], color)
      .box([0, 1.48, -0.31], [0.48, 0.2, 0.09], dark);
    for (const x of [-0.13, 0.13])
      s.sphere([x, 1.63, -0.33], [0.085, 0.08, 0.045], eye);
    for (const x of [-0.14, 0, 0.14])
      s.cone(
        [x, 1.39, -0.36],
        [0.04, 0.12, 0.05],
        armor,
        0,
        [0, 0, 0],
        [Math.PI, 0, 0],
      );
    for (const side of [-1, 1]) {
      const lp = [side * 0.24, 0.65, 0],
        ap = [side * 0.42, 1.23, 0];
      s.sphere(
        [side * 0.25, 0.42, 0],
        [0.19, 0.34, 0.19],
        dark,
        side * 2,
        lp,
      ).box([side * 0.25, 0.12, -0.12], [0.3, 0.21, 0.42], color, side * 2, lp);
      s.sphere(
        [side * 0.49, 0.99, -0.03],
        [0.18, 0.34, 0.19],
        color,
        side,
        ap,
      ).sphere([side * 0.53, 0.7, -0.14], [0.23, 0.2, 0.24], dark, side, ap);
      for (let f = 0; f < 3; f++)
        s.cone(
          [side * (0.42 + f * 0.1), 0.61, -0.3],
          [0.045, 0.22, 0.055],
          armor,
          side,
          ap,
          [Math.PI / 2, 0, 0],
        );
      if (heavy || charger || elite || boss)
        s.sphere([side * 0.43, 1.22, 0.08], [0.3, 0.26, 0.32], armor, side, ap);
    }
    if (heavy) {
      s.box([-0.38, 1.02, -0.45], [0.48, 0.7, 0.18], dark).box(
        [-0.38, 1.02, -0.56],
        [0.36, 0.47, 0.05],
        armor,
      );
    }
    if (runner) {
      for (const x of [-0.2, 0.2])
        s.cone([x, 1.5, 0.22], [0.12, 0.45, 0.17], dark);
    }
    if (heavy || boss) {
      s.sphere([0, 1.08, 0.18], [0.59, 0.44, 0.48], dark);
      for (let i = -1; i <= 1; i++)
        s.box([i * 0.3, 1.29, 0.44], [0.23, 0.3, 0.14], armor);
    }
    if (charger || elite || boss)
      for (const x of [-0.27, 0.27])
        s.cone([x, 1.97, 0.02], [0.12, 0.53, 0.14], armor);
    if (spider)
      for (const side of [-1, 1])
        for (let k = 0; k < 2; k++) {
          const pv = [side * 0.3, 0.8, 0.15];
          s.box(
            [side * 0.6, 0.5, k * 0.45 - 0.15],
            [0.17, 0.18, 0.8],
            dark,
            side * 2,
            pv,
            [0, side * 0.65, side * 0.6],
          );
        }
    if (spider)
      s.add(
        new THREE.CylinderGeometry(0.15, 0.2, 0.65, 8),
        [0, 1.38, 0.25],
        [1, 1, 1],
        "#ac8cca",
        0,
        [0, 0, 0],
        [Math.PI / 2, 0, 0],
      );
    if (boss) {
      s.box([0, 1.1, -0.42], [0.52, 0.48, 0.15], "#a579d5");
      s.sphere([0, 1.16, -0.52], [0.17, 0.22, 0.06], "#f9c6ff");
      for (const x of [-0.65, 0.65])
        s.cone([x, 1.65, 0.22], [0.19, 0.75, 0.25], "#a2bbc9");
    }
    return s.finish();
  }
  distantEnemyGeometry(type) {
    // Keep head/torso, articulated feet/arms and type silhouette; remove subpixel teeth/claws.
    const s = new ShapeBuilder(), heavy = type === "heavy", elite = type === "elite",
      runner = type === "runner", ranged = type === "ranged";
    const color = heavy ? "#914c48" : ranged ? "#6c647f" : elite ? "#ad5145"
      : runner ? "#e79539" : "#d96f56";
    s.sphere([0, 0.96, 0], [heavy ? 0.66 : runner ? 0.32 : 0.47, 0.58, 0.4], color)
      .sphere([0, 1.53, -0.04], [0.37, 0.35, 0.34], color)
      .box([0, 1.62, -0.34], [0.39, 0.1, 0.04], "#fff58e");
    for (const side of [-1, 1]) {
      const lp = [side * 0.24, 0.65, 0], ap = [side * 0.42, 1.23, 0];
      s.box([side * 0.25, 0.32, -0.04], [0.28, 0.58, 0.36], "#393347", side * 2, lp)
        .box([side * 0.49, 0.94, -0.06], [0.28, 0.65, 0.3], color, side, ap);
      if (heavy || elite) s.box([side * 0.48, 1.25, 0], [0.35, 0.28, 0.4], "#e7b77a", side, ap);
      if (runner || type === "charger" || elite)
        s.cone([side * 0.24, 1.92, 0.08], [0.12, 0.45, 0.14], "#e7b77a");
      if (ranged) s.box([side * 0.6, 0.5, 0.12], [0.2, 0.2, 0.95], "#393347", side * 2, lp);
    }
    if (heavy) s.box([-0.38, 1.02, -0.5], [0.48, 0.7, 0.18], "#e7b77a");
    if (ranged) s.box([0, 1.35, 0.27], [0.28, 0.28, 0.65], "#ac8cca");
    return s.finish();
  }
  batch(type, detail = "near") {
    const key = type + "/" + detail;
    if (this.batches.has(key)) return this.batches.get(key);
    const geometry = this.enemyGeometry(type, detail),
      motion = new THREE.InstancedBufferAttribute(
        new Float32Array(this.limit * 4),
        4,
      );
    geometry.setAttribute("aMotion", motion);
    // Diffuse cartoon lighting avoids per-fragment PBR work across the entire horde.
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHordeTime = this.uniform;
      shader.uniforms.uAnimationHz = this.animationHz;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\nattribute float aLimb; attribute vec3 aPivot; attribute vec4 aMotion; uniform float uHordeTime; uniform float uAnimationHz; varying float vHordeHit;\nmat3 limbRotation(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}`,
        )
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>\nfloat gaitTime=instanceMatrix[3].z < -25. ? floor(uHordeTime*uAnimationHz)/uAnimationHz : uHordeTime;float gait=sin(gaitTime*(6.+mod(aMotion.x,3.))+aMotion.x)*sign(aLimb)*(.42+step(1.5,abs(aLimb))*.16); if(abs(aLimb)>.1&&abs(aLimb)<1.5)gait+=aMotion.w; if(abs(aLimb)>.1)objectNormal=limbRotation(gait)*objectNormal;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nif(abs(aLimb)>.1)transformed=limbRotation(gait)*(transformed-aPivot)+aPivot;transformed.y+=abs(sin(gaitTime*8.+aMotion.x))*.045;transformed.z+=aMotion.y*.1; transformed.y*=max(.02,1.-aMotion.z);transformed.z+=aMotion.z*.7;vHordeHit=aMotion.y;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying float vHordeHit;",
        )
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.7,.42),vHordeHit*.8);",
        );
    };
    material.customProgramCacheKey = () => "horde-rig-lod-v2";
    const mesh = new THREE.InstancedMesh(geometry, material, this.limit);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    this.scene.add(mesh);
    const b = { mesh, motion, count: 0, type, detail };
    this.batches.set(key, b);
    return b;
  }
  sync(enemies, boss, time, quality = 0) {
    this.uniform.value = time;
    this.animationHz.value = qualityProfile(quality).animationHz;
    for (const b of this.batches.values()) b.count = 0;
    const list = boss ? [...enemies, boss] : enemies;
    for (const e of list) {
      const type = e === boss ? "boss" : e.type,
        b = this.batch(type, e.renderDetail = enemyDetail(e.z, quality, e.renderDetail, type === "boss")),
        i = b.count++;
      if (i >= this.limit) {
        b.count--;
        continue;
      }
      const d = this.dummy;
      d.position.copy(e.group.position);
      d.rotation.set(0, Math.PI, 0);
      d.scale.copy(e.group.scale);
      if (e === boss) d.scale.multiplyScalar(2.8);
      d.updateMatrix();
      b.mesh.setMatrixAt(i, d.matrix);
      b.motion.setXYZW(
        i,
        e === boss ? e.move : e.phase || 0,
        (e.flash || 0) * 9,
        e.dead
          ? Math.min(0.98, 1 - (e.dead === true ? e.death : e.dead) / 0.48)
          : 0,
        e === boss
          ? e.phase === "warn"
            ? -0.65
            : e.group.userData.actor.machine.state === "attack"
              ? 0.8
              : 0
          : e.windup > 0
            ? -0.35
            : e.cooldown > 0
              ? 0.45
              : 0,
      );
      this.color.set(
        e.slowTime > 0 ? "#a2dfff" : e.burnTime > 0 ? "#ffad7e" : "#ffffff",
      );
      b.mesh.setColorAt(i, this.color);
    }
    for (const b of this.batches.values()) {
      b.mesh.count = b.count;
      b.mesh.instanceMatrix.needsUpdate = true;
      b.motion.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    }
  }
  audit() {
    return {
      technique: "GPU instanced articulated original meshes",
      families: new Set([...this.batches.values()].map(b => b.type)).size,
      near: [...this.batches.values()].filter(b => b.detail === "near").reduce((n,b) => n+b.count,0),
      far: [...this.batches.values()].filter(b => b.detail === "far").reduce((n,b) => n+b.count,0),
      animationHz: this.animationHz.value,
      instances: [...this.batches.values()].reduce((n, b) => n + b.count, 0),
      draws: [...this.batches.values()].filter((b) => b.count > 0).length,
      proxyPool: this.proxyPool.length,
    };
  }
}
export function roadPropGeometry(kind) {
  const s = new ShapeBuilder();
  if (kind === 0) {
    s.box([0, 0.33, 0], [1.25, 0.4, 2.5], "#d9e7e7")
      .box([0, 0.64, -0.05], [1.0, 0.47, 1.25], "#248baf")
      .box([0, 0.68, -0.69], [0.86, 0.3, 0.045], "#9deaf2")
      .box([0, 0.66, 0.6], [0.86, 0.3, 0.04], "#36536c");
    for (const x of [-0.63, 0.63])
      for (const z of [-0.77, 0.77])
        s.add(
          new THREE.CylinderGeometry(0.29, 0.29, 0.18, 8),
          [x, 0.26, z],
          [1, 1, 1],
          "#263243",
          0,
          [0, 0, 0],
          [0, 0, Math.PI / 2],
        );
    for (const x of [-0.43, 0.43])
      s.box([x, 0.4, -1.26], [0.2, 0.12, 0.04], "#ecf6ae");
  } else if (kind === 1) {
    s.box([0, 0.06, 0], [0.6, 0.1, 0.6], "#354b60")
      .cone([0, 0.45, 0], [0.25, 0.78, 0.25], "#f2a255")
      .cone([0, 0.48, 0], [0.18, 0.31, 0.18], "#f3ece1");
  } else if (kind === 2) {
    s.box([0, 0.1, 0], [1.2, 0.18, 0.7], "#405568")
      .box([0, 0.33, 0], [0.8, 0.3, 0.5], "#abc6cf")
      .box([0.3, 0.52, 0.1], [0.4, 0.17, 0.3], "#7194a7");
  } else {
    for (const x of [-0.6, 0.6]) s.box([x, 0.5, 0], [0.12, 1, 0.2], "#8aa9b8");
    s.box([0, 0.68, 0], [1.5, 0.4, 0.24], "#eeae65");
    for (const x of [-0.42, 0, 0.42])
      s.box(
        [x, 0.7, -0.14],
        [0.18, 0.3, 0.02],
        "#264c60",
        0,
        [0, 0, 0],
        [0, 0, -0.3],
      );
  }
  return s.finish();
}
