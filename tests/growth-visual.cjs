const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {open}=require('./horde-harness.cjs');
const dir=path.resolve(__dirname,'../test-results/growth');fs.mkdirSync(dir,{recursive:true});
async function observe(page){return page.evaluate(async()=>{let last=performance.now();const times=[];for(let i=0;i<30;i++)await new Promise(resolve=>requestAnimationFrame(now=>{if(i>=5)times.push(now-last);last=now;resolve();}));const a=[...times].sort((a,b)=>a-b);return {frames:times.length,meanFrameMs:times.reduce((a,b)=>a+b)/times.length,p95:a[Math.floor(a.length*.95)],metrics:__MR_TEST__.metrics(),horde:__MR_TEST__.hordeReport()};});}
async function run(root,label){const h=await open({width:393,height:873},root);const rows=[];try{
 await h.page.evaluate(()=>{const t=__MR_TEST__;t.configure({time:150,spawnTimer:999,crateTimer:999,gateTimer:999,nextBoss:9999,shootTimer:999});t.runModel().nextDraft=t.runModel().eventTimer=9999;t.setQuality(0,true);for(const role of ['assault','heavy','guard','assault'])t.recruit(role);t.step(.025);for(let i=0;i<200;i++){const e=t.spawnEnemy(['heavy','runner','ranged','elite'][i%4],(i%10-4.5),-4-Math.floor(i/10)*1.2);e.hp*=.7;}t.step(.125);t.renderFrame();});
 const stats=await observe(h.page);assert.equal(stats.horde.alive,200);
 // Read the actual amber instanced bar mesh for the unmodified baseline too.
 const bars=await h.page.evaluate(()=>{const t=__MR_TEST__;let count=null;t.scene().traverse(o=>{if(o.isInstancedMesh&&o.material.color?.getHexString()==='ffc270')count=o.count;});return t.healthBarAudit?.().count??count;});
 assert.notEqual(bars,null);
 rows.push({scenario:'200 damaged enemies, 4 crew, frozen rendering',bars,...stats});
 await h.page.screenshot({path:path.join(dir,`${label}-crowd-393.png`)});
 if(label==='after'){
  await h.page.setViewportSize({width:360,height:800});await h.page.screenshot({path:path.join(dir,'after-crowd-360.png')});
  await h.page.evaluate(async()=>{const t=__MR_TEST__;await t.start();await t.silence();t.freeze();t.setQuality(0,true);t.configure({spawnTimer:999,crateTimer:999,nextBoss:9999,shootTimer:999});t.runModel().eventTimer=t.runModel().nextDraft=9999;t.step(20.15);t.renderFrame();});
  const gates=await h.page.evaluate(()=>__MR_TEST__.supply().gates.filter(g=>!g.resolved).map(g=>g.reward.type));assert.deepEqual(gates,['rate','pellets']);
  await h.page.screenshot({path:path.join(dir,'natural-rate-pellets-360.png')});
  await h.page.setViewportSize({width:393,height:873});await h.page.screenshot({path:path.join(dir,'natural-rate-pellets-393.png')});
  const layout=await h.page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}));assert.equal(layout.w,layout.scroll);
 }
 assert.deepEqual(h.errors,[]);return {label,rows,errors:h.errors};
}finally{await h.close();}}
(async()=>{const runs=[];if(process.env.GROWTH_BASELINE_ROOT)runs.push(await run(process.env.GROWTH_BASELINE_ROOT,'before'));runs.push(await run(path.resolve(__dirname,'..'),'after'));fs.writeFileSync(path.join(dir,'visual-performance.json'),JSON.stringify({note:'Sequential isolated software-WebGL frozen scenes; 25 measured frames after five warmup frames. Controlled captures, not Android FPS or natural survival.',runs},null,2));console.log(runs.map(r=>({label:r.label,bars:r.rows[0].bars,mean:r.rows[0].meanFrameMs})));})().catch(e=>{console.error(e);process.exitCode=1;});
