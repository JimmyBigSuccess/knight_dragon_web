// Automated smoke and regression tests for 勇者與龍.
// Run: node tests/smoke.mjs              (static tests)
//      node tests/smoke.mjs --browser    (requires playwright and local web server)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const html=readFileSync('index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script && script.length>10000,'Game script exists');
const scratch=mkdtempSync(join(tmpdir(),'dragon-smoke-'));
try{
 const file=join(scratch,'game.js');writeFileSync(file,script);
 const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr||'JavaScript syntax check');
 console.log('PASS inline JS syntax');
}finally{rmSync(scratch,{recursive:true,force:true})}

const required=['titleScreen','home','adventure','battle','gear','shop','quests','results','settings','field','cards','nextQueue','battleStartGate','resultTitle','saveTransfer'];
for(const id of required)assert.ok(html.includes(`id="${id}"`),`Missing UI element: ${id}`);
assert.ok(!html.includes('id="combatInsight"'),'Obsolete combat advice element must stay removed');
assert.ok(html.includes('class="skill-ap-cost"'),'AP label must be a standalone, frameless element');
assert.ok(/#battle\s+#nextQueue\s*\{[^}]*display:grid!important/.test(html),'Next-skill preview stays visible');
assert.ok(/const ZONES=\[[\s\S]*?水晶洞窟[\s\S]*?綠蔭森林[\s\S]*?熔岩山脈/.test(html),'All three areas present');
assert.ok(html.includes("localStorage.setItem('knight-dragon-v2'"),'Existing save key remains compatible');
console.log('PASS DOM references, removed hint, next skill, zones and save compatibility');
if(!process.argv.includes('--browser'))process.exit(0);

const {chromium}=await import('playwright');
const base=process.env.GAME_BASE_URL||'http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let checks=0;
try{
 for(const [width,height] of [[320,640],[360,740],[390,844],[430,932],[1280,800]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',hasTouch:width<620,isMobile:width<620});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!document.querySelector('#field') && !!document.querySelector('#titleScreen') && !document.querySelector('#titleScreen').classList.contains('hidden'));
  assert.ok(await page.locator('#titleScreen').isVisible(),`Title screen visible at ${width}`);
  await page.evaluate(()=>{s.tutorialDone=true;showPage('home',true)});
  assert.ok(await page.locator('#home').isVisible(),'Home opens');
  await page.evaluate(()=>showPage('adventure',true));
  assert.equal(await page.locator('.zone-banner').count(),3,'Three adventure zones');
  await page.evaluate(()=>{s.tutorialDone=true;enterArea(0)});
  assert.ok(await page.locator('#battleStartGate').isVisible(),'Battle preparation gate');
  assert.equal(await page.locator('#cards .card').count(),4,'Four skill slots');
  assert.equal(await page.locator('#nextQueue .nextcard').count(),4,'Four next skill previews');
  assert.equal(await page.locator('#combatInsight').count(),0,'No old advice card');
  assert.ok(await page.locator('#nextQueue').isVisible(),'Next skill section visible');
  const layout=await page.evaluate(()=>{
    const r=(el)=>{const x=el.getBoundingClientRect();return {x:x.left,y:x.top,right:x.right,bottom:x.bottom,width:x.width,height:x.height}};
    const c=[...document.querySelectorAll('#cards .card')].map(card=>({ap:r(card.querySelector('.skill-ap-cost')),icon:r(card.querySelector('.skill-equip-icon')||card.querySelector('.art'))}));
    return {ap:c,scrollWidth:document.documentElement.scrollWidth,width:innerWidth};
  });
  assert.ok(layout.scrollWidth<=layout.width+4,`No horizontal overflow at ${width}: ${JSON.stringify(layout)}`);
  for(const {ap,icon} of layout.ap){
   if(icon.height>0 && icon.width>0){
    const overlaps=ap.x<icon.right-2 && ap.right>icon.x+2 && ap.y<icon.bottom-2 && ap.bottom>icon.y+2;
    assert.ok(!overlaps,`AP should not cover equipment icon at ${width}: ${JSON.stringify({ap,icon})}`);
   }
  }
  await page.evaluate(()=>beginBattleRound());
  assert.equal(await page.evaluate(()=>phase),'battle','Combat begins after confirmation');
  if(width<620){
    const before=await page.evaluate(()=>({ap:s.ap,cursor:s.skillCursor[0],hp:enemy.hp}));
    await page.locator('#cards .card').first().tap();
    const after=await page.evaluate(()=>({ap:s.ap,cursor:s.skillCursor[0],hp:enemy.hp}));
    assert.ok(after.ap<before.ap,`Touch consumes AP at ${width}`);
    assert.ok(after.cursor!==before.cursor,`Touch advances the skill cycle at ${width}`);
  }else await page.evaluate(()=>useEquipmentSkill(0));
  await page.evaluate(()=>win());
  assert.ok(await page.locator('#results').isVisible(),'Victory results appear');
  assert.match(await page.locator('#resultTitle').textContent(),/勝利/);
  await page.evaluate(()=>advance());
  assert.ok(await page.locator('#battleStartGate').isVisible(),'Next wave returns to preparation');
  assert.equal(await page.evaluate(()=>s.round),2,'Wave advances to 2');
  await page.evaluate(()=>{showPage('settings',true);exportSave()});
  const saved=await page.locator('#saveTransfer').inputValue();
  const payload=JSON.parse(saved);
  assert.equal(payload.game,'knight-dragon-web');
  assert.equal(payload.state.round,2);
  assert.ok(await page.evaluate((json)=>{try{return validateSave(JSON.parse(json)).round===2}catch{return false}},saved),'Save validates and can restore');

  // Defeat and retry must return the player to a ready-state, not an active timer.
  await page.evaluate(()=>{showPage('battle',true);phase='lost';s.hp=0;showResult(false)});
  assert.ok(await page.locator('#results').isVisible(),'Defeat settlement visible');
  await page.evaluate(()=>advance());
  assert.equal(await page.evaluate(()=>phase),'ready','Retry enters preparation');
  assert.equal(await page.evaluate(()=>s.hp===s.maxHp),true,'Retry restores HP');
  assert.ok(await page.locator('#battleStartGate').isVisible(),'Retry gate visible');

  // Boss first-clear unlocks the next chapter and keeps all reward controls usable.
  await page.evaluate(()=>{s.round=6;startRound();phase='ready';render()});
  const geo=await page.evaluate(()=>{
    const box=(sel)=>{const el=document.querySelector(sel),r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    const sc=box('#battle .scene'),hp=box('#battle .enemylabel'),attack=box('#battle .threat');
    const monster={left:sc.left+sc.width*260/480,right:sc.left+sc.width*445/480,top:sc.top+sc.height*125/380,bottom:sc.top+sc.height*322/380};
    return {sc,hp,attack,monster};
  });
  console.log(`LAYOUT ${width}×${height} ${JSON.stringify(geo)}`);
  await page.evaluate(()=>{beginBattleRound();win();if(guideActive)closeGuide()});
  assert.ok(await page.locator('#results').isVisible(),'Boss settlement visible');
  assert.ok(await page.locator('#bossClearNotice').isVisible(),'Boss award notice visible');
  assert.ok(await page.evaluate(()=>s.unlockedZone>=1),'Next zone unlocked');
  await page.evaluate(()=>advance());
  assert.equal(await page.evaluate(()=>s.zone),1,'After boss, next zone begins');
  assert.equal(await page.evaluate(()=>phase),'ready','Next zone starts at preparation');

  // Save data should remain usable after a reload, and a fresh game should reset.
  await page.evaluate(()=>{showPage('home',true);save()});
  const winsBeforeReload=await page.evaluate(()=>s.wins);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>s.wins),winsBeforeReload,'Save persists after reload');
  await page.evaluate(()=>resetGameInstant());
  assert.equal(await page.evaluate(()=>s.wins),0,'New game resets victories');
  assert.ok(await page.locator('#titleScreen').isVisible(),'Reset returns to title');

  for(const name of ['home','adventure','shop','quests','gear']){
   const info=await page.evaluate((id)=>{showPage(id,true);return {scrollWidth:document.documentElement.scrollWidth,innerWidth}},name);
   assert.ok(info.scrollWidth<=info.innerWidth+4,`No horizontal overflow on ${name} at ${width}: ${JSON.stringify(info)}`);
  }
  assert.deepEqual(errors,[],`No browser JavaScript errors at ${width}`);
  await context.close();
  console.log(`PASS mobile/desktop ${width}×${height}: start, skills, victory, defeat, boss, save, reset and page layout`);
  checks++;
 }
 console.log(`PASS ${checks} browser viewport smoke runs`);
}finally{await browser.close()}
