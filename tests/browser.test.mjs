// Run against the dev server, or set BASE_URL to the standalone/public URL.
// Requires Playwright and an installed Chromium browser.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=process.env.CDP_URL?await chromium.connectOverCDP(process.env.CDP_URL):await chromium.launch();
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.BASE_URL||'http://127.0.0.1:5173/';const out=process.env.SCREENSHOT_DIR||'test-results';mkdirSync(out,{recursive:true});
await page.goto(base);await page.locator('#page').waitFor();
for(const width of [360,390,768,1024,1440,1920]){
 await page.setViewportSize({width,height:1000});
 for(const screen of ['home','projects','tasks','clients','finance','subscriptions','bills','insights','users','settings','invoice']){
  await page.evaluate(p=>{location.hash=p},screen);await page.waitForFunction(p=>location.hash==='#'+p,screen);await page.waitForTimeout(250);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`${screen} overflow at ${width}`);
 }
}
await page.setViewportSize({width:1440,height:1000});await page.goto(base+'#home');await page.locator('h1').waitFor();await page.screenshot({path:out+'/home-desktop.png',fullPage:true});
await page.goto(base+'#projects');await page.locator('[data-view="projects:Cards"]').click();await page.screenshot({path:out+'/projects-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:900});await page.goto(base+'#home');await page.locator('[data-action="menu"]').click();assert.equal(await page.locator('[data-action="menu"]').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');await page.screenshot({path:out+'/home-mobile.png',fullPage:true});
for(const mode of ['Reduced','Off']){await page.evaluate(mode=>{db.settings.motion=mode;page='home';render()},mode);assert.equal(await page.locator('h1').isVisible(),true);}
await page.goto(base+'#invoice');await page.emulateMedia({media:'print'});assert.equal(await page.locator('.template-toolbar').isVisible(),false);assert.equal(await page.locator('.paper').isVisible(),true);await page.pdf({path:out+'/invoice.pdf',format:'A4'});
assert.deepEqual(errors,[]);await browser.close();console.log('PASS: widths, screen navigation, motion, keyboard drawer and print.');
