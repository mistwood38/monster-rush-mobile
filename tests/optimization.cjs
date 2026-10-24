const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { open } = require('./horde-harness.cjs');
const dir = path.resolve(__dirname, '../test-results/optimization'); fs.mkdirSync(dir,{recursive:true});
(async()=>{
 const h = await open(); const results=[];
 async function reset(){await h.page.evaluate(async()=>{const t=__MR_TEST__; await t.start();await t.silence();t.freeze();t.configure({spawnTimer:999,gateTimer:999,crateTimer:999,nextBoss:9999,shootTimer:999}); t.runModel().eventTimer=t.runModel().nextDraft=9999;});}
 try {
  await reset();
  let r=await h.page.evaluate(()=>{const t=__MR_TEST__;t.previewGates(1.2); t.updateGatesCrates(.04);const waiting=t.supply().gates.every(g=>!g.resolved); t.forcePlayerX(-2.45);t.updateGatesCrates(.1);t.forcePlayerX(2.45);t.updateGatesCrates(.1);return {waiting,team:t.systems().team.length,damage:t.state().stats.damage,resolved:t.supply().gates.every(g=>g.resolved)};});
  assert.ok(r.waiting&&r.resolved);assert.equal(r.team,1);assert.equal(r.damage,1);results.push({name:'Late sidestep retains exactly one gate choice',...r});
  await reset();
  r=await h.page.evaluate(()=>{const t=__MR_TEST__;t.previewGates(1.2);t.updateGatesCrates(1);t.forcePlayerX(-2.45);t.updateGatesCrates(.01);return {team:t.systems().team.length,resolved:t.supply().gates.every(g=>g.resolved)};});
  assert.equal(r.team,0);assert.ok(r.resolved);results.push({name:'Passed gate cannot be claimed later',...r});
  await reset();
  r=await h.page.evaluate(()=>{const t=__MR_TEST__; t.collectReward({type:'recruit',role:'heavy'}); return t.systems().team[0].role;});assert.equal(r,'heavy');results.push({name:'Recruitment honors profession',role:r});
  await reset();
  r=await h.page.evaluate(()=>{const t=__MR_TEST__;t.configure({time:240});for(let i=0;i<320;i++)t.spawnEnemy(['grunt','runner','heavy','charger','ranged','elite'][i%6],(i%10-4.5),-3-Math.floor(i/10)*1.7);const ids=t.enemyList().map(e=>e.uid), hp=t.enemyList().map(e=>e.hp);const tiers=[]; for(const q of [0,1,2,0]){t.setQuality(q,true);t.renderFrame();tiers.push({q,...t.hordeReport().models,triangles:t.metrics().triangles});} return {tiers,idsRetained:t.enemyList().every((e,i)=>e.uid===ids[i]&&e.hp===hp[i]),model:t.modelAudit()};});
  assert.ok(r.idsRetained);for(const q of r.tiers)assert.equal(q.instances,320);assert.ok(r.tiers[2].far>r.tiers[0].far);assert.ok(r.tiers[2].triangles<r.tiers[0].triangles);assert.ok(r.model.rigs[0].occlusionCue);assert.ok(r.model.batches.every(b=>b.finite));results.push({name:'LOD reduces geometry without changing enemies, HP or Boss detail',...r});
  await reset();
  r=await h.page.evaluate(()=>{const t=__MR_TEST__; t.configure({time:240});for(let i=0;i<24;i++)t.spawnEnemy('ranged',(i%8-3.5),-15);const attackers=t.enemyList();for(let step=0;step<20;step++){for(const e of attackers)t.spawnEnemyShot(e);t.configure({time:240+step*.36});}const shots=t.hostileShots();const before=shots.length;const warn=shots.map(s=>s.warningAt);t.updateGatesCrates(.01);return {count:shots.length,before,earliest:Math.min(...warn),latest:Math.max(...warn),alive:t.state().enemies};});
  assert.ok(r.count<=9&&r.count>1);assert.equal(r.alive,24);assert.ok(r.latest-r.earliest>1);results.push({name:'Ranged volleys are spaced, not deleted or shot simultaneously',...r});
  await reset();
  r=await h.page.evaluate(()=>{const t=__MR_TEST__;t.renderFrame();const cue=t.getPlayer().userData.silhouette;const clear=!cue.visible;const e=t.spawnEnemy('heavy',0,3);t.renderFrame();const occluded=cue.visible;e.z=-20;e.group.position.z=-20;t.renderFrame();return {clear,occluded,clearAgain:!cue.visible,sharedSkeleton:cue.skeleton===t.getPlayer().userData.body.skeleton};});
  assert.ok(r.clear&&r.occluded&&r.clearAgain&&r.sharedSkeleton);results.push({name:'Hero silhouette only activates near occluders and follows the same skeleton',...r});
  await reset();
  r=await h.page.evaluate(()=>{const t=__MR_TEST__;t.spawnEnemy('heavy',0,3);t.armor('thunder');t.step(.025);t.renderFrame();const cues=[];t.scene().traverse(o=>{if(o.userData.silhouette)cues.push({key:o.userData.actor.key,visible:o.userData.silhouette.visible});});return cues;});
  assert.equal(r.find(r=>r.key==='rig/hero').visible,false);assert.equal(r.find(r=>r.key==='rig/armor/thunder').visible,true);results.push({name:'Armor occlusion cue replaces the hidden hero cue',cues:r});
  await reset();
  r=await h.page.evaluate(()=>{const t=__MR_TEST__;const e=t.spawnEnemy('heavy',0,-40);t.renderFrame();const wasFar=e.renderDetail==='far';t.damageEnemy(e,10000);t.step(.6);const n=t.spawnEnemy('heavy',0,-23);return {wasFar,reused:e===n,detail:n.renderDetail};});
  assert.ok(r.wasFar&&r.reused);assert.equal(r.detail,null);results.push({name:'Reused enemies start without stale LOD history',...r});
  assert.deepEqual(h.errors,[]);fs.writeFileSync(path.join(dir,'regressions.json'),JSON.stringify({results,errors:h.errors},null,2));console.log(results.map(r=>r.name));
 }finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
