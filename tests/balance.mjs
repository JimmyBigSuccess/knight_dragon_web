// v10.5 combat balance regression: run via node tests/balance.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const base=process.env.GAME_BASE_URL||'http://127.0.0.1:8765/';
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof startRound==='function'&&typeof equipmentSkill==='function');
 const diagnostics=await page.evaluate(()=>{
  s.tutorialDone=true;showPage('home',true);s.level=1;
  const result={};
  // All equipment gets two legal skills with nonnegative AP cost; +9 forge cannot break cooldown floors.
  result.equipment=ARSENAL.map((eq,id)=>({
   name:eq.name,skills:[0,1].map(n=>{const k=equipmentSkill(id,n);return {name:k?.name,cost:k?.cost}}),
   base:equipmentInterval(id),upgraded:(()=>{s.forgeLevels[id]=9;const val=equipmentInterval(id);s.forgeLevels[id]=0;return val})()
  }));
  // Simulate one real attacking skill; prevent render-loop timing contamination by executing all assertions in one browser task.
  s.zone=0;s.round=1;s.hp=s.maxHp;s.ap=60;startRound();phase='battle';paused=false;
  const attackStart={ap:s.ap,hp:enemy.hp,cycle:s.skillCursor[0]};
  useEquipmentSkill(0);
  result.attack={before:attackStart,after:{ap:s.ap,hp:enemy.hp,cycle:s.skillCursor[0]},cost:equipmentSkill(6,0).cost*10,cooldown:skillIntervalRemaining(6)};
  const apBeforeSpam=s.ap,hpBeforeSpam=enemy.hp;
  useEquipmentSkill(0);
  result.spam={apBefore:apBeforeSpam,apAfter:s.ap,hpBefore:hpBeforeSpam,hpAfter:enemy.hp};
  // Insufficient AP cannot consume supplies, move the skill cursor or set cooldown.
  startRound();phase='battle';paused=false;s.ap=0;
  const noApStart={cursor:s.skillCursor[0],readiness:skillUnavailableReason(equipmentSkill(6,s.skillCursor[0]),6)};
  useEquipmentSkill(0);
  result.noAp={...noApStart,ap:s.ap,cursorAfter:s.skillCursor[0],cooldown:skillIntervalRemaining(6)};
  // The shield must cancel a strike during the 650ms perfect window and refund AP after paying the cost.
  startRound();phase='battle';paused=false;s.ap=60;enemyClock=enemyAttackAt-450;
  const beforePerfect={ap:s.ap,guards:s.guardCount,enemyClock,enemyAttackAt};
  useEquipmentSkill(1);
  result.perfect={before:beforePerfect,after:{ap:s.ap,guards:s.guardCount,enemyClock,enemyAttackAt,cycle:s.skillCursor[1]}};
  // Normal early block reduces the attack, without becoming a free perfect block.
  startRound();phase='battle';paused=false;s.ap=60;s.skillCursor[1]=0;const guardCost=equipmentSkill(7,0).cost*10;
  const predicted=Math.ceil(enemy.attack*enemy.intent.mult);
  useEquipmentSkill(1);
  const beforeStrike={hp:s.hp,ap:s.ap,guardUntil,now:performance.now(),predicted};
  enemyStrike(performance.now());
  result.regular={before:beforeStrike,after:{hp:s.hp,ap:s.ap,guards:s.guardCount,guardUntil,enemyClock},cost:guardCost};
  // A shield raised BEFORE the 650ms perfect window must still mitigate at 850ms.
  startRound();phase='battle';paused=false;s.ap=60;s.skillCursor[1]=0;
  const earlyNow=performance.now();
  enemyClock=enemyAttackAt-850;
  const fullDamage=Math.ceil(enemy.attack*enemy.intent.mult);
  const initialGuardCount=s.guardCount,initialHeroHp=s.hp;
  useEquipmentSkill(1);
  const shieldUntil=guardUntil,apAfterGuardCost=s.ap;
  enemyStrike(earlyNow+850);
  result.earlyGuard={
   duration:shieldUntil-earlyNow,damage:initialHeroHp-s.hp,fullDamage,
   apFromBlock:s.ap-apAfterGuardCost,
   guardCountDelta:s.guardCount-initialGuardCount
  };
  // Inspect attack patterns for three chapter bosses and both phases.
  result.bosses=[];
  for(let zone=0;zone<3;zone++){
   s.zone=zone;s.round=6;s.level=zone+1;s.hp=s.maxHp;startRound();
   const first={name:enemy.name,hp:enemy.maxHp,attack:enemy.attack,weak:enemy.weak,expectedWeak:ZONES[zone].weak,attackInterval:enemyAttackAt,intent:enemy.intent.name};
   const attackIntervals=[enemyAttackAt];
   for(let i=0;i<6;i++){planEnemyAttack();attackIntervals.push(enemyAttackAt)}
   enemy.bossPhase=2;enemyPatternIndex=0;planEnemyAttack();
   result.bosses.push({zone,first,attackIntervals,phaseTwoInterval:enemyAttackAt});
  }
  return result;
 });
 for(const item of diagnostics.equipment){
  assert.ok(item.skills.length===2&&item.skills.every(k=>k.name&&Number.isFinite(k.cost)&&k.cost>=0),`Invalid skills on ${item.name}`);
  assert.ok(item.upgraded<=item.base,`Forge upgrade slows equipment ${item.name}`);
  assert.ok(item.upgraded>=550,`Forge cooldown too short on ${item.name}`);
 }
 assert.equal(diagnostics.attack.after.ap,diagnostics.attack.before.ap-diagnostics.attack.cost,'Weapon AP cost matches');
 assert.ok(diagnostics.attack.after.hp<diagnostics.attack.before.hp,'Attack hurts enemy');
 assert.notEqual(diagnostics.attack.after.cycle,diagnostics.attack.before.cycle,'Skill alternates after attacking');
 assert.ok(diagnostics.attack.cooldown>0,'Cooldown applied');
 assert.equal(diagnostics.spam.apAfter,diagnostics.spam.apBefore,'Rapid press cannot spend AP twice');
 assert.equal(diagnostics.spam.hpAfter,diagnostics.spam.hpBefore,'Rapid press cannot hit twice');
 assert.equal(diagnostics.noAp.ap,0,'No-AP attempt spends no AP');
 assert.equal(diagnostics.noAp.cursorAfter,diagnostics.noAp.cursor,'No-AP attempt cannot advance skill');
 assert.equal(diagnostics.noAp.cooldown,0,'No-AP attempt does not start cooldown');
 assert.equal(diagnostics.perfect.after.guards,diagnostics.perfect.before.guards+1,'Perfect guard records progress');
 assert.equal(diagnostics.perfect.after.ap,diagnostics.perfect.before.ap-10+32,'Perfect guard pays AP and refunds exactly');
 assert.equal(diagnostics.perfect.after.enemyClock,0,'Perfect guard cancels incoming strike');
 assert.equal(diagnostics.regular.before.ap,60-diagnostics.regular.cost,'Normal guard pays AP cost');
 const loss=diagnostics.regular.before.hp-diagnostics.regular.after.hp;
 assert.ok(loss>0&&loss<diagnostics.regular.before.predicted,`Normal block reduces damage: ${loss}`);
 assert.ok(Math.abs(diagnostics.earlyGuard.duration-1050)<3,'Early guard protection remains active for about 1.05s');
 assert.ok(diagnostics.earlyGuard.damage>0&&diagnostics.earlyGuard.damage<diagnostics.earlyGuard.fullDamage,
   `850ms early guard must reduce incoming damage: ${JSON.stringify(diagnostics.earlyGuard)}`);
 assert.equal(diagnostics.earlyGuard.guardCountDelta,0,'Early guard must not grant perfect-guard rewards');
 assert.equal(diagnostics.earlyGuard.apFromBlock,12,'Successful ordinary block restores 12 AP without perfect guard');
 for(const b of diagnostics.bosses){
  assert.equal(b.first.weak,b.first.expectedWeak,`Boss ${b.zone+1} should use its chapter elemental weakness`);
  assert.ok(b.first.hp>0&&b.first.attack>0,'Boss health/attack positive');
  assert.ok(b.attackIntervals.every(v=>v>=1550),'Phase 1 telegraph window not too short');
  assert.ok(b.phaseTwoInterval>=1150,'Phase 2 respects minimum telegraph window');
 }
 assert.deepEqual(errors,[],'No JavaScript runtime errors');
 console.log('BALANCE '+JSON.stringify({equipment:diagnostics.equipment,bosses:diagnostics.bosses}));
 console.log('PASS equipment skills, AP, anti-spam, cooldown, insufficient AP, perfect guard, normal block, three boss patterns');
}finally{await context.close();await browser.close()}
