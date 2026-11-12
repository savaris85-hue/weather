import test from "node:test";
import assert from "node:assert/strict";
import {createWeatherRequestQueue,placeLabel,nearestPlaceName} from "./services.mjs";

test("reverse-geocoder names a nearby town or neighborhood and removes coordinates labels",()=>{
  const name=nearestPlaceName({address:{suburb:"Νέα Σμύρνη",city:"Αθήνα",country:"Ελλάδα"}});
  assert.deepEqual(name,{name:"Νέα Σμύρνη",country:"Ελλάδα",timezone:"GMT"});
  assert.equal(placeLabel({name:"Coordinates",country:"39.566, 22.500"}),"Επιλεγμένη περιοχή");
  assert.equal(placeLabel({name:"Νέα Σμύρνη",country:"Ελλάδα"}),"Νέα Σμύρνη, Ελλάδα");
  assert.equal(nearestPlaceName({address:{}}),null);
});
test("rate-limiter serializes requests and prioritizes new foreground tasks",async()=>{
  const order=[];let inFlight=0,maxInFlight=0;
  const fake=async(url)=>{
    inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);order.push(url);
    await new Promise(r=>setTimeout(r,3));
    inFlight--;return {ok:true,status:200,json:async()=>({url})};
  };
  const request=createWeatherRequestQueue(fake,{minGapMs:0});
  const result=await Promise.all([request("climate1",undefined,1),request("climate2",undefined,1),request("new-city",undefined,12)]);
  assert.equal(result.length,3);
  assert.deepEqual(order,["climate1","new-city","climate2"]);
  assert.equal(maxInFlight,1);
});
test("HTTP 429 retries a bounded number of times and succeeds without a second user click",async()=>{
  let count=0;
  const request=createWeatherRequestQueue(async()=>{
    count++;
    return count===1 ? {ok:false,status:429,json:async()=>({reason:"Too many concurrent requests"})} :
      {ok:true,status:200,json:async()=>({hourly:{time:[]}})};
  },{minGapMs:0,retryDelaysMs:[0,0,0]});
  const result=await request("forecast");
  assert.equal(count,2);
  assert.deepEqual(result,{hourly:{time:[]}});
});
test("HTTP 429 cannot cause unbounded retries",async()=>{
  let count=0;
  const request=createWeatherRequestQueue(async()=>{
    count++;return {ok:false,status:429,json:async()=>({reason:"Too many concurrent requests"})};
  },{minGapMs:0,retryDelaysMs:[0,0,0]});
  await assert.rejects(request("archive"),/429/);
  assert.equal(count,3);
});
