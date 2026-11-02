import * as THREE from "./vendor/three/three.module.min.js";
import { BattleAudio } from "./audio.js";

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
  bossTimer: 78,
  nextBoss: 78,
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
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    const sky = document.createElement("canvas");
    sky.width = 2;
    sky.height = 512;
    const sk = sky.getContext("2d"),
      gradient = sk.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#140e0e");
    gradient.addColorStop(0.38, "#4a241c");
    gradient.addColorStop(0.62, "#c65a32");
    gradient.addColorStop(0.82, "#f0a15a");
    gradient.addColorStop(1, "#6a4034");
    sk.fillStyle = gradient;
    sk.fillRect(0, 0, 2, 512);
    scene.background = new THREE.CanvasTexture(sky);
    scene.background.colorSpace = THREE.SRGBColorSpace;
    scene.fog = new THREE.FogExp2("#5a342c", 0.011);
    camera = new THREE.PerspectiveCamera(
      48,
      innerWidth / innerHeight,
      0.1,
      150,
    );
    camera.position.set(0, 6.05, 12.9);
    camera.lookAt(0, 1.05, -10);
    scene.add(new THREE.HemisphereLight("#ffc7a2", "#2a1612", 0.95));
    const sun = new THREE.DirectionalLight("#ffb06a", 2.65);
    sun.position.set(12, 22, -28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -18;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const rim = new THREE.DirectionalLight("#ffd2b0", 1.15);
    rim.position.set(-4, 8, 18);
    scene.add(rim);
    const roadLight = new THREE.PointLight("#ff6a32", 9, 22, 2);
    roadLight.position.set(0, 3.2, 1.5);
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
  x.fillStyle = "#2c2a28";
  x.fillRect(0, 0, 512, 1024);
  let seed = 911;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 18000; i++) {
    const a = random() * 0.22;
    x.fillStyle = `rgba(${random() > 0.55 ? "90,82,74" : "8,6,5"},${a})`;
    const s = 1 + random() * 6;
    x.fillRect(random() * 512, random() * 1024, s, s * (0.4 + random()));
  }
  const grad = x.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, "#3a342f");
  grad.addColorStop(0.18, "#2a2725");
  grad.addColorStop(0.5, "#242220");
  grad.addColorStop(0.82, "#2a2725");
  grad.addColorStop(1, "#3a342f");
  x.fillStyle = grad;
  x.fillRect(0, 0, 512, 1024);
  x.fillStyle = "#6d6458";
  x.fillRect(0, 0, 28, 1024);
  x.fillRect(484, 0, 28, 1024);
  x.fillStyle = "#c9a15a";
  x.fillRect(22, 0, 4, 1024);
  x.fillRect(486, 0, 4, 1024);
  x.fillStyle = "#d7c48a";
  for (let y = 40; y < 1024; y += 150) {
    x.fillRect(252, y, 8, 72);
  }
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = `rgba(12,8,6,${0.25 + random() * 0.4})`;
    x.lineWidth = 1 + random() * 2.4;
    x.beginPath();
    const xx = 30 + random() * 450,
      yy = random() * 1024;
    x.moveTo(xx, yy);
    x.lineTo(xx + (random() - 0.5) * 40, yy + 30 + random() * 90);
    x.stroke();
  }
  for (let i = 0; i < 26; i++) {
    x.fillStyle = `rgba(18,12,10,${0.18 + random() * 0.28})`;
    x.beginPath();
    x.ellipse(
      40 + random() * 430,
      random() * 1024,
      10 + random() * 36,
      4 + random() * 14,
      random(),
      0,
      Math.PI * 2,
    );
    x.fill();
  }
  for (let i = 0; i < 18; i++) {
    x.fillStyle = `rgba(255,90,30,${0.04 + random() * 0.07})`;
    x.fillRect(random() * 512, random() * 1024, 20 + random() * 80, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 9);
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
function buildWorld() {
  const ground = mesh(
    new THREE.PlaneGeometry(90, 180),
    mat("ash", "#2a221c", 1),
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
      mat("curb" + side, "#5c564c", 0.92),
      scene,
      [side * 6.35, -0.06, -36],
    );
    shoulder.receiveShadow = true;
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
    new THREE.MeshBasicMaterial({ color: "#ffffff" }),
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
      b.style < 0.34 ? "#241c1a" : b.style < 0.67 ? "#322824" : "#1a2228";
    buildings.setColorAt(i, new THREE.Color(bodyColor));
    caps.setColorAt(i, new THREE.Color("#3a302a"));
    for (let w = 0; w < 15; w++) {
      const j = i * 15 + w;
      windows.setColorAt(
        j,
        new THREE.Color(w % 4 === 0 ? "#ff5a1e" : w % 4 === 1 ? "#ffc07a" : "#140e0c"),
      );
      b["window" + w] = {
        id: j,
        x: b.x + mix(-b.wide * 0.34, b.wide * 0.34, (w % 5) / 4),
      };
    }
  }
  worldObjects.instances = { buildings, caps, windows, antennas, dummy };
  updateWorldInstances();
  const rocks = new THREE.InstancedMesh(
    G.cube,
    mat("rockInst", "#ffffff", 0.92, 0.08),
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
    rocks.setColorAt(i, new THREE.Color(i % 2 ? "#4a433c" : "#6a5c50"));
    worldObjects.rocks.push(r);
  }
  worldObjects.rockMesh = rocks;
  updateRockInstances();
  const edge = new THREE.InstancedMesh(
    G.cube,
    mat("edgeLight", "#c98448", 0.5, 0.15, 0.35),
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
    new THREE.CircleGeometry(5.4, 48),
    basic("#ffb15a"),
    scene,
    [18, 13.5, -104],
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
  const ridgeMaterial = mat("mountains", "#2a201c", 1);
  ridgeMaterial.side = THREE.DoubleSide;
  mesh(ridgeGeo, ridgeMaterial, scene);

  const emberGeo = new THREE.BufferGeometry(),
    emberPositions = [];
  for (let i = 0; i < 80; i++)
    emberPositions.push(rand(-40, 40), rand(2, 18), rand(-90, 8));
  emberGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(emberPositions, 3),
  );
  scene.add(
    new THREE.Points(
      emberGeo,
      new THREE.PointsMaterial({
        color: "#ff7a3a",
        size: 0.09,
        transparent: true,
        opacity: 0.45,
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
      mat("lampMetal", "#3a3836", 0.48, 0.62),
      lamp,
      [0, 2.2, 0],
      [1, 4.3, 1],
    );
    mesh(
      G.cube,
      mat("lampArm", "#3a3836", 0.45, 0.55),
      lamp,
      [side === 1 ? -0.6 : 0.6, 4.3, 0],
      [1.3, 0.1, 0.12],
    );
    mesh(
      G.cube,
      mat("lampGlass", "#ffb15a", 0.3, 0.05, 1.6),
      lamp,
      [side === 1 ? -1.15 : 1.15, 4.18, 0],
      [0.34, 0.12, 0.4],
    );
    const bulb = new THREE.PointLight("#ff8a3a", 5, 10, 2);
    bulb.position.set(side === 1 ? -1.15 : 1.15, 3.9, 0);
    lamp.add(bulb);
    compactGroup(lamp, true);
    worldObjects.lamps.push({ group: lamp, z: lamp.position.z });
  }
  buildDressing();
}
function makeSkylineTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#1a100e");
  sky.addColorStop(0.42, "#6a3024");
  sky.addColorStop(0.7, "#e07038");
  sky.addColorStop(1, "#ffb56a");
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  let seed = 77;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  g.fillStyle = "#ff9a4a";
  g.beginPath();
  g.arc(760, 150, 54, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,160,80,0.35)";
  g.beginPath();
  g.arc(760, 150, 110, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 56; i++) {
    const w = 16 + rnd() * 58,
      h = 50 + rnd() * 240,
      x = rnd() * 1024,
      y = 512 - h - 8;
    g.fillStyle = rnd() > 0.5 ? "#161210" : "#241c18";
    g.fillRect(x, y, w, h + 30);
    for (let wy = y + 8; wy < 500; wy += 11)
      for (let wx = x + 4; wx < x + w - 4; wx += 8)
        if (rnd() > 0.62) {
          g.fillStyle = rnd() > 0.55 ? "#ff5a1c" : "#ffd0a0";
          g.globalAlpha = 0.45 + rnd() * 0.55;
          g.fillRect(wx, wy, 2.5, 4);
          g.globalAlpha = 1;
        }
  }
  g.fillStyle = "#ff3a22";
  g.globalAlpha = 0.85;
  g.beginPath();
  g.moveTo(470, 430);
  g.lineTo(512, 250);
  g.lineTo(560, 430);
  g.fill();
  g.beginPath();
  g.moveTo(430, 450);
  g.lineTo(490, 300);
  g.lineTo(545, 455);
  g.fill();
  g.beginPath();
  g.moveTo(500, 450);
  g.lineTo(575, 280);
  g.lineTo(620, 455);
  g.fill();
  g.globalAlpha = 0.55;
  g.fillStyle = "#ffd0c0";
  g.beginPath();
  g.arc(520, 390, 28, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 0.28;
  g.fillStyle = "#2a1814";
  for (let i = 0; i < 10; i++) {
    g.beginPath();
    g.ellipse(rnd() * 1024, 70 + rnd() * 160, 70 + rnd() * 90, 24 + rnd() * 20, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function buildDressing() {
  const skyline = mesh(
    new THREE.PlaneGeometry(168, 62),
    new THREE.MeshBasicMaterial({ map: makeSkylineTexture(), depthWrite: false }),
    scene,
    [0, 18, -112],
  );
  skyline.material.toneMapped = true;
  const barrierMat = mat("barrier", "#6a645c", 0.88, 0.12);
  const stripeMat = mat("barrierStripe", "#d7a24a", 0.6, 0.05, 0.15);
  const barriers = new THREE.InstancedMesh(G.cube, barrierMat, 28);
  const stripes = new THREE.InstancedMesh(G.cube, stripeMat, 28);
  barriers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stripes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  barriers.castShadow = true;
  barriers.receiveShadow = true;
  scene.add(barriers);
  scene.add(stripes);
  worldObjects.barrierMesh = barriers;
  worldObjects.stripeMesh = stripes;
  worldObjects.barriers = [];
  for (let i = 0; i < 28; i++) {
    const side = i % 2 ? 1 : -1;
    worldObjects.barriers.push({
      id: i,
      x: side * 5.85,
      z: 14 - Math.floor(i / 2) * 8.2,
      rot: side * 0.02,
    });
  }
  updateBarrierInstances();
  const steel = mat("wreckSteel", "#3c3834", 0.62, 0.45);
  const rust = mat("wreckRust", "#6a3828", 0.86, 0.18);
  const glass = mat("wreckGlass", "#1a1816", 0.3, 0.4);
  worldObjects.props = [];
  const wrecks = [
    { kind: "truck", x: -6.9, z: 2 },
    { kind: "car", x: 6.9, z: -16 },
    { kind: "truck", x: 7.1, z: -40 },
    { kind: "car", x: -7.0, z: -58 },
    { kind: "car", x: 6.8, z: -76 },
  ];
  for (const spec of wrecks) {
    const g = new THREE.Group();
    if (spec.kind === "truck") {
      addBox(g, [0, 0.7, 0.2], [1.45, 0.85, 3.1], null, steel);
      addBox(g, [0, 1.35, 0.95], [1.35, 0.7, 1.25], null, rust);
      addBox(g, [0, 1.35, 1.15], [1.05, 0.42, 0.08], null, glass);
    } else {
      addBox(g, [0, 0.42, 0], [1.15, 0.42, 2.35], null, steel);
      addBox(g, [0, 0.78, -0.15], [1.05, 0.38, 1.05], null, rust);
      addBox(g, [0, 0.78, 0.15], [0.85, 0.22, 0.06], null, glass);
    }
    for (const [wx, wz] of [
      [-0.48, -0.8],
      [0.48, -0.8],
      [-0.48, 0.85],
      [0.48, 0.85],
    ])
      addBox(g, [wx, 0.18, wz], [0.28, 0.28, 0.28], null, mat("tire", "#1a1816", 0.9, 0.05));
    g.position.set(spec.x, 0, spec.z);
    g.rotation.y = spec.x > 0 ? -0.4 : 0.55;
    scene.add(g);
    worldObjects.props.push({ group: g, z: spec.z, x: spec.x });
  }
  const crateMat = mat("roadCrate", "#6a5438", 0.8, 0.1);
  const barrelMat = mat("barrel", "#8a3a28", 0.55, 0.35);
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const side = i % 2 ? 1 : -1;
    if (i % 2 === 0) {
      addBox(g, [0, 0.28, 0], [0.7, 0.5, 0.55], null, crateMat);
      addBox(g, [0.35, 0.22, 0.2], [0.45, 0.38, 0.4], null, crateMat);
    } else {
      mesh(G.cylinder, barrelMat, g, [0, 0.38, 0], [3.2, 0.7, 3.2]);
      mesh(G.cylinder, barrelMat, g, [0.45, 0.28, 0.1], [2.4, 0.5, 2.4]);
    }
    const z = 4 - i * 14;
    g.position.set(side * 5.15, 0, z);
    scene.add(g);
    worldObjects.props.push({ group: g, z, x: side * 5.15 });
  }
  worldObjects.helis = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    const dark = mat("heliBody", "#2c2e32", 0.45, 0.6);
    const canopy = mat("heliCanopy", "#c46a3a", 0.35, 0.2, 0.25);
    addBox(g, [0, 0, 0], [0.42, 0.36, 1.6], null, dark);
    addBox(g, [0, 0.08, 0.2], [0.36, 0.28, 0.7], null, canopy);
    addBox(g, [0, 0.08, 1.15], [0.08, 0.22, 0.9], null, dark);
    addBox(g, [0.15, 0.08, 1.55], [0.55, 0.06, 0.16], null, dark);
    const rotor = addBox(g, [0, 0.32, 0.05], [2.5, 0.025, 0.1], null, dark);
    g.scale.setScalar(2.3);
    const x = i === 0 ? -16 : 18;
    const z = i === 0 ? -28 : -62;
    g.position.set(x, 9.5 + i, z);
    g.rotation.y = i === 0 ? 0.6 : -0.4;
    scene.add(g);
    worldObjects.helis.push({ group: g, rotor, z, x, y: g.position.y, phase: i });
  }
}
function updateBarrierInstances() {
  const meshA = worldObjects.barrierMesh,
    meshB = worldObjects.stripeMesh;
  if (!meshA) return;
  const d = worldObjects.instances?.dummy || new THREE.Object3D();
  for (const b of worldObjects.barriers) {
    d.position.set(b.x, 0.38, b.z);
    d.rotation.set(0, b.rot, 0);
    d.scale.set(0.55, 0.72, 1.7);
    d.updateMatrix();
    meshA.setMatrixAt(b.id, d.matrix);
    d.position.set(b.x, 0.62, b.z);
    d.scale.set(0.58, 0.1, 1.72);
    d.updateMatrix();
    meshB.setMatrixAt(b.id, d.matrix);
  }
  meshA.instanceMatrix.needsUpdate = true;
  meshB.instanceMatrix.needsUpdate = true;
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
function createSoldier(kind = "player") {
  const root = new THREE.Group(),
    human = kind === "player" || String(kind).startsWith("ally"),
    enemy = !human,
    boss = kind === "boss";
  const palettes = {
    player: ["#2c3138", "#6e624f", "#ff7a2a", "#1c1814"],
    "ally-heavy": ["#2a2624", "#8a5a32", "#ff6a1c", "#141210"],
    "ally-blue": ["#243044", "#9eb4c4", "#3ec6ff", "#101820"],
    "ally-red": ["#3a2428", "#6e3032", "#ff2d3a", "#140c0e"],
    "ally-green": ["#243028", "#4e6a48", "#3ef08a", "#101612"],
    scout: ["#d8d2c6", "#b7b0a4", "#ff2a18", "#5c564e"],
    runner: ["#e6dfd4", "#c9b8b0", "#ff1c14", "#5a3834"],
    heavy: ["#8d939a", "#4e555c", "#ff2c1c", "#23272c"],
    ranged: ["#efe6d8", "#d5c8b8", "#ff3a18", "#6a4038"],
    elite: ["#a0a6ac", "#3a4148", "#ff2418", "#161a1e"],
    boss: ["#e8e2d8", "#f4eee6", "#ff140e", "#6a403c"],
  };
  const [base, armor, accent, secondary] = palettes[kind] || palettes.scout;
  const suit = mat("actorSuit" + kind, base, enemy ? 0.72 : 0.62, enemy ? 0.06 : 0.22),
    plate = mat("actorArmor" + kind, armor, 0.48, enemy ? 0.16 : 0.34),
    dark = mat("actorDark" + kind, enemy ? "#2a2624" : "#161412", 0.7, 0.25),
    trim = mat("actorTrim" + kind, secondary, 0.5, 0.18),
    glow = mat("actorGlow" + kind, accent, 0.28, 0.08, enemy ? 1.45 : 1.05);
  const box = (parent, p, s, m = plate) => {
    const o = mesh(armorGeometry(), m, parent, p, s);
    o.castShadow = !enemy;
    o.receiveShadow = true;
    return o;
  };
  const part = (geometry, parent, p, s, m = plate) => {
    const o = mesh(geometry, m, parent, p, s);
    o.castShadow = !enemy;
    return o;
  };
  const body = part(
    G.body,
    root,
    [0, 1.18, 0],
    [boss ? 1.65 : enemy ? 1.27 : 1.12, 1, boss ? 1.35 : 1],
    suit.clone(),
  );
  if (enemy) {
    body.material.emissive.set(accent);
    body.material.emissiveIntensity = boss ? 0.48 : 0.24;
    body.material.roughness = kind === "heavy" || kind === "elite" ? 0.4 : 0.74;
    body.material.metalness = kind === "heavy" || kind === "elite" ? 0.42 : 0.04;
  }
  const chest = box(
    root,
    [0, 1.39, -0.035],
    [boss ? 1.1 : enemy ? 0.79 : 0.69, 0.52, 0.46],
  );
  chest.rotation.x = -0.06;
  box(root, [0, 0.88, 0], [boss ? 0.9 : 0.55, 0.24, 0.35], dark);
  box(root, [0, 0.96, -0.23], [0.49, 0.09, 0.07], trim);
  if (!enemy) {
    // An angular combat suit, helmet stripe and a compact two-cell power pack.
    box(root, [0, 1.42, -0.29], [0.49, 0.3, 0.08]);
    box(root, [0, 1.55, -0.34], [0.33, 0.055, 0.04], glow);
    box(root, [0, 1.29, 0.3], [0.46, 0.55, 0.23], dark);
    for (const s of [-1, 1]) {
      box(root, [s * 0.155, 1.31, 0.43], [0.12, 0.37, 0.08], plate);
      box(root, [s * 0.155, 1.38, 0.48], [0.075, 0.15, 0.035], glow);
    }
    for (let i = 0; i < 3; i++)
      box(root, [0, 1.13 + i * 0.055, 0.465], [0.1, 0.022, 0.025], trim);
    box(root, [-0.3, 1.15, -0.19], [0.16, 0.22, 0.16], trim);
  } else {
    box(root, [0, 1.37, -0.29], [boss ? 0.71 : 0.51, 0.4, 0.14], trim);
    const reactor = part(
      G.sphere,
      root,
      [0, 1.43, -0.42],
      [boss ? 0.21 : 0.105, boss ? 0.21 : 0.105, 0.075],
      glow,
    );
    if (boss) {
      const ring = part(G.torus, root, [0, 1.43, -0.43], [0.3, 0.3, 0.3], dark);
      for (const s of [-1, 1]) {
        const chimney = box(
          root,
          [s * 0.43, 1.68, 0.22],
          [0.2, 0.63, 0.25],
          dark,
        );
        chimney.rotation.z = s * 0.18;
        box(root, [s * 0.49, 1.98, 0.22], [0.19, 0.12, 0.25], glow);
      }
    }
    for (const s of [-1, 1]) {
      const spine = part(
        G.cone,
        root,
        [s * 0.29, 1.71, 0.2],
        [0.7, kind === "runner" ? 1.8 : 1, 0.8],
        trim,
      );
      spine.rotation.z = -s * 0.55;
    }
  }
  const head = new THREE.Group();
  head.position.set(0, 1.9, enemy ? -0.055 : 0);
  root.add(head);
  if (!enemy) {
    box(head, [0, 0, 0], [0.49, 0.4, 0.46], plate);
    box(head, [0, 0.16, 0.015], [0.42, 0.1, 0.4], suit);
    box(head, [0, 0.213, 0.015], [0.085, 0.018, 0.41], trim);
    box(head, [0, -0.035, -0.244], [0.46, 0.17, 0.04], dark);
    box(head, [0, -0.028, -0.269], [0.38, 0.075, 0.02], glow);
    box(head, [0, -0.17, -0.18], [0.32, 0.12, 0.16], suit);
    for (const s of [-1, 1])
      box(head, [s * 0.263, -0.04, 0], [0.055, 0.17, 0.2], dark);
    box(head, [0, 0.02, 0.243], [0.28, 0.06, 0.025], trim);
  } else {
    part(G.sphere, head, [0, 0, 0], [boss ? 0.39 : 0.32, 0.3, 0.32], plate);
    box(head, [0, -0.17, -0.25], [0.43, 0.16, 0.18], dark);
    for (const s of [-1, 1]) {
      const brow = box(
        head,
        [s * 0.155, 0.025, -0.285],
        [0.25, 0.1, 0.12],
        suit,
      );
      brow.rotation.z = s * 0.22;
      part(
        G.smallSphere,
        head,
        [s * 0.15, -0.025, -0.35],
        [0.068, 0.052, 0.032],
        glow,
      );
      const fang = part(
        G.cone,
        head,
        [s * 0.135, -0.185, -0.37],
        [0.22, 0.34, 0.25],
        mat("ivory", "#fff0c3", 0.65),
      );
      fang.rotation.z = Math.PI;
      const horn = part(
        G.cone,
        head,
        [s * 0.29, 0.26, 0.02],
        [
          0.55,
          boss ? 2.15 : kind === "runner" ? 1.55 : kind === "scout" ? 0.42 : kind === "heavy" || kind === "elite" ? 1.2 : 0.72,
          0.55,
        ],
        boss ? plate : kind === "runner" ? glow : trim,
      );
      horn.rotation.z = -s * 0.42;
    }
    if (kind === "ranged")
      for (const s of [-1, 1])
        part(G.sphere, root, [s * 0.35, 1.54, 0.25], [0.23, 0.3, 0.2], glow);
  }
  const legL = new THREE.Group(),
    legR = new THREE.Group(),
    armL = new THREE.Group(),
    armR = new THREE.Group();
  for (const [s, leg, arm] of [
    [-1, legL, armL],
    [1, legR, armR],
  ]) {
    leg.position.set(s * (boss ? 0.28 : 0.2), 0.83, 0);
    root.add(leg);
    part(G.limb, leg, [0, -0.18, 0], [1.05, 0.64, 1], suit);
    box(leg, [0, -0.3, -0.105], [0.23, 0.18, 0.14]);
    const lower = new THREE.Group();
    lower.position.set(0, -0.38, 0);
    leg.add(lower);
    part(G.smallLimb, lower, [0, -0.14, 0], [1.2, 0.55, 1.15], dark);
    box(lower, [0, -0.15, -0.105], [0.19, 0.22, 0.09], plate);
    box(lower, [0, -0.35, -0.095], [0.28, 0.17, 0.4], dark);
    box(lower, [0, -0.3, -0.23], [0.23, 0.08, 0.1], trim);
    leg.userData.lower = lower;
    arm.position.set(s * (boss ? 0.67 : enemy ? 0.53 : 0.45), 1.51, 0);
    root.add(arm);
    const shoulder = box(arm, [0, -0.03, 0], [boss ? 0.49 : 0.31, 0.23, 0.37]);
    shoulder.rotation.z = -s * 0.18;
    if (enemy) {
      const spike = part(
        G.cone,
        arm,
        [s * 0.12, 0.16, 0.03],
        [0.8, boss ? 1.5 : 0.9, 0.8],
        trim,
      );
      spike.rotation.z = -s * 0.65;
    }
    part(G.smallLimb, arm, [0, -0.24, 0], [enemy ? 1.35 : 1, 0.69, 1.2], suit);
    const fore = new THREE.Group();
    fore.position.set(0, -0.39, 0);
    fore.rotation.x = enemy ? -0.18 : 1.15;
    arm.add(fore);
    box(fore, [0, -0.14, 0], [enemy ? 0.25 : 0.21, 0.28, 0.24], plate);
    box(fore, [0, -0.31, -0.025], [enemy ? 0.23 : 0.17, 0.13, 0.18], dark);
    if (enemy)
      for (let finger = -1; finger <= 1; finger++) {
        const claw = part(
          G.cone,
          fore,
          [finger * 0.07, -0.42, -0.07],
          [0.25, 0.55, 0.28],
          glow,
        );
        claw.rotation.z = Math.PI;
      }
    arm.userData.fore = fore;
  }
  let gun = new THREE.Group();
  gun.position.set(0.63, 1.34, -0.25);
  root.add(gun);
  if (enemy) {
    gun.visible = false;
    if (boss) {
      box(armR, [0, -0.42, -0.23], [0.43, 0.5, 0.67], dark);
      const barrel = part(
        G.cylinder,
        armR,
        [0, -0.42, -0.68],
        [2.6, 0.65, 2.6],
        trim,
      );
      barrel.rotation.x = Math.PI / 2;
      part(G.sphere, armR, [0, -0.42, -1.02], [0.12, 0.12, 0.045], glow);
    }
  } else {
    armL.rotation.set(0.36, 0, -0.22);
    armR.rotation.set(0.5, 0, 0.1);
  }
  let core = null;
  if (!enemy) {
    const coreMat = glow.clone();
    core = box(root, [0, 1.48, 0.52], [0.18, 0.16, 0.045], coreMat);
    box(root, [0, 1.35, 0.52], [0.3, 0.07, 0.04], glow);
    if (kind === "ally-heavy") {
      box(root, [0, 1.22, 0.5], [0.64, 0.4, 0.34], dark);
      box(root, [0.22, 1.58, 0.64], [0.14, 0.1, 0.05], glow);
    }
    if (kind === "ally-blue") {
      box(
        head,
        [0, 0.04, 0.3],
        [0.42, 0.48, 0.1],
        mat("hairWhite", "#f4f1ea", 0.55, 0.02),
      );
      box(root, [0, 1.3, 0.56], [0.14, 0.32, 0.05], glow);
    }
    if (kind === "ally-red") {
      const scarf = mesh(
        G.plane,
        mat("scarf", "#c41628", 0.7, 0.05, 0.25),
        root,
        [0.22, 1.02, 0.44],
        [0.58, 0.98, 1],
      );
      scarf.rotation.x = 0.22;
      scarf.rotation.z = -0.18;
    }
    if (kind === "ally-green") {
      box(head, [0, 0.16, 0.06], [0.64, 0.34, 0.58], dark);
      box(head, [0, 0.02, -0.3], [0.16, 0.05, 0.04], glow);
    }
  } else if (!boss) {
    if (kind === "scout") {
      body.rotation.x = 0.32;
      box(root, [0, 1.12, -0.38], [0.07, 0.46, 0.04], glow);
      box(root, [0.18, 1.38, -0.36], [0.045, 0.24, 0.035], glow);
    }
    if (kind === "runner") {
      const blade = part(
        G.cone,
        root,
        [0.46, 1.22, -0.58],
        [0.5, 1.85, 0.22],
        glow,
      );
      blade.rotation.x = Math.PI / 2.25;
      blade.rotation.z = -0.35;
      const blade2 = part(
        G.cone,
        root,
        [-0.4, 1.28, -0.42],
        [0.36, 1.35, 0.2],
        trim,
      );
      blade2.rotation.x = Math.PI / 2.4;
      blade2.rotation.z = 0.5;
    }
    if (kind === "heavy") {
      box(root, [0, 1.5, -0.42], [0.82, 0.52, 0.16], dark);
      box(root, [0, 1.2, -0.46], [0.52, 0.08, 0.045], glow);
      for (const s of [-1, 1])
        box(root, [s * 0.5, 1.64, 0.02], [0.34, 0.22, 0.44], plate);
    }
    if (kind === "ranged") {
      part(G.sphere, root, [0, 0.98, -0.22], [0.66, 0.58, 0.52], glow);
      part(G.sphere, root, [0, 0.92, 0.28], [0.42, 0.36, 0.34], suit);
    }
    if (kind === "elite") {
      box(root, [0, 1.55, -0.44], [0.95, 0.6, 0.2], dark);
      part(G.sphere, root, [0, 1.5, -0.58], [0.26, 0.26, 0.16], glow);
      for (const s of [-1, 1]) {
        const cannon = part(
          G.cylinder,
          root,
          [s * 0.62, 1.32, -0.45],
          [1.7, 0.9, 1.7],
          dark,
        );
        cannon.rotation.x = Math.PI / 2;
        box(root, [s * 0.52, 1.78, 0.04], [0.36, 0.2, 0.5], plate);
      }
    }
  } else {
    part(G.sphere, root, [0, 1.9, -0.2], [0.46, 0.5, 0.38], glow);
    for (const [x, y, z, s, rz] of [
      [0, 2.45, 0.02, 1.05, 0],
      [-0.62, 2.1, 0.08, 0.78, 0.5],
      [0.66, 2.16, -0.02, 0.82, -0.42],
      [-0.28, 2.2, -0.4, 0.6, 0.22],
      [0.34, 1.95, -0.5, 0.55, -0.3],
      [0.05, 2.7, -0.1, 0.7, 0.08],
    ]) {
      const shard = part(
        G.cone,
        root,
        [x, y, z],
        [s, s * 2.5, s],
        x === 0 ? glow : plate,
      );
      shard.rotation.z = rz;
    }
  }
  for (const group of [head, legL, legR, armL, armR]) compactGroup(group);
  compactGroup(root, true, core ? [body, core] : [body]);
  root.scale.setScalar(boss ? 3.05 : 1);
  if (enemy) root.rotation.y = Math.PI;
  root.userData = {
    kind,
    body,
    head,
    legL,
    legR,
    armL,
    armR,
    gun,
    core,
    scale: root.scale.x,
  };
  return root;
}

function buildGun(type, glowHex) {
  const glowColor =
    glowHex ||
    {
      rifle: "#ff8a3d",
      machine: "#ff6a1a",
      shotgun: "#ff4a28",
      plasma: "#4db7ff",
      laser: "#ff2d3a",
    }[type];
  const g = new THREE.Group(),
    metal = mat("gunMetal" + type + glowColor, "#2a2826", 0.36, 0.72),
    shell = mat(
      "gunShell" + type + glowColor,
      {
        rifle: "#4a463f",
        machine: "#3a342e",
        shotgun: "#4a3028",
        plasma: "#2a3648",
        laser: "#3a2428",
      }[type],
      0.38,
      0.62,
    ),
    glow = mat("gunGlow" + type + glowColor, glowColor, 0.22, 0.2, 1.8),
    dark = mat("gunDark" + type + glowColor, "#141210", 0.48, 0.4);
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
            ? "#8fd4ff"
            : type === "laser"
              ? "#ff5a4a"
              : "#ffd2a4",
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
    color: "#ff8a3d",
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
    color: "#ff6a1a",
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
    color: "#ff4a28",
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
    color: "#4db7ff",
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
    color: "#ff2d3a",
    interval: 0.12,
    damage: 7.2,
    speed: 0,
    count: 1,
    spread: 0,
    kind: "laser",
  },
};
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
      color: "#100c0a",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
    scene,
    [0, -0.08, playerZ],
    [0.7, 0.48, 1],
  );
  playerShadow.rotation.x = -Math.PI / 2;
  buildSquad();
  setWeapon("rifle", true);
}
const squad = [];
function attachSquadGun(rig, type, glowHex) {
  const gun = buildGun(type, glowHex);
  const flash = mesh(
    new THREE.ConeGeometry(0.09, 0.32, 8),
    mat("squadMuzzle" + type + (glowHex || ""), glowHex || weaponInfo[type].color, 0.18, 0.05, 2),
    gun,
    [0, 0, -0.91],
    [0.42, 1, 0.65],
  );
  flash.rotation.x = -Math.PI / 2;
  flash.visible = false;
  rig.userData.gun.add(gun);
  rig.userData.muzzle = flash;
}
function sealSquad(rig) {
  const gun = rig.userData.gun;
  const core = rig.userData.core;
  rig.remove(gun);
  compactGroup(rig, false, core ? [core] : []);
  rig.add(gun);
}
function buildSquad() {
  const specs = [
    { kind: "ally-heavy", ox: -0.82, oz: 0.08, gun: "machine", scale: 0.9 },
    { kind: "ally-blue", ox: -1.42, oz: 0.42, gun: "plasma", scale: 0.74 },
    { kind: "ally-red", ox: 0.82, oz: 0.12, gun: "shotgun", scale: 0.8 },
    { kind: "ally-green", ox: 1.4, oz: 0.48, gun: "rifle", glow: "#3ef08a", scale: 0.72 },
  ];
  for (const spec of specs) {
    const rig = createSoldier(spec.kind);
    sealSquad(rig);
    rig.scale.setScalar(spec.scale);
    attachSquadGun(rig, spec.gun, spec.glow);
    rig.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    scene.add(rig);
    squad.push({ ...spec, rig });
  }
}
function placeSquad(time) {
  if (!playerRig) return;
  const x = playerRig.position.x;
  for (const mate of squad) {
    const px = clamp(x + mate.ox, -5.2, 5.2);
    mate.rig.position.set(
      px,
      -0.1 + Math.sin(time * 8 + mate.ox) * 0.015,
      playerZ + mate.oz,
    );
    if (mate.rig.userData.core)
      mate.rig.userData.core.material.emissiveIntensity =
        0.85 + Math.sin(time * 3 + mate.ox) * 0.18;
  }
  const core = playerRig.userData.core;
  if (core) {
    const tier = Math.max(1, state.weaponLevel || 1);
    core.material.emissiveIntensity =
      (state.overdrive > 0 ? 2.3 : 0.7 + Math.min(1.5, (tier - 1) * 0.18)) +
      Math.sin(time * 4) * 0.1;
  }
}
function labelSprite(lines, color = "#ffb089") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 350;
  const x = c.getContext("2d");
  x.clearRect(0, 0, 512, 350);
  const grad = x.createLinearGradient(0, 0, 0, 350);
  grad.addColorStop(0, "rgba(18,10,8,.9)");
  grad.addColorStop(1, "rgba(18,10,8,.62)");
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
  x.fillStyle = "#fff6ee";
  x.font = '900 86px system-ui,"Noto Sans SC",sans-serif';
  x.fillText(lines.value, 256, 137);
  x.fillStyle = color;
  x.font = '800 42px system-ui,"Noto Sans SC",sans-serif';
  x.fillText(lines.name, 256, 232);
  x.fillStyle = "#f0d2c0";
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
      color: "#3aa0ff",
    },
    {
      type: "pellets",
      amount: 2,
      value: "弹丸 +2",
      name: "齐射强化",
      color: "#ffcc4d",
    },
  ],
  [
    {
      type: "rate",
      amount: 0.25,
      value: "射速 +25%",
      name: "高速供弹",
      color: "#ffb020",
    },
    {
      type: "damage",
      amount: 0.3,
      value: "伤害 +30%",
      name: "穿甲弹芯",
      color: "#ff3b4e",
    },
  ],
  [
    {
      type: "speed",
      amount: 0.25,
      value: "弹速 +25%",
      name: "超导推进",
      color: "#3dff86",
    },
    {
      type: "lanes",
      amount: 2,
      value: "弹道 +2",
      name: "双轨分流",
      color: "#3aa0ff",
    },
  ],
  [
    {
      type: "pellets",
      amount: 4,
      value: "弹丸 +4",
      name: "复式弹链",
      color: "#ffcc4d",
    },
    {
      type: "rate",
      amount: 0.4,
      value: "射速 +40%",
      name: "过载射击",
      color: "#ffb020",
    },
  ],
  [
    {
      type: "damage",
      amount: 0.5,
      value: "伤害 +50%",
      name: "裂甲弹芯",
      color: "#ff3b4e",
    },
    {
      type: "speed",
      amount: 0.35,
      value: "弹速 +35%",
      name: "磁轨加速",
      color: "#3dff86",
    },
  ],
  [
    {
      type: "lanes",
      amount: 3,
      value: "弹道 +3",
      name: "全域覆盖",
      color: "#3aa0ff",
    },
    {
      type: "pellets",
      amount: 5,
      value: "弹丸 +5",
      name: "重装弹匣",
      color: "#ffcc4d",
    },
  ],
];
const chevronTextures = {};
function chevronMaterial(color) {
  if (!chevronTextures[color]) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 384;
    const x = c.getContext("2d");
    x.clearRect(0, 0, 256, 384);
    x.strokeStyle = color;
    x.lineWidth = 22;
    x.lineJoin = "round";
    x.lineCap = "round";
    x.shadowColor = color;
    x.shadowBlur = 18;
    for (let i = 0; i < 3; i++) {
      const y = 64 + i * 112;
      x.beginPath();
      x.moveTo(36, y + 58);
      x.lineTo(128, y);
      x.lineTo(220, y + 58);
      x.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    chevronTextures[color] = tex;
  }
  return new THREE.MeshBasicMaterial({
    map: chevronTextures[color],
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
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
  const frame = mat("gateFrame" + color, "#2a2624", 0.4, 0.65);
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
      opacity: 0.18,
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
  const chevron = mesh(
    new THREE.PlaneGeometry(2.15, 3.1),
    chevronMaterial(color),
    group,
    [0, 0.04, 1.85],
  );
  chevron.rotation.x = -Math.PI / 2;
  chevron.renderOrder = 2;
  const lbl = labelSprite(
    { value: reward.value, name: reward.name, hint: "射击增幅 · 迎面穿越" },
    color,
  );
  group.add(lbl.sprite);
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
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
  x.fillStyle = "rgba(22,14,10,.94)";
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
    mat("crate" + type, "#3a3228", 0.55, 0.45),
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
    mat("crateTop" + type, "#4a4034", 0.5, 0.4),
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
  const pair = gateDefs[state.gateSequence % gateDefs.length];
  const pairId = ++state.gateSequence;
  for (let i = 0; i < 2; i++) {
    buildGate(pair[i], i === 0 ? -2.45 : 2.45, -34);
    state.gates.at(-1).pairId = pairId;
  }
  state.gateTimer = state.time < 30 ? 9.5 : 11;
}

function acquireGate(g) {
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
  navigator.vibrate?.(extra ? 32 : 18);
  burst3D(g.x, 2, playerZ - 0.1, g.reward.color, 32);
  updateWeaponUi();
}
function disposeGroup(g) {
  const sharedMaps = new Set(Object.values(chevronTextures));
  scene.remove(g);
  g.traverse?.((o) => {
    if (o.geometry && !Object.values(G).includes(o.geometry))
      o.geometry.dispose();
    const map = o.material?.map;
    if (map?.image?.tagName === "CANVAS") {
      if (!sharedMaps.has(map)) map.dispose();
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
  g.userData.body?.material?.dispose();
  g.userData.shieldMaterial?.dispose();
}
function spawnEnemy(type = "grunt", x = rand(-4.4, 4.4), z = -46) {
  if (state.threats.length >= 20) return;
  const cfg = {
    grunt: { hp: 26, speed: 5.2, damage: 9, scale: 1, score: 12 },
    runner: { hp: 22, speed: 8.2, damage: 11, scale: 0.85, score: 18 },
    heavy: { hp: 96, speed: 3.7, damage: 16, scale: 1.27, score: 28 },
    ranged: { hp: 38, speed: 3.5, damage: 10, scale: 0.92, score: 22 },
    elite: { hp: 195, speed: 4.4, damage: 20, scale: 1.48, score: 65 },
  }[type] || { hp: 26, speed: 5, damage: 9, scale: 1, score: 12 };
  const group = createSoldier(type === "grunt" ? "scout" : type);
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
    basic(type === "elite" ? "#ff3a2a" : "#ff5a42", 0.96),
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
    Math.max(0, 100 - state.effects.filter((p) => !p.userData.warning).length),
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
  const flashes = [muzzle, ...squad.map((mate) => mate.rig.userData.muzzle)];
  for (const current of flashes) {
    if (!current) continue;
    current.visible = true;
    current.scale.y = rand(0.65, 1.5);
    setTimeout(() => {
      current.visible = false;
    }, 55);
  }
}
function acquireBullet() {
  let b = state.bullets.find((x) => !x.active);
  if (!b) {
    if (state.bullets.length >= 260) return null;
    const group = new THREE.Group(),
      core = mesh(
        G.smallSphere,
        mat("bulletCore", "#d7ffff", 0.2, 0.05, 2),
        group,
        [0, 0, 0],
        [0.08, 0.08, 0.2],
      ),
      tail = mesh(
        G.smallSphere,
        basic("#60eff0", 0.72),
        group,
        [0, 0, 0.18],
        [0.05, 0.05, 0.2],
      );
    scene.add(group);
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
function releaseBullet(b) {
  b.active = false;
  b.group.visible = false;
}
function createShot(type, target = aimTarget()) {
  const info = weaponInfo[type],
    stats = state.stats,
    lanes = stats.lanes;
  const pellets = (type === "shotgun" ? info.count : 1) + stats.pellets - 1;
  const muzzleX = state.playerX + 0.63,
    originZ = playerZ - 1.16;
  const baseAngle = Math.atan2(
    target.x - muzzleX,
    Math.max(2, originZ - target.z),
  );
  let emitted = 0;
  for (let lane = 0; lane < lanes; lane++)
    for (let p = 0; p < pellets && emitted < 60; p++) {
      const b = acquireBullet();
      if (!b) return;
      const spread = type === "shotgun" ? (p - (pellets - 1) / 2) * 0.065 : 0;
      const angle = baseAngle + spread,
        speed = info.speed * stats.bulletSpeed;
      b.kind = info.kind;
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
        type === "plasma" ? 0.32 : type === "shotgun" ? 0.14 : 0.055,
        type === "plasma" ? 0.32 : type === "shotgun" ? 0.07 : 0.055,
        type === "plasma" ? 0.32 : type === "shotgun" ? 0.42 : 0.28,
      );
      b.tail.scale.set(
        type === "plasma" ? 0.16 : type === "shotgun" ? 0.1 : 0.035,
        type === "plasma" ? 0.16 : type === "shotgun" ? 0.045 : 0.035,
        type === "plasma" ? 0.7 : type === "shotgun" ? 0.85 : 0.62,
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
  const charge = Math.min(16, g.charge + amount);
  if (charge === g.charge) return;
  g.charge = charge;
  updateGateLabel(g);
  g.scan.material.opacity = 0.95;
}

function doLaser() {
  const s = state.stats,
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
      const outer = mesh(geometry, basic("#ff2a2a", 0.55, false), ray),
        inner = mesh(geometry, basic("#fff2e4", 0.95, false), ray);
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
  x.fillStyle = "rgba(18,10,8,.9)";
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
  x.fillStyle = "#fff6ee";
  x.font = '900 86px system-ui,"Noto Sans SC"';
  x.fillText(g.reward.value, 256, 137);
  x.fillStyle = co;
  x.font = '800 42px system-ui,"Noto Sans SC"';
  x.fillText(g.reward.name, 256, 232);
  x.fillStyle = "#f0d2c0";
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
    state.stats.fireRate /
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
    burst3D(target.x, 1.3, target.z, "#ff7a32", 16);
    burst3D(target.x, 1.5, target.z, weaponInfo.plasma.color, 10);
    audio.explosion();
    state.shake = Math.max(state.shake, 0.15);
  } else if (isBoss) damageBoss(damage);
  else damageEnemy(target, damage, false);
  releaseBullet(b);
  return true;
}

function damageEnemy(e, dmg, heavy) {
  if (e.dead) return;
  e.hp -= dmg;
  e.stun = 0.11;
  e.flash = 0.09;
  e.group.userData.body.material.emissive.set("#ffffff");
  e.group.userData.body.material.emissiveIntensity = 0.55;
  createDamageSprite(
    Math.max(1, Math.round(dmg)),
    heavy ? "#ffb068" : "#ffd8cc",
    e.x,
    e.z,
    2.15 * e.group.scale.x,
  );
  burst3D(e.x, 1.05, e.z, heavy ? "#ff6a22" : "#ff3a32", heavy ? 10 : 5);
  audio.impact(heavy);
  state.lastHit = state.time;
  state.combo = Math.min(99, state.combo + 1);
  if (e.hp <= 0) {
    e.dead = 0.48;
    e.group.userData.dead = true;
    state.kills++;
    state.score += e.score;
    addHeat(e.type === "elite" ? 3 : 1);
    state.combo++;
    audio.impact(e.type === "elite" || e.type === "heavy");
    burst3D(
      e.x,
      1,
      e.z,
      e.type === "elite" ? "#ff2418" : "#e8d8cc",
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
function damageBoss(dmg) {
  const b = state.boss;
  if (!b || b.dead) return;
  if (b.shield > 0) {
    if (state.time - (b.lastShieldHit || -1) > 0.18) {
      b.lastShieldHit = state.time;
      createDamageSprite("护盾", "#9aeaff", b.x, b.z, 4.2);
      burst3D(b.x, 3, b.z, "#7ecbff", 6);
    }
    return;
  }
  const boundary = b.armorPhase < 2 ? (b.maxHp * (2 - b.armorPhase)) / 3 : 0;
  const previousHp = b.hp;
  b.hp = Math.max(boundary, b.hp - dmg);
  b.flash = 0.1;
  createDamageSprite(Math.round(previousHp - b.hp), "#ffd0b0", b.x, b.z, 4);
  burst3D(b.x, 2.3, b.z, "#ff4a32", 6);
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
    burst3D(b.x, 2, b.z, "#ff3a28", 28);
    audio.setBoss(false);
  }
}

function spawnEnemyShot(enemy) {
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
    vx: (state.playerX - start.x) * 0.28,
    vz: 8.5,
    life: 3,
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
  const hp = 650 + Math.min(350, state.time * 2);
  const shieldMaterial = new THREE.MeshBasicMaterial({
    color: "#3ec4ff",
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shieldMesh = mesh(
    new THREE.SphereGeometry(1.05, 18, 14),
    shieldMaterial,
    group,
    [0, 1.25, 0],
    [1.2, 1.45, 1.05],
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
  navigator.vibrate?.([40, 30, 70]);
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
      r < 0.22 ? "runner" : r < 0.46 ? "heavy" : r < 0.62 ? "ranged" : "grunt";
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
              : "grunt";
  spawnEnemy(type, rand(-5.1, 5.1), -44 - rand(0, 12));
}
function spawnInterval(t) {
  const base =
    t < 15
      ? 1.65
      : t < 40
        ? 1.1
        : t < 70
          ? 0.83
          : t < 90
            ? 0.92
            : Math.max(0.42, 0.78 - (t - 90) * 0.0018);
  return t % 24 >= 20 ? base * 3.8 : base;
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
    burst3D(state.playerX, 1, playerZ, "#ff8a3a", 24);
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
    state.nextBoss += 88;
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
    e.flash = Math.max(0, (e.flash || 0) - dt);
    e.group.userData.body.material.emissiveIntensity = e.flash > 0 ? 0.95 : 0.26;
    e.phase += dt;
    const dz = playerZ - e.z,
      dist = Math.abs(dz);
    if (e.type === "runner") {
      if (e.charge > 0) {
        e.charge -= dt;
        e.x = mix(e.x, e.targetX, Math.min(1, dt * 4));
        e.z += e.speed * 2.15 * dt;
      } else if (e.charge === 0 && dist < 29) {
        e.charge = -1.1;
        e.targetX = clamp(
          state.playerX + rand(-1.1, 1.1),
          -PLAYER_LIMIT,
          PLAYER_LIMIT,
        );
      } else if (e.charge < 0) {
        e.charge += dt;
        if (e.charge >= 0) {
          e.charge = 0.62;
          const ring = mesh(
            new THREE.RingGeometry(0.2, 0.34, 24),
            new THREE.MeshBasicMaterial({
              color: "#ff634f",
              transparent: true,
              opacity: 0.8,
              side: THREE.DoubleSide,
            }),
            scene,
            [state.playerX, 0.02, playerZ],
          );
          ring.rotation.x = -Math.PI / 2;
          ring.userData.life = 0.52;
          ring.userData.warning = true;
          state.effects.push(ring);
        }
      } else {
        e.x = mix(e.x, state.playerX, dt * 0.55);
        e.z += e.speed * dt;
      }
    } else if (e.type === "ranged") {
      e.x = mix(e.x, state.playerX + Math.sin(e.phase) * 1.4, dt * 0.28);
      if (dist > 16) e.z += e.speed * dt;
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
      e.z += e.speed * dt;
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
    if (e.z > playerZ + 8) {
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
  b.shieldMesh.material.opacity = 0.16 + Math.sin(b.move * 8) * 0.06;
  $("#bossHud").classList.toggle("shielded", b.shield > 0);
  $("#bossLabel").textContent = b.shield > 0 ? "巨像 · 护盾" : "灾厄巨像";
  b.flash = Math.max(0, b.flash - dt);
  b.group.userData.body.material.emissive.set(b.flash > 0 ? "#fff4e8" : "#ff1c12");
  b.group.userData.body.material.emissiveIntensity = b.flash > 0 ? 1 : 0.46;
  b.move += dt;
  b.x = Math.sin(b.move * 0.45) * 3.25;
  b.z = mix(b.z, -18, Math.min(1, dt * 0.5));
  b.group.position.set(b.x, -0.12 + Math.sin(b.move * 1.6) * 0.04, b.z);
  b.group.rotation.y = Math.PI + Math.sin(b.move * 0.4) * 0.12;
  b.group.userData.legL.rotation.x = Math.sin(b.move * 3) * 0.08;
  b.attack -= dt;
  if (b.attack <= 0 && b.phase === "idle") {
    b.phase = "warn";
    b.warning = 0.85;
    b.attack = 3.2;
    const target = clamp(state.playerX, -4.7, 4.7);
    b.targetX = target;
    const warn = mesh(
      new THREE.PlaneGeometry(2.8, 17),
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
    warn.userData.life = 0.85;
    state.effects.push(warn);
    b.warnMesh = warn;
    audio.bossAlert();
    navigator.vibrate?.(22);
  }
  if (b.phase === "warn") {
    b.warning -= dt;
    if (b.warnMesh)
      b.warnMesh.material.opacity = 0.15 + Math.sin(state.time * 35) * 0.12;
    if (b.warning <= 0) {
      b.phase = "idle";
      b.warnMesh?.parent?.remove(b.warnMesh);
      b.warnMesh = null;
      for (let i = -1; i <= 1; i++) spawnBossShot(b, i);
      state.shake = 0.12;
    }
  }
  if (b.z > playerZ - 3.8 && Math.abs(b.x - state.playerX) < 1.4)
    hurtPlayer(24, 1.1);
  $("#bossBar").style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
}
function spawnBossShot(b, i) {
  const x = b.x + i * 0.65,
    z = b.z + 1,
    targetX = clamp(b.targetX + i * 0.7, -5.3, 5.3),
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
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.life -= dt;
    s.mesh.position.set(s.x, s.y, s.z);
    s.mesh.rotation.x += dt * 4;
    if (
      Math.abs(s.z - playerZ) < 0.65 &&
      Math.abs(s.x - state.playerX) < 0.72
    ) {
      hurtPlayer(s.damage, 0.8);
      burst3D(s.x, 0.8, s.z, "#ff745b", 9);
      scene.remove(s.mesh);
      state.enemyShots.splice(i, 1);
      continue;
    }
    if (s.life <= 0 || s.z > playerZ + 1) {
      scene.remove(s.mesh);
      state.enemyShots.splice(i, 1);
    }
  }
}
function hurtPlayer(amount, cooldown) {
  if (state.invuln > 0 || state.mode !== "playing") return;
  state.hp = Math.max(0, state.hp - amount);
  app.classList.remove("hurt");
  void app.offsetWidth;
  app.classList.add("hurt");
  state.invuln = cooldown;
  state.shake = Math.max(state.shake, 0.17);
  audio.impact(true);
  navigator.vibrate?.(26);
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
    c.z += worldSpeed() * dt;
    c.group.position.z = c.z;
    c.spin += dt;
    c.group.rotation.y = Math.sin(c.spin) * 0.07;
    c.group.position.y = 0.42 + Math.sin(c.spin * 2) * 0.09;
    if (
      Math.abs(c.z - playerZ) < 1.25 &&
      Math.abs(c.x - state.playerX) < 1.35
    ) {
      if (c.type === "medkit") {
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
  if (worldObjects.barriers) {
    for (const b of worldObjects.barriers) {
      b.z += worldSpeed() * dt;
      if (b.z > 16) b.z -= 28 * 4.1;
    }
    updateBarrierInstances();
  }
  for (const p of worldObjects.props || []) {
    p.z += worldSpeed() * dt;
    if (p.z > 16) p.z -= 96;
    p.group.position.z = p.z;
  }
  for (const h of worldObjects.helis || []) {
    h.z += worldSpeed() * dt * 0.35;
    if (h.z > 20) h.z -= 110;
    h.phase += dt;
    h.group.position.z = h.z;
    h.group.position.y = h.y + Math.sin(h.phase * 0.8) * 0.35;
    h.group.position.x = h.x + Math.sin(h.phase * 0.25) * 2.2;
    if (h.rotor) h.rotor.rotation.y += dt * 18;
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
  camera.lookAt(state.playerX * 0.08, 1.05, -10);
  placeSquad(state.time);
  state.shootTimer <= 0 && fireWeapon();
  updateDifficulty(dt);
  moveThreats(dt);
  updateBoss(dt);
  updateShots(dt);
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
      ? "黄昏公路 · 初始接触"
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
    stats = state.stats,
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
  state.nextBoss = 78;
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
    placeSquad(now * 0.001);
    updateDecor(dt * 0.18);
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
          state.stats.fireRate /
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
