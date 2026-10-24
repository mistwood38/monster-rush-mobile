// Isolated paired browser measurement. Never run alongside another browser suite.
const {open}=require('./horde-harness.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../test-results/optimization');fs.mkdirSync(dir,{recursive:true});
async function sample(page){return page.evaluate(async()=>{let last=performance.now();const times=[];for(let i=0;i<35;i++)await new Promise(resolve=>requestAnimationFrame(now=>{if(i>=5)times.push(now-last);last=now;resolve();}));const sorted=[...times].sort((a,b)=>a-b);return {frames:times.length,meanFrameMs:times.reduce((a,b)=>a+b)/times.length,p95FrameMs:sorted[Math.floor(sorted.length*.95)],...__MR_TEST__.metrics(),horde:__MR_TEST__.hordeReport()};});}
async function run(root,label){const h=await open({width:393,height:873},root);const rows=[];try{
 const renderer=await h.page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER);});
 for(const [count,tier]of [[240,0],[320,2]]){
  await h.page.evaluate(async({count,tier})=>{const t=__MR_TEST__;await t.start();await t.silence();t.freeze();t.setQuality(tier,true);t.configure({time:240,spawnTimer:999,gateTimer:999,crateTimer:999,nextBoss:9999,shootTimer:999});t.runModel().eventTimer=t.runModel().nextDraft=9999;for(const role of ['assault','heavy','guard','assault'])t.recruit(role);t.step(.025);for(let i=0;i<count;i++)t.spawnEnemy(['grunt','runner','heavy','charger','ranged','elite'][i%6],(i%10-4.5)*1.05,-3-Math.floor(i/10)*1.7);t.collectReward({type:'lanes',amount:2});t.collectReward({type:'pellets',amount:2});for(let i=0;i<30;i++)t.fire();t.emit(0,1,-6,'#aff',64);t.renderFrame();}, {count,tier});
  const row={requestedEnemies:count,tier,...await sample(h.page)};assert.equal(row.horde.alive,count);rows.push(row);
  await h.page.screenshot({path:path.join(dir,`${label}-${count}-q${tier}-393.png`)});
 }
 if(label==='after'){
  await h.page.setViewportSize({width:360,height:800});await h.page.screenshot({path:path.join(dir,'after-320-q2-360.png')});
  // Explicit occlusion fixture; an enemy overlaps the controlled hero, no painted overlay.
  await h.page.evaluate(()=>{const t=__MR_TEST__;t.setQuality(0,true);const e=t.enemyList().find(e=>e.type==='heavy');e.x=0;e.z=3;e.group.position.set(0,-.1,3);t.renderFrame();});
  await h.page.screenshot({path:path.join(dir,'occlusion-360.png')});
  const layout=await h.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,cue:__MR_TEST__.getPlayer().userData.silhouette?.material.depthFunc}));assert.equal(layout.width,layout.scroll);
 }
 assert.deepEqual(h.errors,[]);return {label,renderer,rows,errors:h.errors};
}finally{await h.close();}}
(async()=>{
 const runs=[];
 if(process.env.OPT_BASELINE_ROOT)runs.push(await run(process.env.OPT_BASELINE_ROOT,'before'));
 runs.push(await run(path.resolve(__dirname,'..'),'after'));
 fs.writeFileSync(path.join(dir,'performance.json'),JSON.stringify({method:'Sequential 393x873 frozen scene: 4 crew, 160 projectiles, 64 requested sparks, 240/320 live enemies, 30 measured rAF intervals after 5 warmup frames. Same tier locked on both revisions. SwiftShader is not Android GPU performance; screenshots are controlled fixtures.',runs},null,2));
 console.log(runs.map(r=>({label:r.label,rows:r.rows.map(s=>({count:s.requestedEnemies,tier:s.tier,triangles:s.triangles,draws:s.drawCalls,mean:s.meanFrameMs,p95:s.p95FrameMs}))})));
})().catch(e=>{console.error(e);process.exitCode=1;});
