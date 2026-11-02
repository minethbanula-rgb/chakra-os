// Read-only production boundary checks: no accounts or business records are changed.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=readFileSync('dist/enhancements.js','utf8'),url=source.match(/const CLOUD_URL='([^']+)'/)[1],key=source.match(/const CLOUD_KEY='([^']+)'/)[1];
for(const [path,method,body] of [['chakra_workspace?select=id','GET'],['chakra_members?select=role','GET'],['rpc/chakra_portal','POST',{requested_client:'not-authorized'}],['rpc/chakra_save','POST',{payload:{version:1,projects:[],tasks:[]},expected_revision:0}]]){
 const response=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.ok([401,403].includes(response.status),`${path}: expected denial, got ${response.status}`);console.log(`PASS: anonymous ${method} ${path} denied (${response.status}).`);
}
