/* eslint-disable @typescript-eslint/no-require-imports */
const {chromium}=require('playwright-core');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.MOCKUP_CHROME||path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1234/chrome-win64/chrome.exe')});
  const page=await browser.newPage();
  const failures=[];
  page.on('pageerror',e=>failures.push(e.message));
  const url=pathToFileURL(path.resolve('public/miracle-public-v3-final-mockup.html')).href;
  const previews=path.resolve('public/mockup-public-v3/previews');
  await fs.mkdir(previews,{recursive:true});
  let scenarios=0;
  try{
    for(const width of [1440,768,390,360]){
      await page.setViewportSize({width,height:1000});
      for(const phase of ['registration','drawing','live','finished']){
        for(const route of ['home','events','event','participants','bracket','leaderboard','schedule']){
          await page.goto(`${url}#${route}/${phase}`);
          await page.evaluate(()=>document.fonts.ready);
          await page.waitForTimeout(50);
          assert.equal(await page.locator('main h1').count(),1,`${route}/${phase}: one H1`);
          const sizes=await page.evaluate(()=>({viewport:innerWidth,doc:document.documentElement.scrollWidth,badImages:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src)}));
          assert(sizes.doc<=sizes.viewport+1,`${width} ${route}/${phase}: page overflow ${sizes.doc}`);
          assert.deepEqual(sizes.badImages,[],`${route}: images loaded`);
          if(route==='bracket'&&phase==='registration'){
            assert(!(await page.locator('.bracket-team').allTextContents()).some(t=>/Garuda|Vortex|North/.test(t)),'No seeded teams during registration');
          }
          if(route==='leaderboard'&&['registration','drawing'].includes(phase))assert.equal(await page.locator('table').count(),0,'No rankings before publication');
          if((width===1440||width===390)&&phase==='live')await page.screenshot({path:path.join(previews,`${route}-${width}.png`),fullPage:true});
          if((width===1440||width===390)&&route==='event'&&phase!=='live')await page.screenshot({path:path.join(previews,`event-${phase}-${width}.png`),fullPage:true});
          scenarios++;
        }
      }
    }
    await page.goto(`${url}#participants/live`);
    await page.locator('#team-search').fill('Garuda');
    assert.equal(await page.locator('.team-card').count(),1);
    await page.locator('.team-card').click();
    assert.equal(await page.locator('dialog[open] .roster-row').count(),5);
    await page.keyboard.press('Escape');
    await page.locator('#team-search').fill('not-a-team');
    assert.equal(await page.locator('.team-card').count(),0);
    await page.locator('#team-search').fill('');
    await page.locator('[data-team-page="2"]').click();
    assert.equal(await page.locator('[data-team-page="2"]').getAttribute('aria-current'),'page');
    await page.goto(`${url}#events/live`);
    assert.equal(await page.locator('#event-results .event-list-card').count(),4);
    await page.locator('[data-event-filter="finished"]').click();
    assert.equal(await page.locator('#event-results .event-list-card').count(),2);
    await page.locator('[data-event-filter="upcoming"]').click();
    assert.equal(await page.locator('#event-results .event-list-card').count(),1);
    await page.locator('#event-results .event-list-card').click();
    assert.equal(await page.locator('dialog[open]').count(),1);
    await page.keyboard.press('Escape');
    await page.goto(`${url}#event/finished`);
    assert.equal(await page.locator('.award-card').count(),4);
    assert.equal(await page.locator('.awards-heading a[href="#leaderboard/finished"]').count(),1);
    await page.locator('.award-certificate-link').first().click();
    assert((await page.locator('dialog[open]').innerText()).includes('MVP OF TOURNAMENT'));
    await page.keyboard.press('Escape');
    await page.goto(`${url}#bracket/registration`);
    await page.locator('#bracket-stage').selectOption('all');
    assert.equal(await page.locator('#full-bracket .bracket-match').count(),31);
    await page.locator('#full-bracket .bracket-match').first().click();
    assert((await page.locator('dialog').innerText()).includes('Belum ada seed ou bye resmi'.replace('ou','atau')));
    await page.keyboard.press('Escape');
    await page.locator('[data-phase="drawing"]').click();
    await page.waitForURL('**#bracket/drawing');
    await page.locator('[data-phase="drawing"][aria-pressed="true"]').waitFor();
    assert((await page.locator('#full-bracket').innerText()).includes('Garuda Nova'));
    await page.goto(`${url}#leaderboard/live`);
    await page.locator('[data-metric="assists"]').click();
    assert((await page.locator('.leader').first().innerText()).includes('Aero'));
    await page.locator('#player-position').selectOption('Goalkeeper');
    assert.equal(await page.locator('tbody tr').count(),3);
    await page.goto(`${url}#event/live`);
    await page.locator('.event-nav [data-page="bracket"]').click();
    await page.waitForURL('**#bracket/live');
    await page.locator('#full-bracket').waitFor();
    await page.goBack();
    assert(page.url().endsWith('#event/live'));
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
    assert.deepEqual(failures,[],'No browser errors');
    console.log(JSON.stringify({ok:true,scenarios,interactions:'Event directory filters, search, empty results, pagination, roster, modal Escape, drawing, 32-team bracket, stats sorting/filtering, navigation/back, reduced motion',previews},null,2));
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
