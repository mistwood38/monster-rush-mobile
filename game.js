import * as THREE from "./vendor/three/three.module.min.js";
import { CombatModels, roadPropGeometry } from "./actors3d.js";
import {
  HORDE_LIMIT,
  hordeStage,
  enemyKind,
  SpatialGrid,
  qualityProfile,
} from "./horde.js";
import { BattleAudio } from "./audio.js";
import { SpriteLibrary } from "./sprites.js";
const sprites = await SpriteLibrary.load("./assets/v17/catalog.json").catch(
  (error) => {
    const button = document.querySelector("#start");
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.querySelector("span").textContent = "重新装载";
    button.onclick = () => location.reload();
    document.querySelector("#menu .menu-desc span").textContent =
      "战场资源暂未读取完成，请重试。";
    throw error;
  },
);
import { RunSystems } from "./systems.js";
import { RULES, ROLES, PETS, ARMORS, AFFIXES } from "./config/catalog.js";
const run = new RunSystems();
let models;
const enemyGrid = new SpatialGrid(2.5),
  collisionCandidates = [],
  enemyPool = [];
let gridDirty = true,
  enemySerial = 0,
  qualityLevel = 0;
const telemetry = {
  spawned: 0,
  killed: 0,
  breached: 0,
  hits: 0,
  damageTaken: 0,
  damageDealt: 0,
  killSeconds: 0,
  engagementSeconds: 0,
  breachHits: 0,
  directHits: 0,
  peakAlive: 0,
  peakVisible: 0,
  collisionTests: 0,
  bossFights: [],
  stages: [],
  realSeconds: 0,
};
function ensureGrid() {
  if (gridDirty) {
    enemyGrid.rebuild(state.threats);
    gridDirty = false;
  }
  return enemyGrid;
}
function queryEnemies(x0, z0, x1 = x0, z1 = z0, pad = 1.6) {
  return ensureGrid().query(x0, z0, x1, z1, pad, []);
}
function retireEnemy(e) {
  models.releaseProxy(e.group);
  enemyPool.push(e);
  gridDirty = true;
}

const teamVisuals = new Map();
let petVisual = null,
  armorVisual = null;
function vibrate(pattern) {
  if (saved.get("mr-haptics", "1") === "1")
    try {
      navigator.vibrate?.(pattern);
    } catch {}
}
function combatStats() {
  return run.stats(state.stats, state.overdrive > 0, state.hp);
}

const $ = (s) => document.querySelector(s),
  clamp = (x, a, b) => Math.max(a, Math.min(b, x)),
  rand = (a, b) => a + Math.random() * (b - a),
  mix = (a, b, t) => a + (b - a) * t;
const canvas = $("#game"),
  app = $("#app"),
  playerZ = 2.4,
  ROAD_HALF = 6.2,
  PLAYER_LIMIT = 4.8;
const saved = {
  get(k, d) {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, String(v));
    } catch {}
  },
};
const state = {
  mode: "menu",
  time: 0,
  score: 0,
  kills: 0,
  hp: 100,
  best: +saved.get("mr2-best", "0"),
  weapon: "rifle",
  weaponLevel: 1,
  playerX: 0,
  targetX: 0,
  invuln: 0,
  shootTimer: 0,
  spawnTimer: 0,
  gateTimer: 4,
  crateTimer: 13,
  bossTimer: 95,
  nextBoss: 95,
  boss: null,
  damageBonus: 0,
  combo: 0,
  lastHit: 0,
  shake: 0,
  recoil: 0,
  heat: 0,
  overdrive: 0,
  gateSequence: 0,
  wave: 1,
  stats: { lanes: 1, pellets: 1, fireRate: 1, bulletSpeed: 1, damage: 1 },
  gateDamage: 1,
  threats: [],
  gates: [],
  crates: [],
  bullets: [],
  enemyShots: [],
  effects: [],
  floating: [],
  props: [],
  bossBullets: [],
  lastHud: 0,
  elapsedSinceBoss: 0,
};
const audio = new BattleAudio(
  +saved.get("mr2-music", ".55"),
  +saved.get("mr2-sfx", ".75"),
);
let W = innerWidth,
  H = innerHeight,
  renderer,
  scene,
  camera,
  clock,
  lastFrame = 0,
  frameCount = 0,
  fpsT = 0,
  lowFps = 0,
  menuGroup,
  playerRig,
  playerParts = {},
  weaponRoot,
  muzzle,
  weaponModels = {},
  playerShadow,
  roadTexture,
  roadMaterial,
  worldTime = 0,
  activeTouches = 0,
  worldObjects = { buildings: [], rocks: [], lamps: [] },
  cameraBaseQ = new THREE.Quaternion();
const mats = {};
const G = {
  sphere: new THREE.SphereGeometry(1, 12, 9),
  body: new THREE.CapsuleGeometry(0.3, 0.53, 5, 10),
  bigBody: new THREE.CapsuleGeometry(0.39, 0.52, 5, 10),
  helmet: new THREE.SphereGeometry(1, 12, 9),
  limb: new THREE.CapsuleGeometry(0.14, 0.42, 4, 8),
  smallLimb: new THREE.CapsuleGeometry(0.1, 0.34, 3, 7),
  smallSphere: new THREE.SphereGeometry(1, 8, 6),
  cube: new THREE.BoxGeometry(1, 1, 1),
  capsule: new THREE.CapsuleGeometry(0.14, 0.45, 4, 8),
  capsuleSmall: new THREE.CapsuleGeometry(0.1, 0.34, 3, 7),
  cylinder: new THREE.CylinderGeometry(0.07, 0.07, 1, 9),
  cone: new THREE.ConeGeometry(0.18, 0.46, 8),
  plane: new THREE.PlaneGeometry(1, 1),
  torus: new THREE.TorusGeometry(1, 0.045, 7, 24),
};
function mat(
  name,
  color,
  rough = 0.7,
  metal = 0,
  emissive = 0,
  transparent = false,
  opacity = 1,
) {
  const key = [color, rough, metal, emissive, transparent, opacity].join(":");
  return (
    mats[key] ||
    (mats[key] = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal,
      emissive: emissive ? color : 0,
      emissiveIntensity: emissive,
      transparent,
      opacity,
      side: transparent ? THREE.DoubleSide : THREE.FrontSide,
    }))
  );
}
function basic(color, opacity = 1, depthWrite = true) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite,
    side: THREE.DoubleSide,
  });
}
function mesh(geo, material, parent, pos = [0, 0, 0], scale = null) {
  if (geo.type === "PlaneGeometry" && material.side === THREE.DoubleSide)
    material.forceSinglePass = true;
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  parent.add(m);
  return m;
}
function init() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.35));
    renderer.setSize(app.clientWidth, app.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    const sky = document.createElement("canvas");
    sky.width = 2;
    sky.height = 512;
    const sk = sky.getContext("2d"),
      gradient = sk.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#438fca");
    gradient.addColorStop(0.47, "#a3d9ed");
    gradient.addColorStop(1, "#e2f1ec");
    sk.fillStyle = gradient;
    sk.fillRect(0, 0, 2, 512);
    scene.background = new THREE.CanvasTexture(sky);
    scene.background.colorSpace = THREE.SRGBColorSpace;
    scene.fog = new THREE.FogExp2("#c2e0e7", 0.007);
    camera = new THREE.PerspectiveCamera(
      52,
      innerWidth / innerHeight,
      0.1,
      130,
    );
    camera.position.set(0, 19, 24);
    camera.lookAt(0, 0.8, -14);
    scene.add(new THREE.HemisphereLight("#d5f7ff", "#334d65", 1.8));
    const sun = new THREE.DirectionalLight("#ffe0bb", 2.5);
    sun.position.set(-8, 16, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -18;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const rim = new THREE.DirectionalLight("#27dcf3", 1.15);
    rim.position.set(6, 6, -15);
    scene.add(rim);
    const roadLight = new THREE.PointLight("#1daeb9", 4, 25, 2);
    roadLight.position.set(0, 3, -10);
    scene.add(roadLight);
    models = new CombatModels(scene, sprites, HORDE_LIMIT);
    buildWorld();
    buildPlayer();
    setupUi();
    resize();
    requestAnimationFrame(frame);
  } catch (e) {
    console.error(e);
    $("#menu .menu-desc span").textContent =
      "此浏览器未能启动 WebGL，请更新 Chrome 后重试。";
  }
}
function makeRoadTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#63768b";
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1200; i++) {
    const a = (i * 73) % 256,
      b = (i * 137) % 256;
    x.fillStyle = i % 2 ? "#ffffff08" : "#12243c0d";
    x.fillRect(a, b, 1, 2);
  }
  x.strokeStyle = "#334b6360";
  x.lineWidth = 1;
  x.strokeRect(0, 0, 256, 256);
  x.fillStyle = "#a8c3d314";
  x.fillRect(3, 0, 3, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function buildWorld() {
  const ground = mesh(
    new THREE.PlaneGeometry(110, 180),
    mat("park", "#79a091", 1),
    scene,
    [0, -6, -35],
  );
  ground.rotation.x = -Math.PI / 2;
  addBox(scene, [0, -0.44, -36], [20, 0.6, 126], "#7795a5");
  for (const side of [-1, 1]) {
    addBox(scene, [side * 8, -0.07, -36], [3.3, 0.09, 126], "#a6bdc8");
    addBox(scene, [side * 9.8, 0.35, -36], [0.16, 0.7, 126], "#d5e7e5");
  }
  roadTexture = makeRoadTexture();
  roadMaterial = new THREE.MeshStandardMaterial({
    map: roadTexture,
    roughness: 1,
    metalness: 0,
  });
  worldObjects.roadSegments = [];
  for (let i = 0; i < 3; i++) {
    const road = mesh(new THREE.PlaneGeometry(12.4, 42), roadMaterial, scene, [
      0,
      -0.105,
      -79 + i * 42,
    ]);
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    worldObjects.roadSegments.push(road);
  }
  for (const side of [-1, 1]) {
    addBox(scene, [side * 6.38, 0.08, -36], [0.24, 0.3, 126], "#b5c8cc");
    addBox(scene, [side * 6.44, 0.38, -36], [0.12, 0.16, 126], "#73d3e1");
  }
  // Real world-space skyline: source side strips contain baked perspective and
  // would float above the road when mapped onto upright planes.
  const buildings = new THREE.InstancedMesh(
    G.cube,
    mat("city", "#b8d5e4", 0.8, 0.12),
    48,
  );
  const crowns = new THREE.InstancedMesh(
    G.cube,
    mat("cityGlass", "#4b8eb6", 0.38, 0.3, 0.12),
    48,
  );
  const windows = new THREE.InstancedMesh(
    G.cube,
    mat("cityWindows", "#83dfe2", 0.4, 0.15, 0.3),
    48 * 6,
  );
  windows.frustumCulled = false;
  scene.add(windows);
  const dummy = new THREE.Object3D();
  worldObjects.skyline = [];
  for (let i = 0; i < 48; i++) {
    const side = i % 2 ? 1 : -1,
      height = 4 + ((i * 13) % 11),
      z = 18 - Math.floor(i / 2) * 5.8;
    worldObjects.skyline.push({
      x: side * (10 + (i % 4) * 2.6),
      z,
      height,
      width: 2.6 + (i % 3) * 0.4,
    });
  }
  buildings.frustumCulled = crowns.frustumCulled = false;
  scene.add(buildings, crowns);
  worldObjects.cityMeshes = { buildings, crowns, windows, dummy };
  const markings = new THREE.InstancedMesh(
    G.cube,
    mat("lane", "#d7e9d9", 1),
    32,
  );
  markings.frustumCulled = false;
  scene.add(markings);
  worldObjects.markings = markings;

  worldObjects.decor = [];
  const choices = [
    "props/abandoned_car_topdown",
    "props/traffic_cone",
    "props/road_debris_cluster",
    "props/road_barrier",
  ];
  worldObjects.decorBatches = choices.map((key, i) => {
    const batch = new THREE.InstancedMesh(
      roadPropGeometry(i),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0.14,
      }),
      6,
    );
    batch.frustumCulled = false;
    scene.add(batch);
    return batch;
  });
  for (let i = 0; i < 24; i++) {
    const root = new THREE.Object3D(),
      side = i % 2 ? 1 : -1,
      z = 15 - Math.floor(i / 2) * 9;
    root.position.set(side * (7.3 + (i % 3) * 0.6), 0, z);
    worldObjects.decor.push({
      root,
      z,
      batch: i % 4,
      index: Math.floor(i / 4),
    });
  }
  const overlay = {
    dummy: new THREE.Object3D(),
    normal: new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion),
  };
  for (const [key, geometry, material] of [
    ["back", G.plane, basic("#1d1718", 0.92, false)],
    ["fill", G.plane, basic("#ffc270", 0.96, false)],
    ["shadow", new THREE.CircleGeometry(1, 16), basic("#050b0d", 0.22, false)],
  ]) {
    material.forceSinglePass = true;
    const batch = new THREE.InstancedMesh(geometry, material, RULES.enemyLimit);
    batch.frustumCulled = false;
    batch.count = 0;
    scene.add(batch);
    overlay[key] = batch;
  }
  worldObjects.enemyOverlay = overlay;
}
function syncEnemyOverlays() {
  const o = worldObjects.enemyOverlay;
  if (!o) return;
  const d = o.dummy;
  let bars = 0,
    shadows = 0;
  for (const e of state.threats) {
    const scale = e.group.scale.x;
    d.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    d.position.set(e.x, -0.08, e.z);
    d.scale.set(0.55 * scale, 0.38 * scale, 1);
    d.updateMatrix();
    o.shadow.setMatrixAt(shadows++, d.matrix);
    if (
      e.dead ||
      (e.z < -15 && e.type !== "elite") ||
      (e.type === "grunt" && e.hp >= e.maxHp)
    )
      continue;
    const hp = clamp(e.hp / e.maxHp, 0, 1);
    d.quaternion.copy(camera.quaternion);
    d.position.set(
      e.x,
      e.group.position.y + (e.type === "elite" ? 2.4 : 2.05) * scale,
      e.z,
    );
    d.scale.set(0.9 * scale, 0.095 * scale, 1);
    d.updateMatrix();
    o.back.setMatrixAt(bars, d.matrix);
    d.position.x -= (1 - hp) * 0.44 * scale;
    d.position.addScaledVector(o.normal, 0.012);
    d.scale.set(0.88 * scale * Math.max(0.001, hp), 0.06 * scale, 1);
    d.updateMatrix();
    o.fill.setMatrixAt(bars, d.matrix);
    bars++;
  }
  o.back.count = o.fill.count = bars;
  o.shadow.count = shadows;
  for (const key of ["back", "fill", "shadow"])
    o[key].instanceMatrix.needsUpdate = true;
}
function setInstance(meshObject, id, pos, scale, rotationY = 0) {
  const d = worldObjects.instances?.dummy || new THREE.Object3D();
  d.position.set(pos[0], pos[1], pos[2]);
  d.rotation.set(0, rotationY, 0);
  d.scale.set(scale[0], scale[1], scale[2]);
  d.updateMatrix();
  meshObject.setMatrixAt(id, d.matrix);
}
function updateWorldInstances() {
  const i = worldObjects.instances;
  if (!i) return;
  for (const b of worldObjects.buildings) {
    setInstance(
      i.buildings,
      b.id,
      [b.x, b.height / 2, b.z],
      [b.wide, b.height, b.depth],
    );
    setInstance(
      i.caps,
      b.id,
      [b.x, b.height + 0.08, b.z],
      [b.wide * 1.06, 0.15, b.depth * 1.06],
    );
    setInstance(
      i.antennas,
      b.id,
      [b.x + b.wide * 0.3, b.height + 0.55, b.z],
      [0.04, 1.1, 0.04],
    );
    for (let w = 0; w < 15; w++) {
      const win = b["window" + w];
      setInstance(
        i.windows,
        win.id,
        [
          win.x,
          b.height * (0.32 + Math.floor(w / 5) * 0.22),
          b.z + b.depth / 2 + 0.025,
        ],
        [0.24, 0.38, 0.035],
      );
    }
  }
  i.buildings.instanceMatrix.needsUpdate = true;
  i.caps.instanceMatrix.needsUpdate = true;
  i.antennas.instanceMatrix.needsUpdate = true;
  i.windows.instanceMatrix.needsUpdate = true;
}
function updateRockInstances() {
  const m = worldObjects.rockMesh;
  if (!m) return;
  const d = new THREE.Object3D();
  for (const r of worldObjects.rocks) {
    d.position.set(r.x, -0.1, r.z);
    d.rotation.set(r.rx, r.id * 0.63, r.rz);
    d.scale.set(r.sx, r.sy, r.sz);
    d.updateMatrix();
    m.setMatrixAt(r.id, d.matrix);
  }
  m.instanceMatrix.needsUpdate = true;
}
function addBox(parent, position, scale, color, material = null) {
  const o = mesh(
    G.cube,
    material || mat("box" + color, color, 0.58, 0.22),
    parent,
    position,
    scale,
  );
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
// Shared shader: colored armor and emissive accents use one draw per moving part.
let compactSurface;
function compactGroup(group, directOnly = false, exclude = []) {
  group.updateWorldMatrix(true, true);
  const meshes = [];
  const collect = (o) => {
    if (o.isMesh && !exclude.includes(o)) meshes.push(o);
  };
  if (directOnly) group.children.forEach(collect);
  else group.traverse(collect);
  if (meshes.length < 2) return;
  if (!compactSurface) {
    compactSurface = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      vertexColors: true,
      roughness: 0.63,
      metalness: 0.18,
    });
    compactSurface.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec3 surfaceGlow; varying vec3 vSurfaceGlow;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvSurfaceGlow = surfaceGlow;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vSurfaceGlow;",
        )
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vSurfaceGlow;",
        );
    };
  }
  const inverse = group.matrixWorld.clone().invert(),
    positions = [],
    normals = [],
    colors = [],
    emissions = [],
    indices = [];
  for (const object of meshes) {
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    const p = geometry.getAttribute("position"),
      n = geometry.getAttribute("normal"),
      oldColor = geometry.getAttribute("color"),
      oldGlow = geometry.getAttribute("surfaceGlow"),
      offset = positions.length / 3;
    const material = Array.isArray(object.material)
        ? object.material[0]
        : object.material,
      col = material.color || new THREE.Color("#ffffff"),
      emission = material.emissive || new THREE.Color(0),
      gain = material.emissiveIntensity || 0;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(
        oldColor ? oldColor.getX(i) : col.r,
        oldColor ? oldColor.getY(i) : col.g,
        oldColor ? oldColor.getZ(i) : col.b,
      );
      emissions.push(
        oldGlow ? oldGlow.getX(i) : emission.r * gain,
        oldGlow ? oldGlow.getY(i) : emission.g * gain,
        oldGlow ? oldGlow.getZ(i) : emission.b * gain,
      );
    }
    const idx = geometry.index?.array;
    if (idx) for (const i of idx) indices.push(offset + i);
    else for (let i = 0; i < p.count; i++) indices.push(offset + i);
    geometry.dispose();
    object.parent.remove(object);
    if (!Object.values(G).includes(object.geometry)) object.geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    "surfaceGlow",
    new THREE.Float32BufferAttribute(emissions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const merged = new THREE.Mesh(geometry, compactSurface);
  merged.castShadow = true;
  merged.receiveShadow = true;
  group.add(merged);
  return merged;
}

function armorGeometry() {
  if (G.armor) return G.armor;
  const shape = new THREE.Shape();
  shape.moveTo(-0.4, -0.4);
  shape.lineTo(0.4, -0.4);
  shape.lineTo(0.4, 0.4);
  shape.lineTo(-0.4, 0.4);
  shape.closePath();
  G.armor = new THREE.ExtrudeGeometry(shape, {
    depth: 0.8,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.1,
    bevelThickness: 0.1,
    curveSegments: 1,
  });
  G.armor.translate(0, 0, -0.4);
  return G.armor;
}
const enemyTextures = {};
function createSoldier(kind = "player") {
  if (kind === "player") return createAssetSoldier();
  return models.proxy(kind === "scout" ? "grunt" : kind);
}
function buildGun(type) {
  return models.gun(type);
}
function setWeapon(type, quiet = false) {
  const valid = ["rifle", "machine", "shotgun", "plasma", "laser"];
  if (!valid.includes(type)) return;
  state.weapon = type;
  state.weaponLevel = valid.indexOf(type) + 1;
  if (weaponRoot) playerParts.gun.remove(weaponRoot);
  let visual = weaponModels[type];
  if (!visual) {
    const root = buildGun(type),
      flash = mesh(
        new THREE.PlaneGeometry(
          type === "shotgun" ? 1.35 : 0.82,
          type === "plasma" ? 1.25 : 0.82,
        ),
        new THREE.MeshBasicMaterial({
          map: sprites.staticTexture(
            "vfx/" +
              {
                rifle: "assault",
                machine: "gatling",
                shotgun: "shotgun",
                plasma: "plasma",
                laser: "laser",
              }[type] +
              "_muzzle",
          ),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
        root,
        [0, 0, -1.04],
      );
    flash.quaternion.copy(camera.quaternion);
    flash.visible = false;
    visual = weaponModels[type] = { root, muzzle: flash };
  }
  weaponRoot = visual.root;
  muzzle = visual.muzzle;
  playerParts.gun.add(weaponRoot);
  updateWeaponUi();
  if (!quiet) {
    announce(`${weaponInfo[type].name} 已装备`, `火力模式切换`);
    audio.pickup();
    burst3D(
      playerRig.position.x,
      1.4,
      playerZ - 0.4,
      weaponInfo[type].color,
      20,
    );
  }
}
const weaponInfo = {
  medkit: { name: "装甲维修箱", color: "#89f5cb", icon: "✚" },
  rifle: {
    name: "突击步枪",
    sub: "稳定 · 全自动",
    icon: "⌁",
    color: "#74eff0",
    interval: 0.25,
    damage: 12,
    speed: 32,
    count: 1,
    spread: 0.025,
    kind: "bullet",
  },
  machine: {
    name: "重型机枪",
    sub: "高射速 · 密集弹幕",
    icon: "▤",
    color: "#ffd27f",
    interval: 0.12,
    damage: 8.2,
    speed: 36,
    count: 1,
    spread: 0.035,
    kind: "bullet",
  },
  shotgun: {
    name: "破门霰弹枪",
    sub: "七发散射 · 近战爆发",
    icon: "✣",
    color: "#ffad76",
    interval: 0.72,
    damage: 8.8,
    speed: 27,
    count: 7,
    spread: 0.27,
    kind: "pellet",
  },
  plasma: {
    name: "等离子炮",
    sub: "范围爆炸 · 重型火力",
    icon: "◉",
    color: "#c9a2ff",
    interval: 0.86,
    damage: 51,
    speed: 17,
    count: 1,
    spread: 0.015,
    kind: "plasma",
  },
  laser: {
    name: "棱镜激光器",
    sub: "持续光束 · 穿透目标",
    icon: "ϟ",
    color: "#ff92f7",
    interval: 0.12,
    damage: 7.2,
    speed: 0,
    count: 1,
    spread: 0,
    kind: "laser",
  },
};
function createAssetSoldier(role = "hero") {
  return models.soldier(role);
}
function buildPlayer() {
  playerRig = createSoldier("player");
  scene.add(playerRig);
  playerParts = {
    gun: playerRig.userData.gun,
    legL: playerRig.userData.legL,
    legR: playerRig.userData.legR,
    armL: playerRig.userData.armL,
    armR: playerRig.userData.armR,
    head: playerRig.userData.head,
  };
  playerRig.position.set(0, -0.1, playerZ);
  playerRig.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  playerShadow = mesh(
    new THREE.CircleGeometry(0.72, 24),
    new THREE.MeshBasicMaterial({
      color: "#061016",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    scene,
    [0, -0.08, playerZ],
    [0.7, 0.48, 1],
  );
  playerShadow.rotation.x = -Math.PI / 2;
  setWeapon("rifle", true);
}
function labelSprite(lines, color = "#b7ffff") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 350;
  const x = c.getContext("2d");
  x.clearRect(0, 0, 512, 350);
  const grad = x.createLinearGradient(0, 0, 0, 350);
  grad.addColorStop(0, "rgba(6,21,31,.88)");
  grad.addColorStop(1, "rgba(6,21,31,.58)");
  x.fillStyle = grad;
  x.beginPath();
  x.roundRect(8, 8, 496, 334, 28);
  x.fill();
  x.strokeStyle = color;
  x.lineWidth = 7;
  x.shadowColor = color;
  x.shadowBlur = 20;
  x.stroke();
  x.shadowBlur = 0;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillStyle = "#f3ffff";
  x.font = '900 86px system-ui,"Noto Sans SC",sans-serif';
  x.fillText(lines.value, 256, 137);
  x.fillStyle = color;
  x.font = '800 42px system-ui,"Noto Sans SC",sans-serif';
  x.fillText(lines.name, 256, 232);
  x.fillStyle = "#d1e7e6";
  x.font = "600 22px system-ui,sans-serif";
  x.fillText(lines.hint || "选择此路线", 256, 293);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(2.7, 1.85, 1);
  sprite.position.set(0, 3.35, 0.22);
  sprite.material.depthTest = false;
  sprite.renderOrder = 5;
  return { sprite, canvas: c, texture: tex, ctx: x };
}
const gateDefs = [
  [
    {
      type: "lanes",
      amount: 1,
      value: "弹道 +1",
      name: "扩展覆盖",
      color: "#74f4ed",
    },
    {
      type: "damage",
      amount: 0.15,
      value: "伤害 +15%",
      name: "弹芯强化",
      color: "#ffa9a4",
    },
  ],
  [
    {
      type: "rate",
      amount: 0.2,
      value: "射速 +20%",
      name: "高速供弹",
      color: "#ffd19c",
    },
    {
      type: "pellets",
      amount: 1,
      value: "弹丸 +1",
      name: "复式弹链",
      color: "#a1c8ff",
    },
  ],
  [
    {
      type: "speed",
      amount: 0.3,
      value: "弹速 +30%",
      name: "磁轨推进",
      color: "#83d6ff",
    },
    {
      type: "damage",
      amount: 0.25,
      value: "伤害 +25%",
      name: "强化弹芯",
      color: "#ffafac",
    },
  ],
];
function buildGate(reward, x, z) {
  if (
    (reward.type === "recruit" && run.team.length >= 4) ||
    (reward.type === "promote" && !run.canPromote(reward.role)) ||
    (reward.type === "team" && run.teamPower >= 0.3)
  )
    reward = {
      type: "regroup",
      amount: 15,
      value: "维修 +15",
      name: "小队维修",
      color: "#8defce",
    };
  const limits = {
    lanes: ["lanes", 3],
    pellets: ["pellets", 3],
    rate: ["fireRate", 2],
    speed: ["bulletSpeed", 2],
    damage: ["damage", 2.2],
  };
  if (
    limits[reward.type] &&
    state.stats[limits[reward.type][0]] >= limits[reward.type][1] - 1e-6
  )
    reward = {
      type: "repair",
      amount: 12,
      value: "装甲 +12",
      name: "维修协议",
      color: "#8defce",
    };
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  const key =
    {
      lanes: "ballistics",
      pellets: "bullets",
      rate: "fire_rate",
      speed: "bullet_speed",
      damage: "damage",
      recruit: "recruit",
      promote: "promote",
      team: "team_fire_rate",
      regroup: "team_repair",
      repair: "heal",
    }[reward.type] || "damage";
  const frame = mesh(
    new THREE.PlaneGeometry(3.5, 4.38),
    new THREE.MeshBasicMaterial({
      map: sprites.staticTexture("gates/gate_" + key),
      transparent: true,
      alphaTest: 0.025,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    group,
    [0, 1.9, 0],
  );
  frame.quaternion.copy(camera.quaternion);
  const scan = mesh(
    new THREE.PlaneGeometry(2.75, 0.035),
    new THREE.MeshBasicMaterial({
      color: reward.color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
    group,
    [0, 1.2, 0.1],
  );
  const label = labelSprite(
    {
      value: reward.value,
      name: reward.name,
      hint: ["recruit", "promote", "team", "regroup"].includes(reward.type)
        ? "靠近此路线 · 二选一"
        : "射击充能 · 上限16",
    },
    reward.color,
  );
  label.sprite.position.set(0, 2.3, 0.2);
  group.add(label.sprite);
  const light = new THREE.Object3D();
  light.intensity = 0;
  group.add(light);
  state.gates.push({
    id: ++gateSerial,
    pairId: null,
    group,
    reward: { ...reward },
    charge: 0,
    x,
    z,
    light,
    label,
    scan,
    phase: rand(0, 6),
    resolved: false,
  });
}
function spawnGateEvent() {
  const systemPairs = [
    [
      {
        type: "recruit",
        role: "assault",
        amount: 1,
        value: "队员 +1",
        name: "突击招募",
        color: "#8ff3df",
      },
      gateDefs[0][1],
    ],
    [
      {
        type: "promote",
        role: "heavy",
        amount: 1,
        value: "晋升 +1",
        name: "重火力路线",
        color: "#ffd58f",
      },
      {
        type: "promote",
        role: "guard",
        amount: 1,
        value: "晋升 +1",
        name: "护卫路线",
        color: "#9beac7",
      },
    ],
    [
      {
        type: "team",
        amount: 0.1,
        value: "全队射速 +10%",
        name: "协同供弹",
        color: "#a7beff",
      },
      {
        type: "promote",
        role: "assault",
        amount: 1,
        value: "晋升 +1",
        name: "突击精锐",
        color: "#8ddff1",
      },
    ],
  ];
  const index = state.gateSequence,
    pair =
      index === 0
        ? systemPairs[0]
        : index % 3 === 1
          ? systemPairs[Math.floor(index / 3) % 3]
          : gateDefs[index % 3];
  const pairId = ++state.gateSequence;
  pair.forEach((reward, i) => {
    buildGate(reward, i === 0 ? -2.45 : 2.45, -34);
    state.gates.at(-1).pairId = pairId;
  });
  state.gateTimer = 10.5;
}

function makeCrateTexture(type) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 260;
  const x = c.getContext("2d"),
    color = weaponInfo[type].color;
  x.fillStyle = "rgba(8,18,29,.94)";
  x.beginPath();
  x.roundRect(5, 5, 502, 250, 25);
  x.fill();
  x.strokeStyle = color;
  x.lineWidth = 5;
  x.stroke();
  x.textAlign = "center";
  x.fillStyle = color;
  x.font = '900 45px system-ui,"Noto Sans SC"';
  x.fillText(type === "medkit" ? "战地支援" : "武器补给", 256, 85);
  x.fillStyle = "#ffffff";
  x.font = '900 68px system-ui,"Noto Sans SC"';
  x.fillText(weaponInfo[type].name, 256, 165);
  x.fillStyle = "#cbdfdf";
  x.font = '600 26px system-ui,"Noto Sans SC"';
  x.fillText(
    (type === "medkit"
      ? "装甲 +25"
      : ["标准级", "军用级", "突击级", "实验级", "原型级"][
          ["rifle", "machine", "shotgun", "plasma", "laser"].indexOf(type)
        ]) + "  ·  靠近拾取",
    256,
    215,
  );
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    }),
  );
}
function spawnCrate(type, x = rand(-3.7, 3.7), z = -29) {
  if (state.crates.length >= 3 || !weaponInfo[type]) return;
  const group = new THREE.Group();
  group.position.set(x, 0.1, z);
  scene.add(group);
  const rank = ["rifle", "machine", "shotgun", "plasma", "laser"].indexOf(type),
    key =
      type === "medkit"
        ? "pickup_heal_kit"
        : rank >= 3
          ? "pickup_advanced_weapon"
          : rank >= 1
            ? "pickup_rare_weapon"
            : "pickup_common_weapon";
  const body = mesh(
    new THREE.PlaneGeometry(1.65, 1.65),
    new THREE.MeshBasicMaterial({
      map: sprites.staticTexture("props/" + key),
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
    }),
    group,
    [0, 0.5, 0],
  );
  body.quaternion.copy(camera.quaternion);
  const sprite = makeCrateTexture(type);
  sprite.position.set(0, 1.8, 0);
  sprite.scale.set(3, 1.52, 1);
  group.add(sprite);
  if (type !== "medkit") {
    const display = buildGun(type);
    display.position.set(0, 0.9, 0.1);
    group.add(display);
  }
  const light = new THREE.Object3D();
  light.intensity = 0;
  group.add(light);
  state.crates.push({
    group,
    type,
    x,
    z,
    spin: 0,
    light,
    grade: rank >= 3 ? "high" : "normal",
    opened: false,
    armorRolled: false,
  });
}

function acquireGate(g) {
  if (!testPickupsEnabled) return;
  const special = g.reward.type;
  if (["recruit", "team", "promote", "regroup"].includes(special)) {
    if (special === "recruit") run.recruit("assault");
    if (special === "team") run.teamPower = Math.min(0.3, run.teamPower + 0.1);
    if (special === "regroup") {
      state.hp = Math.min(run.maxHp, state.hp + 15);
      run.team.forEach((m) => (m.hp = Math.min(m.maxHp, m.hp + 15)));
    }
    if (special === "promote") {
      if (!run.team.length) run.recruit("assault");
      else if (!run.promote(g.reward.role))
        run.team.forEach((m) => (m.hp = Math.min(m.maxHp, m.hp + 15)));
    }
    announce(g.reward.value, "队员本局持续存在 · 职业武器保留");
    audio.pickup();
    state.score += 70;
    return;
  }
  if (g.reward.type === "repair") {
    const amount = g.reward.amount + (g.charge >= 8 ? 6 : 0);
    state.hp = Math.min(run.maxHp, state.hp + amount);
    state.score += 60;
    announce("装甲修复 +" + amount, "满阶强化转为战地维修");
    audio.pickup();
    return;
  }
  if (g.reward.type === "gun") {
    setWeapon(g.reward.weapon);
    state.score += 150;
    return;
  }
  const s = state.stats;
  const previousDamage = s.damage;
  switch (g.reward.type) {
    case "lanes":
      s.lanes = Math.min(3, s.lanes + Math.min(2, g.reward.amount));
      break;
    case "pellets":
      s.pellets = Math.min(3, s.pellets + Math.min(2, g.reward.amount));
      break;
    case "rate":
      s.fireRate = Math.min(2, s.fireRate * (1 + g.reward.amount));
      break;
    case "speed":
      s.bulletSpeed = Math.min(2, s.bulletSpeed * (1 + g.reward.amount));
      break;
    case "damage":
      s.damage = Math.min(2.2, s.damage * (1 + g.reward.amount));
      break;
  }
  state.weaponLevel = Math.min(9, state.weaponLevel + 1);
  state.hp = Math.min(run.maxHp, state.hp + 6);
  state.score += 45;
  state.combo++;
  const extra = g.charge >= 8 ? Math.min(1.25, g.charge * 0.035) : 0;
  if (extra) {
    if (g.reward.type === "lanes") s.lanes = Math.min(3, s.lanes + 1);
    else if (g.reward.type === "pellets")
      s.pellets = Math.min(3, s.pellets + 1);
    else if (g.reward.type === "rate")
      s.fireRate = Math.min(2, s.fireRate * 1.1);
    else if (g.reward.type === "speed")
      s.bulletSpeed = Math.min(2, s.bulletSpeed * 1.1);
    else if (g.reward.type === "damage")
      s.damage = Math.min(2.2, s.damage * 1.12);
  }
  state.gateDamage = Math.min(
    2.2,
    (state.gateDamage * s.damage) / previousDamage,
  );
  announce(
    g.reward.value,
    extra ? "射击充能成功 · 额外强化" : "火力提升 · 装甲修复 +6",
  );
  audio.pickup();
  state.shake = Math.max(state.shake, extra ? 0.18 : 0.1);
  vibrate(extra ? 32 : 18);
  burst3D(g.x, 2, playerZ - 0.1, g.reward.color, 32);
  updateWeaponUi();
}
function disposeGroup(g) {
  sprites.release(g);
  scene.remove(g);
  g.traverse((o) => {
    for (const resource of o.userData.disposables || []) resource.dispose();
  });
  g.traverse?.((o) => {
    if (
      o.geometry &&
      !o.userData.sharedGeometry &&
      !Object.values(G).includes(o.geometry)
    )
      o.geometry.dispose();
    if (o.material?.map?.image?.tagName === "CANVAS") {
      o.material.map.dispose();
      o.material.dispose();
    }
  });
}
function removeShadow(shadow) {
  scene.remove(shadow);
  shadow.geometry?.dispose();
  shadow.material?.dispose();
}
function disposeSoldier(g) {
  disposeGroup(g);
  g.userData.shieldMaterial?.dispose();
}
function spawnEnemy(type = "grunt", x = rand(-4.4, 4.4), z = -46) {
  if (state.threats.length >= RULES.enemyLimit) return;
  const cfg = {
    grunt: { hp: 26, speed: 2.8, damage: 5, scale: 0.88, score: 10 },
    runner: { hp: 22, speed: 4.1, damage: 6, scale: 0.74, score: 14 },
    heavy: { hp: 130, speed: 2.0, damage: 12, scale: 1.0, score: 30 },
    charger: { hp: 60, speed: 3.4, damage: 10, scale: 0.94, score: 24 },
    ranged: { hp: 40, speed: 2.3, damage: 7, scale: 0.8, score: 22 },
    elite: { hp: 260, speed: 2.5, damage: 16, scale: 1.32, score: 70 },
  }[type] || { hp: 26, speed: 2.8, damage: 5, scale: 0.88, score: 10 };
  const stage = hordeStage(state.time);
  const group = createSoldier(
    type === "grunt" ? "scout" : type === "charger" ? "charger" : type,
  );
  group.scale.setScalar(cfg.scale);
  group.position.set(x, 0, z);
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  // No enemy mesh/group is inserted into the scene tree: six GPU batches render the entire horde.
  // Public combat objects stay stable; actual bars/shadows render in three batches.
  const barGroup = new THREE.Object3D(),
    fill = new THREE.Object3D(),
    shadow = new THREE.Object3D();
  const e = enemyPool.pop() || {};
  Object.assign(e, {
    uid: ++enemySerial,
    type,
    group,
    shadow,
    x,
    z,
    hp: cfg.hp * stage.hp,
    maxHp: cfg.hp * stage.hp,
    speed: cfg.speed * stage.speed,
    damage: cfg.damage,
    score: cfg.score,
    phase: rand(0, 8),
    fire: rand(2.5, 6),
    cooldown: 0,
    stun: 0,
    dead: 0,
    bar: fill,
    barGroup,
    windup: 0,
    dash: 0,
    dashCooldown: rand(2, 5),
    targetX: x,
    burnTime: 0,
    burnTick: 0,
    burnDamage: 0,
    slow: 0,
    slowTime: 0,
    flash: 0,
    spawnedAt: state.time,
    firstHitAt: -1,
    homeX: x,
    shotgunCD: 0,
    bounty: false,
    flank: false,
    pack: 0,
    visualDebt: 0,
    visualStamp: -1,
  });
  state.threats.push(e);
  telemetry.spawned++;
  gridDirty = true;
  return e;
}
function createDamageSprite(
  value,
  color,
  xPos = state.playerX,
  zPos = playerZ,
  yPos = 1.8,
) {
  if (state.floating.length >= 24) return;
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 72;
  const x = c.getContext("2d");
  x.font = "900 48px system-ui";
  x.textAlign = "center";
  x.lineWidth = 6;
  x.strokeStyle = "#0a1115";
  x.strokeText(String(value), 96, 53);
  x.fillStyle = color;
  x.shadowColor = color;
  x.shadowBlur = 14;
  x.fillText(String(value), 96, 53);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    }),
  );
  sp.scale.set(1.15, 0.44, 1);
  sp.position.set(xPos + rand(-0.25, 0.25), yPos, zPos);
  scene.add(sp);
  state.floating.push({ mesh: sp, texture: tex, life: 0.74, max: 0.74 });
}
const particlePool = [];
let sparkBatch = null;
let warningBatches = null;
function syncWarnings() {
  if (!warningBatches) {
    warningBatches = [G.plane, new THREE.RingGeometry(0.59, 1, 24)].map((g) => {
      const geometry = g === G.plane ? g.clone() : g,
        alpha = new THREE.InstancedBufferAttribute(
          new Float32Array(RULES.particleLimit),
          1,
        );
      geometry.setAttribute("aWarningAlpha", alpha);
      const material = basic("#ffffff", 0.4, false);
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nattribute float aWarningAlpha;varying float vWarningAlpha;",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvWarningAlpha=aWarningAlpha;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying float vWarningAlpha;",
          )
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\ndiffuseColor.a=vWarningAlpha;",
          );
      };
      material.customProgramCacheKey = () => "warning-alpha-1";
      const batch = new THREE.InstancedMesh(
        geometry,
        material,
        RULES.particleLimit,
      );
      batch.frustumCulled = false;
      batch.renderOrder = 1;
      scene.add(batch);
      return { batch, alpha };
    });
  }
  const counts = [0, 0],
    dummy = worldObjects.enemyOverlay.dummy;
  for (const p of state.effects) {
    if (!p.userData.warning || !p.isMesh) continue;
    const index = p.geometry.type === "RingGeometry" ? 1 : 0,
      { batch, alpha } = warningBatches[index],
      i = counts[index]++;
    p.removeFromParent();
    dummy.position.copy(p.position);
    dummy.quaternion.copy(p.quaternion);
    dummy.scale.copy(p.scale);
    if (index === 0) {
      dummy.scale.x *= p.geometry.parameters.width || 1;
      dummy.scale.y *= p.geometry.parameters.height || 1;
    } else dummy.scale.multiplyScalar(p.geometry.parameters.outerRadius || 1);
    dummy.updateMatrix();
    batch.setMatrixAt(i, dummy.matrix);
    batch.setColorAt(i, p.material.color);
    alpha.setX(i, Math.max(0.04, Math.min(0.8, p.material.opacity)));
  }
  warningBatches.forEach(({ batch, alpha }, i) => {
    batch.count = counts[i];
    batch.instanceMatrix.needsUpdate = true;
    alpha.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
  });
}
function syncSparks() {
  if (!sparkBatch) {
    const mesh = new THREE.InstancedMesh(
      G.smallSphere,
      new THREE.MeshBasicMaterial({
        vertexColors: false,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      RULES.particleLimit,
    );
    mesh.frustumCulled = false;
    scene.add(mesh);
    sparkBatch = {
      mesh,
      dummy: new THREE.Object3D(),
      color: new THREE.Color(),
    };
  }
  let i = 0;
  for (const p of state.effects) {
    if (!p.userData.v) continue;
    const d = sparkBatch.dummy;
    d.position.copy(p.position);
    d.scale.copy(p.scale);
    d.updateMatrix();
    sparkBatch.mesh.setMatrixAt(i, d.matrix);
    sparkBatch.color
      .copy(p.material.color)
      .multiplyScalar(Math.max(0.08, p.userData.life / p.userData.max));
    sparkBatch.mesh.setColorAt(i, sparkBatch.color);
    i++;
  }
  sparkBatch.mesh.count = i;
  sparkBatch.mesh.instanceMatrix.needsUpdate = true;
  if (sparkBatch.mesh.instanceColor)
    sparkBatch.mesh.instanceColor.needsUpdate = true;
}

// Telegraphs have priority over cosmetic sparks, with one global effect ceiling.
function registerEffect(effect) {
  if (state.effects.length >= RULES.particleLimit) {
    let i = state.effects.findIndex((p) => !p.userData.warning);
    if (i < 0) i = 0;
    const old = state.effects.splice(i, 1)[0];
    scene.remove(old);
    if (old.userData.v) {
      old.visible = false;
      particlePool.push(old);
    } else {
      if (!Object.values(G).includes(old.geometry)) old.geometry.dispose();
      old.material.dispose();
    }
  }
  state.effects.push(effect);
}

function burst3D(x, y, z, color, count = 12) {
  const n = Math.min(
    count,
    qualityProfile(qualityLevel).particles,
    Math.max(
      0,
      qualityProfile(qualityLevel).particles -
        state.effects.filter((p) => !p.userData.warning).length,
    ),
  );
  for (let i = 0; i < n; i++) {
    let p = particlePool.pop();
    if (!p) {
      p = new THREE.Object3D();
      p.material = { color: new THREE.Color(color), opacity: 1 };
      p.userData.v = new THREE.Vector3();
    }
    p.visible = true;
    p.material.color.set(color);
    p.material.opacity = 1;
    p.position.set(x + rand(-0.18, 0.18), y + rand(-0.2, 0.2), z);
    p.scale.setScalar(rand(0.035, 0.095));
    p.userData.v.set(rand(-5, 5), rand(-1, 5), rand(-6, 4));
    p.userData.life = p.userData.max = rand(0.22, 0.54);
    registerEffect(p);
  }
}
const muzzleWorld = new THREE.Vector3();
function shotOrigin(source = null) {
  const root =
    source?.rig?.userData.gun?.children[0] ||
    (source ? null : armorVisual?.userData.gun?.children[0] || weaponRoot);
  if (root) {
    root.updateWorldMatrix(true, false);
    muzzleWorld.set(0, 0, -1.04).applyMatrix4(root.matrixWorld);
    return { x: muzzleWorld.x, y: muzzleWorld.y, z: muzzleWorld.z };
  }
  return {
    x: (source?.x ?? state.playerX) + 0.22,
    y: 1.65,
    z: (source?.z ?? playerZ) - 1.7,
  };
}
function muzzleFlash() {
  state.recoil = 1;
  if (muzzle) {
    muzzle.visible = true;
    muzzle.userData.until = state.time + 0.065;
  }
  if (armorVisual) {
    if (!armorVisual.userData.flash) {
      const f = mesh(
        G.plane,
        new THREE.MeshBasicMaterial({
          color: "#caf9ff",
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
        armorVisual.userData.gun,
        [0, 0, -1.04],
        [0.65, 0.65, 1],
      );
      f.quaternion.copy(camera.quaternion);
      armorVisual.userData.flash = f;
    }
    armorVisual.userData.flash.visible = true;
    armorVisual.userData.flash.userData.until = state.time + 0.065;
  }
}
function acquireBullet() {
  let b = state.bullets.find((x) => !x.active);
  if (!b) {
    if (state.bullets.length >= RULES.bulletLimit) return null;
    // Reuse CPU records; all live projectiles render in two GPU instanced draws.
    const group = new THREE.Group(),
      core = { scale: new THREE.Vector3(0.08, 0.08, 0.2), material: null },
      tail = { scale: new THREE.Vector3(0.05, 0.05, 0.2), material: null };
    b = {
      group,
      core,
      tail,
      active: false,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      damage: 1,
      life: 0,
      kind: "bullet",
      color: "#7afff2",
      radius: 0.18,
    };
    state.bullets.push(b);
  }
  b.active = true;
  b.group.visible = true;
  return b;
}
let bulletInstances = null;
function syncBulletInstances() {
  if (!bulletInstances) {
    const core = new THREE.InstancedMesh(
      G.smallSphere,
      new THREE.MeshBasicMaterial({ color: "#ffffff" }),
      RULES.bulletLimit,
    );
    const tail = new THREE.InstancedMesh(
      G.smallSphere,
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
      }),
      RULES.bulletLimit,
    );
    for (const item of [core, tail]) {
      item.frustumCulled = false;
      item.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(item);
    }
    bulletInstances = {
      core,
      tail,
      dummy: new THREE.Object3D(),
      color: new THREE.Color(),
    };
  }
  const { core, tail, dummy, color } = bulletInstances;
  let index = 0;
  for (const b of state.bullets) {
    if (!b.active) continue;
    dummy.position.set(b.x, b.y || 1.65, b.z);
    dummy.rotation.copy(b.group.rotation);
    dummy.scale.copy(b.core.scale);
    dummy.updateMatrix();
    core.setMatrixAt(index, dummy.matrix);
    dummy.position.x += Math.sin(b.group.rotation.y) * 0.35;
    dummy.position.z += Math.cos(b.group.rotation.y) * 0.35;
    dummy.scale.copy(b.tail.scale);
    dummy.updateMatrix();
    tail.setMatrixAt(index, dummy.matrix);
    color.set(b.color);
    core.setColorAt(index, color);
    tail.setColorAt(index, color);
    index++;
  }
  core.count = tail.count = index;
  if (index) {
    for (const item of [core, tail]) {
      item.instanceMatrix.needsUpdate = true;
      item.instanceColor.needsUpdate = true;
    }
  }
}
function releaseBullet(b) {
  b.active = false;
  b.group.visible = false;
}
function createShot(type, target = aimTarget(), source = null) {
  const info = weaponInfo[type],
    stats = source?.stats || combatStats(),
    lanes = stats.lanes;
  const pellets = (type === "shotgun" ? info.count : 1) + stats.pellets - 1;
  const origin = shotOrigin(source);
  const muzzleX = origin.x,
    originZ = origin.z;
  const baseAngle = Math.atan2(
    target.x - muzzleX,
    Math.max(2, originZ - target.z),
  );
  let emitted = 0;
  for (let lane = 0; lane < lanes; lane++)
    for (let p = 0; p < pellets && emitted < (source ? 8 : 40); p++) {
      const b = acquireBullet();
      if (!b) return;
      const spread = type === "shotgun" ? (p - (pellets - 1) / 2) * 0.065 : 0;
      const angle = baseAngle + spread,
        speed = info.speed * stats.bulletSpeed;
      b.kind = info.kind;
      b.owner = source ? "team" : "player";
      b.weaponType = type;
      b.hitTargets = new Set();
      b.pierce = source
        ? 0
        : run.armor?.kind === "phantom"
          ? 1
          : run.level("piercing_core") &&
              Math.random() < (run.level("piercing_core") === 2 ? 0.3 : 0.2)
            ? 1
            : 0;
      b.x =
        muzzleX +
        (lane === 0 ? 0 : lane === 1 ? -2.1 : 2.1) *
          (1 + run.value("spread_width", "spread_shot"));
      b.z = originZ - (type === "shotgun" ? 0 : p * 0.27);
      b.prevX = b.x;
      b.prevZ = b.z;
      b.originZ = originZ;
      b.y = origin.y;
      b.lastGateId = -1;
      b.vx = Math.sin(angle) * speed;
      b.vz = -Math.cos(angle) * speed;
      b.damage =
        info.damage *
        stats.damage *
        1 *
        (type === "shotgun" || p === 0 ? 1 : 0.35);
      b.life = 3.2;
      b.color = info.color;
      b.radius = type === "plasma" ? 0.4 : type === "pellet" ? 0.12 : 0.14;
      b.group.position.set(b.x, b.y, b.z);
      b.group.rotation.y = -angle;
      b.core.material = mat("bullet" + type, info.color, 0.2, 0.05, 1.4);
      b.tail.material = mat(
        "trail" + type,
        info.color,
        0.25,
        0,
        0.8,
        true,
        0.65,
      );
      b.core.scale.set(
        type === "plasma" ? 0.3 : 0.065,
        type === "plasma" ? 0.3 : 0.065,
        type === "plasma" ? 0.55 : 0.21,
      );
      b.tail.scale.set(
        type === "plasma" ? 0.13 : 0.04,
        type === "plasma" ? 0.13 : 0.04,
        type === "plasma" ? 1.2 : 0.5,
      );
      emitted++;
    }
}
// Swept intersection prevents fast bullets skipping targets between frames.
function segmentHit(x0, z0, x1, z1, x, z, rx, rz) {
  let lo = 0,
    hi = 1;
  for (const [start, end, center, radius] of [
    [x0, x1, x, rx],
    [z0, z1, z, rz],
  ]) {
    const d = end - start;
    if (Math.abs(d) < 1e-8) {
      if (Math.abs(start - center) > radius) return null;
      continue;
    }
    const a = (center - radius - start) / d,
      b = (center + radius - start) / d;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
    if (lo > hi) return null;
  }
  return lo;
}
function chargeGate(g, amount) {
  if (
    !["lanes", "pellets", "rate", "speed", "damage", "repair"].includes(
      g.reward.type,
    )
  )
    return;
  const charge = Math.min(16, g.charge + amount);
  if (charge === g.charge) return;
  g.charge = charge;
  updateGateLabel(g);
  g.scan.material.opacity = 0.95;
}

function doLaser() {
  const s = combatStats(),
    target = aimTarget(),
    origin = shotOrigin(),
    originZ = origin.z,
    muzzleX = origin.x;
  const dx = target.x - muzzleX,
    dz = target.z - originZ,
    length = Math.hypot(dx, dz) || 1;
  const range = 32 * Math.sqrt(s.bulletSpeed),
    vx = dx / length,
    vz = dz / length;
  if (!state.laserBeam) {
    const group = new THREE.Group(),
      beams = [];
    scene.add(group);
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 6);
    for (let i = 0; i < 5; i++) {
      const ray = new THREE.Group();
      const outer = mesh(geometry, basic("#eb62ff", 0.5, false), ray),
        inner = mesh(geometry, basic("#ffffff", 0.95, false), ray);
      group.add(ray);
      beams.push({ ray, outer, inner });
    }
    state.laserBeam = { group, beams, life: 0 };
  }
  const beam = state.laserBeam;
  beam.group.visible = true;
  beam.life = 0.11;
  for (let lane = 0; lane < 5; lane++) {
    const visual = beam.beams[lane];
    visual.ray.visible = lane < s.lanes;
    if (!visual.ray.visible) continue;
    const x =
        muzzleX +
        (lane === 0 ? 0 : lane === 1 ? -2.1 : 2.1) *
          (1 + run.value("spread_width", "spread_shot")),
      endX = x + vx * range,
      endZ = originZ + vz * range;
    visual.ray.position.set((x + endX) / 2, origin.y, (originZ + endZ) / 2);
    visual.ray.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(vx, 0, vz),
    );
    const width = 0.045 + Math.min(0.07, (s.pellets - 1) * 0.008);
    visual.outer.scale.set(width * 2, range, width * 2);
    visual.inner.scale.set(width, range, width);
    const damage =
      weaponInfo.laser.damage * s.damage * (1 + (s.pellets - 1) * 0.35) * 1;
    const line = queryEnemies(x, originZ, endX, endZ, 1.2)
      .filter(
        (e) =>
          !e.dead &&
          segmentHit(
            x,
            originZ,
            endX,
            endZ,
            e.x,
            e.z,
            0.55 * e.group.scale.x,
            0.65,
          ) !== null,
      )
      .sort((a, b) => b.z - a.z)
      .slice(0, 8);
    line.forEach((e, index) => {
      damageEnemy(e, damage * Math.max(0.25, Math.pow(0.76, index)), false);
      e.burnTime = Math.max(e.burnTime, 1);
      e.burnDamage = Math.max(e.burnDamage, damage * 0.06);
      if (index < 2) nativeFlash(e.x, e.z, "laser_impact", 0.8);
    });
    const b = state.boss;
    if (
      b &&
      !b.dead &&
      segmentHit(x, originZ, endX, endZ, b.x, b.z, 1.7, 1.1) !== null
    )
      damageBoss(damage);
    for (const gate of state.gates)
      if (
        !gate.resolved &&
        segmentHit(x, originZ, endX, endZ, gate.x, gate.z, 1.4, 0.3) !== null
      )
        chargeGate(gate, 1);
  }
  for (const c of state.crates)
    if (c.destructible && Math.abs(c.x - muzzleX) < 1.5)
      damageSupply(c, weaponInfo.laser.damage * s.damage);
  audio.shoot("laser");
}

function updateGateLabel(g) {
  g.label.ctx.clearRect(0, 0, 512, 350);
  const x = g.label.ctx,
    co = g.reward.color;
  x.fillStyle = "rgba(6,21,31,.88)";
  x.beginPath();
  x.roundRect(8, 8, 496, 334, 28);
  x.fill();
  x.strokeStyle = co;
  x.lineWidth = 7;
  x.shadowColor = co;
  x.shadowBlur = 18;
  x.stroke();
  x.shadowBlur = 0;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillStyle = "#f3ffff";
  x.font = '900 86px system-ui,"Noto Sans SC"';
  x.fillText(g.reward.value, 256, 137);
  x.fillStyle = co;
  x.font = '800 42px system-ui,"Noto Sans SC"';
  x.fillText(g.reward.name, 256, 232);
  x.fillStyle = "#d1e7e6";
  x.font = "600 22px system-ui";
  x.fillText(
    g.charge >= 8 ? "充能完成 · 额外增幅" : "射击充能 " + g.charge + "/8",
    256,
    293,
  );
  g.label.texture.needsUpdate = true;
}
function fireWeapon() {
  const type = state.weapon;
  state.shootTimer = weaponInfo[type].interval / combatStats().fireRate;
  if (type === "laser") doLaser();
  else {
    createShot(type, aimTarget());
    audio.shoot(type);
  }
  sprites.trigger(playerRig, "shoot");
  if (armorVisual) sprites.trigger(armorVisual, "attack");
  muzzleFlash();
  if (type === "shotgun") state.shake = Math.max(state.shake, 0.12);
  else if (type === "plasma") state.shake = Math.max(state.shake, 0.09);
}
function aimTarget() {
  let target = { x: state.playerX + 0.63, z: -45 },
    best = Infinity;
  for (const e of [
    ...state.threats,
    ...(state.boss ? [state.boss] : []),
    ...state.crates.filter((c) => c.destructible),
  ]) {
    if (e.dead || e.z >= playerZ || Math.abs(e.x - state.playerX) > 3.1)
      continue;
    const distance = playerZ - e.z;
    if (distance < best) {
      best = distance;
      target = e;
    }
  }
  // Choose a portal by standing in its lane. Threats in front retain priority.
  if (best === Infinity)
    for (const g of state.gates)
      if (!g.resolved && Math.abs(g.x - state.playerX) < 1.7) {
        target = { x: state.playerX + 0.63, z: g.z };
        break;
      }
  return { x: target.x, z: target.z };
}

function processBulletCollisions(b, dt) {
  const x0 = b.prevX ?? b.x,
    z0 = b.prevZ ?? b.z;
  // Holograms charge without swallowing the player's fire.
  for (const gate of state.gates)
    if (
      !gate.resolved &&
      gate.id !== b.lastGateId &&
      segmentHit(x0, z0, b.x, b.z, gate.x, gate.z, 1.43, 0.4) !== null
    ) {
      chargeGate(gate, b.kind === "plasma" ? 3 : 1);
      b.lastGateId = gate.id;
    }
  let target = null,
    nearest = Infinity,
    isBoss = false,
    isCrate = false;
  for (const e of queryEnemies(x0, z0, b.x, b.z, 1.8)) {
    telemetry.collisionTests++;
    if (e.dead || b.hitTargets?.has(e.uid)) continue;
    const t = segmentHit(
      x0,
      z0,
      b.x,
      b.z,
      e.x,
      e.z,
      0.52 * e.group.scale.x + b.radius,
      0.55 * e.group.scale.x + b.radius,
    );
    if (t !== null && t < nearest) {
      nearest = t;
      target = e;
      isBoss = false;
    }
  }
  const boss = state.boss;
  if (boss && !boss.dead) {
    const t = segmentHit(
      x0,
      z0,
      b.x,
      b.z,
      boss.x,
      boss.z,
      1.7 + b.radius,
      1.2 + b.radius,
    );
    if (t !== null && t < nearest) {
      target = boss;
      isBoss = true;
    }
  }
  for (const c of state.crates)
    if (c.destructible) {
      const t = segmentHit(x0, z0, b.x, b.z, c.x, c.z, 1.2, 0.9);
      if (t !== null && t < nearest) {
        nearest = t;
        target = c;
        isBoss = false;
        isCrate = true;
      }
    }
  if (isCrate) {
    damageSupply(target, b.damage);
    releaseBullet(b);
    return true;
  }
  if (!target) return false;
  const damage =
    b.damage *
    (b.kind === "pellet"
      ? clamp(
          1.45 - Math.abs((b.originZ ?? playerZ) - target.z) / 35,
          0.55,
          1.4,
        )
      : 1);
  if (b.kind === "pellet" && !isBoss && target.shotgunCD <= 0) {
    target.z -= 0.5;
    target.shotgunCD = 0.3;
    target.stun = 0.2;
    nativeFlash(target.x, target.z, "shotgun_impact", 1.25);
    groundPulse(target.x, target.z, "#ffc782", 0.8, 0.2);
    gridDirty = true;
  }
  if (b.kind === "plasma") {
    const neighbors = queryEnemies(target.x, target.z, target.x, target.z, 3)
      .filter((e) => !e.dead && Math.hypot(e.x - target.x, e.z - target.z) < 3)
      .sort(
        (a, b) =>
          Math.hypot(a.x - target.x, a.z - target.z) -
          Math.hypot(b.x - target.x, b.z - target.z),
      )
      .slice(0, 8);
    for (const e of neighbors) {
      const distance = Math.hypot(e.x - target.x, e.z - target.z),
        power = e === target ? damage : damage * 0.8 * (1 - distance / 6);
      damageEnemy(e, power, true, e === target && b.owner === "player");
      e.z -= 0.22;
    }
    nativeFlash(target.x, target.z, "plasma_impact", 3.6);
    groundPulse(target.x, target.z, "#c7a0ff", 3);
    if (
      boss &&
      !boss.dead &&
      (isBoss || Math.hypot(boss.x - target.x, boss.z - target.z) < 3)
    )
      damageBoss(damage, isBoss && b.owner === "player");
    burst3D(target.x, 1.3, target.z, weaponInfo.plasma.color, 24);
    audio.explosion();
    state.shake = Math.max(state.shake, 0.15);
  } else if (isBoss) damageBoss(damage, b.owner === "player");
  else damageEnemy(target, damage, false, b.owner === "player");
  if (b.pierce > 0 && b.kind !== "plasma" && !isBoss) {
    b.pierce--;
    b.damage *= run.level("piercing_core") === 2 ? 0.55 : 0.5;
    b.hitTargets.add(target.uid);
    return false;
  }
  releaseBullet(b);
  return true;
}

function damageEnemy(e, dmg, heavy, procs = true) {
  if (e.dead) return;
  if (e.firstHitAt < 0) e.firstHitAt = state.time;
  if (procs) {
    const hit = run.directHit(e.uid, dmg);
    dmg = hit.damage;
    if (hit.burn) {
      statusAccent(e, "fireFx");
      e.burnTime = 3;
      e.burnDamage = 4;
    }
    if (hit.slow) {
      statusAccent(e, "frostFx");
      e.slowTime = 2;
      e.slow = Math.min(
        hit.slow,
        (e.slow || 0) +
          0.025 * (run.team.some((m) => m.role === "heavy") ? 1.5 : 1),
      );
    }
    if (hit.chain) secondaryDamage(e, dmg * 0.35, 4, hit.chain, "#8edfff");
    if (hit.explode)
      secondaryDamage(
        e,
        dmg * 0.45,
        run.level("explosive_round") === 2 ? 2.4 : 2,
        4,
        "#ffc489",
      );
    if (run.armor?.kind === "molten" && run.blastCD <= 0) {
      run.blastCD = 0.6;
      secondaryDamage(e, dmg * 0.3, 1.8, 3, "#ffb679");
    }
  }
  telemetry.damageDealt += Math.min(e.hp, dmg);
  e.hp -= dmg;
  sprites.trigger(e.group, "hit");
  e.stun = 0.11;
  e.flash = 0.09;
  createDamageSprite(
    Math.max(1, Math.round(dmg)),
    heavy ? "#ffc17b" : "#e9ffff",
    e.x,
    e.z,
    2.15 * e.group.scale.x,
  );
  burst3D(e.x, 1.05, e.z, heavy ? "#ffd17e" : "#a3f8ed", heavy ? 10 : 4);
  audio.impact(heavy);
  state.lastHit = state.time;
  state.combo = Math.min(99, state.combo + 1);
  if (e.hp <= 0) {
    telemetry.killed++;
    telemetry.killSeconds += state.time - e.spawnedAt;
    telemetry.engagementSeconds += state.time - e.firstHitAt;
    e.dead = 0.48;
    gridDirty = true;
    nativeFlash(e.x, e.z, "enemy_impact", 2);
    e.group.userData.dead = true;
    sprites.trigger(e.group, "down");
    state.kills++;
    state.hp = Math.min(run.maxHp, state.hp + run.onKill());
    state.score += e.score;
    if (e.bounty) {
      state.score += 300;
      spawnCrate("plasma", e.x, e.z);
      announce("精英悬赏完成", "积分 +300 · 高级补给投放");
    }
    addHeat(e.type === "elite" ? 3 : 1);
    state.combo++;
    audio.impact(e.type === "elite" || e.type === "heavy");
    burst3D(
      e.x,
      1,
      e.z,
      e.type === "elite" ? "#ff7059" : "#f4a46c",
      e.type === "elite" ? 22 : 12,
    );
    if (state.crates.length < 2 && Math.random() < 0.008 && e.type !== "grunt")
      spawnCrate(
        ["machine", "shotgun", "plasma", "laser"][
          Math.floor(Math.random() * 4)
        ],
        e.x,
        e.z - 2,
      );
  }
}
function secondaryDamage(origin, damage, radius, limit, color) {
  let hits = 0;
  for (const target of queryEnemies(
    origin.x,
    origin.z,
    origin.x,
    origin.z,
    radius,
  )) {
    if (
      target !== origin &&
      !target.dead &&
      Math.hypot(target.x - origin.x, target.z - origin.z) < radius
    ) {
      damageEnemy(target, damage, false, false);
      energyLink(origin.x, origin.z, target.x, target.z, color);
      if (++hits >= limit) break;
    }
  }
}
function damageBoss(dmg, procs = true) {
  const b = state.boss;
  if (!b || b.dead) return;
  if (b.shield > 0) {
    if (state.time - (b.lastShieldHit || -1) > 0.18) {
      b.lastShieldHit = state.time;
      createDamageSprite("护盾", "#9aeaff", b.x, b.z, 4.2);
      burst3D(b.x, 3, b.z, "#8be7ff", 4);
    }
    return;
  }
  if (procs) {
    const hit = run.directHit(b, dmg);
    dmg = hit.damage;
    if (hit.slow) {
      b.slowTime = 2;
      b.slow = Math.min(0.08, hit.slow);
    }
    if (hit.burn) {
      b.burnTime = 3;
      b.burnDamage = 4;
    }
    if (hit.chain) secondaryDamage(b, dmg * 0.35, 5, hit.chain, "#9ce2ff");
    if (hit.explode) secondaryDamage(b, dmg * 0.45, 2.4, 4, "#ffc489");
  }
  const boundary = b.armorPhase < 2 ? (b.maxHp * (2 - b.armorPhase)) / 3 : 0;
  const previousHp = b.hp;
  b.hp = Math.max(boundary, b.hp - dmg);
  b.flash = 0.1;
  if (
    !["windup", "attack", "recover"].includes(
      b.group.userData.actor.machine.state,
    )
  )
    sprites.trigger(b.group, "hit");
  createDamageSprite(Math.round(previousHp - b.hp), "#ffd7a1", b.x, b.z, 4);
  burst3D(b.x, 2.3, b.z, "#ff9a73", 5);
  audio.impact(true);
  state.shake = Math.max(state.shake, 0.06);
  if (b.hp <= boundary && boundary > 0) {
    b.armorPhase++;
    b.shield = 2.2;
    b.attack = Math.min(b.attack, 0.65);
    showCombo("巨像护盾重组 · 准备躲避齐射");
    audio.bossAlert();
  }
  if (b.hp <= 0) {
    b.dead = true;
    sprites.trigger(b.group, "down");
    b.death = 1.35;
    b.shieldMesh.visible = false;
    state.score += 1400 + Math.floor(state.time * 2);
    if (telemetry.bossFights.length)
      telemetry.bossFights.at(-1).ended = state.time;
    state.kills++;
    state.hp = Math.min(run.maxHp, state.hp + 25);
    audio.explosion();
    announce("巨像核心击破", "高额战斗积分 · 装甲修复");
    burst3D(b.x, 2, b.z, "#ffbd70", 24);
    audio.setBoss(false);
  }
}

function spawnEnemyShot(enemy) {
  sprites.trigger(enemy.group, "attack");
  if (state.enemyShots.length >= 60) return;
  const warning = mesh(
    new THREE.RingGeometry(0.16, 0.27, 24),
    new THREE.MeshBasicMaterial({
      color: "#ff4f59",
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    scene,
    [state.playerX, 0.018, playerZ - 2],
  );
  warning.rotation.x = -Math.PI / 2;
  registerEffect(warning);
  warning.userData.life = enemy.type === "ranged" ? 0.7 : 0.5;
  warning.userData.warning = true;
  const start = { x: enemy.x, z: enemy.z, y: 1.1 };
  state.enemyShots.push({
    x: start.x,
    z: start.z,
    y: start.y,
    vx: (state.playerX - start.x) / Math.max(0.8, (playerZ - start.z) / 11),
    vz: 11,
    life: 6,
    damage: enemy.damage,
    warningAt: state.time + 0.55,
    active: false,
    mesh: null,
  });
}
function buildBoss() {
  const type = "boss",
    group = createSoldier(type);
  group.position.set(0, 0, -30);
  scene.add(group);
  const hp = 2500 * (1 + Math.min(1.4, Math.max(0, state.time - 95) / 250));
  const shieldMaterial = new THREE.MeshBasicMaterial({
    color: "#70dbff",
    wireframe: true,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const shieldMesh = mesh(
    new THREE.IcosahedronGeometry(1, 1),
    shieldMaterial,
    group,
    [0, 1.15, 0],
    [1, 1.2, 0.8],
  );
  group.userData.shieldMaterial = shieldMaterial;
  state.boss = {
    shield: 1.8,
    shieldMesh,
    armorPhase: 0,
    group,
    x: 0,
    z: -30,
    hp,
    maxHp: hp,
    move: 0,
    attack: 2.2,
    warning: 0,
    phase: "idle",
    flash: 0,
    dead: false,
  };
  state.bossHud = true;
  $("#bossHud").classList.remove("hidden");
  $("#bossLabel").textContent = "灾厄巨像";
  telemetry.bossFights.push({ started: state.time, maxHp: hp, ended: null });
  audio.setBoss(true);
  audio.bossAlert();
  state.shake = 0.32;
  vibrate([40, 30, 70]);
  burst3D(0, 1.8, -30, "#ff604f", 35);
}
function spawnRoundEnemy() {
  spawnHordePack();
}
function spawnHordePack(forcedPattern = null, forcedCount = null, z = -48) {
  const stage = hordeStage(state.time),
    pattern =
      forcedPattern ||
      ["line", "armor", "flank", "stagger"][state.packSequence++ % 4];
  const count = Math.min(
    forcedCount || stage.batch,
    RULES.enemyLimit - state.threats.length,
  );
  const gap = Math.sin(state.packSequence * 0.83) * 3.5;
  for (let i = 0; i < count; i++) {
    let x = -5.3 + (i % 10) * 1.15;
    if (pattern === "flank") x = (i % 2 ? 1 : -1) * (4.2 + (i % 3) * 0.35);
    if (pattern === "stagger")
      x = clamp(x + Math.sin(i * 2.1) * 0.3, -5.4, 5.4);
    if (Math.abs(x - gap) < 0.6) x += x < gap ? -0.65 : 0.65;
    const e = spawnEnemy(
      enemyKind(state.time, i, pattern),
      clamp(x, -5.5, 5.5),
      z - Math.floor(i / 10) * 2.1 - rand(0, 0.65),
    );
    if (e) {
      e.pack = state.packSequence;
      e.flank = pattern === "flank";
    }
  }
  return count;
}
function spawnInterval(t) {
  const stage = hordeStage(t);
  return (stage.batch / stage.rate) * (stage.relief ? 2.8 : 1);
}
function addHeat(amount) {
  state.heat = (state.heat + amount) % 10;
}

function updateDifficulty(dt) {
  const t = state.time,
    interval = spawnInterval(t) * (state.boss ? 0.85 : 1),
    wave = Math.floor(t / 24) + 1;
  if (state.wave !== wave) {
    state.wave = wave;
    showCombo("第 " + wave + " 波 · 敌潮再临");
  }
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    const stage = hordeStage(t),
      occupancy = state.threats.filter((e) => !e.dead).length;
    state.spawnTimer = interval * (occupancy < stage.target * 0.65 ? 0.72 : 1);
    if (occupancy < stage.target * 1.08) spawnHordePack();
    else state.spawnTimer = Math.min(state.spawnTimer, 0.4);
  }
  if (t % 38 >= 33 && (t - dt) % 38 < 33) {
    showCombo("短暂喘息 · 搜寻补给");
    if (state.hp < 95)
      spawnCrate("medkit", state.playerX > 0 ? -2.4 : 2.4, -18);
  }
  state.gateTimer -= dt;
  if (state.gateTimer <= 0 && state.gates.length < 4) spawnGateEvent();
  state.crateTimer -= dt;
  if (state.crateTimer <= 0 && state.crates.length < 2) {
    const choices = ["machine", "shotgun", "plasma", "laser"],
      type = choices[t < 30 ? 0 : t < 55 ? 1 : t < 90 ? 2 : 3];
    spawnCrate(
      type,
      (Math.floor(Math.max(0, t - 20) / 35) % 2 ? -1 : 1) * 2.75,
    );
    state.crateTimer = 22;
  }
  if (t >= state.nextBoss && !state.boss) {
    buildBoss();
    state.nextBoss = RULES.bosses.find((n) => n > t + 1) || state.nextBoss + 90;
  }
}

function moveThreats(dt) {
  for (let i = state.threats.length - 1; i >= 0; i--) {
    const e = state.threats[i];
    if (e.dead) {
      sprites.tick(e.group, dt);
      e.dead -= dt;
      e.group.rotation.z += dt * 1.5;
      e.group.position.y = Math.max(-0.35, e.group.position.y - dt * 0.7);
      e.group.scale.multiplyScalar(Math.max(0.94, 1 - dt * 0.58));
      if (e.dead <= 0) {
        retireEnemy(e);
        state.threats.splice(i, 1);
      }
      continue;
    }
    if (e.z > -18 || Math.floor(state.time * 15) !== e.visualStamp) {
      sprites.tick(e.group, Math.min(0.08, dt + (e.visualDebt || 0)));
      e.visualDebt = 0;
      e.visualStamp = Math.floor(state.time * 15);
    } else e.visualDebt = (e.visualDebt || 0) + dt;
    e.shotgunCD = Math.max(0, e.shotgunCD - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.cooldown = Math.max(0, (e.cooldown || 0) - dt);
    if (e.burnTime > 0) {
      e.burnTime -= dt;
      e.burnTick = (e.burnTick || 0) + dt;
      if (e.burnTick >= 0.5) {
        e.burnTick -= 0.5;
        damageEnemy(e, e.burnDamage * 0.5, false, false);
        if (e.dead) continue;
      }
    }
    e.slowTime = Math.max(0, (e.slowTime || 0) - dt);
    const moveDt =
      dt * (e.slowTime > 0 ? 1 - (e.slow || 0) : 1) * (e.stun > 0 ? 0.15 : 1);
    e.flash = Math.max(0, (e.flash || 0) - dt);
    e.phase += dt;
    const dz = playerZ - e.z,
      dist = Math.abs(dz);
    if (e.type === "runner" || e.type === "charger") {
      e.dashCooldown = (e.dashCooldown ?? 1.7) - dt;
      if (e.dash > 0) {
        e.dash -= dt;
        e.x = mix(e.x, e.targetX, Math.min(1, dt * 3));
        e.z += e.speed * 1.8 * moveDt;
      } else if (e.windup > 0) {
        e.windup -= dt;
        e.group.userData.body.scale.y = 0.87;
        if (e.windup <= 0) {
          e.dash = 0.65;
          e.dashCooldown = 2.8;
          e.group.userData.body.scale.y = 1;
        }
      } else {
        e.x = mix(
          e.x,
          e.flank
            ? state.playerX + Math.sign(e.homeX) * 1.8
            : e.homeX * 0.5 + state.playerX * 0.5,
          Math.min(1, dt * 0.28),
        );
        e.z += e.speed * moveDt;
        if (dist < 24 && e.dashCooldown <= 0) {
          e.windup = 0.75;
          e.targetX = clamp(state.playerX, -PLAYER_LIMIT, PLAYER_LIMIT);
          const warning = mesh(
            new THREE.PlaneGeometry(1.5, Math.max(2, dist)),
            basic("#ffbc70", 0.2, false),
            scene,
            [e.targetX, 0.015, (e.z + playerZ) / 2],
          );
          warning.rotation.x = -Math.PI / 2;
          warning.userData.warning = true;
          warning.userData.life = 0.75;
          registerEffect(warning);
        }
      }
    } else if (e.type === "ranged") {
      e.x = mix(e.x, state.playerX + Math.sin(e.phase) * 1.4, dt * 0.28);
      if (dist > 16) e.z += e.speed * moveDt;
      e.fire -= dt;
      if (e.fire <= 0 && dist < 34) {
        e.fire = rand(3.2, 4.1);
        spawnEnemyShot(e);
      }
    } else {
      e.x = mix(
        e.x,
        e.homeX * 0.72 + state.playerX * 0.28 + Math.sin(e.phase * 1.5) * 0.25,
        dt * (e.type === "heavy" ? 0.18 : 0.45),
      );
      e.z += e.speed * moveDt;
    }
    if (e.type === "elite") {
      e.fire -= dt;
      if (e.fire <= 0 && dist < 30) {
        e.fire = 4.5;
        spawnEnemyShot(e);
      }
    }
    if (e.stun > 0) e.z -= e.stun * 0.8 * dt;
    e.group.position.set(
      e.x,
      -0.1 + Math.max(0, Math.sin(e.phase * 8) * 0.035),
      e.z,
    );
    e.group.userData.legL.rotation.x = Math.sin(e.phase * 8) * 0.45;
    e.group.userData.legR.rotation.x = -Math.sin(e.phase * 8) * 0.45;
    e.group.userData.armL.rotation.x = -0.22 + Math.sin(e.phase * 8) * 0.28;
    e.group.userData.armR.rotation.x = -0.38 - Math.sin(e.phase * 8) * 0.25;
    e.group.userData.body.rotation.z = Math.sin(e.phase * 4) * 0.025;
    e.group.userData.body.position.z = e.cooldown > 0 ? 0.22 : 0;
    e.shadow.position.set(e.x, -0.08, e.z);
    e.bar.scale.x = Math.max(0.02, e.hp / e.maxHp);
    e.bar.position.x = -(1 - e.hp / e.maxHp) * 0.44;
    e.barGroup.quaternion
      .copy(e.group.quaternion)
      .invert()
      .multiply(camera.quaternion);
    if (e.cooldown <= 0 && dist < 1.05 && Math.abs(e.x - state.playerX) < 0.7) {
      e.cooldown = 0.8;
      sprites.trigger(e.group, "attack");
      hurtPlayer(e.damage, 0.8);
      e.z -= 2.1;
      e.x += Math.sign(e.x - state.playerX || 1) * 0.45;
    }
    for (const member of [...run.team]) {
      if (
        Math.abs(e.z - member.z) < 0.95 &&
        Math.abs(e.x - member.x) < 0.8 &&
        member.invuln <= 0
      ) {
        e.cooldown = 0.24;
        sprites.trigger(e.group, "attack");
        run.hurtMember(member, e.damage);
        e.z -= 0.9;
        burst3D(member.x, 1, member.z, "#ffba98", 8);
      }
    }
    if (e.z > playerZ + 1.8) {
      run.totals.breaches++;
      hurtPlayer(
        e.type === "elite" ? 1 : e.type === "heavy" ? 0.4 : 0.18,
        0.15,
        true,
      );
      showCombo("防线突破 · 装甲受损");
      telemetry.breached++;
      retireEnemy(e);
      state.threats.splice(i, 1);
    }
  }
}
function updateBoss(dt) {
  const b = state.boss;
  if (!b) return;
  const machine = b.group.userData.actor.machine;
  if (b.phase === "warn" && !b.dead) {
    machine.state = "windup";
    machine.elapsed = Math.min(700, machine.elapsed);
  }
  sprites.tick(b.group, dt);
  if (b.phase === "warn" && !b.dead && machine.state !== "windup") {
    machine.state = "windup";
    machine.elapsed = 700;
  }
  if (b.dead) {
    b.death -= dt;
    b.group.rotation.y += dt * 2;
    b.group.scale.multiplyScalar(Math.max(0.95, 1 - dt * 0.2));
    if (b.death <= 0) {
      disposeSoldier(b.group);
      state.boss = null;
      $("#bossHud").classList.add("hidden");
      audio.setBoss(false);
    }
    return;
  }
  b.shield = Math.max(0, b.shield - dt);
  b.shieldMesh.visible = b.shield > 0;
  b.shieldMesh.rotation.y += dt * 0.5;
  b.shieldMesh.material.opacity = 0.18 + Math.sin(b.move * 8) * 0.05;
  $("#bossHud").classList.toggle("shielded", b.shield > 0);
  $("#bossLabel").textContent = b.shield > 0 ? "巨像 · 护盾" : "灾厄巨像";
  b.flash = Math.max(0, b.flash - dt);
  b.group.userData.body.material.color.set(b.flash > 0 ? "#ffc8cb" : "#ffffff");
  b.slowTime = Math.max(0, (b.slowTime || 0) - dt);
  if (b.burnTime > 0) {
    b.burnTime -= dt;
    b.burnTick = (b.burnTick || 0) + dt;
    if (b.burnTick >= 0.5) {
      b.burnTick -= 0.5;
      damageBoss(b.burnDamage * 0.5, false);
    }
  }
  b.move += dt * (b.slowTime > 0 ? 1 - (b.slow || 0) : 1);
  b.x = Math.sin(b.move * 0.45) * 3.25;
  b.z = mix(b.z, -18, Math.min(1, dt * 0.5));
  b.group.position.set(b.x, -0.12 + Math.sin(b.move * 1.6) * 0.04, b.z);
  b.group.rotation.y = 0;
  b.group.userData.legL.rotation.x = Math.sin(b.move * 3) * 0.08;
  b.attack -= dt;
  if (b.attack <= 0 && b.phase === "idle") {
    b.phase = "warn";
    sprites.trigger(b.group, "windup");
    b.skillCycle = (b.skillCycle || 0) + 1;
    b.sweep = b.armorPhase === 2 && b.skillCycle % 2 === 0;
    b.warning = b.armorPhase > 0 ? 1.05 : 0.85;
    b.attack = b.armorPhase === 2 ? 2.85 : 3.2;
    const target = b.sweep
      ? state.playerX > 0
        ? 2.6
        : -2.6
      : clamp(state.playerX, -4.7, 4.7);
    if (b.sweep) showCombo("巨像冲击波 · 转移另一侧");
    else if (b.armorPhase > 0) showCombo("巨像扩散齐射 · 离开预警区域");
    b.targetX = target;
    const warn = mesh(
      new THREE.PlaneGeometry(b.sweep ? 5.2 : b.armorPhase > 0 ? 4.2 : 2.8, 21),
      new THREE.MeshBasicMaterial({
        color: "#ff2846",
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      scene,
      [target, 0.015, (playerZ + b.z) / 2],
    );
    warn.rotation.x = -Math.PI / 2;
    warn.userData.warning = true;
    warn.userData.life = b.warning;
    registerEffect(warn);
    b.warnMesh = warn;
    audio.bossAlert();
    vibrate(22);
  }
  if (b.phase === "warn") {
    b.warning -= dt;
    if (b.warnMesh)
      b.warnMesh.material.opacity = 0.15 + Math.sin(state.time * 35) * 0.12;
    if (b.warning <= 0) {
      b.phase = "idle";
      sprites.trigger(b.group, "attack");
      b.warnMesh?.parent?.remove(b.warnMesh);
      b.warnMesh = null;
      if (b.sweep) spawnBossWave(b);
      else {
        for (
          let i = -(b.armorPhase > 0 ? 2 : 1);
          i <= (b.armorPhase > 0 ? 2 : 1);
          i++
        )
          spawnBossShot(b, i);
        if (b.armorPhase > 0 && b.skillCycle % 3 === 0) {
          spawnHordePack("flank", 18, b.z - 10);
          showCombo("巨像呼援 · 两翼增援接近");
        }
      }
      state.shake = 0.12;
    }
  }
  if (b.z > playerZ - 3.8 && Math.abs(b.x - state.playerX) < 1.4)
    hurtPlayer(24, 1.1);
  $("#bossBar").style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
}
function spawnBossWave(b) {
  if (state.enemyShots.length >= 60) return;
  const wave = hostileVisual(true, true);
  wave.position.set(b.targetX, 0.35, b.z + 1);
  state.enemyShots.push({
    mesh: wave,
    x: b.targetX,
    z: b.z + 1,
    y: 0.35,
    vx: 0,
    vz: 12,
    life: 4,
    damage: 24,
    active: true,
    boss: true,
    wave: true,
    width: 5.2,
  });
}
function spawnBossShot(b, i) {
  if (state.enemyShots.length >= 60) return;
  const x = b.x + i * 0.65,
    z = b.z + 1,
    targetX = clamp(b.targetX + i * (b.sweep ? 0.95 : 0.7), -5.3, 5.3),
    travel = 1.35;
  const meshObj = hostileVisual(false, true);
  meshObj.position.set(x, 1.3, z);
  state.enemyShots.push({
    mesh: meshObj,
    x,
    z,
    y: 1.3,
    vx: (targetX - x) / travel,
    vz: (playerZ - z) / travel,
    life: travel + 0.4,
    damage: 18,
    active: true,
    boss: true,
  });
}

let hostileBatches = null;
function hostileVisual(wave, boss) {
  const o = new THREE.Object3D();
  o.scale.set(
    wave ? 5.2 : boss ? 0.26 : 0.16,
    wave ? 0.32 : boss ? 0.26 : 0.16,
    wave ? 0.55 : boss ? 0.5 : 0.3,
  );
  return o;
}
function syncHostileInstances() {
  if (!hostileBatches) {
    hostileBatches = [G.smallSphere, G.cube].map((g) => {
      const m = new THREE.InstancedMesh(
        g,
        new THREE.MeshBasicMaterial({ color: "#ffffff" }),
        60,
      );
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
  }
  const counts = [0, 0],
    color = new THREE.Color();
  for (const s of state.enemyShots) {
    if (!s.active || !s.mesh) continue;
    const index = s.wave ? 1 : 0,
      m = hostileBatches[index],
      i = counts[index]++;
    s.mesh.updateMatrix();
    m.setMatrixAt(i, s.mesh.matrix);
    color.set(s.boss ? "#ff4877" : "#ffac56");
    m.setColorAt(i, color);
  }
  for (let i = 0; i < 2; i++) {
    const m = hostileBatches[i];
    m.count = counts[i];
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}
function updateShots(dt) {
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    if (!b.active) continue;
    b.prevX = b.x;
    b.prevZ = b.z;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.life -= dt;
    b.group.position.set(b.x, b.y || 1.65, b.z);
    b.group.rotation.y = Math.atan2(b.vx, -b.vz);
    if (processBulletCollisions(b, dt) || b.life <= 0 || b.z < -60)
      releaseBullet(b);
  }
  const beam = state.laserBeam;
  if (beam) {
    beam.life -= dt;
    beam.group.visible = beam.life > 0;
  }
  for (let i = state.enemyShots.length - 1; i >= 0; i--) {
    const s = state.enemyShots[i];
    if (!s.active) {
      if (state.time < s.warningAt) continue;
      s.active = true;
      s.mesh = hostileVisual(false, false);
    }
    const oldX = s.x,
      oldZ = s.z;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    s.mesh.position.set(s.x, s.y, s.z);
    if (!s.wave) s.mesh.rotation.x += dt * 4;
    if (
      segmentHit(
        oldX,
        oldZ,
        s.x,
        s.z,
        state.playerX,
        playerZ,
        0.72 + (s.width || 0) / 2,
        0.65,
      ) !== null
    ) {
      hurtPlayer(s.damage, 0.8, false, !!s.boss);
      burst3D(s.x, 0.8, s.z, "#ff745b", 9);
      scene.remove(s.mesh);
      state.enemyShots.splice(i, 1);
      continue;
    }
    const member = run.team.find(
      (m) =>
        m.invuln <= 0 &&
        segmentHit(
          oldX,
          oldZ,
          s.x,
          s.z,
          m.x,
          m.z,
          0.6 + (s.width || 0) / 2,
          0.65,
        ) !== null,
    );
    if (member) {
      run.hurtMember(member, s.damage, !!s.boss);
      burst3D(member.x, 1, member.z, "#ff9f9c", 6);
      scene.remove(s.mesh);
      state.enemyShots.splice(i, 1);
      continue;
    }
    if (s.life <= 0 || s.z > playerZ + 2) {
      scene.remove(s.mesh);
      state.enemyShots.splice(i, 1);
    }
  }
}
function hurtPlayer(
  amount,
  cooldown = 0.8,
  breach = false,
  bossSource = false,
) {
  if ((!breach && state.invuln > 0) || state.mode !== "playing") return;
  const previousHP = state.hp;
  const feedback =
    !breach || !state.breachFeedback || state.breachFeedback <= 0;
  state.hp = Math.max(0, state.hp - run.absorb(amount, bossSource));
  if (state.hp < previousHP) {
    telemetry.hits++;
    telemetry[breach ? "breachHits" : "directHits"]++;
    telemetry.damageTaken += previousHP - state.hp;
  }
  // A small breach penalty must never shorten contact/shot invulnerability.
  state.invuln = Math.max(state.invuln, breach ? 0 : cooldown);
  if (feedback) {
    sprites.trigger(playerRig, "hit");
    app.classList.remove("hurt");
    void app.offsetWidth;
    app.classList.add("hurt");
    state.shake = Math.max(state.shake, breach ? 0.04 : 0.17);
    if (breach) state.breachFeedback = 0.7;
    audio.impact(!breach);
    if (!breach) vibrate(26);
    burst3D(state.playerX, 0.8, playerZ, "#ff685e", breach ? 3 : 12);
  }
  const reaction = run.onPlayerHurt(state.hp);
  state.hp = Math.min(run.maxHp, state.hp + reaction.heal);
  if (reaction.pulse) {
    for (const e of state.threats)
      if (!e.dead && Math.hypot(e.x - state.playerX, e.z - playerZ) < 6) {
        e.z -= 2;
        e.stun = 0.3;
      }
    burst3D(state.playerX, 1, playerZ, "#87dcff", 18);
  }
  $("#healthBar").style.width = (state.hp / run.maxHp) * 100 + "%";
  $("#healthText").textContent = Math.ceil(state.hp);
  $("#maxHealth").textContent = run.maxHp;
  if (state.hp <= 0) endGame();
}
function maybeArmorDrop(c) {
  if (c.armorRolled || c.grade !== "high") return;
  c.armorRolled = true;
  const kind = run.rollArmor(state.time);
  if (kind) spawnRoadReward("armor", c.x, c.z - 3, kind);
}
function damageSupply(c, damage) {
  if (!c.destructible || c.hp <= 0) return;
  c.hp = Math.max(0, c.hp - damage);
  createDamageSprite(Math.ceil(damage), "#ffe4aa", c.x, c.z, 2);
  if (c.hp === 0) {
    c.destructible = false;
    c.opened = true;
    if (c.group.userData.locked) {
      const l = c.group.userData.locked;
      l.material.map.dispose();
      l.material.dispose();
      l.removeFromParent();
      c.group.userData.locked = null;
    }
    maybeArmorDrop(c);
    announce("运输车已击破", "靠近领取武器补给");
    burst3D(c.x, 1, c.z, "#ffc58d", 16);
  }
}
function updateGatesCrates(dt) {
  for (const g of state.gates) {
    g.z += worldSpeed() * dt;
    g.group.position.z = g.z;
    g.phase += dt;
    g.scan.position.y = 0.6 + ((g.phase * 1.5) % 3.4);
  }
  for (const g of state.gates) {
    if (g.resolved || g.z <= playerZ - 1.1) continue;
    const pair =
      g.pairId === null
        ? [g]
        : state.gates.filter(
            (other) => other.pairId === g.pairId && !other.resolved,
          );
    const chosen = pair.find(
      (other) => Math.abs(state.playerX - other.x) < 1.72,
    );
    for (const other of pair) {
      other.resolved = true;
      other.group.visible = false;
    }
    if (chosen) {
      acquireGate(chosen);
      burst3D(chosen.x, 1.2, playerZ, chosen.reward.color, 24);
    } else showCombo("提前靠向左右强化门");
  }
  for (let i = state.gates.length - 1; i >= 0; i--)
    if (state.gates[i].z > playerZ + 4) {
      disposeGroup(state.gates[i].group);
      state.gates.splice(i, 1);
    }
  for (let i = state.crates.length - 1; i >= 0; i--) {
    const c = state.crates[i];
    if (c.resolved) {
      disposeGroup(c.group);
      state.crates.splice(i, 1);
      continue;
    }
    const previousZ = c.z;
    c.z += worldSpeed() * dt;
    c.group.position.z = c.z;
    c.spin += dt;
    c.group.rotation.y = Math.sin(c.spin) * 0.07;
    c.group.position.y = 0.42 + Math.sin(c.spin * 2) * 0.09;
    if (
      testPickupsEnabled &&
      !c.destructible &&
      previousZ <= playerZ + 1.6 &&
      c.z >= playerZ - 1.7 &&
      Math.abs(c.x - state.playerX) < 1.55 + run.level("magnet") * 0.2
    ) {
      if (c.choiceId)
        for (const other of state.crates)
          if (other !== c && other.choiceId === c.choiceId) {
            other.resolved = true;
            other.group.visible = false;
          }
      if (c.system) {
        collectRoadReward(c);
      } else if (c.type === "medkit") {
        state.hp = Math.min(run.maxHp, state.hp + 25);
        announce("装甲修复 +25", "调整路线 · 继续突围");
        audio.pickup();
      } else if (
        ["rifle", "machine", "shotgun", "plasma", "laser"].indexOf(c.type) <=
        ["rifle", "machine", "shotgun", "plasma", "laser"].indexOf(state.weapon)
      ) {
        const previous = state.stats.damage;
        state.stats.damage = Math.min(2.2, previous * 1.08);
        state.hp = Math.min(run.maxHp, state.hp + 8);
        announce(
          state.stats.damage > previous
            ? "补给校准 · 伤害 +" +
                Math.round((state.stats.damage / previous - 1) * 100) +
                "%"
            : "满阶补给",
          "装甲修复 +8",
        );
        audio.pickup();
        updateWeaponUi();
      } else setWeapon(c.type);
      maybeArmorDrop(c);
      state.score += 100;
      burst3D(c.x, 1, c.z, weaponInfo[c.type].color, 24);
      disposeGroup(c.group);
      state.crates.splice(i, 1);
      continue;
    }
    if (c.z > playerZ + 3) {
      disposeGroup(c.group);
      state.crates.splice(i, 1);
    }
  }
}

function energyLink(x, z, tx, tz, color = "#a7a3ff") {
  if (state.effects.filter((p) => p.userData.warning).length >= 18) return;
  const points = [
    new THREE.Vector3(x, 1.4, z),
    new THREE.Vector3((x + tx) / 2 + 0.16, 1.6, (z + tz) / 2),
    new THREE.Vector3(tx, 1.2, tz),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  );
  line.userData.linkFx = true;
  line.userData.life = 0.23;
  scene.add(line);
  registerEffect(line);
}
function updateTeam(dt) {
  const slots = [
    [-1.25, -0.65],
    [1.25, -0.65],
    [-2.35, -1.8],
    [2.35, -1.8],
  ];
  for (const [id, v] of teamVisuals)
    if (!run.team.some((m) => m.id === id)) {
      sprites.trigger(v, "down");
      v.userData.retire = (v.userData.retire || 0.55) - dt;
      sprites.tick(v, dt);
      v.userData.body.material.opacity = Math.max(0, v.userData.retire / 0.55);
      if (v.userData.retire <= 0) {
        disposeGroup(v);
        teamVisuals.delete(id);
        showCombo("队员阵亡 · 寻找救援");
      }
    }
  run.team.forEach((m, i) => {
    let v = teamVisuals.get(m.id);
    if (v && v.userData.role !== m.role) {
      disposeGroup(v);
      teamVisuals.delete(m.id);
      v = null;
    }
    if (!v) {
      v = createAssetSoldier(m.role === "guard" ? "guardian" : m.role);
      v.userData.role = m.role;
      v.scale.setScalar(1.03);
      v.userData.gun.add(buildGun(ROLES[m.role].weapon));
      scene.add(v);
      teamVisuals.set(m.id, v);
      m.x = clamp(state.playerX + slots[i][0], -4.55, 4.55);
      m.z = playerZ + slots[i][1];
    }
    m.x = mix(
      m.x,
      clamp(state.playerX + slots[i][0], -4.55, 4.55),
      Math.min(1, dt * 8),
    );
    m.z = mix(m.z, playerZ + slots[i][1], Math.min(1, dt * 8));
    v.position.set(m.x, -0.08 + Math.sin(state.time * 10 + i) * 0.015, m.z);
    v.rotation.z = clamp((state.targetX - state.playerX) * -0.03, -0.06, 0.06);
    if (m.invuln > 0) sprites.trigger(v, "hit");
    v.userData.body.material.color.set(m.level === 3 ? "#e7f3ff" : "#ffffff");
    sprites.tick(v, dt);
    m.fire -= dt;
    if (m.fire <= 0) {
      const role = ROLES[m.role],
        target = [...state.threats, ...(state.boss ? [state.boss] : [])]
          .filter((e) => !e.dead && e.z < m.z && Math.abs(e.x - m.x) < 5)
          .sort((a, b) => b.z - a.z)[0];
      if (target) {
        const info = weaponInfo[role.weapon],
          base = role.dps[m.level - 1] * role.interval;
        createShot(role.weapon, target, {
          x: m.x,
          z: m.z,
          rig: v,
          stats: {
            lanes: 1,
            pellets: 1,
            fireRate: 1,
            bulletSpeed: 1,
            damage:
              (base / info.damage) *
              run.teamDamage(m, { ...state.stats, damage: state.gateDamage }),
          },
        });
        sprites.trigger(v, "shoot");
      }
      m.fire = role.interval / run.teamRate(state.stats);
    }
  });
}
function spawnRoadReward(kind, x = rand(-3.5, 3.5), z = -30, value = null) {
  if (state.crates.length >= 3) return null;
  const descriptors = {
    rescue: {
      name: "队员救援",
      value: run.team.length < 4 ? "招募 +1" : "编队整备",
      color: "#83e5ff",
    },
    pet: {
      name: "伙伴信标",
      value: PETS[value]?.name || "宠物支援",
      color: PETS[value]?.color || "#c6acff",
    },
    armor: {
      name: "稀有战甲",
      value: ARMORS[value]?.name || "战甲补给",
      color: ARMORS[value]?.color || "#bfa9ff",
    },
    truck: {
      name: "武装运输车",
      value: (weaponInfo[value] || weaponInfo.machine).name,
      color: "#ffe2a0",
    },
  };
  const descriptor = descriptors[kind];
  if (!descriptor) return null;
  spawnCrate("medkit", x, z);
  const c = state.crates.at(-1);
  c.system = { kind, value };
  const pickup = c.group.children.find((o) => o.isMesh);
  if (pickup) {
    if (kind === "truck") pickup.visible = false;
    else
      pickup.material.map = sprites.staticTexture(
        "props/" +
          {
            rescue: "pickup_team_rescue",
            pet: "pickup_pet_chip",
            armor: "pickup_armor_core",
          }[kind],
      );
  }
  c.group.children
    .filter((o) => o.isSprite)
    .forEach((o) => {
      o.material.map.dispose();
      o.material.dispose();
      c.group.remove(o);
    });
  const label = labelSprite(
    {
      value: descriptor.value,
      name: descriptor.name,
      hint:
        kind === "pet"
          ? "同伴升级 · 可替换"
          : kind === "rescue"
            ? "持续编队 · 阵亡可补员"
            : "左右移动 · 靠近领取",
    },
    descriptor.color,
  );
  label.sprite.position.y = 2.5;
  label.sprite.scale.set(3, 2.05, 1);
  c.group.add(label.sprite);
  if (kind === "truck") {
    c.destructible = true;
    c.hp = 100 + Math.min(120, state.time);
    c.maxHp = c.hp;
    c.grade = "high";
    c.group.userData.locked = label.sprite;
  }
  if (kind === "truck") {
    addBox(c.group, [0, -0.08, 0], [1.7, 0.65, 1.65], "#69859d");
    addBox(c.group, [0, 0.48, -0.46], [1.35, 0.6, 0.7], "#8cc8db");
    for (const a of [-1, 1])
      for (const b of [-1, 1]) {
        const wheel = mesh(
          G.smallSphere,
          mat("truckTyre", "#26374b"),
          c.group,
          [a * 0.8, -0.35, b * 0.55],
          [0.18, 0.32, 0.32],
        );
      }
  }
  const beacon = mesh(
    G.torus,
    mat("reward" + kind, descriptor.color, 0.3, 0.15, 1),
    c.group,
    [0, 1.05, 0],
    [0.75, 0.75, 0.75],
  );
  beacon.rotation.x = Math.PI / 2;
  return c;
}
function collectRoadReward(c) {
  const { kind, value } = c.system;
  if (kind === "rescue") {
    run.recruit(value || "assault");
    announce("队员归队", ROLES[value || "assault"].name + " · 本局持续作战");
  }
  if (kind === "pet") {
    run.equipPet(value);
    announce(
      PETS[value].name + " Lv." + run.pet.level,
      PETS[value].description,
    );
  }
  if (kind === "armor") {
    const activated = run.activateArmor(value);
    if (!activated) {
      announce("战甲重复补给", "战地维修 +15 · 不叠加时长");
      return;
    }
    announce(
      ARMORS[value].name + " · 变身",
      "持续12秒 · " + ARMORS[value].description,
    );
    state.shake = 0.22;
  }
  if (kind === "truck") {
    const order = ["rifle", "machine", "shotgun", "plasma", "laser"];
    if (order.indexOf(value) > order.indexOf(state.weapon)) setWeapon(value);
    else {
      state.stats.damage = Math.min(2.2, state.stats.damage * 1.12);
      announce("运输补给 · 当前武器校准", "保留高阶武器");
    }
    run.addShield(10);
  }
  audio.pickup();
  updateWeaponUi();
  updateSystemsHud();
}
function updatePetArmor(dt, result) {
  if (run.pet) {
    const p = run.pet,
      key =
        "pet/" +
        {
          dragon: "fire_dragon",
          owl: "electromagnetic_owl",
          drone: "shield_drone",
          fairy: "life_sprite",
        }[p.kind] +
        "/" +
        p.level;
    if (!petVisual || petVisual.userData.assetKey !== key) {
      if (petVisual) disposeGroup(petVisual);
      petVisual = sprites.actor(key, camera, 1.08);
      petVisual.userData.assetKey = key;
      scene.add(petVisual);
    }
    petVisual.position.set(
      clamp(state.playerX - 1.25, -5.3, 5.3),
      1.65 + Math.sin(state.time * 3) * 0.1,
      playerZ - 0.3,
    );
    if (result.pet) {
      groundPulse(state.playerX, playerZ, PETS[result.pet].color, 2.2, 0.5);
      nativeFlash(
        state.playerX,
        playerZ,
        {
          dragon: "fire_burst_02",
          owl: "electric_chain_02",
          drone: "shield_pulse_01",
          fairy: "heal_pulse_01",
        }[result.pet],
        3,
      );
      sprites.trigger(petVisual, "cast");
      const t = run.team.find((m) => m.id === run.petTarget);
      burst3D(
        t?.x ?? state.playerX,
        1.4,
        t?.z ?? playerZ,
        PETS[p.kind].color,
        12,
      );
      audio.pet?.(p.kind);
    }
    sprites.tick(petVisual, dt);
  }
  if (run.armor || run.armorFade > 0) {
    const kind = run.armor?.kind || armorVisual?.userData.kind;
    if (kind && (!armorVisual || armorVisual.userData.kind !== kind)) {
      if (armorVisual) disposeGroup(armorVisual);
      armorVisual = models.soldier("armor/" + kind);
      armorVisual.scale.setScalar(1.4);
      armorVisual.userData.kind = kind;
      armorVisual.userData.weaponType = state.weapon;
      armorVisual.userData.gun.add(buildGun(state.weapon));
      sprites.trigger(armorVisual, "activate");
      groundPulse(state.playerX, playerZ, ARMORS[kind].color, 3.5, 0.7);
      scene.add(armorVisual);
    }
    if (armorVisual) {
      if (armorVisual.userData.weaponType !== state.weapon) {
        for (const child of [...armorVisual.userData.gun.children]) {
          armorVisual.userData.gun.remove(child);
          disposeGroup(child);
        }
        armorVisual.userData.flash = null;
        armorVisual.userData.gun.add(buildGun(state.weapon));
        armorVisual.userData.weaponType = state.weapon;
      }
      armorVisual.position.set(state.playerX, -0.06, playerZ + 0.07);
      sprites.tick(armorVisual, dt);
      armorVisual.userData.body.material.opacity = run.armor
        ? 1
        : Math.max(0, run.armorFade / 0.8);
      playerRig.userData.body.visible = false;
    }
  } else {
    if (armorVisual) {
      disposeGroup(armorVisual);
      armorVisual = null;
    }
    playerRig.userData.body.visible = true;
  }
  if (result.armorEnded) {
    groundPulse(state.playerX, playerZ, "#93dbe8", 2, 0.5);
    sprites.trigger(armorVisual, "deactivate");
    announce("战甲解除", "原武器与数字门强化保留");
    updateWeaponUi();
  }
  if (result.armorPulse && armorVisual) {
    sprites.trigger(armorVisual, "attack");
    groundPulse(state.playerX, playerZ, ARMORS[run.armor.kind].color, 1.5, 0.3);
  }
}
function openDraft() {
  if (state.mode !== "playing") return;
  run.rollOffers(Math.random, { weapon: state.weapon });
  state.mode = "draft";
  activeTouches = 0;
  audio.pause();
  $("#draftPanel").classList.remove("hidden");
  renderDraft();
}
function renderDraft() {
  $("#draftTitle").textContent = run.pendingReplacement
    ? "替换一项现有词条"
    : "选择本局战术";
  $("#draftCopy").textContent = run.pendingReplacement
    ? "已有四项词条，选择要替换的一项。"
    : "每局最多四项 · 同词条最高两级";
  const ids = run.pendingReplacement
    ? run.affixes.map((a) => a.id)
    : run.offers;
  $("#draftChoices").innerHTML = ids
    .map((id) => {
      const a = AFFIXES.find((a) => a.id === id),
        level = run.level(id);
      return `<button class="draft-card" data-affix="${id}"><img src="${a.icon}" alt=""><small>${a.category} · ${run.pendingReplacement ? "替换 Lv." + level : level ? "升级 Lv." + level + " → " + (level + 1) : "新战术"}</small><b>${a.name}</b><span>${a.description}</span></button>`;
    })
    .join("");
  $("#draftChoices")
    .querySelectorAll("button")
    .forEach((b) => (b.onclick = () => chooseAffix(b.dataset.affix)));
}
function chooseAffix(id) {
  if (state.mode !== "draft") return false;
  if (run.pendingReplacement) {
    if (!run.affixes.some((a) => a.id === id)) return false;
    run.selectAffix(run.pendingReplacement, id);
  } else {
    if (!run.offers.includes(id)) return false;
    if (run.selectAffix(id) === "replace") {
      renderDraft();
      return false;
    }
  }
  finishDraft();
  return true;
}
function finishDraft() {
  run.pendingReplacement = null;
  run.offers = [];
  $("#draftPanel").classList.add("hidden");
  state.mode = "playing";
  lastFrame = performance.now();
  updateWeaponUi();
  audio.resume().catch(() => {});
  if (document.hidden) pauseRun();
}
function updateRunSystems(dt) {
  run.playerX = state.playerX;
  const owlRange = run.pet?.kind === "owl" && run.pet.level === 3 ? 36 : 28;
  const near =
    state.threats.some((e) => !e.dead && e.z > -owlRange) || !!state.boss;
  const result = run.tick(dt, { hp: state.hp, enemiesNearby: near });
  state.hp = clamp(state.hp + result.heal, 0, run.maxHp);
  updateTeam(dt);
  updatePetArmor(dt, result);
  if (
    state.time >= run.nextDraft &&
    !state.boss &&
    state.gates.every((g) => g.resolved || g.z < -10)
  ) {
    run.draftIndex++;
    run.nextDraft = RULES.traitTimes[run.draftIndex] ?? state.time + 80;
    openDraft();
    return;
  }
  run.eventTimer -= dt;
  if (
    run.breachRescue > 0 &&
    run.breachRescue < 0.1 &&
    state.crates.length < 3
  ) {
    spawnRoadReward("rescue", state.playerX > 0 ? -2.6 : 2.6, -29, "assault");
    run.breachRescue = 0;
  }
  if (run.eventTimer <= 0 && state.crates.length < 2) {
    const i = run.eventIndex++,
      x = (i % 2 ? 1 : -1) * 2.6,
      n = Math.floor(i / 3);
    run.eventTimer = 25;
    if (i % 3 === 0) {
      const choices = Object.keys(PETS),
        kind = choices[(Math.floor(Math.random() * choices.length) + n) % 4];
      const first = spawnRoadReward("pet", x, -30, kind),
        second = spawnRoadReward(
          "pet",
          -x,
          -30,
          run.pet?.kind || choices[(choices.indexOf(kind) + 1) % 4],
        );
      if (first && second) first.choiceId = second.choiceId = "pet-" + i;
      run.event = "伙伴信标 · 二选一";
    } else if (i % 3 === 1) {
      spawnRoadReward(
        "truck",
        x,
        -31,
        ["machine", "shotgun", "plasma", "laser"][Math.min(3, n)],
      );
      run.event = "击破武装运输车";
    } else {
      spawnEnemy("elite", x, -33);
      const e = state.threats.at(-1);
      if (e) {
        e.bounty = true;
      }
      spawnRoadReward("rescue", -x, -32, "assault");
      run.event = "悬赏精英 · 队员救援";
    }
    showCombo(run.event);
  }
}
function updateSystemsHud() {
  $("#teamStatus").innerHTML =
    `<span>编队 ${run.team.length + 1}/5</span>` +
    run.team
      .map(
        (m) =>
          `<div class="crew-chip" style="--crew:${ROLES[m.role].color}"><b>${ROLES[m.role].name} ${"ⅠⅡⅢ"[m.level - 1]}</b><i style="width:${(m.hp / m.maxHp) * 100}%"></i></div>`,
      )
      .join("");
  $("#petStatus").textContent = run.pet
    ? `${PETS[run.pet.kind].name} ${"ⅠⅡⅢ"[run.pet.level - 1]} · ${Math.ceil(run.pet.cooldown)}s`
    : "伙伴 · 等待信标";
  $("#shieldText").textContent =
    run.shield > 0 ? "护盾 " + Math.ceil(run.shield) : "";
  $("#armorStatus").textContent = run.armor
    ? `${ARMORS[run.armor.kind].name} ${run.armor.remaining.toFixed(1)}s`
    : run.armorFade > 0
      ? "战甲解除"
      : "";
  $("#armorStatus").classList.toggle("active", !!run.armor);
  $("#affixStatus").innerHTML = run.affixes.length
    ? run.affixes
        .map((a) => {
          const d = AFFIXES.find((d) => d.id === a.id);
          return `<span class="trait-chip"><img src="${d.icon}" alt="">${d.name} ${a.level}</span>`;
        })
        .join("")
    : "战术词条 · 43秒首次选择";
  $("#runDetail").textContent =
    `救援 ${run.totals.recruits} · 阵亡 ${run.totals.fallen} · 突破防线 ${run.totals.breaches}`;
  $("#collectionText").textContent =
    `出击 ${saved.get("mr-runs", "0")} 次 · 外观徽章 ${saved.get("mr-collection", "[]") === "[]" ? "尚未解锁" : "曙光行者"}（无属性加成）`;
}

function worldSpeed() {
  return 6.3 + Math.min(2.7, state.time * 0.018);
}
function groundPulse(x, z, color, radius = 2, life = 0.32) {
  const ring = mesh(
    G.torus,
    basic(color, 0.7, false),
    scene,
    [x, 0.06, z],
    [0.3, 0.3, 0.3],
  );
  ring.rotation.x = -Math.PI / 2;
  ring.userData = { waveFx: true, life, max: life, radius };
  registerEffect(ring);
}
function statusAccent(e, key, interval = 0.5) {
  if (qualityLevel > 1 && e.z < -14) return;
  if (state.time - (e[key] || -1) < interval) return;
  e[key] = state.time;
  if (key === "frostFx") groundPulse(e.x, e.z, "#82ddff", 0.6, 0.24);
  else if (key === "fireFx") burst3D(e.x, 0.7, e.z, "#ff9a4d", 2);
}
function nativeFlash(x, z, key, size = 1.8) {
  if (state.effects.length >= RULES.particleLimit) return;
  const f = mesh(
    G.plane,
    new THREE.MeshBasicMaterial({
      map: sprites.staticTexture("vfx/" + key),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
    scene,
    [x, 1.25, z],
    [size, size, 1],
  );
  f.quaternion.copy(camera.quaternion);
  f.userData = { native: true, life: 0.22, max: 0.22 };
  registerEffect(f);
}
function updateEffects(dt) {
  for (let i = state.effects.length - 1; i >= 0; i--) {
    const p = state.effects[i];
    p.userData.life -= dt;
    if (p.userData.waveFx) {
      const age = 1 - p.userData.life / p.userData.max,
        r = 0.3 + age * p.userData.radius;
      p.scale.set(r, r, r);
      p.material.opacity = (1 - age) * 0.65;
      if (p.userData.life <= 0) {
        scene.remove(p);
        p.material.dispose();
        state.effects.splice(i, 1);
      }
      continue;
    }
    if (p.userData.native) {
      p.material.opacity = Math.max(0, p.userData.life / p.userData.max);
      p.scale.multiplyScalar(1 + dt);
      if (p.userData.life <= 0) {
        scene.remove(p);
        p.material.dispose();
        state.effects.splice(i, 1);
      }
      continue;
    }
    if (p.userData.warning || p.userData.linkFx) {
      p.material.opacity = Math.max(0, p.userData.life * 1.1);
      if (p.userData.life <= 0) {
        scene.remove(p);
        if (!Object.values(G).includes(p.geometry)) p.geometry.dispose();
        p.material.dispose();
        state.effects.splice(i, 1);
      }
      continue;
    }
    p.userData.v.y -= 9 * dt;
    p.position.addScaledVector(p.userData.v, dt);
    p.material.opacity = Math.max(0, p.userData.life / p.userData.max);
    p.scale.multiplyScalar(0.985);
    if (p.userData.life <= 0) {
      p.visible = false;
      scene.remove(p);
      particlePool.push(p);
      state.effects.splice(i, 1);
    }
  }
  for (let i = state.floating.length - 1; i >= 0; i--) {
    const f = state.floating[i];
    f.life -= dt;
    f.mesh.position.y += dt * 0.85;
    f.mesh.material.opacity = Math.max(0, f.life / f.max);
    f.mesh.scale.multiplyScalar(1 + dt * 0.2);
    if (f.life <= 0) {
      scene.remove(f.mesh);
      f.texture.dispose();
      f.mesh.material.dispose();
      state.floating.splice(i, 1);
    }
  }
}
function updateDecor(dt) {
  worldTime += dt;
  if (roadTexture)
    roadTexture.offset.y =
      (roadTexture.offset.y + (worldSpeed() * dt) / 14) % 1;
  for (const d of worldObjects.decor || []) {
    d.z += worldSpeed() * dt;
    if (d.z > 22) d.z -= 118;
    d.root.position.z = d.z;
    const dummy = worldObjects.cityMeshes.dummy;
    dummy.position.set(d.root.position.x, 0, d.z);
    dummy.quaternion.identity();
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    worldObjects.decorBatches[d.batch].setMatrixAt(d.index, dummy.matrix);
  }
  for (const batch of worldObjects.decorBatches || [])
    batch.instanceMatrix.needsUpdate = true;
  const city = worldObjects.cityMeshes;
  if (city) {
    city.dummy.quaternion.identity();
    for (let i = 0; i < worldObjects.skyline.length; i++) {
      const b = worldObjects.skyline[i];
      b.z += worldSpeed() * dt * 0.7;
      if (b.z > 24) b.z -= 139.2;
      city.dummy.position.set(b.x, b.height / 2 - 3.1, b.z);
      city.dummy.scale.set(b.width, b.height + 5.6, 3.9);
      city.dummy.updateMatrix();
      city.buildings.setMatrixAt(i, city.dummy.matrix);
      city.dummy.position.y = b.height * 0.64;
      city.dummy.scale.set(b.width + 0.04, b.height * 0.48, 3.94);
      city.dummy.updateMatrix();
      city.crowns.setMatrixAt(i, city.dummy.matrix);
      for (let w = 0; w < 6; w++) {
        city.dummy.position.set(
          b.x + ((w % 3) - 1) * b.width * 0.26,
          b.height * (0.42 + Math.floor(w / 3) * 0.26),
          b.z + 2,
        );
        city.dummy.scale.set(b.width * 0.17, b.height * 0.12, 0.04);
        city.dummy.updateMatrix();
        city.windows.setMatrixAt(i * 6 + w, city.dummy.matrix);
      }
    }
    city.buildings.instanceMatrix.needsUpdate =
      city.crowns.instanceMatrix.needsUpdate =
      city.windows.instanceMatrix.needsUpdate =
        true;
    for (let i = 0; i < 32; i++) {
      city.dummy.position.set(
        i % 2 ? 2.06 : -2.06,
        -0.085,
        20 - Math.floor(i / 2) * 8 + ((worldTime * worldSpeed()) % 8),
      );
      city.dummy.scale.set(0.075, 0.018, 2.6);
      city.dummy.updateMatrix();
      worldObjects.markings.setMatrixAt(i, city.dummy.matrix);
    }
    worldObjects.markings.instanceMatrix.needsUpdate = true;
  }
}
function updateGame(dt) {
  if (state.mode !== "playing") return;
  if (W !== app.clientWidth || H !== app.clientHeight) resize();
  dt = Math.min(0.04, dt);
  state.time += dt;
  if (muzzle) muzzle.visible = state.time < (muzzle.userData.until || 0);
  if (armorVisual?.userData.flash)
    armorVisual.userData.flash.visible =
      state.time < (armorVisual.userData.flash.userData.until || 0);
  state.overdrive = Math.max(0, state.overdrive - dt);
  worldTime += dt;
  state.invuln = Math.max(0, state.invuln - dt);
  state.breachFeedback = Math.max(0, (state.breachFeedback || 0) - dt);
  state.shootTimer -= dt;
  state.playerX = mix(state.playerX, state.targetX, Math.min(1, dt * 10));
  playerRig.position.x = state.playerX;
  playerRig.position.y = -0.1 + Math.sin(state.time * 8) * 0.018;
  const moving = Math.abs(state.playerX - state.targetX) > 0.08;
  const aim = aimTarget();
  playerRig.userData.aim = clamp(
    -Math.atan2(aim.x - state.playerX, playerZ - aim.z),
    -0.48,
    0.48,
  );
  state.recoil = Math.max(0, state.recoil - dt * 9);
  playerRig.rotation.z = mix(
    playerRig.rotation.z,
    clamp((state.targetX - state.playerX) * -0.09, -0.12, 0.12),
    dt * 4,
  );
  if (state.invuln > 0)
    playerRig.visible = Math.floor(state.invuln * 16) % 2 === 0;
  else playerRig.visible = true;
  playerShadow.position.x = state.playerX;
  camera.position.x = mix(camera.position.x, state.playerX * 0.17, dt * 1.8);
  camera.lookAt(state.playerX * 0.08, 0.8, -14);
  state.shootTimer <= 0 && fireWeapon();
  updateRunSystems(dt);
  if (state.mode !== "playing") return;
  sprites.tick(playerRig, dt);
  updateDifficulty(dt);
  moveThreats(dt);
  gridDirty = true;
  if (state.mode !== "playing") return;
  updateBoss(dt);
  updateShots(dt);
  if (state.mode !== "playing") return;
  updateGatesCrates(dt);
  updateEffects(dt);
  updateDecor(dt);
  state.score = Math.max(0, state.score + dt * 1.15);
  state.hp = clamp(state.hp, 0, run.maxHp);
  telemetry.peakAlive = Math.max(
    telemetry.peakAlive,
    state.threats.filter((e) => !e.dead).length,
  );
  if (state.time - state.lastHud > 0.1) {
    state.lastHud = state.time;
    updateHud();
  }
  if (state.hp <= 0 && state.mode === "playing") endGame();
}
function updateHud() {
  updateSystemsHud();
  app.classList.toggle("overdrive", state.overdrive > 0);
  $("#overdriveFill").style.width =
    (state.overdrive > 0 ? state.overdrive / 6 : state.heat / 10) * 100 + "%";
  $("#overdriveLabel").textContent =
    state.overdrive > 0
      ? "火力过载 · " + state.overdrive.toFixed(1) + " 秒"
      : "击杀充能 · " + state.heat + " / 10";
  const frontline = state.threats.reduce((n, e) => n + !e.dead, 0);
  $("#waveLabel").textContent =
    (state.boss
      ? "首领战 · 躲开预警"
      : hordeStage(state.time).relief
        ? "喘息 · 搜寻补给"
        : "第 " + state.wave + " 波") +
    " · 前线 " +
    frontline;
  const mins = String(Math.floor(state.time / 60)).padStart(2, "0"),
    secs = String(Math.floor(state.time % 60)).padStart(2, "0");
  $("#clock").textContent = `${mins}:${secs}`;
  $("#score").textContent = String(Math.floor(state.score)).padStart(4, "0");
  $("#healthBar").style.width = (state.hp / run.maxHp) * 100 + "%";
  $("#healthText").textContent = Math.ceil(state.hp);
  $("#maxHealth").textContent = run.maxHp;
  let label =
    state.time < 15
      ? "曙光前线 · 初始接触"
      : state.time < 40
        ? "废城外环 · 敌潮增援"
        : state.time < 70
          ? "破碎公路 · 重装来袭"
          : state.boss
            ? "巨像交战 · 高危警报"
            : "深区突围 · 怪潮狂袭";
  $("#stage").textContent = label;
  if (state.time > 5) $("#touchHint").classList.add("hidden");
  $("#best").textContent = state.best;
}
function updateWeaponUi() {
  const info = weaponInfo[state.weapon],
    stats = combatStats(),
    total = (state.weapon === "shotgun" ? info.count : 1) + stats.pellets - 1;
  $("#weaponName").textContent = info.name;
  $("#weaponMeta").textContent =
    `弹道 ${stats.lanes} · 齐射 ${total} · 伤害 ×${stats.damage.toFixed(1)}`;
  $("#weaponIcon").textContent = info.icon;
  $("#weaponIcon").style.color = info.color;
  $("#weaponRank").textContent = {
    rifle: "制式",
    machine: "重装",
    shotgun: "近战",
    plasma: "实验",
    laser: "原型",
  }[state.weapon];
  $("#buildStats").innerHTML = [
    ["弹道", stats.lanes],
    ["每次齐射", total],
    ["射速", "×" + stats.fireRate.toFixed(2)],
    ["弹速", "×" + stats.bulletSpeed.toFixed(2)],
    ["伤害", "×" + stats.damage.toFixed(2)],
  ]
    .map(
      ([label, value]) => `<div><small>${label}</small><b>${value}</b></div>`,
    )
    .join("");
}

let testFrozen = false,
  testPickupsEnabled = true,
  dragOriginX = 0,
  dragPlayerX = 0;
let gateSerial = 0;
let toastTimer = 0,
  comboTimer = 0;
function announce(title, sub = "") {
  const el = $("#upgradeToast");
  el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ""}`;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}
function showCombo(text) {
  const el = $("#comboToast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => el.classList.remove("show"), 950);
}
function endGame() {
  if (state.mode !== "playing") return;
  state.mode = "ended";
  sprites.trigger(playerRig, "down");
  burst3D(state.playerX, 1.1, playerZ, "#b3e9ff", 28);
  playerRig.rotation.z = 0;
  const runs = +saved.get("mr-runs", "0") + 1;
  saved.set("mr-runs", runs);
  let collection = [];
  try {
    const value = JSON.parse(saved.get("mr-collection", "[]"));
    if (Array.isArray(value)) collection = value;
  } catch {}
  if (state.time >= 95 && !collection.includes("曙光行者"))
    collection.push("曙光行者");
  saved.set("mr-collection", JSON.stringify(collection));
  audio.pause();
  state.best = Math.max(state.best, Math.floor(state.score));
  saved.set("mr2-best", state.best);
  $("#endTime").textContent =
    `${String(Math.floor(state.time / 60)).padStart(2, "0")}:${String(Math.floor(state.time % 60)).padStart(2, "0")}`;
  $("#endKills").textContent = state.kills;
  $("#endScore").textContent = Math.floor(state.score);
  $("#endBest").textContent = state.best;
  $("#endTitle").textContent = state.time < 15 ? "战斗结束" : "突围报告";
  $("#hud").classList.add("hidden");
  $("#endPanel").classList.remove("hidden");
}
function clearDynamic() {
  for (const v of teamVisuals.values()) {
    disposeGroup(v);
    v.userData.body?.material.dispose();
  }
  teamVisuals.clear();
  if (petVisual) {
    disposeGroup(petVisual);
    petVisual = null;
  }
  if (armorVisual) {
    disposeGroup(armorVisual);
    armorVisual = null;
  }
  run.reset();
  $("#draftPanel")?.classList.add("hidden");
  for (const e of state.threats) retireEnemy(e);
  for (const g of state.gates) disposeGroup(g.group);
  for (const c of state.crates) disposeGroup(c.group);
  for (const s of state.enemyShots) if (s.mesh) scene.remove(s.mesh);
  for (const p of state.effects) {
    scene.remove(p);
    if (p.userData.v) {
      p.visible = false;
      particlePool.push(p);
    } else {
      if (p.geometry && !Object.values(G).includes(p.geometry))
        p.geometry.dispose();
      p.material?.dispose();
    }
  }
  for (const f of state.floating) {
    scene.remove(f.mesh);
    f.texture.dispose();
    f.mesh.material.dispose();
  }
  state.threats.length =
    state.gates.length =
    state.crates.length =
    state.enemyShots.length =
    state.effects.length =
    state.floating.length =
      0;
  for (const b of state.bullets) releaseBullet(b);
  if (state.boss) {
    disposeSoldier(state.boss.group);
    state.boss = null;
  }
  if (state.laserBeam) {
    const geometries = new Set(),
      materials = new Set();
    state.laserBeam.group.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    scene.remove(state.laserBeam.group);
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    state.laserBeam = null;
  }
  $("#bossHud").classList.add("hidden");
  audio.setBoss(false);
}
function resetRun() {
  testPickupsEnabled = true;
  clearDynamic();
  app.classList.remove("overdrive", "hurt");
  clearTimeout(toastTimer);
  clearTimeout(comboTimer);
  $("#upgradeToast").classList.remove("show");
  $("#comboToast").classList.remove("show");
  state.packSequence = 0;
  Object.assign(telemetry, {
    spawned: 0,
    killed: 0,
    breached: 0,
    hits: 0,
    damageTaken: 0,
    damageDealt: 0,
    killSeconds: 0,
    engagementSeconds: 0,
    breachHits: 0,
    directHits: 0,
    peakAlive: 0,
    peakVisible: 0,
    collisionTests: 0,
    bossFights: [],
    stages: [],
    realSeconds: 0,
  });
  state.time = 0;
  state.score = 0;
  state.kills = 0;
  state.hp = 100;
  state.playerX = state.targetX = 0;
  state.invuln = 0;
  state.breachFeedback = 0;
  state.shootTimer = 0.1;
  state.spawnTimer = 0.7;
  state.gateTimer = 7;
  state.crateTimer = 17;
  state.nextBoss = 95;
  state.damageBonus = 0;
  state.combo = 0;
  state.lastHit = 0;
  state.shake = 0;
  state.recoil = 0;
  state.heat = 0;
  state.overdrive = 0;
  state.gateSequence = 0;
  state.wave = 1;
  state.lastHud = -1;
  state.gateDamage = 1;
  state.stats = {
    lanes: 1,
    pellets: 1,
    fireRate: 1,
    bulletSpeed: 1,
    damage: 1,
  };
  playerRig.position.set(0, -0.1, playerZ);
  playerRig.rotation.set(0, 0, 0);
  camera.position.x = 0;
  camera.lookAt(0, 0.8, -14);
  playerRig.visible = true;
  playerRig.userData.body.visible = true;
  playerRig.userData.body.material.opacity = 1;
  playerRig.userData.actor.machine.reset("run");
  setWeapon("rifle", true);
  updateWeaponUi();
  updateHud();
}
async function startRun() {
  resetRun();
  state.mode = "playing";
  $("#menu").classList.add("hidden");
  $("#pausePanel").classList.add("hidden");
  $("#endPanel").classList.add("hidden");
  $("#settingsPanel").classList.add("hidden");
  $("#hud").classList.remove("hidden");
  $("#touchHint").classList.remove("hidden");
  try {
    await audio.start();
  } catch {
    showCombo("音频暂不可用 · 可继续游戏");
  }
  lastFrame = performance.now();
}
async function pauseRun() {
  if (state.mode === "playing") {
    state.mode = "paused";
    $("#pausePanel").classList.remove("hidden");
    await audio.pause();
  } else if (state.mode === "paused") {
    state.mode = "playing";
    $("#pausePanel").classList.add("hidden");
    await audio.resume();
    lastFrame = performance.now();
  }
}
function setModeMenu() {
  clearDynamic();
  app.classList.remove("overdrive", "hurt");
  state.mode = "menu";
  state.time = 0;
  playerRig.position.x = 0;
  playerRig.visible = true;
  $("#hud").classList.add("hidden");
  $("#pausePanel").classList.add("hidden");
  $("#endPanel").classList.add("hidden");
  $("#settingsPanel").classList.add("hidden");
  $("#menu").classList.remove("hidden");
  audio.pause();
}
function setupUi() {
  $("#start").disabled = false;
  $("#start").removeAttribute("aria-busy");
  $("#start span").textContent = "开始突围";
  const persist = (id, key, otherIds) => {
    const slider = $(id),
      v = +saved.get(key, key === "mr2-music" ? ".55" : ".75") * 100;
    slider.value = v;
    const set = (value) => {
      const n = +value / 100;
      saved.set(key, n);
      if (key === "mr2-music") audio.setMusic(n);
      else audio.setSfx(n);
      const display = Math.round(value) + "%";
      $(key === "mr2-music" ? "#musicValue" : "#sfxValue").textContent =
        display;
      const output = {
        "#menuMusicVolume": "#menuMusicValue",
        "#menuSfxVolume": "#menuSfxValue",
      };
      for (const k of otherIds) {
        $(k).value = value;
        $(output[k]).textContent = display;
      }
    };
    slider.addEventListener("input", (e) => set(e.target.value));
    for (const k of otherIds)
      $(k).addEventListener("input", (e) => set(e.target.value));
    for (const k of otherIds) {
      $(k).value = v;
      const output = {
        "#menuMusicVolume": "#menuMusicValue",
        "#menuSfxVolume": "#menuSfxValue",
      };
      $(output[k]).textContent = Math.round(v) + "%";
    }
    set(v);
  };
  persist("#musicVolume", "mr2-music", ["#menuMusicVolume"]);
  persist("#sfxVolume", "mr2-sfx", ["#menuSfxVolume"]);
  $("#start").addEventListener("click", startRun);
  $("#again").addEventListener("click", startRun);
  $("#restart").addEventListener("click", startRun);
  $("#pause").addEventListener("click", pauseRun);
  $("#resume").addEventListener("click", pauseRun);
  $("#home").addEventListener("click", setModeMenu);
  $("#endHome").addEventListener("click", setModeMenu);
  $("#openSettings").addEventListener("click", () =>
    $("#settingsPanel").classList.remove("hidden"),
  );
  $("#closeSettings").addEventListener("click", () =>
    $("#settingsPanel").classList.add("hidden"),
  );
  $("#best").textContent = state.best;
  $("#skipDraft").onclick = finishDraft;
  $("#haptics").checked = saved.get("mr-haptics", "1") === "1";
  $("#haptics").onchange = (e) =>
    saved.set("mr-haptics", e.target.checked ? "1" : "0");
  updateSystemsHud();
  canvas.addEventListener("pointerdown", (e) => {
    if (state.mode !== "playing") return;
    e.preventDefault();
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch {}
    activeTouches++;
    dragOriginX = e.clientX;
    dragPlayerX = state.targetX;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (state.mode === "playing" && (e.buttons || e.pointerType === "touch")) {
      e.preventDefault();
      movePointer(e);
    }
  });
  canvas.addEventListener(
    "pointerup",
    () => (activeTouches = Math.max(0, activeTouches - 1)),
  );
  canvas.addEventListener("pointercancel", () => (activeTouches = 0));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "playing") pauseRun();
  });
  addEventListener("blur", () => {
    if (state.mode === "playing") pauseRun();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.mode === "playing") pauseRun();
  });
}
function movePointer(e) {
  const r = canvas.getBoundingClientRect();
  state.targetX = clamp(
    dragPlayerX + ((e.clientX - dragOriginX) / r.width) * PLAYER_LIMIT * 2.4,
    -PLAYER_LIMIT,
    PLAYER_LIMIT,
  );
}

function resize() {
  if (!renderer) return;
  W = app.clientWidth;
  H = app.clientHeight;
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(
    Math.min(devicePixelRatio || 1, qualityProfile(qualityLevel).dpr),
  );
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
function frame(now) {
  requestAnimationFrame(frame);
  const elapsedFrame = now - lastFrame,
    dt = Math.min(0.04, Math.max(0, elapsedFrame || 16) / 1000);
  lastFrame = now;
  if (W !== app.clientWidth || H !== app.clientHeight) resize();
  if (state.mode === "playing" && !testFrozen) {
    const elapsed = Math.min(0.5, Math.max(0, elapsedFrame || 16) / 1000);
    telemetry.realSeconds += elapsed;
    const steps = Math.max(1, Math.ceil(elapsed / 0.025));
    for (let i = 0; i < steps && state.mode === "playing"; i++)
      updateGame(elapsed / steps);
  } else if (playerRig) {
    playerRig.position.y = -0.1 + Math.sin(now * 0.0011) * 0.012;
    if (state.mode === "menu") {
      updateDecor(dt * 0.18);
      sprites.tick(playerRig, dt);
    }
    if (state.mode === "ended") {
      sprites.tick(playerRig, dt);
      updateEffects(dt);
    }
  }
  const shake = state.shake,
    baseX = camera.position.x,
    baseY = camera.position.y;
  cameraBaseQ.copy(camera.quaternion);
  if (shake > 0 && state.mode === "playing") {
    camera.position.x += rand(-shake, shake);
    camera.position.y += rand(-shake * 0.45, shake * 0.45);
    state.shake = Math.max(0, shake - dt * 0.65);
  }
  if (state.mode === "playing") {
    const aim = aimTarget(),
      p = new THREE.Vector3(aim.x, 1.3, aim.z).project(camera);
    $("#reticle").style.transform =
      `translate(${((p.x + 1) * W) / 2}px,${((1 - p.y) * H) / 2}px)`;
  }
  syncBulletInstances();
  syncSparks();
  syncHostileInstances();
  syncWarnings();
  syncEnemyOverlays();
  models.sync(state.threats, state.boss, state.time);
  renderer.render(scene, camera);
  camera.position.x = baseX;
  camera.position.y = baseY;
  camera.quaternion.copy(cameraBaseQ);
  if (now - fpsT > 2500) {
    const fps = (frameCount * 1000) / (now - fpsT);
    if (fps < 39) {
      lowFps++;
      if (lowFps >= 2 && qualityLevel < 2) {
        qualityLevel++;
        renderer.setPixelRatio(
          Math.min(devicePixelRatio || 1, qualityProfile(qualityLevel).dpr),
        );
        renderer.shadowMap.enabled = qualityProfile(qualityLevel).shadows;
        lowFps = 0;
      }
    } else lowFps = Math.max(0, lowFps - 1);
    fpsT = now;
    frameCount = 0;
  }
  frameCount++;
}
addEventListener("resize", resize, { passive: true });
if ("ResizeObserver" in window) new ResizeObserver(() => resize()).observe(app);
document.addEventListener("contextmenu", (e) => e.preventDefault());
init();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const register = () =>
    navigator.serviceWorker
      .register("./sw.js")
      .catch((e) => console.warn("离线缓存未就绪", e.message));
  if (document.readyState === "complete") register();
  else addEventListener("load", register, { once: true });
}
if (new URLSearchParams(location.search).get("test") === "1")
  window.__MR_TEST__ = {
    silence: () => audio.pause(),
    resumeAudio: () => audio.resume(),
    captureAudio: () => audio.captureStream(),
    systems: () => run.snapshot(),
    modelAudit() {
      const rigs = [
        playerRig,
        ...teamVisuals.values(),
        ...(armorVisual ? [armorVisual] : []),
      ];
      return {
        rigs: rigs.map((r) => ({
          key: r.userData.actor.key,
          bones: r.userData.bones?.length,
          skinned: !!r.userData.body.isSkinnedMesh,
          handBound: r.userData.gun.parent === r.userData.bones?.[9],
          gunChildren: r.userData.gun.children.length,
        })),
        batches: [...models.batches.entries()].map(([type, b]) => ({
          type,
          count: b.mesh.count,
          vertices: b.mesh.geometry.attributes.position.count,
          finite: Array.from(b.motion.array.slice(0, b.mesh.count * 4)).every(
            Number.isFinite,
          ),
        })),
        sceneObjects: (() => {
          let n = 0;
          scene.traverse(() => n++);
          return n;
        })(),
      };
    },
    hordePack: spawnHordePack,
    hordeStage,
    setQuality(level) {
      qualityLevel = clamp(level, 0, 2);
      renderer.setPixelRatio(
        Math.min(devicePixelRatio || 1, qualityProfile(qualityLevel).dpr),
      );
      renderer.shadowMap.enabled = qualityProfile(qualityLevel).shadows;
    },
    renderFrame() {
      syncBulletInstances();
      syncSparks();
      syncHostileInstances();
      syncWarnings();
      syncEnemyOverlays();
      models.sync(state.threats, state.boss, state.time);
      renderer.render(scene, camera);
    },
    hordeReport() {
      camera.updateMatrixWorld();
      const f = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        ),
      );
      const live = state.threats.filter((e) => !e.dead),
        visible = live.filter((e) =>
          f.containsPoint(new THREE.Vector3(e.x, 1, e.z)),
        );
      telemetry.peakVisible = Math.max(telemetry.peakVisible, visible.length);
      return {
        ...telemetry,
        time: state.time,
        alive: live.length,
        visible: visible.length,
        averageKillSeconds: telemetry.killed
          ? telemetry.killSeconds / telemetry.killed
          : 0,
        averageEngagementSeconds: telemetry.killed
          ? telemetry.engagementSeconds / telemetry.killed
          : 0,
        models: models.audit(),
        quality: qualityLevel,
        stats: combatStats(),
        crew: run.team.length,
      };
    },
    recruit: (role) => run.recruit(role),
    promote: (role) => run.promote(role),
    hurtMember: (id, n) =>
      run.hurtMember(
        run.team.find((m) => m.id === id),
        n,
      ),
    equipPet: (kind) => run.equipPet(kind),
    armor: (kind) => run.activateArmor(kind),
    affix: (id, replace) => run.selectAffix(id, replace),
    draft: () => openDraft(),
    choose: chooseAffix,
    roadReward: spawnRoadReward,
    runModel: () => run,
    spriteAudit: () => sprites.audit(),
    getPlayer: () => playerRig,
    spriteTrigger: (state) => sprites.trigger(playerRig, state),
    combatStats,
    formationBounds() {
      return [playerRig, ...teamVisuals.values()].map((rig) => {
        rig.updateMatrixWorld(true);
        const points = [];
        rig.traverse((o) => {
          if (
            !o.isMesh ||
            !o.geometry?.attributes.position ||
            o !== rig.userData.body
          )
            return;
          const a = o.geometry.attributes.position;
          for (let i = 0; i < a.count; i++) {
            const p = new THREE.Vector3()
              .fromBufferAttribute(a, i)
              .applyMatrix4(o.matrixWorld)
              .project(camera);
            points.push({ x: ((p.x + 1) * W) / 2, y: ((1 - p.y) * H) / 2 });
          }
        });
        return {
          minX: Math.min(...points.map((p) => p.x)),
          maxX: Math.max(...points.map((p) => p.x)),
          maxY: Math.max(...points.map((p) => p.y)),
        };
      });
    },
    project(x, y, z) {
      const p = new THREE.Vector3(x, y, z).project(camera);
      return { x: ((p.x + 1) * W) / 2, y: ((1 - p.y) * H) / 2 };
    },
    artStatus: () => ({
      errors: sprites.errors,
      loaded: sprites.audit().ready,
    }),
    roadOffset: () => roadTexture.offset.y,
    updateRunSystems,

    configure(values) {
      for (const key of [
        "spawnTimer",
        "gateTimer",
        "crateTimer",
        "nextBoss",
        "hp",
        "invuln",
        "shootTimer",
        "time",
        "score",
        "gateSequence",
      ])
        if (Number.isFinite(values[key])) state[key] = values[key];
    },
    setTarget(x) {
      state.targetX = clamp(x, -PLAYER_LIMIT, PLAYER_LIMIT);
    },
    supply: () => ({ gates: state.gates, crates: state.crates }),
    interval: spawnInterval,
    laser: () => state.laserBeam,
    blockPickups(value = true) {
      testPickupsEnabled = !value;
    },
    freeze(value = true) {
      testFrozen = value;
    },
    scene: () => scene,
    aim: aimTarget,
    charge: addHeat,
    effects: () => ({
      active: state.effects.length,
      pooled: particlePool.length,
      floating: state.floating.map((f) => ({
        x: f.mesh.position.x,
        z: f.mesh.position.z,
      })),
    }),
    emit: burst3D,
    updateEffects,
    updateGatesCrates,
    processBulletCollisions,
    shots: () => state.bullets.filter((b) => b.active),
    clearDynamic,
    enemyList: () => state.threats,
    boss: () => state.boss,
    hostileShots: () => state.enemyShots,
    start: startRun,
    reset: resetRun,
    update: updateGame,
    step(seconds) {
      let n = Math.ceil(seconds / 0.025);
      for (let i = 0; i < n && state.mode === "playing"; i++)
        updateGame(seconds / n);
      return this.state();
    },
    spawnEnemy,
    spawnGateEvent,
    previewGates(z = -12) {
      spawnGateEvent();
      for (const g of state.gates) {
        g.z = z;
        g.group.position.z = z;
      }
    },
    previewCrate(type = "plasma", z = -16) {
      spawnCrate(type, 0, z);
    },
    spawnCrate,
    setWeapon,
    spawnBoss: buildBoss,
    setTime(t) {
      state.time = t;
      state.nextBoss = t + 999;
    },
    setSpawnTimer(t) {
      state.spawnTimer = t;
    },
    fire: fireWeapon,
    damageEnemy,
    damageBoss,
    hurtPlayer,
    collectReward(reward, x = 0) {
      state.playerX = state.targetX = x;
      playerRig.position.x = x;
      const r = {
        type: "damage",
        amount: 0.2,
        value: "伤害 +20%",
        name: "测试增益",
        color: "#73ffff",
        ...reward,
      };
      buildGate(r, x, playerZ - 1.3);
      updateGatesCrates(0.04);
      return this.state();
    },
    testGateCharge() {
      const r = {
        type: "rate",
        amount: 0.15,
        value: "射速 +15%",
        name: "高速供弹",
        color: "#73ffff",
      };
      buildGate(r, state.playerX, playerZ - 0.5);
      const g = state.gates.at(-1);
      const b = acquireBullet();
      b.x = g.x;
      b.z = g.z;
      b.prevX = b.x;
      b.prevZ = b.z;
      b.lastGateId = -1;
      b.vx = 0;
      b.vz = 0;
      b.group.position.set(b.x, 1.2, b.z);
      processBulletCollisions(b, 0.01);
      return g.charge;
    },
    forceCrate(type) {
      spawnCrate(type, state.playerX, playerZ - 1.2);
      updateGatesCrates(0.04);
      return this.state();
    },
    forcePlayerX(x) {
      state.playerX = state.targetX = clamp(x, -PLAYER_LIMIT, PLAYER_LIMIT);
      playerRig.position.x = state.playerX;
    },
    clearBullets() {
      for (const b of state.bullets) releaseBullet(b);
    },
    metrics() {
      const active = state.bullets.filter((x) => x.active);
      return {
        count: active.length,
        avgSpeed: active.length
          ? active.reduce((a, b) => a + Math.hypot(b.vx, b.vz), 0) /
            active.length
          : 0,
        totalDamage: active.reduce((a, b) => a + b.damage, 0),
        weapon: state.weapon,
        interval:
          weaponInfo[state.weapon].interval / combatStats().fireRate / 1,
        lanes: state.stats.lanes,
        pellets: state.stats.pellets,
        damageMultiplier: state.stats.damage,
        bulletSpeedMultiplier: state.stats.bulletSpeed,
        kinds: [...new Set(active.map((x) => x.kind))],
        gunMeshes: (() => {
          let n = 0;
          weaponRoot?.traverse((o) => {
            if (o.isMesh) n++;
          });
          return n;
        })(),
        playerMeshes: (() => {
          let n = 0;
          playerRig?.traverse((o) => {
            if (o.isMesh) n++;
          });
          return n;
        })(),
        drawCalls: renderer.info.render.calls,
        memory: { ...renderer.info.memory },
        triangles: renderer.info.render.triangles,
        heap: performance.memory
          ? {
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize,
            }
          : null,
        laser: !!state.laserBeam?.group.visible,
      };
    },
    difficulty: [0, 15, 40, 70, 78, 90, 150, 250].map((t) => ({
      time: t,
      interval: spawnInterval(t),
    })),
    state: () => ({
      mode: state.mode,
      time: state.time,
      overdrive: state.overdrive,
      heat: state.heat,
      wave: state.wave,
      hp: state.hp,
      score: state.score,
      kills: state.kills,
      weapon: state.weapon,
      playerX: state.playerX,
      targetX: state.targetX,
      stats: { ...state.stats },
      enemies: state.threats.length,
      gates: state.gates.length,
      crates: state.crates.length,
      boss: !!state.boss,
      bossHp: state.boss?.hp,
      enemyShots: state.enemyShots.length,
      bullets: state.bullets.filter((x) => x.active).length,
      audio: audio.status(),
    }),
    playerProjection() {
      playerRig.updateMatrixWorld(true);
      const f = new THREE.Vector3(0, 1.8, 0)
          .applyMatrix4(playerRig.matrixWorld)
          .project(camera),
        feet = new THREE.Vector3(0, 0, 0)
          .applyMatrix4(playerRig.matrixWorld)
          .project(camera);
      return {
        headY: ((1 - f.y) * H) / 2,
        feetY: ((1 - feet.y) * H) / 2,
        headNdc: f.y,
        feetNdc: feet.y,
      };
    },
    getEnemy() {
      return state.threats[0];
    },
    getGate() {
      return state.gates[0];
    },
    getAudio: () => audio.status(),
  };
