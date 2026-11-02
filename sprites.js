import * as THREE from "./vendor/three/three.module.min.js";

export const art = { ready: false, tex: {}, meta: null, mat: {} };

const qParent = new THREE.Quaternion();
const qCam = new THREE.Quaternion();

export async function loadArt() {
  const meta = await (await fetch("./assets/art/atlas.json")).json();
  art.meta = meta;
  const loader = new THREE.TextureLoader();
  const load = (url) =>
    new Promise((resolve, reject) =>
      loader.load(url, resolve, undefined, reject),
    );
  const [actors, props, fx, backdrop, road] = await Promise.all([
    load("./assets/art/actors.png"),
    load("./assets/art/props.png"),
    load("./assets/art/fx.png"),
    load("./assets/art/backdrop.png"),
    load("./assets/art/road.jpg"),
  ]);
  for (const tex of [actors, props, fx, backdrop, road]) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 4;
  }
  road.wrapS = road.wrapT = THREE.RepeatWrapping;
  road.repeat.set(1, 2.2);
  art.tex = { actors, props, fx, backdrop, road };
  art.mat = {
    actors: new THREE.MeshBasicMaterial({
      map: actors,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.28,
    }),
    props: new THREE.MeshBasicMaterial({
      map: props,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.02,
    }),
    fx: new THREE.MeshBasicMaterial({
      map: fx,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  };
  art.ready = true;
}

function writeFrame(geo, atlas, name) {
  const pack = art.meta[atlas];
  const fr = pack.frames[name];
  const u0 = fr.x / pack.w;
  const u1 = (fr.x + fr.w) / pack.w;
  const vTop = 1 - fr.y / pack.h;
  const vBot = 1 - (fr.y + fr.h) / pack.h;
  const uv = geo.attributes.uv;
  uv.setXY(0, u0, vTop);
  uv.setXY(1, u1, vTop);
  uv.setXY(2, u0, vBot);
  uv.setXY(3, u1, vBot);
  uv.needsUpdate = true;
  return fr;
}

export function applyFrame(mesh, atlas, name) {
  const fr = writeFrame(mesh.geometry, atlas, name);
  const aspect = fr.w / Math.max(1, fr.h);
  mesh.userData.aspect = aspect;
  mesh.userData.frame = name;
  return fr;
}

/** Camera-facing painted card. Bottom sits on the local origin. */
export function painted(atlas, name, height) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const fr = writeFrame(geo, atlas, name);
  const mesh = new THREE.Mesh(geo, art.mat[atlas].clone());
  mesh.material.side = THREE.DoubleSide;
  const aspect = fr.w / Math.max(1, fr.h);
  mesh.scale.set(height * aspect, height, 1);
  mesh.position.y = height * 0.5;
  mesh.userData.aspect = aspect;
  mesh.userData.frame = name;
  mesh.userData.baseHeight = height;
  mesh.onBeforeRender = function (_renderer, _scene, camera) {
    const parent = this.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.getWorldQuaternion(qParent);
      this.quaternion.copy(qParent.invert()).multiply(qCam.copy(camera.quaternion));
    } else this.quaternion.copy(camera.quaternion);
    this.updateMatrix();
    if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    else this.matrixWorld.copy(this.matrix);
  };
  return mesh;
}
