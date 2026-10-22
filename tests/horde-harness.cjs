const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function open(viewport={width:393,height:873},root=path.resolve(__dirname,'..')){
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.ogg':'audio/ogg','.webmanifest':'application/manifest+json'};
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),rel=decodeURIComponent(url.pathname).replace(/^\/monster-rush-mobile\//,'/'),file=path.resolve(root,'.'+(rel.endsWith('/')?rel+'index.html':rel));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-precise-memory-info']});
 const context=await browser.newContext({viewport,isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const base=`http://127.0.0.1:${server.address().port}/monster-rush-mobile/`;await page.goto(base+'?test=1');await page.waitForFunction(()=>!!window.__MR_TEST__,{timeout:60000});await page.evaluate(()=>__MR_TEST__.freeze());await page.locator('#start').click();await page.evaluate(()=>__MR_TEST__.silence());
 return {page,browser,context,errors,base,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}
// Same bounded controller for accelerated and real-time observations; no HP/spawn/damage cheats.
function pilot(t,skill,build,c){
 const s=t.state(),r=t.runModel();
 if(s.mode==='draft'){
  const pref={barrage:['piercing_core','spread_shot','focus_combo','critical_calibration'],element:['chain_lightning','frost_round','explosive_round','scorch_mag'],squad:['squad_command','squad_reload','guardian_line','last_stand'],defense:['armor_training','emergency_repair','counter_pulse','toughness_core']}[build]||[];
  if(skill==='stationary'){document.querySelector('#skipDraft').click();return;}
  const rank=id=>pref.includes(id)?pref.indexOf(id):100;
  t.choose([...r.offers].sort((a,b)=>rank(a)-rank(b))[0]);if(r.pendingReplacement)t.choose([...r.affixes].sort((a,b)=>rank(b.id)-rank(a.id))[0].id);return;
 }
 if(skill==='stationary'||s.mode!=='playing')return;
 if(s.time<(c.next||0))return;c.next=s.time+({novice:1.1,medium:.45,expert:.18}[skill]||.45);
 const supplies=t.supply(),enemies=t.enemyList().filter(e=>!e.dead&&e.z>-12),boss=t.boss();
 const picks=[...supplies.gates,...supplies.crates].filter(p=>!p.resolved&&p.z>-20&&p.z<4);
 const priority=p=>{const k=p.reward?.type;return (build==='squad'&&['recruit','promote','team'].includes(k)?2:0)+(p.system?.kind==='rescue'&&r.team.length<4?3:0)+(p.type==='medkit'&&s.hp<65?3:0)+(p.type&&p.type!=='medkit'?2:0)};
 const pickup=picks.sort((a,b)=>(b.z+priority(b))-(a.z+priority(a)))[0];
 if(skill==='novice'){t.setTarget(pickup&&pickup.z>-8?pickup.x:Math.sin(s.time*.6)*3.8);return;}
 let best=Infinity,lane=s.targetX;
 for(const x of [-4.1,-2.7,-1.35,0,1.35,2.7,4.1]){
  let cost=Math.abs(x-s.playerX)*.35;
  for(const e of enemies){const dz=2.4-e.z,eta=dz/(e.speed*(e.dash>0?1.8:1));if(eta<2.3&&eta>-.4){const ex=e.dash>0?e.targetX:e.x;cost+=(e.type==='elite'?13:8)*Math.exp(-Math.pow((x-ex)/1.2,2))*(2.5-Math.max(0,eta));}}
  if(skill==='expert')for(const shot of t.hostileShots()){const eta=(2.4-shot.z)/Math.max(1,shot.vz);if(eta>0&&eta<1.6){const sx=shot.x+(shot.vx||0)*eta;cost+=12*Math.exp(-Math.pow((x-sx)/(shot.width||.9),2));}}
  if(boss?.phase==='warn'&&Math.abs(x-boss.targetX)<(boss.sweep?3.2:2.2))cost+=40;
  if(pickup)cost+=Math.abs(x-pickup.x)*(pickup.z>-8?2.2:.45);
  else cost+=Math.abs(x-Math.sin(s.time*.5)*3)*.25;
  if(cost<best){best=cost;lane=x;}
 }
 t.setTarget(lane);
}
module.exports={open,pilot};
