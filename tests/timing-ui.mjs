// v10.9 visual timing cues and shield button highlighting in a real browser.
// The attack timer is exercised at exact simulated combat clock positions.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const base=process.env.GAME_BASE_URL||'http://127.0.0.1:8765/';
try{
 for(const viewport of [{width:320,height:640},{width:390,height:844},{width:430,height:932}]){
  const ctx=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:viewport.width===320?'reduce':'no-preference'});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof attackTimingStage==='function'&&typeof refreshAttackTimingUI==='function');
  const values=await page.evaluate(()=>{
   s.tutorialDone=true;
   enterArea(0);
   beginBattleRound();
   paused=false;s.ap=100;s.skillCursor[1]=0;
   globalSkillReadyAt=0;equipmentReadyAt[7]=0;guardCooldown=0;
   enemy.stunned=false;
   const box=document.querySelector('#battle .battle-enemy-strip .threat');
   const shieldCard=document.querySelectorAll('#cards .card')[1];
   const snap=remain=>{
    enemyClock=enemyAttackAt-remain;refreshAttackTimingUI();
    const r=box.getBoundingClientRect();
    return {
     stage:attackTimingStage(),box:box.dataset.state,
     tag:document.getElementById('threatTag').textContent,
     shieldReady:shieldCard.classList.contains('guard-window-ready'),
     shieldPerfect:shieldCard.classList.contains('perfect-window-ready'),
     markerEarly:parseFloat(document.getElementById('guardTimingMark').style.left),
     markerPerfect:parseFloat(document.getElementById('perfectTimingMark').style.left),
     seconds:document.getElementById('threatSeconds').textContent,
     rect:{top:r.top,bottom:r.bottom,height:r.height}
    };
   };
   const preparing=snap(1600),ordinary=snap(900),perfect=snap(500);
   s.skillCursor[1]=1;const rotated=snap(500);
   s.skillCursor[1]=0;s.ap=0;const insufficient=snap(900);
   s.ap=100;paused=true;const pausedState=snap(500);
   paused=false;enemy.stunned=true;const stunned=snap(500);
   enemy.stunned=false;phase='ready';const waiting=snap(500);
   const sc=document.querySelector('#battle .scene').getBoundingClientRect();
   const monsterBottom=sc.top+sc.height*322/380;
   return {preparing,ordinary,perfect,rotated,insufficient,pausedState,stunned,waiting,monsterBottom,sceneBottom:sc.bottom,scrollWidth:document.documentElement.scrollWidth,innerWidth};
  });
  const {preparing,ordinary,perfect,rotated,insufficient,pausedState,stunned,waiting,monsterBottom,sceneBottom}=values;
  assert.equal(preparing.stage,'preparing','Countdown should start in neutral state');
  assert.equal(preparing.shieldReady,false,'Ready button not highlighted too early');
  assert.equal(ordinary.stage,'guard','1.05–0.65s is the ordinary guard zone');
  assert.match(ordinary.tag,/架盾/);
  assert.equal(ordinary.shieldReady,true,'Ready shield button highlighted for ordinary guard');
  assert.equal(ordinary.shieldPerfect,false);
  assert.equal(perfect.stage,'perfect','Last 650ms is perfect guard zone');
  assert.match(perfect.tag,/精準格擋/);
  assert.equal(perfect.shieldPerfect,true,'Ready shield visually highlighted for perfect guard');
  assert.equal(rotated.shieldReady,false,'Do not highlight shield if next skill is bash');
  assert.equal(insufficient.shieldReady,false,'Do not highlight shield without enough AP');
  assert.equal(pausedState.stage,'pause','Paused attack countdown is not actionable');
  assert.equal(pausedState.shieldReady,false);
  assert.equal(stunned.stage,'stun','Stunned enemy has no active guard window');
  assert.equal(stunned.shieldReady,false);
  assert.equal(waiting.stage,'waiting','Ready screen should not suggest guarding');
  assert.ok(ordinary.markerEarly>0&&ordinary.markerEarly<ordinary.markerPerfect&&ordinary.markerPerfect<100,
   'Timing marks are ordered and remain within countdown track');
  assert.ok(ordinary.rect.top>=monsterBottom+2,
   `Countdown below monster in ${viewport.width}px view: ${JSON.stringify(values)}`);
  assert.ok(ordinary.rect.bottom<=sceneBottom+1,'Countdown must stay inside scene');
  assert.ok(values.scrollWidth<=values.innerWidth+4,'No horizontal overflow');
  assert.deepEqual(errors,[],'No runtime browser errors');
  console.log(`PASS v10.9 timing UI ${viewport.width}x${viewport.height}: early, perfect, no AP, skill rotation, pause, stun, readiness and monster overlap`);
  await ctx.close();
 }
}finally{await browser.close()}
