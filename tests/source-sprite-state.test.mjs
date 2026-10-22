import test from 'node:test';
import assert from 'node:assert/strict';
import { SpriteStateMachine } from '../sprite-state.mjs';
const clip=(state,count=3,fps=10,loop=false)=>({frames:Array.from({length:count},(_,i)=>state+i),fps,loop});
const clips={idle:clip('idle',1,1,true),run:clip('run',6,8,true),shoot:clip('shoot'),hit:clip('hit',2),down:clip('down',1,1,false)};
test('run loops and can be interrupted by shot',()=>{
 const m=new SpriteStateMachine(clips);m.setBase('run');m.tick(400); assert.equal(m.frame().state,'run');
 assert.equal(m.trigger('shoot'),true); assert.equal(m.frame().state,'shoot');
 m.tick(100); m.tick(100);m.tick(100);
 assert.equal(m.frame().state,'run');
});
test('hit overrides shooting; shoot cannot interrupt hit',()=>{
 const m=new SpriteStateMachine(clips);m.setBase('run');m.trigger('shoot');m.tick(100);
 assert.equal(m.trigger('hit'),true);assert.equal(m.trigger('shoot'),false);
 m.tick(100);m.tick(100);assert.equal(m.frame().state,'run');
});
test('down locks until reset',()=>{
 const m=new SpriteStateMachine(clips);m.trigger('down');m.tick(500);
 assert.equal(m.trigger('hit'),false);m.setBase('run');m.tick(500);
 assert.equal(m.frame().state,'down');m.reset('idle');assert.equal(m.trigger('shoot'),true);
});
test('boss windup -> attack -> recover -> idle',()=>{
 const boss={idle:clip('idle',1,1,true),windup:clip('windup',2,10),attack:clip('attack',3,10),recover:clip('recover',2,10)};
 const m=new SpriteStateMachine(boss);m.trigger('windup');m.tick(100);m.tick(100);assert.equal(m.state,'attack');
 for(let i=0;i<3;i++)m.tick(100);assert.equal(m.state,'recover');
 for(let i=0;i<2;i++)m.tick(100);assert.equal(m.state,'idle');
});
test('invalid dt rejected',()=>{
 const m=new SpriteStateMachine(clips);assert.throws(()=>m.tick(-1));assert.throws(()=>m.tick(Infinity));
});
