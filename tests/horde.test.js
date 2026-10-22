import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HORDE_LIMIT,hordeStage,enemyKind,SpatialGrid,qualityProfile} from '../horde.js';
test('0–300 s curve and endless growth are continuous, bounded and contain relief windows',()=>{
 assert.equal(HORDE_LIMIT,320);
 let last=hordeStage(0);for(let t=1;t<=900;t++){const s=hordeStage(t);assert.ok(s.rate>=last.rate);assert.ok(s.hp>=last.hp);assert.ok(s.speed>=last.speed&&s.speed<=1.9);assert.ok(s.target<=306);last=s;}
 assert.ok(hordeStage(34).relief&&!hordeStage(30).relief);assert.ok(hordeStage(600).hp>hordeStage(300).hp);
});
test('mixed packs include flanks, armor cover, fast/ranged/elite roles',()=>{
 assert.equal(enemyKind(90,0,'armor',()=>0),'heavy');assert.equal(enemyKind(90,1,'flank',()=>0),'runner');assert.equal(enemyKind(90,0,'flank',()=>0),'charger');
 const kinds=new Set(Array.from({length:100},(_,i)=>enemyKind(180,i,'line',()=>i/100)));assert.equal(kinds.size,6);
});
test('spatial broadphase never omits a swept collision candidate (500 seeded rays)',()=>{
 let seed=117;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 const es=Array.from({length:320},(_,uid)=>({uid,x:random()*12-6,z:random()*70-60,dead:uid%11===0}));const grid=new SpatialGrid();grid.rebuild(es);let checks=0;
 for(let i=0;i<500;i++){const x=random()*12-6,z=random()*60-55,x2=x+(random()-.5)*3,z2=z-random()*4;const out=grid.query(x,z,x2,z2,1.8);checks+=out.length;for(const e of es)if(!e.dead&&e.x>=Math.min(x,x2)-1.8&&e.x<=Math.max(x,x2)+1.8&&e.z>=Math.min(z,z2)-1.8&&e.z<=Math.max(z,z2)+1.8)assert.ok(out.includes(e));assert.equal(new Set(out).size,out.length);}
 assert.ok(checks<500*320*.3);grid.rebuild([]);assert.equal(grid.query(-10,-90,10,20).length,0);assert.ok(grid.pool.length>0);
});
test('quality tiers only reduce rendering, never simulation or live enemy budget',()=>{for(const i of [0,1,2]){const q=qualityProfile(i);assert.ok(q.dpr<=1.15);assert.ok(q.particles<=64);assert.ok(!('enemyLimit' in q));assert.ok(!('damage' in q));}assert.ok(qualityProfile(2).animationHz<qualityProfile(0).animationHz);});
