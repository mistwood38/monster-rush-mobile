import * as THREE from "./vendor/three/three.module.min.js";
import { BattleAudio } from "./audio.js";
import { RunSystems } from "./systems.js";
import { RULES, ROLES, PETS, ARMORS, AFFIXES } from "./config/catalog.js";
const run = new RunSystems();
const teamVisuals = new Map();
let petVisual = null, armorVisual = null;
const art = {}, assetErrors = [];
const assetLoader = new THREE.TextureLoader();
for (const [key, path] of Object.entries({soldier:'characters/player_soldier_back',highway:'backgrounds/highway_day',gate:'gates/fire_rate_plus_20'})) {
  art[key] = assetLoader.load('./assets/'+path+'.webp', texture=> {texture.colorSpace=THREE.SRGBColorSpace;},undefined,()=>assetErrors.push(path));
}
function vibrate(pattern){if(saved.get("mr-haptics","1")==="1")try{navigator.vibrate?.(pattern);}catch{}}
function combatStats(){return run.stats(state.stats,state.overdrive>0,state.hp);}


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
      58,
      innerWidth / innerHeight,
      0.1,
      130,
    );
    camera.position.set(0, 14, 23);
    camera.lookAt(0, 1.2, -15);
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
  c.width = 512;
  c.height = 1024;
  const x = c.getContext("2d");
  x.fillStyle = "#29373a";
  x.fillRect(0, 0, 512, 1024);
  let seed = 911;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 15000; i++) {
    const a = random() * 0.16;
    x.fillStyle = `rgba(${random() > 0.52 ? "180,190,174" : "3,12,18"},${a})`;
    const s = 1 + random() * 5;
    x.fillRect(random() * 512, random() * 1024, s, s);
  }
  const grad = x.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, "#536d7b");
  grad.addColorStop(0.5, "#324e63");
  grad.addColorStop(1, "#536d7b");
  x.fillStyle = grad;
  x.fillRect(0, 0, 512, 1024);
  x.fillStyle = "#b2d2ce";
  x.fillRect(10, 0, 5, 1024);
  x.fillRect(497, 0, 5, 1024);
  x.fillStyle = "#e2c58c";
  for (let y = 0; y < 1024; y += 128) {
    x.fillRect(167, y, 5, 68);
    x.fillRect(342, y, 5, 68);
  }
  for (let i = 0; i < 45; i++) {
    x.strokeStyle = `rgba(8,15,16,${random() * 0.22})`;
    x.lineWidth = 1 + random() * 2;
    x.beginPath();
    const xx = random() * 512,
      yy = random() * 1024;
    x.moveTo(xx, yy);
    x.lineTo(xx + random() * 25, yy + random() * 70);
    x.stroke();
  }
  for (let i = 0; i < 3000; i++) {
    x.fillStyle = i % 2 ? "#ffffff07" : "#00000009";
    x.fillRect(random() * 512, random() * 1024, 2, 3);
  }
  for (const xx of [12, 492])
    for (let yy = 0; yy < 1024; yy += 48) {
      x.fillStyle = "#ffca78";
      x.fillRect(xx, yy, 8, 22);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 9);
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
function buildWorld() {
  // Highway image informs the menu and palette; this world road actually scrolls.

  const ground = mesh(
    new THREE.PlaneGeometry(90, 160),
    mat("cityDeck", "#99c9bc", 1),
    scene,
    [0, -0.2, -30],
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  roadTexture = makeRoadTexture();
  roadMaterial = new THREE.MeshStandardMaterial({
    map: roadTexture,
    roughness: 0.94,
    metalness: 0.02,
  });
  const road = mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2, 125),
    roadMaterial,
    scene,
    [0, -0.105, -36],
  );
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  for (const side of [-1, 1]) {
    const shoulder = mesh(
      new THREE.BoxGeometry(0.42, 0.07, 125),
      mat("curb" + side, "#9aaeb3", 0.94),
      scene,
      [side * 6.35, -0.06, -36],
    );
    shoulder.receiveShadow = true;
  }
  const deck = addBox(scene,[0,-.55,-36],[13.8,.7,125],'#bdd4de');
  deck.receiveShadow=true;
  for(const side of [-1,1]) {
    addBox(scene,[side*6.5,.38,-36],[.18,.75,125],'#d5e5e9');
    addBox(scene,[side*6.48,.8,-36],[.22,.12,125],'#6bdbe0');
  }
  const configs = [];
  for (const side of [-1, 1])
    for (let i = 0; i < 12; i++)
      configs.push({
        side,
        z: 10 - i * 10.8 + rand(-1.3, 1.3),
        x: side * (8.4 + rand(0, 5)),
        height: rand(2.5, 9),
        wide: rand(1.7, 4.4),
        depth: rand(2.4, 5.6),
        style: Math.random(),
      });
  const buildings = new THREE.InstancedMesh(
    G.cube,
    mat("buildingInst", "#ffffff", 0.92),
    configs.length,
  );
  buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  scene.add(buildings);
  const caps = new THREE.InstancedMesh(
    G.cube,
    mat("capInst", "#ffffff", 0.72, 0.08),
    configs.length,
  );
  caps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  caps.castShadow = true;
  scene.add(caps);
  const windows = new THREE.InstancedMesh(
    G.cube,
    mat("windowInst", "#ffffff", 0.32, 0.2, 0.8),
    configs.length * 15,
  );
  windows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  windows.castShadow = false;
  scene.add(windows);
  const antennas = new THREE.InstancedMesh(
    G.cylinder,
    mat("antennaInst", "#ffffff", 0.6, 0.45),
    configs.length,
  );
  antennas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(antennas);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < configs.length; i++) {
    const b = { ...configs[i], id: i };
    worldObjects.buildings.push(b);
    const bodyColor =
      b.style < 0.3 ? "#dfa99a" : b.style < 0.6 ? "#8eb8d0" : "#77b9b4";
    buildings.setColorAt(i, new THREE.Color(bodyColor));
    caps.setColorAt(i, new THREE.Color("#c8bba3"));
    for (let w = 0; w < 15; w++) {
      const j = i * 15 + w;
      windows.setColorAt(j, new THREE.Color(w % 3 ? "#68c6cb" : "#ffc18c"));
      b["window" + w] = {
        id: j,
        x: b.x + mix(-b.wide * 0.34, b.wide * 0.34, (w % 5) / 4),
      };
    }
  }
  worldObjects.instances = { buildings, caps, windows, antennas, dummy };
  updateWorldInstances();
  const rocks = new THREE.InstancedMesh(
    G.sphere,
    mat("rockInst", "#ffffff", 0.96),
    14,
  );
  rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);
  for (let i = 0; i < 14; i++) {
    const r = {
      id: i,
      x: (i % 2 ? 1 : -1) * rand(7.2, 30),
      z: rand(-92, 5),
      sx: rand(0.15, 0.62),
      sy: rand(0.12, 0.4),
      sz: rand(0.2, 0.72),
      rx: rand(-1, 1),
      rz: rand(-1, 1),
    };
    rocks.setColorAt(i, new THREE.Color(i % 2 ? "#b49580" : "#8b9c9a"));
    worldObjects.rocks.push(r);
  }
  worldObjects.rockMesh = rocks;
  updateRockInstances();
  const edge = new THREE.InstancedMesh(
    G.cube,
    mat("edgeLight", "#77e9e7", 0.45, 0.1, 0.45),
    44,
  );
  scene.add(edge);
  for (let j = 0; j < 44; j++)
    setInstance(
      edge,
      j,
      [(j % 2 ? 1 : -1) * 6.04, -0.04, 12 - Math.floor(j / 2) * 5.8],
      [0.12, 0.035, 3.5],
    );
  const sunDisc = mesh(
    new THREE.CircleGeometry(3.2, 48),
    basic("#ffcca4"),
    scene,
    [14, 10, -110],
  );
  sunDisc.lookAt(camera.position);
  sunDisc.material.toneMapped = false;
  const ridge = [
      [-100, 8],
      [-82, 13],
      [-68, 10],
      [-54, 17],
      [-47, 14],
      [-35, 20],
      [-24, 16],
      [-13, 11],
      [0, 12],
      [17, 10],
      [28, 16],
      [39, 14],
      [54, 19],
      [64, 13],
      [83, 17],
      [100, 9],
    ],
    points = [];
  for (let j = 0; j < ridge.length - 1; j++) {
    const [x, y] = ridge[j],
      [xx, yy] = ridge[j + 1];
    points.push(
      x,
      -3,
      -113,
      x,
      y,
      -115,
      xx,
      yy,
      -115,
      x,
      -3,
      -113,
      xx,
      yy,
      -115,
      xx,
      -3,
      -113,
    );
  }
  const ridgeGeo = new THREE.BufferGeometry();
  ridgeGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  ridgeGeo.computeVertexNormals();
  const ridgeMaterial = mat("mountains", "#5c7c8e", 1);
  ridgeMaterial.side = THREE.DoubleSide;
  mesh(ridgeGeo, ridgeMaterial, scene);

  const starGeo = new THREE.BufferGeometry(),
    positions = [];
  for (let i = 0; i < 300; i++)
    positions.push(rand(-55, 55), rand(5, 34), rand(-110, 5));
  starGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: "#b9edf1",
        size: 0.055,
        transparent: true,
        opacity: 0.2,
        sizeAttenuation: true,
      }),
    ),
  );
  for (let i = 0; i < 3; i++) {
    const side = i % 2 ? 1 : -1,
      lamp = new THREE.Group();
    lamp.position.set(side * 7.05, 0, 8 - i * 22);
    scene.add(lamp);
    mesh(
      G.cylinder,
      mat("lampMetal", "#65716c", 0.45, 0.7),
      lamp,
      [0, 2.2, 0],
      [1, 4.3, 1],
    );
    mesh(
      G.cube,
      mat("lampArm", "#65716c", 0.4, 0.6),
      lamp,
      [side === 1 ? -0.6 : 0.6, 4.3, 0],
      [1.3, 0.1, 0.12],
    );
    mesh(
      G.cube,
      mat("lampGlass", "#95e2d8", 0.25, 0.1, 1.8),
      lamp,
      [side === 1 ? -1.15 : 1.15, 4.18, 0],
      [0.34, 0.12, 0.4],
    );
    const bulb = new THREE.PointLight("#70dcd4", 7, 11, 2);
    bulb.position.set(side === 1 ? -1.15 : 1.15, 3.9, 0);
    lamp.add(bulb);
    compactGroup(lamp, true);
    worldObjects.lamps.push({ group: lamp, z: lamp.position.z });
  }
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
const enemyTextures={};
function createSoldier(kind='player'){
  if(kind==='player')return createAssetSoldier();
  const root=new THREE.Group(),data={kind,asset:true};
  if(!enemyTextures[kind]){const t=assetLoader.load('./assets/enemies/'+kind+'.svg',undefined,undefined,()=>assetErrors.push(kind));t.colorSpace=THREE.SRGBColorSpace;enemyTextures[kind]=t;}
  const base=enemyTextures[kind];
  const plane=(parent,x,y,w,h,offset,repeat)=>{
    const texture=base.clone();texture.offset.set(...offset);texture.repeat.set(...repeat);
    const material=new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.1,roughness:.85,side:THREE.DoubleSide});
    const part=mesh(new THREE.PlaneGeometry(w,h),material,parent,[x,y,0]);
    part.quaternion.copy(camera.quaternion);return part;
  };
  data.body=plane(root,0,1.47,1.9,1.51,[0,90/280],[1,190/280]);
  for(const [name,sign] of [['legL',-1],['legR',1]]){
    const pivot=new THREE.Group();pivot.position.set(sign*.475,.74,0);root.add(pivot);
    plane(pivot,0,-.36,.95,.72,[sign<0?0:.5,0],[.5,90/280]);data[name]=pivot;
  }
  for(const key of ['head','armL','armR','gun']){data[key]=new THREE.Group();root.add(data[key]);}
  root.scale.setScalar(kind==='boss'?2.6:1);root.userData=data;return root;
}

function buildGun(type) {
  const g = new THREE.Group(),
    metal = mat("gunMetal" + type, "#263b45", 0.34, 0.75),
    shell = mat(
      "gunShell" + type,
      {
        rifle: "#55747a",
        machine: "#55534a",
        shotgun: "#665547",
        plasma: "#414c76",
        laser: "#484b72",
      }[type],
      0.36,
      0.68,
    ),
    glow = mat(
      "gunGlow" + type,
      {
        rifle: "#61e8e6",
        machine: "#ffc574",
        shotgun: "#ff9561",
        plasma: "#ae81ff",
        laser: "#ff76f5",
      }[type],
      0.22,
      0.25,
      1.7,
    ),
    dark = mat("gunDark" + type, "#17232b", 0.45, 0.4);
  const box = (p, s, m = shell) => mesh(armorGeometry(), m, g, p, s);
  const barrel = (x, z, r, len, m = metal) => {
    const b = mesh(new THREE.CylinderGeometry(r * 0.74, r, len, 10), m, g, [
      x,
      0.025,
      z,
    ]);
    b.rotation.x = -Math.PI / 2;
    return b;
  };
  if (type === "rifle") {
    box([0, 0, 0], [0.25, 0.23, 0.64]);
    box([0, -0.14, 0.18], [0.2, 0.18, 0.25], dark);
    box([0, 0.11, 0.02], [0.12, 0.08, 0.28], glow);
    box([0, 0.18, -0.1], [0.24, 0.07, 0.13], metal);
    barrel(0, -0.43, 0.048, 0.55);
    box([0, 0.015, -0.28], [0.3, 0.08, 0.2], dark);
    box([0, -0.07, -0.03], [0.09, 0.19, 0.12], metal);
  }
  if (type === "machine") {
    box([0, 0, 0], [0.39, 0.31, 0.75]);
    box([0, 0.23, -0.04], [0.43, 0.11, 0.26], metal);
    box([0, -0.22, 0.13], [0.3, 0.18, 0.26], dark);
    box([0, 0.13, 0.08], [0.23, 0.07, 0.32], glow);
    for (let i = -1; i <= 1; i++)
      barrel(i * 0.13, -0.59, 0.046, 0.54, i === 0 ? glow : metal);
    for (let z = -0.16; z < 0.18; z += 0.075)
      box([-0.205, 0.01, z], [0.035, 0.1, 0.035], dark);
  }
  if (type === "shotgun") {
    box([0, 0, 0.04], [0.29, 0.25, 0.55]);
    box([0, -0.1, 0.29], [0.19, 0.2, 0.3], dark);
    box([0, 0.11, 0.02], [0.24, 0.09, 0.18], glow);
    for (const x of [-0.09, 0.09]) barrel(x, -0.49, 0.065, 0.6, metal);
    box([0, -0.14, -0.3], [0.35, 0.11, 0.18], shell);
  }
  if (type === "plasma") {
    box([0, 0, 0], [0.43, 0.36, 0.56]);
    box([0, 0.02, -0.4], [0.36, 0.32, 0.46], dark);
    const orb = mesh(
      new THREE.SphereGeometry(0.16, 12, 10),
      glow,
      g,
      [0, 0.06, -0.56],
    );
    const ring = mesh(G.torus, glow, g, [0, 0.04, -0.5]);
    ring.scale.set(0.25, 0.25, 0.4);
    ring.rotation.x = Math.PI / 2;
    barrel(0, -0.82, 0.105, 0.42, glow);
    for (const s of [-1, 1]) {
      box([s * 0.24, 0.02, -0.31], [0.08, 0.11, 0.35], shell);
      box([s * 0.24, 0.02, -0.16], [0.1, 0.08, 0.05], glow);
    }
  }
  if (type === "laser") {
    box([0, 0, 0.06], [0.32, 0.3, 0.73]);
    box([0, 0.04, -0.36], [0.22, 0.22, 0.43], dark);
    box([0, 0.08, 0.1], [0.22, 0.14, 0.34], glow);
    barrel(0, -0.72, 0.06, 0.45, glow);
    for (const s of [-1, 1]) {
      const coil = mesh(G.torus, glow, g, [s * 0.14, 0.02, -0.4]);
      coil.scale.set(0.14, 0.14, 0.3);
      coil.rotation.x = Math.PI / 2;
    }
    box([0, -0.17, 0.25], [0.25, 0.15, 0.23], metal);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  compactGroup(g);
  return g;
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
        new THREE.ConeGeometry(0.09, 0.32, 8),
        mat(
          "muzzle" + type,
          type === "plasma"
            ? "#c29aff"
            : type === "laser"
              ? "#ff8bfb"
              : "#fff0b1",
          0.18,
          0.05,
          2,
        ),
        root,
        [0, 0, -0.91],
        [0.42, 1, 0.65],
      );
    flash.rotation.x = -Math.PI / 2;
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
    interval: 0.3,
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
    damage: 7,
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
    damage: 6.8,
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
function createAssetSoldier() {
  const root=new THREE.Group();
  const material=new THREE.MeshStandardMaterial({map:art.soldier,transparent:true,alphaTest:.09,roughness:.9,side:THREE.DoubleSide,depthWrite:true});
  const body=mesh(new THREE.PlaneGeometry(1.85,2.8),material,root,[0,1.35,0]);
  body.quaternion.copy(camera.quaternion);
  const data={body,asset:true};
  for(const key of ['gun','legL','legR','armL','armR','head']){data[key]=new THREE.Group();root.add(data[key]);}
  data.gun.position.set(.63,1.5,-.25);
  root.userData=data;
  return root;
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
      name: "弹道扩展",
      color: "#64f4ed",
    },
    {
      type: "pellets",
      amount: 2,
      value: "弹丸 +2",
      name: "齐射强化",
      color: "#ffd37b",
    },
  ],
  [
    {
      type: "rate",
      amount: 0.20,
      value: "射速 +20%",
      name: "高速供弹",
      color: "#ffbd65",
    },
    {
      type: "damage",
      amount: 0.3,
      value: "伤害 +30%",
      name: "穿甲弹芯",
      color: "#ff7776",
    },
  ],
  [
    {
      type: "speed",
      amount: 0.25,
      value: "弹速 +25%",
      name: "超导推进",
      color: "#9ccaff",
    },
    {
      type: "lanes",
      amount: 2,
      value: "弹道 +2",
      name: "双轨分流",
      color: "#58f5de",
    },
  ],
  [
    {
      type: "pellets",
      amount: 4,
      value: "弹丸 +4",
      name: "复式弹链",
      color: "#ffd47e",
    },
    {
      type: "rate",
      amount: 0.4,
      value: "射速 +40%",
      name: "过载射击",
      color: "#ff9469",
    },
  ],
  [
    {
      type: "damage",
      amount: 0.5,
      value: "伤害 +50%",
      name: "裂甲弹芯",
      color: "#ff7289",
    },
    {
      type: "speed",
      amount: 0.35,
      value: "弹速 +35%",
      name: "磁轨加速",
      color: "#76d5ff",
    },
  ],
  [
    {
      type: "lanes",
      amount: 3,
      value: "弹道 +3",
      name: "全域覆盖",
      color: "#76fff1",
    },
    {
      type: "pellets",
      amount: 5,
      value: "弹丸 +5",
      name: "重装弹匣",
      color: "#ffc977",
    },
  ],
];
function buildGate(reward, x, z) {
  const limits = {
    lanes: ["lanes", 5],
    pellets: ["pellets", 8],
    rate: ["fireRate", 2.5],
    speed: ["bulletSpeed", 2.2],
    damage: ["damage", 3],
  };
  const limit = limits[reward.type];
  if (limit && state.stats[limit[0]] >= limit[1] - 1e-6) {
    reward = {
      type: "repair",
      amount: 12,
      value: "装甲 +12",
      name: "维修协议",
      color: "#8df0c3",
    };
  }
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);
  const color = reward.color;
  const glow = mat("gateGlow" + color, color, 0.23, 0.1, 1.5);
  const frame = mat("gateFrame" + color, "#263942", 0.35, 0.7);
  const w = 2.85,
    h = 4.35;
  for (const s of [-1, 1]) {
    addBox(group, [(s * w) / 2, h / 2, 0], [0.14, h, 0.17], undefined, frame);
    addBox(
      group,
      [(s * w) / 2, h / 2, 0.11],
      [0.09, h - 0.1, 0.09],
      undefined,
      glow,
    );
  }
  addBox(group, [0, h, 0], [w, 0.16, 0.2], undefined, frame);
  addBox(group, [0, h, 0.015], [w - 0.12, 0.06, 0.08], undefined, glow);
  const holo = mesh(
    new THREE.PlaneGeometry(w - 0.22, h - 0.32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.105,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    group,
    [0, h / 2, 0.1],
  );
  const scan = mesh(
    new THREE.PlaneGeometry(w - 0.3, 0.035),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    }),
    group,
    [0, 1.2, 0.11],
  );
  const lbl = labelSprite(
    { value: reward.value, name: reward.name, hint: ["recruit","team","promote"].includes(reward.type)?"选择路线 · 迎面穿越":"射击增幅 · 迎面穿越" },
    color,
  );
  group.add(lbl.sprite);
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  if(reward.type==='rate' && reward.amount===.2){
    const sample=new THREE.Sprite(new THREE.SpriteMaterial({map:art.gate,transparent:true,depthWrite:false}));
    sample.scale.set(3.3,2.47,1);sample.position.set(0,1.35,.15);group.add(sample);
  }
  const light = new THREE.Object3D();
  light.intensity = 0;
  light.position.set(0, 2.2, 0.35);
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
    label: lbl,
    scan,
    phase: rand(0, 6),
    resolved: false,
  });
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
  if (state.crates.length >= 3) return;
  const group = new THREE.Group();
  group.position.set(x, 0.4, z);
  scene.add(group);
  const color = weaponInfo[type].color;
  const crate = addBox(
    group,
    [0, 0, 0],
    [1.1, 0.8, 0.8],
    undefined,
    mat("crate" + type, "#263941", 0.38, 0.75),
  );
  crate.rotation.y = 0.12;
  addBox(
    group,
    [0, 0.04, -0.43],
    [0.84, 0.49, 0.055],
    undefined,
    mat("crateGlow" + type, color, 0.22, 0.25, 1.4),
  );
  for (const s of [-1, 1])
    addBox(
      group,
      [s * 0.48, 0.39, 0],
      [0.1, 0.09, 0.85],
      undefined,
      mat("crateEdge" + type, color, 0.3, 0.6, 0.75),
    );
  const top = addBox(
    group,
    [0, 0.43, 0],
    [1.08, 0.08, 0.82],
    undefined,
    mat("crateTop" + type, "#40545a", 0.36, 0.68),
  );
  const sprite = makeCrateTexture(type);
  sprite.position.set(0, 1.65, 0);
  sprite.scale.set(2.9, 1.47, 1);
  group.add(sprite);
  const display = type === "medkit" ? new THREE.Group() : buildGun(type);
  if (type === "medkit") {
    addBox(display, [0, 0, 0], [0.22, 0.65, 0.18], "#b8ffe4");
    addBox(display, [0, 0, 0], [0.65, 0.22, 0.18], "#b8ffe4");
  }
  display.scale.setScalar(1.35);
  display.position.set(0, 0.92, 0);
  display.rotation.y = Math.PI / 2;
  group.add(display);
  const halo = mesh(
    G.torus,
    mat("crateHalo" + type, color, 0.4, 0.2, 0.8),
    group,
    [0, 0.48, 0],
    [0.85, 0.85, 0.85],
  );
  halo.rotation.x = Math.PI / 2;
  const light = new THREE.Object3D();
  light.intensity = 0;
  light.position.y = 1;
  group.add(light);
  state.crates.push({ group, type, x, z, spin: rand(0, 6), light });
}
function spawnGateEvent() {
  const systemPairs=[
   [{type:'recruit',role:'assault',amount:1,value:'队员 +1',name:'突击招募',color:'#80eaff'},{type:'recruit',role:'guard',amount:1,value:'队员 +1',name:'护卫招募',color:'#a0eec7'}],
   [{type:'team',amount:1,value:'团队 +8%',name:'协同强化',color:'#a5a5ff'},{type:'promote',amount:1,value:'职业 +1',name:'职业晋升',color:'#ffce85'}],
   [{type:'recruit',role:'heavy',amount:1,value:'队员 +1',name:'重火力招募',color:'#ffcc86'},gateDefs[1][1]],
  ];
  const index=state.gateSequence;
  const pair = index===0 ? systemPairs[0] : index%3===1 ? systemPairs[Math.floor(index/3)%3] : gateDefs[index%gateDefs.length];
  const pairId = ++state.gateSequence;
  for (let i = 0; i < 2; i++) {
    buildGate(pair[i], i === 0 ? -2.45 : 2.45, -34);
    state.gates.at(-1).pairId = pairId;
  }
  state.gateTimer = state.time < 30 ? 9.5 : 11;
}

function acquireGate(g) {
  const special=g.reward.type;
  if(['recruit','team','promote'].includes(special)){
    if(special==='recruit')run.recruit(g.reward.role||'assault');
    if(special==='team')run.teamPower=Math.min(5,run.teamPower+1);
    if(special==='promote'){if(!run.team.length)run.recruit('assault');else run.promote();}
    announce(g.reward.value,'队员本局持续存在 · 职业武器保留');audio.pickup();state.score+=70;return;
  }
  if (g.reward.type === "repair") {
    const amount = g.reward.amount + (g.charge >= 8 ? 6 : 0);
    state.hp = Math.min(100, state.hp + amount);
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
  switch (g.reward.type) {
    case "lanes":
      s.lanes = Math.min(5, s.lanes + g.reward.amount);
      break;
    case "pellets":
      s.pellets = Math.min(8, s.pellets + g.reward.amount);
      break;
    case "rate":
      s.fireRate = Math.min(2.5, s.fireRate * (1 + g.reward.amount));
      break;
    case "speed":
      s.bulletSpeed = Math.min(2.2, s.bulletSpeed * (1 + g.reward.amount));
      break;
    case "damage":
      s.damage = Math.min(3, s.damage * (1 + g.reward.amount));
      break;
  }
  state.weaponLevel = Math.min(9, state.weaponLevel + 1);
  state.hp = Math.min(100, state.hp + 6);
  state.score += 45;
  state.combo++;
  const extra = g.charge >= 8 ? Math.min(1.25, g.charge * 0.035) : 0;
  if (extra) {
    if (g.reward.type === "lanes") s.lanes = Math.min(5, s.lanes + 1);
    else if (g.reward.type === "pellets")
      s.pellets = Math.min(8, s.pellets + 1);
    else if (g.reward.type === "rate")
      s.fireRate = Math.min(2.5, s.fireRate * 1.1);
    else if (g.reward.type === "speed")
      s.bulletSpeed = Math.min(2.2, s.bulletSpeed * 1.1);
    else if (g.reward.type === "damage")
      s.damage = Math.min(3, s.damage * 1.12);
  }
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
  scene.remove(g);
  for(const resource of g.userData.disposables||[])resource.dispose();
  g.traverse?.((o) => {
    if (o.geometry && !Object.values(G).includes(o.geometry))
      o.geometry.dispose();
    if (o.material?.map?.image?.tagName === "CANVAS") {
      o.material.map.dispose();
      o.material.dispose();
    }
  });
}
function removeShadow(shadow) {
  scene.remove(shadow);
  shadow.geometry.dispose();
  shadow.material.dispose();
}
function disposeSoldier(g) {
  scene.remove(g);
  g.traverse?.((o) => {
    if (o.geometry && !Object.values(G).includes(o.geometry))
      o.geometry.dispose();
  });
  g.traverse(o=>{if(o.isMesh&&o.material?.map&&o.material.map!==art.soldier){o.material.map.dispose();o.material.dispose();}});
  g.userData.body?.material?.dispose();
  g.userData.shieldMaterial?.dispose();
}
function spawnEnemy(type = "grunt", x = rand(-4.4, 4.4), z = -46) {
  if (state.threats.length >= RULES.enemyLimit) return;
  const cfg = {
    grunt: { hp: 26, speed: 5.2, damage: 9, scale: 1, score: 12 },
    runner: { hp: 22, speed: 8.2, damage: 11, scale: 0.85, score: 18 },
    heavy: { hp: 96, speed: 3.7, damage: 16, scale: 1.27, score: 28 },
    charger: { hp: 48, speed: 6.5, damage: 16, scale: 1.07, score: 25 },
    ranged: { hp: 38, speed: 3.5, damage: 10, scale: 0.92, score: 22 },
    elite: { hp: 195, speed: 4.4, damage: 20, scale: 1.48, score: 65 },
  }[type] || { hp: 26, speed: 5, damage: 9, scale: 1, score: 12 };
  const group = createSoldier(type === "grunt" ? "scout" : type === "charger" ? "charger" : type);
  group.scale.setScalar(cfg.scale);
  group.position.set(x, 0, z);
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  scene.add(group);
  const barGroup = new THREE.Group();
  const back = mesh(
    G.plane,
    basic("#1d1718", 0.92),
    barGroup,
    [0, 0, 0],
    [0.9, 0.095, 1],
  );
  const fill = mesh(
    G.plane,
    basic(type === "elite" ? "#ff6a54" : "#ffc270", 0.96),
    barGroup,
    [0, 0, 0.006],
    [0.88, 0.06, 1],
  );
  barGroup.position.y = 2.35;
  group.add(barGroup);
  barGroup.quaternion
    .copy(group.quaternion)
    .invert()
    .multiply(camera.quaternion);
  const shadow = mesh(
    new THREE.CircleGeometry(0.55 * cfg.scale, 18),
    new THREE.MeshBasicMaterial({
      color: "#050b0d",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    scene,
    [x, -0.085, z],
    [1, 0.7, 1],
  );
  shadow.rotation.x = -Math.PI / 2;
  state.threats.push({
    type,
    group,
    shadow,
    x,
    z,
    hp: cfg.hp * (1 + Math.min(0.85, state.time / 220)),
    maxHp: cfg.hp * (1 + Math.min(0.85, state.time / 220)),
    speed: cfg.speed * (1 + Math.min(0.55, state.time / 170)),
    damage: cfg.damage,
    score: cfg.score,
    phase: rand(0, 8),
    charge: 0,
    fire: rand(2, 5),
    cooldown: 0,
    stun: 0,
    dead: 0,
    bar: fill,
    barGroup,
    attackWarn: 0,
  });
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
function burst3D(x, y, z, color, count = 12) {
  const n = Math.min(
    count,
    24,
    Math.max(0, RULES.particleLimit - state.effects.filter((p) => !p.userData.warning).length),
  );
  for (let i = 0; i < n; i++) {
    let p = particlePool.pop();
    if (!p) {
      p = new THREE.Mesh(
        G.smallSphere,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        }),
      );
      scene.add(p);
      p.userData.v = new THREE.Vector3();
    }
    scene.add(p);
    p.visible = true;
    p.material.color.set(color);
    p.material.opacity = 1;
    p.position.set(x + rand(-0.18, 0.18), y + rand(-0.2, 0.2), z);
    p.scale.setScalar(rand(0.035, 0.095));
    p.userData.v.set(rand(-5, 5), rand(-1, 5), rand(-6, 4));
    p.userData.life = p.userData.max = rand(0.22, 0.54);
    state.effects.push(p);
  }
}
function muzzleFlash() {
  state.recoil = 1;
  if (!muzzle) return;
  const current = muzzle;
  current.visible = true;
  current.scale.y = rand(0.65, 1.5);
  setTimeout(() => {
    current.visible = false;
  }, 55);
}
function acquireBullet() {
  let b = state.bullets.find((x) => !x.active);
  if (!b) {
    if (state.bullets.length >= RULES.bulletLimit) return null;
    // Reuse CPU records; all live projectiles render in two GPU instanced draws.
    const group=new THREE.Group(),core={scale:new THREE.Vector3(.08,.08,.2),material:null},tail={scale:new THREE.Vector3(.05,.05,.2),material:null};
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
let bulletInstances=null;
function syncBulletInstances(){
  if(!bulletInstances){
    const core=new THREE.InstancedMesh(G.smallSphere,new THREE.MeshBasicMaterial({color:'#ffffff'}),RULES.bulletLimit);
    const tail=new THREE.InstancedMesh(G.smallSphere,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.58,depthWrite:false}),RULES.bulletLimit);
    for(const item of [core,tail]){item.frustumCulled=false;item.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(item);}
    bulletInstances={core,tail,dummy:new THREE.Object3D(),color:new THREE.Color()};
  }
  const {core,tail,dummy,color}=bulletInstances;let index=0;
  for(const b of state.bullets){
    if(!b.active)continue;
    dummy.position.set(b.x,1.28,b.z);dummy.rotation.copy(b.group.rotation);dummy.scale.copy(b.core.scale);dummy.updateMatrix();core.setMatrixAt(index,dummy.matrix);
    dummy.position.x+=Math.sin(b.group.rotation.y)*.35;dummy.position.z+=Math.cos(b.group.rotation.y)*.35;dummy.scale.copy(b.tail.scale);dummy.updateMatrix();tail.setMatrixAt(index,dummy.matrix);
    color.set(b.color);core.setColorAt(index,color);tail.setColorAt(index,color);index++;
  }
  core.count=tail.count=index;
  if(index){for(const item of [core,tail]){item.instanceMatrix.needsUpdate=true;item.instanceColor.needsUpdate=true;}}
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
  const muzzleX = (source?.x ?? state.playerX) + 0.63,
    originZ = (source?.z ?? playerZ) - 1.16;
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
      b.x = muzzleX + (lane - (lanes - 1) / 2) * 0.45;
      b.z = originZ - (type === "shotgun" ? 0 : p * 0.27);
      b.prevX = b.x;
      b.prevZ = b.z;
      b.originZ = originZ;
      b.lastGateId = -1;
      b.vx = Math.sin(angle) * speed;
      b.vz = -Math.cos(angle) * speed;
      b.damage =
        info.damage *
        stats.damage *
        (state.overdrive > 0 ? 1.25 : 1) *
        (type === "shotgun" || p === 0 ? 1 : 0.7);
      b.life = 3.2;
      b.color = info.color;
      b.radius = type === "plasma" ? 0.4 : type === "pellet" ? 0.12 : 0.14;
      b.group.position.set(b.x, 1.27, b.z);
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
  if(!["lanes","pellets","rate","speed","damage","repair"].includes(g.reward.type))return;
  const charge = Math.min(16, g.charge + amount);
  if (charge === g.charge) return;
  g.charge = charge;
  updateGateLabel(g);
  g.scan.material.opacity = 0.95;
}

function doLaser() {
  const s = combatStats(),
    target = aimTarget(),
    originZ = playerZ - 1.16,
    muzzleX = state.playerX + 0.63;
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
    const x = muzzleX + (lane - (s.lanes - 1) / 2) * 0.45,
      endX = x + vx * range,
      endZ = originZ + vz * range;
    visual.ray.position.set((x + endX) / 2, 1.27, (originZ + endZ) / 2);
    visual.ray.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(vx, 0, vz),
    );
    const width = 0.045 + Math.min(0.07, (s.pellets - 1) * 0.008);
    visual.outer.scale.set(width * 2, range, width * 2);
    visual.inner.scale.set(width, range, width);
    const damage =
      weaponInfo.laser.damage *
      s.damage *
      (1 + (s.pellets - 1) * 0.55) *
      (state.overdrive > 0 ? 1.25 : 1);
    for (const e of state.threats)
      if (
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
        ) !== null
      )
        damageEnemy(e, damage, false);
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
  state.shootTimer =
    weaponInfo[type].interval /
    combatStats().fireRate /
    (state.overdrive > 0 ? 1.5 : 1);
  if (type === "laser") doLaser();
  else {
    createShot(type, aimTarget());
    audio.shoot(type);
  }
  muzzleFlash();
  if (type === "shotgun") state.shake = Math.max(state.shake, 0.12);
  else if (type === "plasma") state.shake = Math.max(state.shake, 0.09);
}
function aimTarget() {
  let target = { x: state.playerX + 0.63, z: -45 },
    best = Infinity;
  for (const e of [...state.threats, ...(state.boss ? [state.boss] : [])]) {
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
    isBoss = false;
  for (const e of state.threats) {
    if (e.dead) continue;
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
  if (b.kind === "plasma") {
    for (const e of state.threats)
      if (!e.dead && Math.hypot(e.x - target.x, e.z - target.z) < 3)
        damageEnemy(e, damage, true);
    if (
      boss &&
      !boss.dead &&
      (isBoss || Math.hypot(boss.x - target.x, boss.z - target.z) < 3)
    )
      damageBoss(damage);
    burst3D(target.x, 1.3, target.z, weaponInfo.plasma.color, 24);
    audio.explosion();
    state.shake = Math.max(state.shake, 0.15);
  } else if (isBoss) damageBoss(damage);
  else damageEnemy(target, damage, false);
  releaseBullet(b);
  return true;
}

function damageEnemy(e, dmg, heavy, procs = true) {
  if (e.dead) return;
  if(procs){
    if(e.hp/e.maxHp<.3)dmg*=1+run.level('execution')*.2;
    const burn=run.level('burn')+(run.armor?.kind==='molten'?2:0);
    if(burn){e.burnTime=3;e.burnDamage=3*burn;}
    if(run.level('frost')){e.slowTime=2;e.slow=run.level('frost')*.12;}
    if(run.level('arc') && run.arcCD<=0){run.arcCD=.7;secondaryDamage(e,dmg*.22*run.level('arc'),3.6,2,'#b7b2ff');}
    if(run.level('blast') && run.blastCD<=0){run.blastCD=.7;secondaryDamage(e,dmg*.18*run.level('blast')*(burn?1.12:1),1.8,3,'#ffc591');}
  }
  e.hp -= dmg;
  e.stun = 0.11;
  e.flash = 0.09;
  e.group.userData.body.material.emissive.set("#ffffff");
  e.group.userData.body.material.emissiveIntensity = 0.55;
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
    e.dead = 0.48;
    e.group.userData.dead = true;
    state.kills++;
    state.hp=Math.min(100,state.hp+run.onKill());
    state.score += e.score;
    if(e.bounty){state.score+=300;spawnRoadReward("armor",e.x,e.z,"thunder");announce("精英悬赏完成","积分 +300 · 战甲补给投放");}
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
    if (state.crates.length < 2 && Math.random() < 0.025 && e.type !== "grunt")
      spawnCrate(
        ["machine", "shotgun", "plasma", "laser"][
          Math.floor(Math.random() * 4)
        ],
        e.x,
        e.z - 2,
      );
  }
}
function secondaryDamage(origin,damage,radius,limit,color){
  let hits=0;for(const target of state.threats){if(target!==origin&&!target.dead&&Math.hypot(target.x-origin.x,target.z-origin.z)<radius){damageEnemy(target,damage,false,false);energyLink(origin.x,origin.z,target.x,target.z,color);if(++hits>=limit)break;}}
}
function damageBoss(dmg) {
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
  const boundary = b.armorPhase < 2 ? (b.maxHp * (2 - b.armorPhase)) / 3 : 0;
  const previousHp = b.hp;
  b.hp = Math.max(boundary, b.hp - dmg);
  b.flash = 0.1;
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
    b.death = 1.35;
    b.shieldMesh.visible = false;
    state.score += 1400 + Math.floor(state.time * 2);
    state.kills++;
    state.hp = Math.min(100, state.hp + 25);
    audio.explosion();
    announce("巨像核心击破", "高额战斗积分 · 装甲修复");
    burst3D(b.x, 2, b.z, "#ffbd70", 24);
    audio.setBoss(false);
  }
}

function spawnEnemyShot(enemy) {
  if(state.enemyShots.length>=60)return;
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
  state.effects.push(warning);
  warning.userData.life = enemy.type === "ranged" ? 0.7 : 0.5;
  warning.userData.warning = true;
  const start = { x: enemy.x, z: enemy.z, y: 1.1 };
  state.enemyShots.push({
    x: start.x,
    z: start.z,
    y: start.y,
    vx: (state.playerX - start.x) / Math.max(.8,(playerZ-start.z)/11),
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
  const hp = 1200 + Math.min(1800, state.time * 4) + run.team.length * 180;
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
  audio.setBoss(true);
  audio.bossAlert();
  state.shake = 0.32;
  vibrate([40, 30, 70]);
  burst3D(0, 1.8, -30, "#ff604f", 35);
}
function spawnRoundEnemy() {
  const t = state.time;
  let type = "grunt";
  const r = Math.random();
  if (t < 15) type = r < 0.13 ? "runner" : "grunt";
  else if (t < 40) type = r < 0.22 ? "runner" : r < 0.32 ? "ranged" : "grunt";
  else if (t < 70)
    type =
      r < 0.22 ? "runner" : r < 0.42 ? "heavy" : r < 0.57 ? "ranged" : r < .72 ? "charger" : "grunt";
  else
    type =
      r < 0.22
        ? "elite"
        : r < 0.42
          ? "heavy"
          : r < 0.62
            ? "runner"
            : r < 0.78
              ? "ranged"
              : r < .9 ? "charger" : "grunt";
  spawnEnemy(type, rand(-5.1, 5.1), -44 - rand(0, 12));
}
function spawnInterval(t) {
  const points=[[0,1.7],[15,1.35],[40,.95],[70,.78],[95,.76],[180,.58],[270,.46],[400,.40]];
  let base=.4;
  for(let i=1;i<points.length;i++)if(t<=points[i][0]){const a=points[i-1],b=points[i];base=mix(a[1],b[1],clamp((t-a[0])/(b[0]-a[0]),0,1));break;}
  return t%24>=20?base*3.8:base;
}

function addHeat(amount) {
  if (state.overdrive > 0) return;
  state.heat = Math.min(10, state.heat + amount);
  if (state.heat >= 10) {
    state.heat = 0;
    state.overdrive = 6;
    state.hp = Math.min(100, state.hp + 8);
    announce("火力过载 · 6 秒", "射速 ×1.5 · 伤害 ×1.25");
    audio.pickup();
    burst3D(state.playerX, 1, playerZ, "#7effec", 24);
  }
}

function updateDifficulty(dt) {
  const t = state.time,
    interval = spawnInterval(t) * (state.boss ? 2.4 : 1),
    wave = Math.floor(t / 24) + 1;
  if (state.wave !== wave) {
    state.wave = wave;
    showCombo("第 " + wave + " 波 · 敌潮再临");
  }
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    state.spawnTimer = interval * rand(0.85, 1.12);
    spawnRoundEnemy();
  }
  if (t % 24 >= 20 && (t - dt) % 24 < 20) {
    showCombo("短暂喘息 · 搜寻补给");
    if (state.hp < 75)
      spawnCrate("medkit", state.playerX > 0 ? -2.4 : 2.4, -18);
  }
  state.gateTimer -= dt;
  if (state.gateTimer <= 0 && state.gates.length < 4) spawnGateEvent();
  state.crateTimer -= dt;
  if (state.crateTimer <= 0 && state.crates.length < 2) {
    const choices = ["machine", "shotgun", "plasma", "laser"],
      type = choices[Math.min(3, Math.floor(t / 18))];
    spawnCrate(type, (Math.floor(t / 18) % 2 ? -1 : 1) * 2.75);
    state.crateTimer = 18;
  }
  if (t >= state.nextBoss && !state.boss) {
    buildBoss();
    state.nextBoss = RULES.bosses.find(n=>n>t+1) || state.nextBoss + 90;
  }
}

function moveThreats(dt) {
  for (let i = state.threats.length - 1; i >= 0; i--) {
    const e = state.threats[i];
    if (e.dead) {
      e.dead -= dt;
      e.group.rotation.z += dt * 1.5;
      e.group.position.y = Math.max(-0.35, e.group.position.y - dt * 0.7);
      e.group.scale.multiplyScalar(Math.max(0.94, 1 - dt * 0.58));
      if (e.dead <= 0) {
        disposeSoldier(e.group);
        removeShadow(e.shadow);
        state.threats.splice(i, 1);
      }
      continue;
    }
    e.stun = Math.max(0, e.stun - dt);
    if(e.burnTime>0){e.burnTime-=dt;e.burnTick=(e.burnTick||0)+dt;if(e.burnTick>=.5){e.burnTick-=.5;damageEnemy(e,e.burnDamage*.5,false,false);if(e.dead)continue;}}
    e.slowTime=Math.max(0,(e.slowTime||0)-dt);
    const moveDt=dt*(e.slowTime>0?1-(e.slow||0):1);
    e.flash = Math.max(0, (e.flash || 0) - dt);
    e.group.userData.body.material.emissiveIntensity = e.flash > 0 ? 0.6 : 0;
    e.phase += dt;
    const dz = playerZ - e.z,
      dist = Math.abs(dz);
    if (e.type === "runner" || e.type === "charger") {
      e.dashCooldown=(e.dashCooldown??1.7)-dt;
      if(e.dash>0){
        e.dash-=dt;e.x=mix(e.x,e.targetX,Math.min(1,dt*3));e.z+=e.speed*1.8*moveDt;
      }else if(e.windup>0){
        e.windup-=dt;
        e.group.userData.body.scale.y=.87;
        if(e.windup<=0){e.dash=.65;e.dashCooldown=2.8;e.group.userData.body.scale.y=1;}
      }else{
        e.x=mix(e.x,state.playerX,Math.min(1,dt*.4));e.z+=e.speed*moveDt;
        if(dist<24&&e.dashCooldown<=0){
          e.windup=.75;e.targetX=clamp(state.playerX,-PLAYER_LIMIT,PLAYER_LIMIT);
          const warning=mesh(new THREE.PlaneGeometry(1.5,Math.max(2,dist)),basic('#ffbc70',.2,false),scene,[e.targetX,.015,(e.z+playerZ)/2]);
          warning.rotation.x=-Math.PI/2;warning.userData.warning=true;warning.userData.life=.75;state.effects.push(warning);
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
        state.playerX + Math.sin(e.phase * 1.5) * 0.4,
        dt * (e.type === "heavy" ? 0.22 : 0.62),
      );
      e.z += e.speed * moveDt;
    }
    if(e.type==='elite'){
      e.fire-=dt;
      if(e.fire<=0&&dist<30){e.fire=4.5;spawnEnemyShot(e);}
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
    e.shadow.position.set(e.x, -0.08, e.z);
    e.bar.scale.x = Math.max(0.02, e.hp / e.maxHp);
    e.bar.position.x = -(1 - e.hp / e.maxHp) * 0.44;
    e.barGroup.quaternion
      .copy(e.group.quaternion)
      .invert()
      .multiply(camera.quaternion);
    if (dist < 1.25 && Math.abs(e.x - state.playerX) < 0.9) {
      hurtPlayer(e.damage, 0.8);
      e.z -= 2.1;
      e.x += Math.sign(e.x - state.playerX || 1) * 0.45;
    }
    for(const member of [...run.team]) {
      if(Math.abs(e.z-member.z)<.95 && Math.abs(e.x-member.x)<.8 && member.invuln<=0){
        run.hurtMember(member,e.damage);e.z-=.9;burst3D(member.x,1,member.z,'#ffba98',8);
      }
    }
    if (e.z > playerZ + 1.8) {
      run.totals.breaches++;
      hurtPlayer(Math.max(7,e.damage*.8),.15,true);
      showCombo('防线突破 · 装甲受损');
      disposeSoldier(e.group);
      removeShadow(e.shadow);
      state.threats.splice(i, 1);
    }
  }
}
function updateBoss(dt) {
  const b = state.boss;
  if (!b) return;
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
  b.group.userData.body.material.emissive.set("#ffe1a6");
  b.group.userData.body.material.emissiveIntensity = b.flash > 0 ? 0.9 : 0;
  b.move += dt;
  b.x = Math.sin(b.move * 0.45) * 3.25;
  b.z = mix(b.z, -18, Math.min(1, dt * 0.5));
  b.group.position.set(b.x, -0.12 + Math.sin(b.move * 1.6) * 0.04, b.z);
  b.group.rotation.y = Math.sin(b.move * .4)*.08;
  b.group.userData.legL.rotation.x = Math.sin(b.move * 3) * 0.08;
  b.attack -= dt;
  if (b.attack <= 0 && b.phase === "idle") {
    b.phase = "warn";
    b.skillCycle=(b.skillCycle||0)+1;
    b.sweep=b.armorPhase===2 && b.skillCycle%2===0;
    b.warning = b.armorPhase>0?1.05:.85;
    b.attack = b.armorPhase===2?2.85:3.2;
    const target = b.sweep?(state.playerX>0?2.6:-2.6):clamp(state.playerX,-4.7,4.7);
    if(b.sweep)showCombo('巨像侧翼扫射 · 转移另一侧');
    else if(b.armorPhase>0)showCombo('巨像扩散齐射 · 离开预警区域');
    b.targetX = target;
    const warn = mesh(
      new THREE.PlaneGeometry(b.sweep?5.2:b.armorPhase>0?4.2:2.8, 21),
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
    state.effects.push(warn);
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
      b.warnMesh?.parent?.remove(b.warnMesh);
      b.warnMesh = null;
      for (let i = -(b.armorPhase>0?2:1); i <= (b.armorPhase>0?2:1); i++) spawnBossShot(b, i);
      state.shake = 0.12;
    }
  }
  if (b.z > playerZ - 3.8 && Math.abs(b.x - state.playerX) < 1.4)
    hurtPlayer(24, 1.1);
  $("#bossBar").style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
}
function spawnBossShot(b, i) {
  if(state.enemyShots.length>=60)return;
  const x = b.x + i * 0.65,
    z = b.z + 1,
    targetX = clamp(b.targetX + i * (b.sweep?.95:.7), -5.3, 5.3),
    travel = 1.35;
  const meshObj = mesh(
    G.sphere,
    mat("bossShot", "#ff5667", 0.25, 0.1, 1.5),
    scene,
    [x, 1.3, z],
    [0.26, 0.26, 0.5],
  );
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

function updateShots(dt) {
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    if (!b.active) continue;
    b.prevX = b.x;
    b.prevZ = b.z;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.life -= dt;
    b.group.position.set(b.x, 1.28, b.z);
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
      s.mesh = mesh(
        G.sphere,
        mat("enemyShot", "#ff624d", 0.26, 0.2, 1.4),
        scene,
        [s.x, s.y, s.z],
        [0.16, 0.16, 0.16],
      );
    }
    const oldX=s.x, oldZ=s.z;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    s.mesh.position.set(s.x, s.y, s.z);
    s.mesh.rotation.x += dt * 4;
    if (
      segmentHit(oldX,oldZ,s.x,s.z,state.playerX,playerZ,.72,.65)!==null
    ) {
      hurtPlayer(s.damage, 0.8);
      burst3D(s.x, 0.8, s.z, "#ff745b", 9);
      scene.remove(s.mesh);
      state.enemyShots.splice(i, 1);
      continue;
    }
    const member=run.team.find(m=>m.invuln<=0 && segmentHit(oldX,oldZ,s.x,s.z,m.x,m.z,.6,.65)!==null);
    if(member){run.hurtMember(member,s.damage);burst3D(member.x,1,member.z,'#ff9f9c',6);scene.remove(s.mesh);state.enemyShots.splice(i,1);continue;}
    if (s.life <= 0 || s.z > playerZ + 2) {
      scene.remove(s.mesh);
      state.enemyShots.splice(i, 1);
    }
  }
}
function hurtPlayer(amount, cooldown = .8, breach = false) {
  if ((!breach && state.invuln > 0) || state.mode !== "playing") return;
  const guards=run.team.filter(m=>m.role==='guard').length;
  state.hp = Math.max(0, state.hp - run.absorb(amount*(1-Math.min(.2,guards*.08))));
  app.classList.remove("hurt");
  void app.offsetWidth;
  app.classList.add("hurt");
  state.invuln = cooldown;
  state.shake = Math.max(state.shake, 0.17);
  audio.impact(true);
  vibrate(26);
  burst3D(state.playerX, 0.8, playerZ, "#ff685e", 12);
  $("#healthBar").style.width = state.hp + "%";
  $("#healthText").textContent = Math.ceil(state.hp);
  if (state.hp <= 0) endGame();
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
    if(c.resolved){disposeGroup(c.group);state.crates.splice(i,1);continue;}
    const previousZ=c.z;
    c.z += worldSpeed() * dt;
    c.group.position.z = c.z;
    c.spin += dt;
    c.group.rotation.y = Math.sin(c.spin) * 0.07;
    c.group.position.y = 0.42 + Math.sin(c.spin * 2) * 0.09;
    if (
      previousZ <= playerZ+1.6 && c.z >= playerZ-1.7 &&
      Math.abs(c.x - state.playerX) < 1.55+run.level("magnet")*.2
    ) {
      if(c.choiceId)for(const other of state.crates)if(other!==c&&other.choiceId===c.choiceId){other.resolved=true;other.group.visible=false;}
      if(c.system){collectRoadReward(c);}
      else if (c.type === "medkit") {
        state.hp = Math.min(100, state.hp + 25);
        announce("装甲修复 +25", "调整路线 · 继续突围");
        audio.pickup();
      } else if (
        ["rifle", "machine", "shotgun", "plasma", "laser"].indexOf(c.type) <=
        ["rifle", "machine", "shotgun", "plasma", "laser"].indexOf(state.weapon)
      ) {
        const previous = state.stats.damage;
        state.stats.damage = Math.min(3, previous * 1.12);
        state.hp = Math.min(100, state.hp + 8);
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

function energyLink(x,z,tx,tz,color='#a7a3ff') {
  if(state.effects.filter(p=>p.userData.warning).length>=18)return;
  const points=[new THREE.Vector3(x,1.4,z),new THREE.Vector3((x+tx)/2+.16,1.6,(z+tz)/2),new THREE.Vector3(tx,1.2,tz)];
  const geometry=new THREE.BufferGeometry().setFromPoints(points);
  const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity:.9}));
  line.userData.warning=true;line.userData.life=.23;scene.add(line);state.effects.push(line);
}
function updateTeam(dt) {
  const slots=[[-1.3,.3],[1.3,.3],[-2.45,.7],[2.45,.7]];
  for(const [id,visual] of teamVisuals)if(!run.team.some(m=>m.id===id)){
    burst3D(visual.position.x,1,visual.position.z,'#ffc2a1',12);disposeGroup(visual);visual.userData.body.material.dispose();teamVisuals.delete(id);
    showCombo('队员阵亡 · 寻找救援招募');
  }
  run.team.forEach((member,i)=>{
    let visual=teamVisuals.get(member.id);
    if(!visual){
      visual=createAssetSoldier();visual.scale.setScalar(.8);
      visual.userData.body.material.color.set(ROLES[member.role].color);
      const gun=buildGun(ROLES[member.role].weapon);visual.userData.gun.add(gun);
      const ring=mesh(G.torus,mat('squadRing',ROLES[member.role].color,.5,.1,.6),visual,[0,.12,0],[.54,.54,.54]);ring.rotation.x=Math.PI/2;
      scene.add(visual);teamVisuals.set(member.id,visual);
      member.x=clamp(state.playerX+slots[i][0],-4.5,4.5);member.z=playerZ+slots[i][1];
    }
    member.x=mix(member.x,clamp(state.playerX+slots[i][0],-4.5,4.5),Math.min(1,dt*7));
    member.z=mix(member.z,playerZ+slots[i][1],Math.min(1,dt*7));
    visual.position.set(member.x,-.05+Math.sin(state.time*11+i)*.035,member.z);
    visual.rotation.z=Math.sin(state.time*10+i)*.02;
    visual.visible=member.invuln>0?Math.floor(member.invuln*16)%2===0:true;
    visual.userData.body.material.emissive.set(member.level===3?'#56417f':member.level===2?'#1c485a':'#000000');
    visual.userData.body.material.emissiveIntensity=.25;
    member.fire-=dt;
    if(member.fire<=0){
      const role=ROLES[member.role],targets=[...state.threats,...(state.boss?[state.boss]:[])].filter(e=>!e.dead&&e.z<member.z&&Math.abs(e.x-member.x)<5).sort((a,b)=>b.z-a.z);
      if(targets.length){
        const bonus=run.teamDamage(member),info=weaponInfo[role.weapon];
        createShot(role.weapon,targets[0],{x:member.x,z:member.z,stats:{lanes:1,pellets:1,fireRate:1,bulletSpeed:1,damage:role.damage/info.damage*bonus}});
        visual.userData.gun.position.z=-.1;
        if(Math.random()<.2)audio.shoot(role.weapon);
      }
      member.fire=role.interval/(1+run.level('drill')*.12)/(1+(member.level-1)*.08);
    }
    visual.userData.gun.position.z=mix(visual.userData.gun.position.z,-.25,Math.min(1,dt*10));
  });
}
function spawnRoadReward(kind,x=rand(-3.5,3.5),z=-30,value=null){
  if(state.crates.length>=3)return null;
  const descriptors={
    rescue:{name:'队员救援',value:'招募 +1',color:'#83e5ff'},
    pet:{name:'伙伴信标',value:PETS[value]?.name||'宠物支援',color:PETS[value]?.color||'#c6acff'},
    armor:{name:'稀有战甲',value:ARMORS[value]?.name||'战甲补给',color:ARMORS[value]?.color||'#bfa9ff'},
    truck:{name:'武装运输车',value:(weaponInfo[value]||weaponInfo.machine).name,color:'#ffe2a0'},
  };
  const descriptor=descriptors[kind];if(!descriptor)return null;
  spawnCrate('medkit',x,z);
  const c=state.crates.at(-1);c.system={kind,value};
  c.group.children.filter(o=>o.isSprite).forEach(o=>{o.material.map.dispose();o.material.dispose();c.group.remove(o);});
  const label=labelSprite({value:descriptor.value,name:descriptor.name,hint:kind==='pet'?'同伴升级 · 可替换':kind==='rescue'?'持续编队 · 阵亡可补员':'左右移动 · 靠近领取'},descriptor.color);
  label.sprite.position.y=2.5;label.sprite.scale.set(3,2.05,1);c.group.add(label.sprite);
  if(kind==='truck'){
    addBox(c.group,[0,-.08,0],[1.7,.65,1.65],'#69859d');addBox(c.group,[0,.48,-.46],[1.35,.6,.7],'#8cc8db');
    for(const a of [-1,1])for(const b of [-1,1]){const wheel=mesh(G.smallSphere,mat('truckTyre','#26374b'),c.group,[a*.8,-.35,b*.55],[.18,.32,.32]);}
  }
  const beacon=mesh(G.torus,mat('reward'+kind,descriptor.color,.3,.15,1),c.group,[0,1.05,0],[.75,.75,.75]);beacon.rotation.x=Math.PI/2;
  return c;
}
function collectRoadReward(c){
  const {kind,value}=c.system;
  if(kind==='rescue'){run.recruit(value||'assault');announce('队员归队',ROLES[value||'assault'].name+' · 本局持续作战');}
  if(kind==='pet'){run.equipPet(value);announce(PETS[value].name+' Lv.'+run.pet.level,PETS[value].description);}
  if(kind==='armor'){run.activateArmor(value);announce(ARMORS[value].name+' · 变身', '持续12秒 · '+ARMORS[value].description);state.shake=.22;}
  if(kind==='truck'){
    const order=['rifle','machine','shotgun','plasma','laser'];
    if(order.indexOf(value)>order.indexOf(state.weapon))setWeapon(value);else{state.stats.damage=Math.min(3,state.stats.damage*1.12);announce('运输补给 · 当前武器校准','保留高阶武器');}
    run.addShield(10);
  }
  audio.pickup();updateWeaponUi();updateSystemsHud();
}
function updatePetArmor(dt,result){
  if(run.pet){
    const pet=run.pet,kind=pet.kind;
    if(!petVisual||petVisual.userData.kind!==kind){
      if(petVisual)disposeGroup(petVisual);
      petVisual=new THREE.Group();petVisual.userData.kind=kind;
      const tex=assetLoader.load('./assets/pets/'+kind+'.svg');tex.colorSpace=THREE.SRGBColorSpace;
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));sprite.scale.set(.95,.95,1);petVisual.add(sprite);petVisual.userData.disposables=[tex,sprite.material];scene.add(petVisual);
    }
    petVisual.position.set(clamp(state.playerX-1.1,-5.5,5.5),2.3+Math.sin(state.time*3)*.18,playerZ+.3);
    petVisual.scale.setScalar(pet.flash>0?1.12:1);
    if(result.pet){
      const target=state.threats.filter(e=>!e.dead).sort((a,b)=>b.z-a.z)[0]||state.boss;
      if(target && ['dragon','owl'].includes(result.pet)){
        energyLink(petVisual.position.x,playerZ,target.x,target.z,PETS[kind].color);
        if(result.pet==='owl')for(const e of state.threats){e.slowTime=2;e.slow=.25;}
        if(target===state.boss)damageBoss((kind==='dragon'?20:12)*pet.level);
        else damageEnemy(target,(kind==='dragon'?20:12)*pet.level,true,false);
      }
      burst3D(state.playerX,1.8,playerZ,PETS[kind].color,15);audio.pickup();
    }
  }
  if(run.armor||run.armorFade>0){
    const kind=run.armor?.kind||armorVisual?.userData.kind;
    if(kind && (!armorVisual||armorVisual.userData.kind!==kind)){
      if(armorVisual)disposeGroup(armorVisual);
      armorVisual=new THREE.Group();armorVisual.userData.kind=kind;
      const color=ARMORS[kind].color;
      const platingTexture=assetLoader.load('./assets/armors/'+kind+'.svg');platingTexture.colorSpace=THREE.SRGBColorSpace;
      const plating=mesh(new THREE.PlaneGeometry(2.2,1.47),new THREE.MeshStandardMaterial({map:platingTexture,transparent:true,alphaTest:.1,side:THREE.DoubleSide,roughness:.5,metalness:.2}),armorVisual,[0,1.25,.25]);plating.quaternion.copy(camera.quaternion);
      const ring=mesh(G.torus,mat('armorRing'+kind,color,.25,.25,1),armorVisual,[0,1.25,0],[1.08,1.18,1.08]);ring.rotation.x=Math.PI/2;
      const shield=mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.08,wireframe:true,depthWrite:false}),armorVisual,[0,1.2,0],[1.05,1.5,.8]);
      armorVisual.userData.disposables=[shield.material,plating.material,platingTexture];
      scene.add(armorVisual);
    }
    if(armorVisual){armorVisual.position.set(state.playerX,0,playerZ);armorVisual.rotation.y=Math.sin(state.time*3)*.2;armorVisual.scale.setScalar(run.armor?1+Math.sin(state.time*5)*.03:Math.max(.05,run.armorFade/.8));}
  }else if(armorVisual){disposeGroup(armorVisual);armorVisual=null;}
  if(result.armorEnded){announce('战甲解除','原武器与强化完整保留');audio.pickup();updateWeaponUi();}
  if(result.armorPulse){
    const kind=result.armorPulse;
    if(kind==='thunder'){
      for(const e of state.threats.filter(e=>!e.dead).slice(0,3)){energyLink(state.playerX,playerZ,e.x,e.z,ARMORS[kind].color);damageEnemy(e,24,true,false);}
      if(state.boss)damageBoss(20);
    }else if(kind==='molten'){
      const t=state.threats.filter(e=>!e.dead).sort((a,b)=>b.z-a.z)[0];if(t){damageEnemy(t,32,true,false);secondaryDamage(t,16,2.5,3,ARMORS[kind].color);}
    }else if(kind==='phantom'){createShot(state.weapon==='laser'?'rifle':state.weapon);}
  }
}
function openDraft(){
  if(state.mode!=='playing')return;
  run.rollOffers();state.mode='draft';activeTouches=0;audio.pause();
  $('#draftPanel').classList.remove('hidden');renderDraft();
}
function renderDraft(){
  $('#draftTitle').textContent=run.pendingReplacement?'替换一项现有词条':'选择本局战术';
  $('#draftCopy').textContent=run.pendingReplacement?'已有四项词条，选择要替换的一项。':'每局最多四项 · 同词条最高三级';
  const ids=run.pendingReplacement?run.affixes.map(a=>a.id):run.offers;
  $('#draftChoices').innerHTML=ids.map(id=>{
    const a=AFFIXES.find(a=>a.id===id),level=run.level(id);
    return `<button class="draft-card" data-affix="${id}"><small>${a.category} · ${run.pendingReplacement?'替换 Lv.'+level:level?'升级 Lv.'+level+' → '+(level+1):'新战术'}</small><b>${a.name}</b><span>${a.description}</span></button>`;
  }).join('');
  $('#draftChoices').querySelectorAll('button').forEach(b=>b.onclick=()=>chooseAffix(b.dataset.affix));
}
function chooseAffix(id){
  if(state.mode!=='draft')return false;
  if(run.pendingReplacement){if(!run.affixes.some(a=>a.id===id))return false;run.selectAffix(run.pendingReplacement,id);}
  else {if(!run.offers.includes(id))return false;if(run.selectAffix(id)==='replace'){renderDraft();return false;}}
  finishDraft();return true;
}
function finishDraft(){
  run.pendingReplacement=null;run.offers=[];$('#draftPanel').classList.add('hidden');state.mode='playing';lastFrame=performance.now();updateWeaponUi();audio.resume().catch(()=>{});
  if(document.hidden)pauseRun();
}
function updateRunSystems(dt){
  const result=run.tick(dt);state.hp=Math.min(100,state.hp+result.heal);
  updateTeam(dt);updatePetArmor(dt,result);
  if(state.time>=run.nextDraft){run.nextDraft+=26;openDraft();return;}
  run.eventTimer-=dt;
  if(run.eventTimer<=0 && state.crates.length<3){
    const i=run.eventIndex++,n=Math.floor(i/4),cycle=i%4;run.eventTimer=19;
    const x=(i%2?1:-1)*2.6;
    if(cycle===0){spawnRoadReward('rescue',x,-30,['assault','heavy','guard'][n%3]);run.event='队员救援';}
    if(cycle===1){
      const pet=['dragon','owl','drone','fairy'][n%4];
      const first=spawnRoadReward('pet',x,-30,pet);
      if(run.pet && run.pet.kind!==pet && state.crates.length<3){
        const second=spawnRoadReward('pet',-x,-30,run.pet.kind);
        if(first&&second){first.choiceId=second.choiceId='pet-'+i;}
      }
      run.event=run.pet?'伙伴抉择 · 升级或更换':'伙伴信标';
    }
    if(cycle===2){spawnRoadReward('truck',x,-30,['machine','shotgun','plasma','laser'][Math.min(3,n)]);run.event='武装运输车';}
    if(cycle===3){spawnEnemy('elite',x,-33);const e=state.threats.at(-1);if(e){e.bounty=true;e.hp*=1.25;e.maxHp=e.hp;}spawnRoadReward('armor',-x,-35,['thunder','molten','phantom'][n%3]);run.event='精英悬赏 · 稀有战甲';}
    showCombo(run.event+' · 留意道路信标');
  }
}
function updateSystemsHud(){
  $('#teamStatus').innerHTML=`<span>编队 ${run.team.length+1}/5</span>`+run.team.map(m=>`<div class="crew-chip" style="--crew:${ROLES[m.role].color}"><b>${ROLES[m.role].name} ${'ⅠⅡⅢ'[m.level-1]}</b><i style="width:${m.hp/m.maxHp*100}%"></i></div>`).join('');
  $('#petStatus').textContent=run.pet?`${PETS[run.pet.kind].name} ${'ⅠⅡⅢ'[run.pet.level-1]} · ${Math.ceil(run.pet.cooldown)}s`:'伙伴 · 等待信标';
  $('#shieldText').textContent=run.shield>0?'护盾 '+Math.ceil(run.shield):'';
  $('#armorStatus').textContent=run.armor?`${ARMORS[run.armor.kind].name} ${run.armor.remaining.toFixed(1)}s`:run.armorFade>0?'战甲解除':'';
  $('#armorStatus').classList.toggle('active',!!run.armor);
  $('#affixStatus').textContent=run.affixes.length?run.affixes.map(a=>AFFIXES.find(d=>d.id===a.id).name+' '+a.level).join(' · '):'战术词条 · 18秒首次选择';
  $('#runDetail').textContent=`救援 ${run.totals.recruits} · 阵亡 ${run.totals.fallen} · 突破防线 ${run.totals.breaches}`;
  $('#collectionText').textContent=`出击 ${saved.get('mr-runs','0')} 次 · 外观徽章 ${saved.get('mr-collection','[]')==='[]'?'尚未解锁':'曙光行者'}（无属性加成）`;
}

function worldSpeed() {
  return 6.3 + Math.min(2.7, state.time * 0.018);
}
function updateEffects(dt) {
  for (let i = state.effects.length - 1; i >= 0; i--) {
    const p = state.effects[i];
    p.userData.life -= dt;
    if (p.userData.warning) {
      p.material.opacity = Math.max(0, p.userData.life * 1.1);
      if (p.userData.life <= 0) {
        scene.remove(p);
        p.geometry.dispose();
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
      (roadTexture.offset.y + (worldSpeed() * dt) / 120) % 1;
  let dirty = false;
  for (const b of worldObjects.buildings) {
    b.z += worldSpeed() * dt;
    if (b.z > 18) b.z -= 140;
    dirty = true;
  }
  if (dirty) updateWorldInstances();
  for (const r of worldObjects.rocks) {
    r.z += worldSpeed() * dt;
    if (r.z > 10) r.z = -105;
  }
  updateRockInstances();
  for (const l of worldObjects.lamps) {
    l.z += worldSpeed() * dt;
    if (l.z > 15) l.z -= 66;
    l.group.position.z = l.z;
  }
}
function updateGame(dt) {
  if (state.mode !== "playing") return;
  dt = Math.min(0.04, dt);
  state.time += dt;
  state.overdrive = Math.max(0, state.overdrive - dt);
  worldTime += dt;
  state.invuln = Math.max(0, state.invuln - dt);
  state.shootTimer -= dt;
  state.playerX = mix(state.playerX, state.targetX, Math.min(1, dt * 10));
  playerRig.position.x = state.playerX;
  playerRig.position.y = -0.1 + Math.sin(state.time * 8) * 0.018;
  const moving = Math.abs(state.playerX - state.targetX) > 0.08;
  playerParts.legL.rotation.x = moving
    ? Math.sin(state.time * 13) * 0.62
    : Math.sin(state.time * 10) * 0.2;
  playerParts.legR.rotation.x = moving
    ? -Math.sin(state.time * 13) * 0.62
    : -Math.sin(state.time * 10) * 0.2;
  playerParts.armL.rotation.x =
    0.36 + (moving ? Math.sin(state.time * 13) * 0.04 : 0);
  playerParts.armR.rotation.x = 0.5 + state.recoil * 0.2;
  playerParts.gun.position.z = -0.25 + state.recoil * 0.16;
  const aim = aimTarget();
  playerParts.gun.rotation.y = clamp(
    -Math.atan2(aim.x - state.playerX - 0.63, playerZ - 1.16 - aim.z),
    -0.5,
    0.5,
  );
  playerParts.head.rotation.y = playerParts.gun.rotation.y * 0.25;
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
  camera.lookAt(state.playerX * 0.08, 1.2, -15);
  state.shootTimer <= 0 && fireWeapon();
  updateRunSystems(dt);
  if(state.mode!=="playing")return;
  updateDifficulty(dt);
  moveThreats(dt);
  if(state.mode!=="playing")return;
  updateBoss(dt);
  updateShots(dt);
  if(state.mode!=="playing")return;
  updateGatesCrates(dt);
  updateEffects(dt);
  updateDecor(dt);
  state.score = Math.max(0, state.score + dt * 1.15);
  state.hp = Math.max(0, state.hp);
  if (state.threats.length > 24) {
    for (const e of state.threats.splice(0, state.threats.length - 24)) {
      disposeSoldier(e.group);
      removeShadow(e.shadow);
    }
  }
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
  $("#waveLabel").textContent = state.boss
    ? "首领战 · 躲开红色预警"
    : state.time % 24 >= 20
      ? "喘息时间 · 拾取补给"
      : "第 " +
        state.wave +
        " 波 · 首领 " +
        Math.max(0, Math.ceil(state.nextBoss - state.time)) +
        " 秒";
  const mins = String(Math.floor(state.time / 60)).padStart(2, "0"),
    secs = String(Math.floor(state.time % 60)).padStart(2, "0");
  $("#clock").textContent = `${mins}:${secs}`;
  $("#score").textContent = String(Math.floor(state.score)).padStart(4, "0");
  $("#healthBar").style.width = state.hp + "%";
  $("#healthText").textContent = Math.ceil(state.hp);
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
  burst3D(state.playerX,1.1,playerZ,'#b3e9ff',28);
  playerRig.rotation.z=.9;playerRig.position.y=-.5;
  const runs=+saved.get('mr-runs','0')+1;saved.set('mr-runs',runs);
  let collection=[];try{const value=JSON.parse(saved.get('mr-collection','[]'));if(Array.isArray(value))collection=value;}catch{}if(state.time>=95&&!collection.includes('曙光行者'))collection.push('曙光行者');saved.set('mr-collection',JSON.stringify(collection));
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
  for(const v of teamVisuals.values()){disposeGroup(v);v.userData.body?.material.dispose();}teamVisuals.clear();
  if(petVisual){disposeGroup(petVisual);petVisual=null;}
  if(armorVisual){disposeGroup(armorVisual);armorVisual=null;}
  run.reset();
  $('#draftPanel')?.classList.add('hidden');
  for (const e of state.threats) {
    disposeSoldier(e.group);
    removeShadow(e.shadow);
  }
  for (const g of state.gates) disposeGroup(g.group);
  for (const c of state.crates) disposeGroup(c.group);
  for (const s of state.enemyShots) if (s.mesh) scene.remove(s.mesh);
  for (const p of state.effects) {
    scene.remove(p);
    if (p.userData.warning) {
      p.geometry.dispose();
      p.material.dispose();
    } else {
      p.visible = false;
      particlePool.push(p);
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
  clearDynamic();
  app.classList.remove("overdrive", "hurt");
  clearTimeout(toastTimer);
  clearTimeout(comboTimer);
  $("#upgradeToast").classList.remove("show");
  $("#comboToast").classList.remove("show");
  state.time = 0;
  state.score = 0;
  state.kills = 0;
  state.hp = 100;
  state.playerX = state.targetX = 0;
  state.invuln = 0;
  state.shootTimer = 0.1;
  state.spawnTimer = 0.7;
  state.gateTimer = 1.7;
  state.crateTimer = 10;
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
  state.stats = {
    lanes: 1,
    pellets: 1,
    fireRate: 1,
    bulletSpeed: 1,
    damage: 1,
  };
  playerRig.position.set(0, -0.1, playerZ);
  playerRig.rotation.set(0,0,0);
  camera.position.x=0;camera.lookAt(0,1.2,-15);
  playerRig.visible = true;
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
  $("#skipDraft").onclick=finishDraft;
  $("#haptics").checked=saved.get("mr-haptics","1")==="1";
  $("#haptics").onchange=e=>saved.set("mr-haptics",e.target.checked?"1":"0");
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
    Math.min(devicePixelRatio || 1, lowFps > 0 ? 1 : 1.35),
  );
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
function frame(now) {
  requestAnimationFrame(frame);
  const elapsedFrame = now - lastFrame,
    dt = Math.min(0.04, Math.max(0, elapsedFrame || 16) / 1000);
  lastFrame = now;
  if (state.mode === "playing" && !testFrozen) updateGame(dt);
  else if (playerRig) {
    playerRig.position.y = -0.1 + Math.sin(now * 0.0011) * 0.012;
    if(state.mode === "menu")updateDecor(dt * 0.18);
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
  renderer.render(scene, camera);
  camera.position.x = baseX;
  camera.position.y = baseY;
  camera.quaternion.copy(cameraBaseQ);
  if (now - fpsT > 2500) {
    const fps = (frameCount * 1000) / (now - fpsT);
    if (fps < 39) {
      lowFps++;
      if (lowFps >= 2)
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1));
    } else lowFps = Math.max(0, lowFps - 1);
    fpsT = now;
    frameCount = 0;
  }
  frameCount++;
}
addEventListener("resize", resize, { passive: true });
document.addEventListener("contextmenu", (e) => e.preventDefault());
init();
if ("serviceWorker" in navigator && location.protocol.startsWith("http"))
  addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(() => {}),
  );
if (new URLSearchParams(location.search).has("test"))
  window.__MR_TEST__ = {
    silence: () => audio.pause(),
    systems:()=>run.snapshot(),
    recruit:role=>run.recruit(role),
    promote:role=>run.promote(role),
    hurtMember:(id,n)=>run.hurtMember(run.team.find(m=>m.id===id),n),
    equipPet:kind=>run.equipPet(kind),
    armor:kind=>run.activateArmor(kind),
    affix:(id,replace)=>run.selectAffix(id,replace),
    draft:()=>openDraft(),
    choose:chooseAffix,
    roadReward:spawnRoadReward,
    runModel:()=>run,
    combatStats,
    project(x,y,z){const p=new THREE.Vector3(x,y,z).project(camera);return {x:(p.x+1)*W/2,y:(1-p.y)*H/2};},
    artStatus:()=>({errors:assetErrors,loaded:Object.values(art).every(t=>!!t.image?.width)}),
    roadOffset:()=>roadTexture.offset.y,
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
    freeze(value = true) {
      testFrozen = value;
    },
    scene: () => scene,
    aim: aimTarget,
    charge: addHeat,
    effects: () => ({
      active: state.effects.filter((p) => p.parent === scene).length,
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
          weaponInfo[state.weapon].interval /
          combatStats().fireRate /
          (state.overdrive > 0 ? 1.5 : 1),
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
