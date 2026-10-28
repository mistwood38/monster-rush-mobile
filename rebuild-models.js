import * as THREE from './vendor/three/three.module.min.js';
import {GLTFLoader} from './vendor/three/addons/loaders/GLTFLoader.js';
import {clone} from './vendor/three/addons/utils/SkeletonUtils.js';
import {CombatModels} from './actors3d.js';
import {enemyDetail,qualityProfile} from './horde.js';
export const artURL=p=>window.__MR_ART_ASSETS__?.[p]||'./assets/rebuild/'+p;
export async function loadRebuiltAssets(){
 const keys=['sentinel','stalker','stalker-lod','revenant','revenant-lod','boss','covered-car',...['rifle','machine','shotgun','plasma','laser'].map(k=>'weapon-'+k)],loader=new GLTFLoader();
 const models=await Promise.all(keys.map(k=>loader.loadAsync(artURL('models/'+k+'.glb'))));return Object.fromEntries(keys.map((k,i)=>[k,models[i]]));
}
// Bake actual source skeleton matrices, including bind/world transforms. Only
// the shared poses are baked; movement, damage and collision stay in game.js.
function palette(gltf){
 const root=clone(gltf.scene);root.updateMatrixWorld(true);let body;root.traverse(o=>{if(o.isSkinnedMesh&&!body)body=o;});
 if(!body)throw Error('Enemy skeleton missing');
 const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3()),scale=2.05/(bounds.max.y-bounds.min.y),normalise=new THREE.Matrix4().makeScale(scale,scale,scale);normalise.setPosition(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
 const bones=body.skeleton.bones.length,frames=24,states=['run','idle','attack','hit','down'],pixels=new Float32Array(bones*16*frames*states.length),mixer=new THREE.AnimationMixer(root),matrix=new THREE.Matrix4(),bone=new THREE.Matrix4(),clips={};
 for(let si=0;si<states.length;si++){
  const name=states[si],clip=gltf.animations.find(a=>a.name===name)||gltf.animations[0];clips[name]={start:si*frames,duration:clip.duration,loop:['run','idle'].includes(name)};mixer.stopAllAction();mixer.clipAction(clip).play();
  for(let f=0;f<frames;f++){
   mixer.setTime(f/frames*clip.duration);root.updateMatrixWorld(true);body.skeleton.update();const pre=normalise.clone().multiply(body.matrixWorld).multiply(body.bindMatrixInverse);
   for(let i=0;i<bones;i++){bone.fromArray(body.skeleton.boneMatrices,i*16);matrix.copy(pre).multiply(bone).multiply(body.bindMatrix);matrix.toArray(pixels,((si*frames+f)*bones+i)*16);}
  }
 }
 const texture=new THREE.DataTexture(pixels,bones*4,frames*5,THREE.RGBAFormat,THREE.FloatType);texture.needsUpdate=true;const geometry=body.geometry.clone();geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,0),3);return {texture,geometry,bones,frames,clips,material:body.material};
}
const skinGLSL=`attribute vec4 skinIndex;attribute vec4 skinWeight;attribute vec4 aMotion;uniform sampler2D uBonePoses;uniform vec2 uPoseSize;varying float vArtHit;
mat4 poseBone(float index){float x=index*4.;float y=(aMotion.x+.5)/uPoseSize.y;return mat4(texture2D(uBonePoses,vec2((x+.5)/uPoseSize.x,y)),texture2D(uBonePoses,vec2((x+1.5)/uPoseSize.x,y)),texture2D(uBonePoses,vec2((x+2.5)/uPoseSize.x,y)),texture2D(uBonePoses,vec2((x+3.5)/uPoseSize.x,y)));}
mat4 artSkin(){return skinWeight.x*poseBone(skinIndex.x)+skinWeight.y*poseBone(skinIndex.y)+skinWeight.z*poseBone(skinIndex.z)+skinWeight.w*poseBone(skinIndex.w);}`;
export class RebuiltCombatModels extends CombatModels{
 constructor(scene,sprites,limit,bank){super(scene,sprites,limit);this.bank=bank;this.palettes={};for(const k of ['stalker','stalker-lod','revenant','revenant-lod'])this.palettes[k]=palette(bank[k]);this.rigs=new Set();}
 gun(type){const root=this.bank['weapon-'+type].scene.clone(true);root.traverse(o=>{if(o.isMesh){o.userData.sharedGeometry=true;o.castShadow=true;}});return root;}
 soldier(role='hero'){
  const root=new THREE.Group(),visual=clone(this.bank.sentinel.scene);root.add(visual);visual.scale.setScalar(1.25);visual.rotation.y=Math.PI;let body;const meshes=[],disposables=[];
  visual.traverse(o=>{if(o.isMesh){o.userData.sharedGeometry=true;o.castShadow=true;o.frustumCulled=false;o.material=o.material.clone();o.userData.artColor=o.material.color.clone();meshes.push(o);disposables.push(o.material);if(o.isSkinnedMesh&&!disposables.includes(o.skeleton))disposables.push(o.skeleton);if(o.isSkinnedMesh&&!body)body=o;}});
  const bones=body.skeleton.bones,hand=bones.find(b=>/hand[_.]?R$/.test(b.name)),gun=new THREE.Group();(hand||root).add(gun);gun.scale.setScalar(hand ? .8 : 1);
  const mixer=new THREE.AnimationMixer(visual),actions={},overlayNames=new Set(['shoot','hit']);
  for(const source of this.bank.sentinel.animations){
   let clip=source;
   if(overlayNames.has(source.name)){
    // Shooting and flinching affect the upper body only. The underlying run
    // clip continues to animate both legs during automatic fire.
    clip=source.clone();clip.tracks=clip.tracks.filter(track=>!/^(hips|thigh|shin|foot|heel|toe)/i.test(track.name));
    THREE.AnimationUtils.makeClipAdditive(clip,0,clip,30);
   }
   actions[source.name]=mixer.clipAction(clip);
  }
  actions.run.play();let elapsed=0;
  const machine={state:'run',elapsed:0,reset(name='run'){mixer.stopAllAction();actions[name]?.reset().setEffectiveWeight(1).play();this.state=name;this.elapsed=elapsed=0;}};
  const q=new THREE.Quaternion(),rq=new THREE.Quaternion();
  const actor={key:role,machine,time:0,frame:0,trigger:name=>{
   if(!actions[name]||(name===machine.state&&elapsed<.14)||(machine.state==='down'&&name!=='down'))return false;
   const previous=machine.state;
   if(overlayNames.has(name)){
    if(overlayNames.has(previous))actions[previous]?.fadeOut(.04);
    else if(previous!=='run'){actions[previous]?.fadeOut(.07);actions.run.reset().fadeIn(.07).play();}
    actions.run.play();
   }else{
    actions[previous]?.fadeOut(.07);
    if(overlayNames.has(previous))actions.run.fadeOut(.07);
   }
   const a=actions[name];a.reset().setEffectiveWeight(1).fadeIn(.07).setLoop(['run','idle'].includes(name)?THREE.LoopRepeat:THREE.LoopOnce,['run','idle'].includes(name)?Infinity:1).play();a.clampWhenFinished=true;machine.state=name;machine.elapsed=elapsed=0;return true;
  },tick:dt=>{
   actor.time+=dt;elapsed+=dt;machine.elapsed=elapsed*1000;
   if(overlayNames.has(machine.state)&&elapsed>actions[machine.state]._clip.duration){actions[machine.state].fadeOut(.07);machine.state='run';machine.elapsed=elapsed=0;}
   else if(!['run','idle','down',...overlayNames].includes(machine.state)&&elapsed>actions[machine.state]._clip.duration)actor.trigger('run');
   mixer.update(dt);visual.updateMatrixWorld(true);
   if(hand){hand.getWorldQuaternion(q);root.getWorldQuaternion(rq);gun.quaternion.copy(q.invert().multiply(rq));gun.rotateY(root.userData.aim||0);}
   for(const mesh of meshes){mesh.material.transparent=body.material.opacity<1;if(mesh!==body){mesh.visible=body.visible;mesh.material.opacity=body.material.opacity;mesh.material.color.copy(mesh.userData.artColor).multiply(body.material.color);}}
  }};
  const chest=bones.find(b=>b.name==='chest'),accent=role==='heavy'?'#ff9a35':role==='guardian'?'#6be9e1':role==='assault'?'#63b8ff':'#ffc17c';
  if(chest){const glow=new THREE.Mesh(new THREE.TorusGeometry(.105,.014,5,3),new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:3,metalness:.5,roughness:.3}));glow.position.set(0,.1,-.23);glow.rotation.z=Math.PI;chest.add(glow);disposables.push(glow.geometry,glow.material);
   if(role==='heavy'||role.startsWith('armor/'))for(const side of [-1,1]){const plate=new THREE.Mesh(new THREE.CapsuleGeometry(.14,.25,4,8),new THREE.MeshStandardMaterial({color:'#363b3c',metalness:.7,roughness:.5}));plate.position.set(side*.32,.2,0);plate.rotation.z=side*.4;chest.add(plate);disposables.push(plate.geometry,plate.material);}}
  const cue=new THREE.MeshBasicMaterial({color:'#7be8ff',transparent:true,opacity:.35,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending});const silhouette=new THREE.SkinnedMesh(body.geometry,cue);silhouette.bind(body.skeleton,body.bindMatrix);silhouette.position.copy(body.position);silhouette.quaternion.copy(body.quaternion);silhouette.scale.copy(body.scale);silhouette.renderOrder=4;silhouette.visible=false;silhouette.userData.sharedGeometry=true;body.parent.add(silhouette);disposables.push(cue);
  root.userData={actor,body,gun,bones,hand,meshes,rig:true,aim:0,silhouette,disposables,sourceAsset:'sentinel.glb'};for(const k of ['head','legL','legR','armL','armR'])root.userData[k]=new THREE.Object3D();root.scale.setScalar(1.23);this.sprites.active.add(actor);this.rigs.add(root);actor.tick(0);return root;
 }
 proxy(kind){
  const root=super.proxy(kind);if(kind!=='boss')return root;const visual=clone(this.bank.boss.scene);root.add(visual);const bounds=new THREE.Box3().setFromObject(visual),center=bounds.getCenter(new THREE.Vector3()),factor=5.75/(bounds.max.y-bounds.min.y);visual.scale.setScalar(factor);visual.position.set(-center.x*factor,-bounds.min.y*factor,-center.z*factor);
  const mixer=new THREE.AnimationMixer(visual),actions={};for(const clip of this.bank.boss.animations)actions[clip.name]=mixer.clipAction(clip);actions.idle.play();let last='idle';const actor=root.userData.actor,oldTick=actor.tick.bind(actor);
  visual.traverse(o=>{if(o.isMesh){o.userData.sharedGeometry=true;o.material=o.material.clone();root.userData.disposables.push(o.material);if(o.isSkinnedMesh)root.userData.disposables.push(o.skeleton);o.castShadow=true;o.frustumCulled=false;}});
  actor.tick=dt=>{oldTick(dt);const state=actor.machine.state,name=state==='down'?'down':['attack','windup'].includes(state)?'attack':state==='hit'?'hit':'idle';if(name!==last){actions[last]?.fadeOut(.12);const a=actions[name];a.reset().fadeIn(.12).setLoop(name==='down'?THREE.LoopOnce:THREE.LoopRepeat,Infinity).play();a.clampWhenFinished=true;last=name;}mixer.update(dt);};root.userData.sourceAsset='boss.glb';return root;
 }
 batch(type,detail='near'){
  const key=type+'/'+detail;if(this.batches.has(key))return this.batches.get(key);const family=(['grunt','runner','ranged'].includes(type)?'stalker':'revenant')+(detail==='far'?'-lod':''),p=this.palettes[family],geometry=p.geometry.clone(),motion=new THREE.InstancedBufferAttribute(new Float32Array(this.limit*4),4);geometry.setAttribute('aMotion',motion);const material=p.material.clone();material.roughness=.75;
  material.onBeforeCompile=shader=>{shader.uniforms.uBonePoses={value:p.texture};shader.uniforms.uPoseSize={value:new THREE.Vector2(p.bones*4,p.frames*5)};shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+skinGLSL).replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nmat4 artBones=artSkin();objectNormal=normalize(mat3(artBones)*objectNormal);').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=(artBones*vec4(transformed,1.)).xyz;vArtHit=aMotion.y;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vArtHit;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(1.,.24,.04)*vArtHit*2.;');};material.customProgramCacheKey=()=> 'source-rig-atlas-v1';const mesh=new THREE.InstancedMesh(geometry,material,this.limit);mesh.count=0;mesh.frustumCulled=false;this.scene.add(mesh);const b={mesh,motion,count:0,type,detail,family};this.batches.set(key,b);return b;
 }
 sync(enemies,boss,time,quality=0){
  for(const b of this.batches.values())b.count=0;
  for(const e of enemies){const type=e.type,b=this.batch(type,e.renderDetail=enemyDetail(e.z,quality,e.renderDetail)),p=this.palettes[b.family],i=b.count++,d=this.dummy;d.position.copy(e.group.position);d.rotation.set(0,0,0);d.scale.copy(e.group.scale);if(type==='heavy')d.scale.x*=1.35;if(type==='runner'){d.scale.y*=.83;d.scale.z*=1.1;}d.updateMatrix();b.mesh.setMatrixAt(i,d.matrix);
   const machine=e.group.userData.actor.machine,state=e.dead?'down':['hit','attack','idle'].includes(machine.state)?machine.state:'run',clip=p.clips[state],phase=clip.loop?((time*(type==='runner'?1.3:1)+(typeof e.phase==='number'?e.phase:0))%clip.duration)/clip.duration:Math.min(.999,machine.elapsed/1000/clip.duration),hz=qualityProfile(quality).animationHz,frame=clip.start+Math.min(p.frames-1,Math.floor(Math.floor(phase*hz)/hz*p.frames));b.motion.setXYZW(i,frame,Math.min(1,(e.flash||0)*9),0,0);this.color.set(e.slowTime>0?'#90bed5':e.burnTime>0?'#e5a07d':'#ffffff');b.mesh.setColorAt(i,this.color);}
  for(const b of this.batches.values()){b.mesh.count=b.count;b.mesh.instanceMatrix.needsUpdate=true;b.motion.needsUpdate=true;if(b.mesh.instanceColor)b.mesh.instanceColor.needsUpdate=true;}
  for(const r of this.rigs){if(!this.sprites.active.has(r.userData.actor)){this.rigs.delete(r);continue;}const {body,meshes,gun}=r.userData;gun.visible=body.visible;for(const m of meshes)if(m!==body)m.visible=body.visible;}
 }
 audit(){return {...super.audit(),technique:'CC0 textured skinned GLB + shared GPU bone-pose atlas',sourceMeshes:4,poseTextures:4};}
}
