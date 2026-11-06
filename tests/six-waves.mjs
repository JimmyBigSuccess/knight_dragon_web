// v10.8: deterministic complete six-wave runs using the real game implementation.
// Virtual-time input policies simulate prepared, beginner, early-block, and no-block play.
// These are scripted scenarios, NOT estimates of human win rates.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const page=await ctx.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.GAME_BASE_URL||'http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof chooseRoadEvent==='function'&&typeof nextWaveInfo==='function');
 const results=await page.evaluate(()=>{
  showPage('home',true);
  let clock=2400000;
  Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
  const originalRandom=Math.random, output=[];
  const policies=[
   {label:'starter',weapons:[6,6,6],guard:'perfect'},
   {label:'prepared',weapons:[1,4,3],guard:'perfect'},
   {label:'prepared-early',weapons:[1,4,3],guard:'early'},
   {label:'prepared-no-guard',weapons:[1,4,3],guard:'none'},
   {label:'prepared-plus2',weapons:[1,4,3],guard:'perfect',forge:2}
  ];
  const seeds=[11,47,83,127,251,401];
  function battleScenario(zone,policy,seed){
   let state=(seed+zone*65537)>>>0;
   Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
   clock+=400000;
   s=init();ensureEquipmentState();
   const weaponId=policy.weapons[zone],shieldId=7;
   s.zone=zone;s.round=1;s.level=zone+1;s.maxHp=200+zone*12;s.hp=s.maxHp;
   s.wins=zone*6;s.firstBosses=zone===0?[]:Array.from({length:zone},(_,i)=>i);
   s.unlockedZone=zone;s.tutorialDone=true;s.firstVictoryCelebrated=true;s.potions=3;s.ap=100;
   s.owned=[6,7,weaponId].filter((x,i,arr)=>arr.indexOf(x)===i);
   s.equipped=[weaponId,shieldId,null,null];s.skillCursor=[0,0,0,0];s.weapon=0;
   s.forgeLevels=Array(ARSENAL.length).fill(0);s.forgeLevels[weaponId]=policy.forge||0;
   s.roadEvents=[];
   enterArea(zone);
   const rows=[];let potionSpent=0,events=0,simulatedSeconds=0,previewMatch=true;
   for(let wave=1;wave<=6;wave++){
    if(phase!=='ready'||s.round!==wave){throw Error('Not ready at wave '+wave+', phase '+phase+' round '+s.round)}
    beginBattleRound();
    const hpStart=s.hp,apStart=s.ap,potStart=s.potions,monsterName=enemy.name,enemyMax=enemy.maxHp;
    let attacks=0,guards=0,received=0,ticks=0;
    for(let i=0;i<900;i++){
     clock+=100; simulatedSeconds+=.1;
     if(phase!=='battle')break;
     if(s.ap<100)s.ap=Math.min(100,s.ap+AP_REGEN_PER_SECOND*.1);
     if(enemy.stunned){if(clock>stunUntil){enemy.stunned=false;enemyClock=0}}
     else enemyClock+=100;
     let remaining=enemyAttackAt-enemyClock;
     if(s.potions>0&&s.hp<s.maxHp*.55&&clock-lastMeat>=650){
      const prev=s.potions;eat();if(s.potions<prev)potionSpent++;
     }
     const shieldSkill=equipmentSkill(shieldId,s.skillCursor[1]||0);
     const canShield=skillIntervalRemaining(shieldId,clock)===0
          &&shieldSkill&&s.ap>=shieldSkill.cost*10;
     if(policy.guard!=='none' && canShield && shieldSkill.action==='attack'
       &&remaining>1150&&!enemy.stunned){
      useEquipmentSkill(1);
     }
     const guardSkill=equipmentSkill(shieldId,s.skillCursor[1]||0);
     const guardOk=guardSkill?.action==='guard'&&!enemy.stunned
       &&skillIntervalRemaining(shieldId,clock)===0
       &&clock>=guardCooldown &&s.ap>=guardSkill.cost*10;
     if(policy.guard!=='none'&&guardOk
       &&(policy.guard==='perfect'?(remaining<=500&&remaining>0):(remaining<=950&&remaining>650))){
       const oldGuard=s.guardCount;
       useEquipmentSkill(1);
       if(s.guardCount>oldGuard)guards++;
     }
     if(phase!=='battle')break;
     if(!enemy.stunned&&enemyClock>=enemyAttackAt){
      const oldHP=s.hp;enemyStrike(clock);
      received+=oldHP-s.hp;
     }
     if(phase!=='battle')break;
     const skill=equipmentSkill(weaponId,s.skillCursor[0]||0);
     if(skill&&s.ap>=skill.cost*10&&skillIntervalRemaining(weaponId,clock)===0
       &&clock-lastSkillActivation[0]>=110){
      const beforeCursor=s.skillCursor[0];useEquipmentSkill(0);
      if(s.skillCursor[0]!==beforeCursor)attacks++;
     }
     ticks++;
     if(phase==='cinematic'){win();break}
    }
    if(phase==='cinematic')win();
    const status=phase;
    rows.push({wave,enemy:monsterName,enemyMax,seconds:Math.round(ticks/10*10)/10,
      hpStart,hpEnd:s.hp,apStart:Math.round(apStart),apEnd:Math.round(s.ap),
      potStart,potEnd:s.potions,attacks,guards,received,status});
    if(phase!=='won')break;
    // Assert upcoming BOSS preview is aligned with the current region, not hard-coded to light.
    if(wave===5)previewMatch=nextWaveInfo().weak===ZONES[zone].weak;
    if(wave<6){
     if(pendingRoadEvent()){
      // Prefer a healing choice only when there is actual damage, otherwise stock up on supplies.
      const event=ROAD_EVENTS[zone][wave===2?0:1];
      let option=0;
      if(event.heal &&s.hp<s.maxHp*.78)option=0;
      else if(wave===4&&zone===0&&s.hp<s.maxHp*.78)option=1;
      else if(wave===4&&zone===2&&s.hp<s.maxHp*.78)option=1;
      else if(wave===4&&zone===1)option=1;
      chooseRoadEvent(option);events++;
     }
     const winHP=s.hp;
     advance();
     if(s.round!==wave+1||phase!=='ready')throw Error('Wave progression failed after '+wave);
     if(s.hp>Math.max(winHP,s.maxHp))throw Error('Healing overflow after advance');
    }
   }
   return {zone,policy:policy.label,seed,cleared:rows.length===6&&rows[5].status==='won',
      bossReached:rows.length===6,endedAt:rows.length,seconds:Math.round(simulatedSeconds*10)/10,
      heroHP:s.hp,maxHP:s.maxHp,ap:s.ap,potions:s.potions,
      potionSpent,events,previewMatch,rows};
  }
  for(let zone=0;zone<3;zone++)for(const policy of policies)for(const seed of seeds)
   output.push(battleScenario(zone,policy,seed));
  Math.random=originalRandom;
  return output;
 });
 assert.equal(results.length,90,'All 3×5×6 complete-run scenarios evaluated');
 for(const run of results){
  assert.ok(run.rows.length>=1&&run.rows.length<=6,'Wave count in range');
  assert.ok(run.heroHP>=0&&run.heroHP<=run.maxHP,'HP never leaves bounds');
  assert.ok(run.ap>=0&&run.ap<=100,'AP stays inside 0..100');
  assert.ok(run.potions>=0,'No negative supplies');
  assert.ok(run.potionSpent<=3+Math.floor((run.rows.length-1)/3)+4,'No fabricated supplies');
  for(const wave of run.rows){
   assert.ok(wave.apEnd>=0&&wave.apEnd<=100,'Per-wave AP bounds');
   assert.ok(wave.hpEnd>=0&&wave.hpEnd<=run.maxHP,'Per-wave HP bounds');
   assert.ok(['won','lost','battle'].includes(wave.status),'Expected combat status');
   assert.ok(wave.attacks>0,'Every reached wave had an attack');
  }
  if(run.bossReached)assert.ok(run.previewMatch,'The BOSS preview must reflect its actual weakness');
  if(run.cleared)assert.ok(run.events===2,'Two road events processed on full run');
 }
 assert.deepEqual(errors,[],'No JavaScript errors during six-wave scenarios');
 const summary=[];
 for(let zone=0;zone<3;zone++)for(const label of ['starter','prepared','prepared-early','prepared-no-guard','prepared-plus2']){
  const a=results.filter(x=>x.zone===zone&&x.policy===label);
  const avg=key=>Number((a.reduce((sum,x)=>sum+x[key],0)/a.length).toFixed(1));
  const reached=a.filter(x=>x.bossReached);
  summary.push({zone,loadout:label,runs:a.length,completed:a.filter(x=>x.cleared).length,
   bossReached:reached.length,avgWaves:avg('endedAt'),avgSec:avg('seconds'),
   avgPotionsUsed:avg('potionSpent'),avgEndHP:avg('heroHP'),avgEndAP:avg('ap'),
   avgHPBeforeBoss:reached.length?Number((reached.reduce((sum,x)=>sum+x.rows[5].hpStart,0)/reached.length).toFixed(1)):null
  });
 }
 console.log('SIX_WAVE '+JSON.stringify(summary));
 console.log('PASS 90 deterministic complete six-wave game scenarios with real win/events/advance/saves and boss previews');
}finally{await ctx.close();await browser.close()}
