import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';
import assert from 'node:assert/strict';
for(const filename of ['index.html','Chakra-Studio-OS.html']){
 const html=readFileSync(filename,'utf8'),dom=new JSDOM(html,{url:'https://standalone.test/',runScripts:'outside-only'}),w=dom.window;
 w.structuredClone=structuredClone;w.matchMedia=()=>({matches:false,addEventListener(){}});
 const scripts=[...w.document.scripts];assert.equal(scripts.length,7);assert.ok(scripts.every(s=>!s.src));
 // Exercise the generated inline app with SDK unavailable, a supported fallback.
 for(const script of scripts.slice(1))vm.runInContext(script.textContent,dom.getInternalVMContext());
 assert.equal(w.document.querySelector('h1').textContent,'Studio overview');
 assert.ok(!html.includes('parseMeeting'));assert.ok(!html.includes('exportCalendar'));assert.ok(!html.includes('mountains.svg'));
 dom.window.close();
}
console.log('PASS: both generated standalone apps start with inline source and no retired parser/artwork.');
