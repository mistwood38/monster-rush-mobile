import * as T from './vendor/three/three.module.min.js';
import {mergeGeometries} from './vendor/three/addons/utils/BufferGeometryUtils.js';
import {RoomEnvironment} from './vendor/three/addons/environments/RoomEnvironment.js';
import {artURL} from './rebuild-models.js';

export async function loadWorldTextures(){
 const loader=new T.TextureLoader(),maps={};
 await Promise.all(['asphalt_02','damaged_concrete_floor','rusty_metal_02'].map(async name=>{
  maps[name]={};await Promise.all(['Diffuse','nor_gl','Rough'].map(async key=>{const t=await loader.loadAsync(artURL(`textures/${name}_${key}.jpg`));t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=key==='Diffuse'?T.SRGBColorSpace:T.NoColorSpace;maps[name][key]=t;}));
 }));return maps;
}
// Reusable, metre-scale modules. No illustration or reference image is placed
// behind the game. Every highway/vehicle/building component has depth.
export function buildRebuiltWorld(scene,renderer,camera,maps,bank){
 const root=new T.Group();root.name='Rebuilt elevated highway';scene.add(root);
 let seed=1729;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const solidCache=new Map();const solid=(color,metalness=0,roughness=.75)=>{const k=[color,metalness,roughness].join('/');if(!solidCache.has(k))solidCache.set(k,new T.MeshStandardMaterial({color,metalness,roughness}));return solidCache.get(k);};
 const concrete=solid('#adb3b2'),steel=solid('#60686c',.75,.5),rubber=solid('#15191a'),glass=solid('#253b47',.7,.22),paint=solid('#bdc2b7'),dark=solid('#333d42');
 function pbr(name,repeat){const s=maps[name],m=new T.MeshStandardMaterial({map:s.Diffuse,normalMap:s.nor_gl,roughnessMap:s.Rough,metalness:name.includes('metal')?.65:.03,roughness:1});for(const tex of Object.values(s)){tex.repeat.set(...repeat);tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());}m.normalScale.set(.5,.5);return m;}
 const asphalt=pbr('asphalt_02',[3.2,62]),wall=pbr('damaged_concrete_floor',[2,1]),rust=pbr('rusty_metal_02',[3,1]);
 asphalt.color.set('#7a858c');const buckets=new Map();
 function add(geo,material,position,rotation=[0,0,0],scale=[1,1,1],bucket=buckets){const g=geo.index?geo.toNonIndexed():geo;g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale)));if(!bucket.has(material))bucket.set(material,[]);bucket.get(material).push(g);if(g!==geo)geo.dispose();}
 function box(pos,size,mat=concrete,rot=[0,0,0],bucket=buckets){add(new T.BoxGeometry(...size),mat,pos,rot,[1,1,1],bucket);}
 function flush(bucket,parent){for(const [material,parts]of bucket){const geo=mergeGeometries(parts);if(!geo)throw Error('World module merge failed');const m=new T.Mesh(geo,material);m.receiveShadow=true;parent.add(m);for(const p of parts)p.dispose();}bucket.clear();}
 const road=new T.Mesh(new T.PlaneGeometry(12.4,248),asphalt);road.rotation.x=-Math.PI/2;road.position.set(0,-.12,-100);road.receiveShadow=true;root.add(road);
 box([0,-.7,-100],[14,1.1,248],wall);
 // Lane paint is deliberately worn and broken, not a glowing runway.
 const lanes=new T.Group(),laneParts=new Map();root.add(lanes);for(let z=20;z>-222;z-=7)for(const x of [-2.05,2.05])box([x,-.105,z],[.10,.006,3.3-rnd()*.5],paint,[0,0,0],laneParts);flush(laneParts,lanes);
 for(const side of [-1,1]){
  box([side*6.03,-.08,-100],[.08,.03,248],paint);
  for(let z=18;z>-220;z-=6){
   box([side*6.55,.18,z],[.72,.62,5.85],wall,[0,0,side*.07]);
   box([side*6.65,.79,z],[.16,.12,5.82],rust);
   for(let k=0;k<3;k++)box([side*6.65,.57,z+k*2-2],[.10,.53,.10],steel);
   if(rnd()>.38)box([side*6.15,.32,z+.7],[.024,.13,.34],solid('#d48d43',.15));
  }
  // Underside trusses and piers remain visible through the highway margins.
  for(let z=8;z>-218;z-=22){box([side*4.8,-5,z],[1.4,9,2],wall);box([0,-1.8,z],[13.8,.8,1.6],steel);}
 }
 flush(buckets,root);
 const movers=[];
 function vehicle(x,z,angle){
  // Poly Haven's CC0 1k glTF, with genuine geometry, normal map and PBR maps.
  const g=new T.Group(),model=bank['covered-car'].scene.clone(true),bb=new T.Box3().setFromObject(model),size=bb.getSize(new T.Vector3()),center=bb.getCenter(new T.Vector3()),orientation=new T.Group();
  model.position.x-=center.x;model.position.y-=bb.min.y;model.position.z-=center.z;
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  orientation.add(model);orientation.scale.setScalar(3.65/Math.max(size.x,size.z));if(size.x>size.z)orientation.rotation.y=Math.PI/2;
  g.position.set(x,0,z);g.rotation.y=angle;g.userData.sourceAsset='covered-car.glb';g.add(orientation);root.add(g);movers.push(g);return g;
 }
 const burningCar=vehicle(-4.95,-17,.17,'#626d68');vehicle(5.15,-45,-.24,'#645453');vehicle(-5.2,-81,.08,'#626975');
 const fireUniforms={uTime:{value:0}},fire=new T.Mesh(new T.PlaneGeometry(1.5,2.4),new T.ShaderMaterial({uniforms:fireUniforms,transparent:true,depthWrite:false,side:T.DoubleSide,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec2 vUv;uniform float uTime;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
 void main(){vec2 p=vUv;float n=noise(p*vec2(9.,6.)-vec2(0,uTime*4.));float shape=(1.-p.y)*.52-abs(p.x-.5+sin(p.y*9.-uTime*5.)*.08);float a=smoothstep(-.04,.14,shape-(n-.4)*.17)*smoothstep(0.,.13,p.y);if(a<.01)discard;vec3 col=mix(vec3(3.,.2,.015),vec3(4.,2.1,.5),pow(1.-p.y,2.));gl_FragColor=vec4(col,a*.85);}`}));fire.position.set(0,1.4,-1);burningCar.add(fire);
 const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=128;const sc=smokeCanvas.getContext('2d');for(let i=0;i<20;i++){const x=32+rnd()*64,y=32+rnd()*64,r=15+rnd()*25,g=sc.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(39,43,44,.10)');g.addColorStop(1,'rgba(39,43,44,0)');sc.fillStyle=g;sc.fillRect(0,0,128,128);}const smokeTex=new T.CanvasTexture(smokeCanvas),smoke=[];
 for(let i=0;i<5;i++){const s=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:smokeTex,transparent:true,depthWrite:false,opacity:.6}));burningCar.add(s);smoke.push(s);}
 let elapsed=0;
 const debris=new T.Group();root.add(debris);movers.push(debris);const deb=new Map();
 for(let i=0;i<110;i++){const s=rnd()>.5?1:-1;add(new T.DodecahedronGeometry(.1+rnd()*.26,0),wall,[s*(5.1+rnd()*1),.05,-rnd()*130],[rnd(),rnd(),rnd()],[1.7,.7,1],deb);}
 for(let i=0;i<30;i++)box([(rnd()>.5?1:-1)*(5+rnd()),.16,-rnd()*130],[.5,.15,.05],steel,[0,rnd()*6,.3],deb);flush(deb,debris);
 // One facade atlas, with frames, broken panes, grime and occasional warm rooms.
 const c=document.createElement('canvas');c.width=256;c.height=512;const ctx=c.getContext('2d');ctx.fillStyle='#4c575d';ctx.fillRect(0,0,256,512);
 for(let y=0;y<512;y+=32)for(let x=0;x<256;x+=32){ctx.fillStyle=rnd()>.96?'#967e56':rnd()>.4?'#23343e':'#34454c';ctx.fillRect(x+5,y+4,21,23);ctx.fillStyle='#7a8180';ctx.fillRect(x+4,y+27,23,2);if(rnd()>.75){ctx.fillStyle='#121f27';ctx.fillRect(x+8,y+7,8+rnd()*10,14);}}
 for(let i=0;i<45;i++){ctx.fillStyle='rgba(10,17,22,.17)';ctx.fillRect(rnd()*256,rnd()*512,2+rnd()*5,40+rnd()*80);}
 const facade=new T.CanvasTexture(c);facade.colorSpace=T.SRGBColorSpace;facade.wrapS=facade.wrapT=T.RepeatWrapping;const building=new T.MeshStandardMaterial({map:facade,color:'#a8b9c2',roughness:.8,metalness:.15});
 const city=new T.Group();city.position.y=-5;root.add(city);const cityparts=new Map();
 for(const side of [-1,1])for(let i=0;i<21;i++){
  const x=side*(20+rnd()*25),z=14-i*8-rnd()*5,w=5+rnd()*6,h=9+rnd()*23,d=5+rnd()*5;
  box([x,h/2,z],[w,h,d],building,[0,0,0],cityparts);
  box([x,h+.16,z],[w+.35,.35,d+.35],concrete,[0,0,0],cityparts);
  if(i%3===0){box([x+w*.2,h+1.3,z],[w*.43,2.4,d*.5],dark,[0,0,0],cityparts);box([x,h+4,z],[.07,7,.07],steel,[0,0,0],cityparts);}
  // Recessed structural ribs and irregular broken silhouettes.
  for(const s of [-1,1])box([x+s*w*.4,h/2,z+d/2+.04],[.16,h,.18],concrete,[0,0,0],cityparts);
  if(i%4===0)for(let k=0;k<4;k++)box([x-w*.35+k*w*.23,h+.4+rnd(),z-d*.25],[.22,1+rnd()*2,.3],dark,[0,0,.12],cityparts);
 }
 flush(cityparts,city);
 const sky=document.createElement('canvas');sky.width=8;sky.height=512;const sx=sky.getContext('2d'),grad=sx.createLinearGradient(0,0,0,512);grad.addColorStop(0,'#384e60');grad.addColorStop(.5,'#9faeb4');grad.addColorStop(.79,'#c5c5b6');grad.addColorStop(1,'#e1bc8b');sx.fillStyle=grad;sx.fillRect(0,0,8,512);scene.background=new T.CanvasTexture(sky);scene.background.colorSpace=T.SRGBColorSpace;scene.fog=new T.FogExp2('#83959e',.0085);
 for(const obj of [...scene.children])if(obj.isLight)scene.remove(obj);
 scene.add(new T.HemisphereLight('#b9d9ee','#51473d',2.1));const sun=new T.DirectionalLight('#ffe0ba',3.3);sun.position.set(-12,18,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-15,right:15,top:23,bottom:-17,near:.5,far:60});sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.target.position.set(0,0,-9);scene.add(sun,sun.target);const rim=new T.DirectionalLight('#99c8e7',1.2);rim.position.set(8,6,-14);scene.add(rim);
 const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.38;room.dispose();pmrem.dispose();renderer.toneMappingExposure=1.05;
 camera.position.set(0,10.5,18);camera.lookAt(0,.8,-14);
 return {root,road,sun,update(dt,speed){elapsed+=dt;fireUniforms.uTime.value=elapsed;fire.quaternion.copy(camera.quaternion);for(let i=0;i<smoke.length;i++){const s=smoke[i],age=(elapsed*.28+i/5)%1;s.position.set(age*1.5,1+age*6,-1);s.scale.setScalar(1.5+age*3);s.quaternion.copy(camera.quaternion);s.material.opacity=Math.sin(age*Math.PI)*.75;}lanes.position.z=(lanes.position.z+speed*dt)%7;asphalt.map.offset.y=(asphalt.map.offset.y+speed*dt/4)%1;asphalt.normalMap.offset.copy(asphalt.map.offset);asphalt.roughnessMap.offset.copy(asphalt.map.offset);for(const g of movers){g.position.z+=speed*dt;if(g.position.z>32)g.position.z-=150;}}};
}
