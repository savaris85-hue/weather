import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {
  FIELDS, splitDateChunks, validateRange, normalizeHourly, mergeHourly,
  aggregateForView, csvForRows, moveDay, dayISO, buildForecastParams
} from "./data.mjs";

function fakeElement() {
  const listeners = new Map();
  return {
    value: "", textContent: "", disabled: false,
    style: {}, classList: {toggle() {}},
    addEventListener(name, callback) {listeners.set(name,callback)},
    fire(name) { const callback = listeners.get(name); if (callback) return callback() },
    replaceChildren() {}, append() {}, remove() {}
  };
}
async function waitUntil(condition) {
  for (let i=0; i<150; i++) {
    if (condition()) return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  throw new Error("Timed out waiting for the app to finish loading");
}
test("dashboard boots, renders chart, and makes valid non-conflicting Open-Meteo requests", async () => {
  const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
  const match=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match,"Inline dashboard script is present");
  const script=match[1].replace(/^import\s+\{[^\n]+\}\s+from\s+"\.\/data\.mjs";?\s*/m,"");
  assert.doesNotMatch(script,/^import\s/m,"ES module import removed for Node VM smoke test");

  const nodes=new Map();
  const element=selector=>{
    if(!nodes.has(selector))nodes.set(selector,fakeElement());
    return nodes.get(selector);
  };
  const calls=[];
  const renders=[];
  const fetch=async (url,options={})=>{
    const u=new URL(url);
    calls.push(u);
    if(options.signal?.aborted)throw new DOMException("Aborted","AbortError");
    // Reproduce the API error that originally broke the dashboard.
    if(u.hostname==="api.open-meteo.com" &&
       (u.searchParams.has("past_days")||u.searchParams.has("forecast_days")) &&
       (u.searchParams.has("start_date")||u.searchParams.has("end_date"))) {
      return {ok:false,status:400,json:async()=>({reason:"mutually exclusive date parameters"})};
    }
    const fields=(u.searchParams.get("hourly")||"").split(",");
    const hourly={time:[u.searchParams.get("start_date")+"T12:00"]};
    fields.forEach(field=>{hourly[field]=[field==="temperature_2m"?18:field==="precipitation"?0.6:field==="pressure_msl"?1013:50]});
    return {ok:true,status:200,json:async()=>({hourly})};
  };
  const context={
    FIELDS,splitDateChunks,validateRange,normalizeHourly,mergeHourly,aggregateForView,
    csvForRows,moveDay,dayISO,buildForecastParams,
    document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},
    window:{innerWidth:1360},
    Plotly:{react(...args){renders.push(args);return Promise.resolve()}},
    fetch,URL,URLSearchParams,Date,AbortController,DOMException,
    setTimeout,clearTimeout,console
  };
  runInNewContext(script,context,{timeout:5000});
  await waitUntil(()=>renders.length>=1);
  assert.equal(calls.filter(c=>c.hostname==="api.open-meteo.com").length,1);
  assert.equal(calls.filter(c=>c.hostname==="archive-api.open-meteo.com").length,1);
  const forecast=calls.find(c=>c.hostname==="api.open-meteo.com");
  assert.ok(forecast.searchParams.has("start_date"));
  assert.ok(forecast.searchParams.has("end_date"));
  assert.equal(forecast.searchParams.has("past_days"),false);
  assert.equal(forecast.searchParams.has("forecast_days"),false);
  assert.match(element("#status").textContent,/hourly records/);
  assert.match(element("#m-temp").textContent,/18.0/);
  assert.ok(renders[0][1].length>=2,"At least two chart series were rendered");
  assert.equal(element("#load").disabled,false,"Button is usable after load");

  const previousCalls=calls.length;
  element("#start").value="2027-01-02";
  element("#end").value="2027-01-01";
  await element("#load").fire("click");
  assert.equal(calls.length,previousCalls,"No API request is issued for invalid date input");
  assert.match(element("#status").textContent,/Could not load data/);
});
