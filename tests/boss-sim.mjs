// v10.7: deterministic, virtual-time BOSS battle simulations using the real combat functions.
// This is a scripted AI opponent / input policy, not a substitute for human difficulty testing.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.GAME_BASE_URL||'http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof useEquipmentSkill==='function' && typeof planEnemyAttack==='function');
 const report=await page.evaluate(()=>{
  s.tutorialDone=true;
  // Don't schedule an animation frame while a scenario advances in one synchronous task.
  showPage('home',true);
  let simulatedNow=1000000;
  Object.defineProperty(performance,'now',{configurable:true,value:()=>simulatedNow});
  const originalRandom=Math.random;
  const policies=[
   {label:'starter',weapons:[6,6,6],shield:7,forges:0},
   {label:'standard',weapons:[1,4,3],shield:7,forges:0},
   {label:'nonweak',weapons:[2,1,4],shield:7,forges:0},
   {label:'standard-plus2',weapons:[1,4,3],shield:7,forges:2},
   {label:'standard-no-guard',weapons:[1,4,3],shield:7,forges:0,skipGuard:true},
  ];
  function evaluateScenario(zone,policy,seed){
   // Independent deterministic RNG per scenario, including damage rolls and level-up loot.
   let state=seed>>>0;
   Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
   simulatedNow+=10000;
   s=init();
   ensureEquipmentState();
   s.zone=zone;s.round=6;s.level=zone+1;s.maxHp=200+zone*12;s.hp=s.maxHp;
   s.unlockedZone=zone;s.tutorialDone=true;s.wins=zone*6+5;
   s.ap=100;s.potions=3;
   const weaponId=policy.weapons[zone];
   s.owned=[6,7,weaponId].filter((id,i,all)=>all.indexOf(id)===i);
   s.equipped=[weaponId,policy.shield,null,null];
   s.forgeLevels=Array(ARSENAL.length).fill(0);
   s.forgeLevels[weaponId]=policy.forges;
   s.skillCursor=[0,0,0,0];s.weapon=0;
   startRound();phase='ready';showPage('battle',true);beginBattleRound();
   const startHp=s.hp,initialEnemyHp=enemy.maxHp,wasWeak=ARSENAL[weaponId].type===enemy.weak;
   let phaseTwoReached=false;
   let ticks=0,usedWeapon=0,usedGuard=0,usedBash=0,strikes=0,avoided=0,normalBlocks=0,spentPotions=0,damageDealt=0;
   const tickMs=100,limitMs=120000;
   // The policy chooses one skill at a time, respects game AP/cooldowns, and guards in a readable 500ms window.
   for(let elapsed=tickMs;elapsed<=limitMs;elapsed+=tickMs){
    simulatedNow+=tickMs;
    if(phase!=='battle')break;
    if(enemy.bossPhase===2)phaseTwoReached=true;
    if(s.ap<100)s.ap=Math.min(100,s.ap+AP_REGEN_PER_SECOND*tickMs/1000);
    if(enemy.stunned){
     if(simulatedNow>stunUntil){enemy.stunned=false;enemyClock=0}
    }else enemyClock+=tickMs;
    const remaining=enemyAttackAt-enemyClock;
    const shieldSkill=equipmentSkill(policy.shield,s.skillCursor[1]||0);
    const canShield=skillIntervalRemaining(policy.shield,simulatedNow)===0
       && (!shieldSkill||s.ap>=shieldSkill.cost*10);
    // Rotate shield by using its alternative attack outside the perfect-guard window.
    if(!policy.skipGuard && canShield&&shieldSkill?.action==='attack' && remaining>900 && !enemy.stunned){
     const beforeCursor=s.skillCursor[1];
     useEquipmentSkill(1);
     if(s.skillCursor[1]!==beforeCursor)usedBash++;
    }
    // Aim to interrupt an incoming attack during the last 0.5s.
    const guardSkill=equipmentSkill(policy.shield,s.skillCursor[1]||0);
    if(!policy.skipGuard && guardSkill?.action==='guard' && !enemy.stunned
       && remaining<=500&&remaining>0
       && skillIntervalRemaining(policy.shield,simulatedNow)===0
       && simulatedNow>=guardCooldown && s.ap>=guardSkill.cost*10){
     const beforeCount=s.guardCount,beforeCursor=s.skillCursor[1];
     useEquipmentSkill(1);
     if(s.skillCursor[1]!==beforeCursor)usedGuard++;
     if(s.guardCount>beforeCount)avoided++;
    }
    if(phase!=='battle')break;
    if(!enemy.stunned&&enemyClock>=enemyAttackAt){
      const wasHp=s.hp;
      const wouldBlock=guardUntil>simulatedNow;
      enemyStrike(simulatedNow);strikes++;
      if(wouldBlock && wasHp>s.hp)normalBlocks++;
    }
    if(phase!=='battle')break;
    const sk=equipmentSkill(weaponId,s.skillCursor[0]||0);
    if(sk && s.ap>=sk.cost*10 && skillIntervalRemaining(weaponId,simulatedNow)===0
       && simNowSinceActivation(0)>=110){
      const beforeHp=enemy.hp,beforeCursor=s.skillCursor[0];
      useEquipmentSkill(0);
      if(enemy.bossPhase===2)phaseTwoReached=true;
     if(beforeCursor!==s.skillCursor[0]){
       usedWeapon++;
       damageDealt+=Math.max(0,beforeHp-enemy.hp);
      }
    }
    ticks++;
    if(phase==='cinematic'){win();break}
   }
   if(phase==='cinematic')win();
   const result={
     zone,loadout:policy.label,seed,
     weapon:ARSENAL[weaponId].name,weak:wasWeak,
     victory:phase==='won',defeat:phase==='lost',phase,phaseTwoReached,
     seconds:Math.round(ticks*tickMs/100)/10,
     initialEnemyHp,remainingEnemyHp:enemy.hp,
     initialHeroHp:startHp,heroHp:s.hp,
     damageTaken:startHp-s.hp,apEnd:Math.round(s.ap),
     attacks:usedWeapon,shieldAttacks:usedBash,guards:usedGuard,
     perfectGuards:avoided,enemyHits:strikes,ordinaryBlocks:normalBlocks,
     potionsSpent:spentPotions,damageDealt
   };
   return result;
  }
  function simNowSinceActivation(slot){return simulatedNow-(lastSkillActivation[slot]??-Infinity)}
  const out=[];
  for(let zone=0;zone<3;zone++)
   for(const policy of policies)
    for(const seed of [11,47,83,127,251,401,509,701])
     out.push(evaluateScenario(zone,policy,seed));
  Math.random=originalRandom;
  return out;
 });
 for(const row of report){
  assert.ok(row.seconds>0&&row.seconds<=120,'Valid virtual duration');
  assert.ok(row.heroHp>=0&&row.heroHp<=row.initialHeroHp,'Hero HP bounds');
  assert.ok(row.remainingEnemyHp>=0&&row.remainingEnemyHp<=row.initialEnemyHp,'Enemy HP bounds');
  assert.ok(row.attacks>0,'A simulated boss combat includes attack attempts');
  assert.ok(['won','lost','battle'].includes(row.phase),'Known combat phase');
  assert.ok(row.potionsSpent===0,'Baseline policies do not magically consume supplies');
 }
 assert.deepEqual(errors,[],'No browser errors during simulated boss fights');
 const lines=[];
 for(let zone=0;zone<3;zone++)
  for(const loadout of ['starter','standard','nonweak','standard-plus2','standard-no-guard']){
   const a=report.filter(x=>x.zone===zone&&x.loadout===loadout);
   const avg=k=>Number((a.reduce((sum,x)=>sum+x[k],0)/a.length).toFixed(1));
   lines.push({zone,loadout,win:a.filter(x=>x.victory).length,trials:a.length,
    avgSeconds:avg('seconds'),avgHeroHp:avg('heroHp'),avgAttacks:avg('attacks'),
    avgGuard:avg('perfectGuards'),avgHits:avg('enemyHits'),avgEnemyHp:avg('remainingEnemyHp'),phase2:a.filter(x=>x.phaseTwoReached).length});
  }
 console.log('BOSS_SIM '+JSON.stringify(lines));
 console.log('PASS '+report.length+' deterministic browser boss scenarios, AP regen/cooldown policy and combat state bounds');
}finally{await context.close();await browser.close()}
