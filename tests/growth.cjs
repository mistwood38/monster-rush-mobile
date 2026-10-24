const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { open } = require('./horde-harness.cjs');
const dir = path.resolve(__dirname, '../test-results/growth'); fs.mkdirSync(dir,{recursive:true});
(async()=>{
 const h=await open(); const results=[];
 async function reset(){await h.page.evaluate(async()=>{const t=__MR_TEST__;await t.start();await t.silence();t.freeze();t.configure({spawnTimer:999,crateTimer:999,nextBoss:9999,shootTimer:999});t.runModel().nextDraft=t.runModel().eventTimer=9999;});}
 try {
  for(const pick of ['rate','pellets']){
   await reset();
   const r=await h.page.evaluate(pick=>{
    const t=__MR_TEST__,seen=new Set(),offers=[];t.fire();const base=t.metrics();t.clearBullets();t.configure({shootTimer:999});
    // Natural gate timer and real movement/pickup, no direct collectReward or previewGate.
    for(let i=0;i<460;i++){
     for(const g of t.supply().gates)if(!seen.has(g.pairId)){
      seen.add(g.pairId);offers.push({pair:g.pairId,time:t.state().time,types:t.supply().gates.filter(o=>o.pairId===g.pairId).map(o=>o.reward.type)});
     }
     const gates=t.supply().gates.filter(g=>!g.resolved);
     const target=gates.find(g=>g.reward.type===pick)||gates.find(g=>['lanes','damage'].includes(g.reward.type))||gates[0];
     if(target)t.setTarget(target.x);
     t.step(.1);
    }
    t.clearBullets();t.fire();return {pick,base,after:t.metrics(),stats:t.state().stats,offers,time:t.state().time};
   },pick);
   const types=new Set(r.offers.slice(0,4).flatMap(o=>o.types));for(const type of ['lanes','pellets','rate','speed','damage'])assert.ok(types.has(type),type);
   if(pick==='rate')assert.ok(r.after.interval<r.base.interval);else assert.ok(r.after.count>r.base.count);
   assert.equal(r.stats[pick==='rate'?'pellets':'fireRate'],1,'other side not claimed');
   results.push({name:'Natural gate delivery affects actual '+pick,...r});
  }
  await reset();
  const rotation=await h.page.evaluate(()=>{const t=__MR_TEST__,rows=[];t.recruit('assault');for(let i=0;i<13;i++){t.configure({gateSequence:i});t.spawnGateEvent();rows.push(t.supply().gates.slice(-2).map(g=>g.reward.type));}return rows;});
  assert.ok(rotation[4].includes('promote'));assert.ok(rotation[8].includes('team'));assert.ok(rotation[12].includes('recruit'));results.push({name:'Squad recruitment, promotion and team buffs remain reachable',rotation});
  await reset();
  const bars=await h.page.evaluate(()=>{const t=__MR_TEST__;t.configure({gateTimer:999});for(let i=0;i<200;i++){const e=t.spawnEnemy('heavy',(i%10-4.5),-3-Math.floor(i/10));e.hp-=1;}const near=t.spawnEnemy('elite',0,1);const rows=[];for(const q of [0,1,2]){t.setQuality(q,true);t.renderFrame();rows.push({q,alive:t.hordeReport().alive,...t.healthBarAudit()});}return {near:near.uid,rows};});
  for(const [i,r]of bars.rows.entries()){assert.equal(r.count,[24,18,12][i]);assert.equal(r.alive,201);assert.ok(r.ids.includes(bars.near));}results.push({name:'Health bars prioritize nearby threats without deleting enemies',...bars});
  await reset();
  const warning=await h.page.evaluate(()=>{const t=__MR_TEST__;t.configure({gateTimer:999});t.spawnBoss();t.step(2.3);const before=document.querySelector('#comboToast').textContent;t.spawnEnemy('grunt',4,5);t.step(.025);return {before,after:document.querySelector('#comboToast').textContent,breached:t.hordeReport().breached};});
  assert.match(warning.before,/巨像锁定/);assert.equal(warning.before,warning.after);assert.equal(warning.breached,1);results.push({name:'A real breach cannot overwrite the Boss dodge warning',...warning});
  assert.deepEqual(h.errors,[]);
  fs.writeFileSync(path.join(dir,'regressions.json'),JSON.stringify({results,errors:h.errors},null,2));console.log(results.map(r=>r.name));
 } finally {await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
