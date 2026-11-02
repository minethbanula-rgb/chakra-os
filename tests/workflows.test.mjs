import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html=readFileSync('dist/index.html','utf8');
const dom=new JSDOM(html,{url:'https://studio.test/#home',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;w.structuredClone=structuredClone;w.matchMedia=()=>({matches:false,addEventListener(){}});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.assert=assert;
for(const script of ['app.js','workspace-ui.js','charts.js','enhancements.js'])vm.runInContext(readFileSync('dist/'+script,'utf8'),dom.getInternalVMContext());
const click=s=>{const el=w.document.querySelector(s);assert.ok(el,'Missing '+s);el.click();};
const evaluate=code=>w.eval(code);
// Navigation and screen composition exercise the real bind/render cycle.
assert.equal(w.document.querySelector('h1').textContent,'Studio overview');
assert.ok(!w.document.querySelector('[data-go="meetings"]'));
for(const page of ['projects','tasks','clients','finance','subscriptions','bills','insights','users','settings']){evaluate(`page='${page}';filter='All';query='';render()`);assert.ok(w.document.querySelector('h1'));}
evaluate("page='projects';filter='All';query='Nova';render()");click('[data-view="projects:Cards"]');assert.equal(w.document.querySelectorAll('.project-card').length,1);assert.equal(w.document.querySelector('#page-search').value,'Nova');click('[data-view="projects:Board"]');assert.equal(w.document.querySelector('#page-search').value,'Nova');
evaluate("page='tasks';filter='Mine';query='brand';render()");click('[data-view="tasks:List"]');assert.equal(w.document.querySelector('#page-search').value,'brand');assert.ok(w.document.querySelector('[data-filter="Mine"]').classList.contains('selected'));
evaluate("page='tasks';filter='All';query='';db.tasks[0].checklist=[{id:'step',text:'Complete deliverable',done:false}];render()");click('[data-edit="tasks:t0"]');
const checkbox=w.document.querySelector('[data-check-done]');assert.ok(checkbox);checkbox.checked=true;w.document.querySelector('#record-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(evaluate("db.tasks[0].status"),'Done');assert.equal(evaluate('db.tasks[0].progress'),100);
evaluate("moveTask('t0','In Progress')");assert.equal(evaluate('db.tasks[0].checklist[0].done'),true);click('[data-edit="tasks:t0"]');w.document.querySelector('[data-check-done]').checked=false;w.document.querySelector('#record-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(evaluate('db.tasks[0].progress'),0);assert.equal(evaluate("JSON.parse(localStorage.getItem(key)).tasks[0].checklist[0].done"),false);
// Actual export and import controls round-trip legacy fields.
const fixture=readFileSync('tests/fixtures/legacy-v1.json','utf8');w.fixture=fixture;
evaluate('db=JSON.parse(fixture);normalizeWorkspace();page="settings";settingsTab="Data";render()');let exported;
evaluate('download=(name,text)=>{window.exportedBackup=text}');click('[data-action="export"]');exported=JSON.parse(w.exportedBackup);assert.deepEqual(exported.meetings,JSON.parse(fixture).meetings);assert.equal(exported.settings.homeBanner,JSON.parse(fixture).settings.homeBanner);
await w.document.querySelector('#import-file').onchange({target:{files:[{name:'legacy.json',text:async()=>fixture}],value:'legacy.json'}});click('#confirm-import');assert.equal(evaluate('db.tasks[0].title'),'Imported action remains independent');assert.deepEqual(JSON.parse(evaluate('JSON.stringify(db.meetings)')),exported.meetings);
evaluate("page='meetings';render()");assert.equal(w.location.hash,'#home');assert.ok(w.document.querySelector('#toast').textContent.includes('retired'));
// Appearance settings persist and are not inert controls.
evaluate("page='settings';settingsTab='Appearance';render()");w.document.querySelector('[name=motion]').value='Off';w.document.querySelector('#appearance-form').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(evaluate('db.settings.motion'),'Off');assert.equal(w.studioMotionPreference,'Off');
evaluate("page='finance';render()");click('[data-range="Month"]');assert.ok(w.document.querySelector('[data-range="Month"]').getAttribute('aria-pressed')==='true');const bucket=w.document.querySelector('[data-chart-index]');bucket.focus();assert.equal(w.document.querySelector('.chart-tooltip').hidden,false);
// A stale revision must retain unsynced changes, never report Synced.
evaluate("cloudMode=true;cloudConflict=false;cloudPending=true;cloud={rpc:async()=>({error:{message:'Stale revision'}})}");await evaluate('flushCloud()');assert.equal(evaluate('cloudConflict'),true);assert.equal(evaluate('cloudPending'),true);assert.ok(!evaluate('cloudState').startsWith('Synced'));
dom.window.close();console.log('PASS: DOM navigation, view/filter persistence, checklist saves, legacy backup export/import, retired route, motion settings, chart keyboard details, stale cloud saves.');
