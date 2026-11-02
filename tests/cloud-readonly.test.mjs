// Read-only production boundary checks: no accounts or business records are changed.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=readFileSync('dist/enhancements.js','utf8'),url=source.match(/const CLOUD_URL='([^']+)'/)[1],key=source.match(/const CLOUD_KEY='([^']+)'/)[1];
for(const [path,method,body] of [['chakra_workspace?select=id','GET'],['chakra_members?select=role','GET'],['rpc/chakra_portal','POST',{requested_client:'not-authorized'}],['rpc/chakra_save','POST',{payload:{version:1,projects:[],tasks:[]},expected_revision:0}]]){
 const response=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.ok([401,403].includes(response.status),`${path}: expected denial, got ${response.status}`);console.log(`PASS: anonymous ${method} ${path} denied (${response.status}).`);
}
const share=await fetch(url+'/rest/v1/rpc/chakra_shared_portal',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({share_token:'invalid'})});assert.equal(share.status,400);console.log('PASS: anonymous invalid share token rejected (400).');
const manage=await fetch(url+'/rest/v1/rpc/chakra_manage_share',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({requested_client:'not-authorized',operation:'enable',share_token:'a'.repeat(64)})});assert.ok([401,403].includes(manage.status));console.log('PASS: anonymous share management denied.');
