// v10.6 progression regression: deterministic access to elemental preparation
// Run with local server: node tests/progression.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.GAME_BASE_URL||'http://127.0.0.1:8765/';
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof purchaseForestBlade==='function' && typeof refreshShop==='function');
 await page.evaluate(()=>{s.tutorialDone=true;showPage('shop',true);s.gold=500;refreshShop()});
 assert.equal(await page.locator('#shop .shop-product').count(),4,'Shop retains all original products plus one fixed-price weapon');
 for(const viewport of [{width:320,height:640},{width:390,height:844},{width:430,height:932}]){
  await page.setViewportSize(viewport);
  const shopDimensions=await page.evaluate(()=>{
   const shop=document.querySelector('#shop'),last=shop.querySelector('.rpg-return').getBoundingClientRect();
   return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,shopContentHeight:shop.scrollHeight,returnBottom:last.bottom};
  });
  assert.ok(shopDimensions.scrollWidth<=shopDimensions.width+4,'Shop has no horizontal overflow');
  assert.ok(shopDimensions.returnBottom<=shopDimensions.height+4,`Shop exit remains accessible without vertical scrolling at ${viewport.width}: ${JSON.stringify(shopDimensions)}`);
  console.log('SHOP_LAYOUT '+JSON.stringify(shopDimensions));
 }
 await page.setViewportSize({width:390,height:844});
 const offer=page.locator('#shop [data-product="forest-blade"]');
 const btn=offer.locator('button.shop-buy-button');
 assert.ok(await offer.isVisible(),'Forest weapon offer visible in the shop');
 assert.ok(await btn.isDisabled(),'Fire sword locked before first cave clear');
 const beforeBlocked=await page.evaluate(()=>({gold:s.gold,owned:s.owned.slice()}));
 await page.evaluate(()=>purchaseForestBlade());
 assert.deepEqual(await page.evaluate(()=>({gold:s.gold,owned:s.owned.slice()})),beforeBlocked,'Cannot bypass cave lock using function');
 await page.evaluate(()=>{
  s.zone=0;s.round=6;s.firstBosses=[];startRound();phase='battle';paused=false;win();
  if(guideActive)closeGuide();showPage('shop',true);
 });
 assert.ok(await btn.isEnabled(),'First cave clear unlocks fixed-price fire sword');
 const unequippedHint=await page.evaluate(()=>{
  s.zone=1;s.round=6;startRound();phase='ready';showPage('battle',true);render();
  const copy=$('battleStartInfo').textContent;
  showPage('shop',true);return copy;
 });
 assert.match(unequippedHint,/商店以 120 G 購買火焰劍/,'BOSS preparation explains how to obtain missing fire element');
 assert.match(await offer.innerText(),/120 G/);
 const beforeSale=await page.evaluate(()=>({gold:s.gold,owned:s.owned.slice(),win:s.wins}));
 await btn.click();
 const afterSale=await page.evaluate(()=>({gold:s.gold,owned:s.owned.slice()}));
 assert.equal(afterSale.gold,beforeSale.gold-120,'Purchase costs exactly 120 G');
 assert.ok(afterSale.owned.includes(4),'Fire sword appears in inventory');
 assert.equal(afterSale.owned.filter(x=>x===4).length,1,'Only one sword added');
 assert.ok(await btn.isDisabled(),'One-time weapon purchase cannot be repeated');
 await page.evaluate(()=>purchaseForestBlade());
 assert.equal(await page.evaluate(()=>s.gold),afterSale.gold,'Direct repeat purchase cannot charge again');
 await page.evaluate(()=>{showPage('gear',true);equip(2,4)});
 assert.equal(await page.evaluate(()=>s.equipped[2]),4,'Fire sword can be equipped before forest');
 await page.evaluate(()=>{showPage('adventure',true);enterArea(1)});
 assert.ok(await page.locator('#battleStartGate').isVisible(),'Forest preparation opens with equipped fire sword');
 assert.equal(await page.evaluate(()=>s.equipped[2]),4,'Forest battle retains the fire sword');
 await page.evaluate(()=>{s.round=6;startRound();phase='ready';render()});
 assert.equal(await page.evaluate(()=>enemy.weak),'fire','Forest boss is weak to fire');
 assert.match(await page.locator('#battleStartInfo').textContent(),/已裝備弱點屬性/,'BOSS preparation confirms elemental equipment');
 assert.match(await page.locator('#battleStartInfo').textContent(),/提早架盾可減傷/,'BOSS preparation teaches regular block without combat advice overlays');
 await page.evaluate(()=>{showPage('home',true);save()});
 await page.reload({waitUntil:'domcontentloaded'});
 assert.equal(await page.evaluate(()=>s.owned.filter(x=>x===4).length),1,'Reload preserves owned sword without duplication');
 assert.equal(await page.evaluate(()=>s.equipped[2]),4,'Reload preserves equipped fire sword');
 await page.evaluate(()=>{s.firstBosses.push(1);showPage('quests',true)});
 const rewardBefore=await page.evaluate(()=>({gold:s.gold,count:s.owned.length}));
 await page.evaluate(()=>{claimPioneer('secondBoss');if(guideActive)closeGuide()});
 const rewardAfter=await page.evaluate(()=>({gold:s.gold,count:s.owned.length,claimed:s.pioneerRewards.includes('secondBoss')}));
 assert.equal(rewardAfter.gold,rewardBefore.gold+160,'Second boss milestone still gives normal gold');
 assert.equal(rewardAfter.count,rewardBefore.count,'Forest reward does not duplicate owned sword');
 assert.equal(rewardAfter.claimed,true,'Forest milestone marked claimed');
 assert.deepEqual(errors,[],'No browser JavaScript errors');
 console.log('PASS locked shop sale, cave boss unlock, 120 G fixed price, no duplicate, forest equip, save reload, boss reward');
}finally{await context.close();await browser.close()}
