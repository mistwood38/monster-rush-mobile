import * as THREE from './vendor/three/three.module.min.js';
import {SpriteStateMachine} from './sprite-state.mjs';
// Foot-anchored atlas renderer. UV transforms never upload a fresh texture per frame.
export class SpriteLibrary {
 static async load(url){
  const response=await fetch(url);if(!response.ok)throw Error('美术清单加载失败');
  const library=new SpriteLibrary(await response.json(),new URL('.',new URL(url,location.href)).href);
  await Promise.all(Object.values(library.data.actors).map(def=>library.texture(def.file)));
  return library;
 }
 constructor(data,base){this.data=data;this.base=base;this.cache=new Map();this.errors=[];this.active=new Set();this.loader=new THREE.TextureLoader();}
 texture(path){
  if(this.cache.has(path))return this.cache.get(path).promise;
  const entry={};entry.promise=new Promise((resolve,reject)=>{
   entry.texture=this.loader.load(this.base+path,t=>{t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;resolve(t);},undefined,e=>{this.errors.push(path);reject(Error('贴图无法读取 '+path));});
  });this.cache.set(path,entry);return entry.promise;
 }
 staticTexture(id){const file=this.data.static[id];if(!file)return null;if(!this.cache.has(file))this.texture(file).catch(()=>{});return this.cache.get(file).texture;}
 actor(key,camera,height=3){
  const def=this.data.actors[key];if(!def)throw Error('未知角色 '+key);
  const root=new THREE.Group(),billboard=new THREE.Group();billboard.quaternion.copy(camera.quaternion);root.add(billboard);
  const map=this.cache.get(def.file).texture.clone();map.generateMipmaps=false;map.minFilter=THREE.LinearFilter;map.magFilter=THREE.LinearFilter;
  const material=new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.035,side:THREE.DoubleSide,depthWrite:true,color:'#ffffff'});
  const width=height*def.aspect;
  const body=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);body.position.set(width*(.5-def.anchor[0]),height*(def.anchor[1]-.5),0);billboard.add(body);
  const initial=def.clips.run?'run':def.clips.move?'move':def.clips.hover?'hover':'idle';
  const machine=new SpriteStateMachine(def.clips,initial);
  const actor={root,body,billboard,material,map,key,machine,frame:-1,time:0,trigger:(state)=>machine.trigger(state),tick:(dt)=>{
   machine.tick(dt*1000);const f=machine.frame();const rect=def.clips[f.state].frames[f.index];
   map.repeat.set(rect[2]/def.size[0],rect[3]/def.size[1]);map.offset.set(rect[0]/def.size[0],1-(rect[1]+rect[3])/def.size[1]);
   actor.time+=dt;actor.frame=f.index;return f;
  }};
  const parts={asset:true,actor,body,kind:key,disposables:[map,material]};
  for(const id of ['gun','head','legL','legR','armL','armR']){parts[id]=new THREE.Group();root.add(parts[id]);}
  parts.gun.position.set(.55,1.25,-.22);root.userData=parts;
  actor.tick(0);this.active.add(actor);return root;
 }
 release(root){const actor=root?.userData?.actor;if(actor)this.active.delete(actor);}
 tick(root,dt){root?.userData?.actor?.tick(dt);}
 trigger(root,state){return root?.userData?.actor?.trigger(state);}
 audit(){return {atlases:Object.keys(this.data.actors).length,active:this.active.size,errors:[...this.errors],loaded:[...this.cache.values()].filter(a=>a.texture.image).length,frames:[...this.active].map(a=>({key:a.key,state:a.machine.state,index:a.frame}))};}
}
