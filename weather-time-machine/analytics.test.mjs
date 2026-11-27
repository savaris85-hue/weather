import test from "node:test";
import assert from "node:assert/strict";
import {CLOUDFLARE_WEB_ANALYTICS_TOKEN} from "./analytics-config.mjs";
import {validCloudflareToken,configureCloudflareAnalytics} from "./analytics.mjs";

function fakeDocument(){
 const scripts=[];
 return {
   scripts,
   body:{appendChild(node){scripts.push(node)}},
   getElementById(id){return scripts.find(x=>x.id===id)||null},
   createElement(tag){
     assert.equal(tag,"script");
     return {setAttribute(name,value){this[name]=value}};
   }
 };
}
test("analytics is opt-in: no visitor beacon while the config is empty",()=>{
 assert.equal(CLOUDFLARE_WEB_ANALYTICS_TOKEN,"");
 const doc=fakeDocument();
 assert.equal(configureCloudflareAnalytics(doc),false);
 assert.equal(doc.scripts.length,0);
});
test("only Cloudflare's UUID-shaped site tokens can activate the beacon",()=>{
 for(const token of ["",undefined,"YOUR_TOKEN","<script>alert(1)</script>",
  "../unsafe", "a".repeat(36)]){
   assert.equal(validCloudflareToken(token),false);
   const d=fakeDocument();assert.equal(configureCloudflareAnalytics(d,token),false);
   assert.equal(d.scripts.length,0);
 }
 const token="12345678-1234-1234-abcd-1234567890ab";
 const doc=fakeDocument();
 assert.equal(configureCloudflareAnalytics(doc,token),true);
 assert.equal(doc.scripts.length,1);
 assert.equal(doc.scripts[0].src,"https://static.cloudflareinsights.com/beacon.min.js");
 assert.deepEqual(JSON.parse(doc.scripts[0]["data-cf-beacon"]),{token,spa:false});
 assert.equal(configureCloudflareAnalytics(doc,token),false);
 assert.equal(doc.scripts.length,1);
});
