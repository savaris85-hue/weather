import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dayISO,moveDay} from "./data.mjs";

class Element {
  constructor() {
    this.children=[];this.listeners={};this.dataset={};this.value="";
    this.textContent="";this.disabled=false;this.hidden=false;this.style={};
    this.classList={toggle(){},remove(){},add(){}};
  }
  addEventListener(name,callback){this.listeners[name]=callback}
  fire(name){return this.listeners[name]?.()}
  append(...elements){this.children.push(...elements)}
  replaceChildren(...elements){this.children=elements}
  setAttribute(name,value){this[name]=value}
  on(name,callback){this.listeners[name]=callback}
  closest(){return null}
  remove(){}
  click(){}
}
const nodes=new Map();
const element=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element());return nodes.get(selector)};
const presets=[3,7,15,1095].map(days=>{const btn=new Element();btn.dataset.span=String(days);return btn});
const docs={
  querySelector:element,
  querySelectorAll:selector=>selector==="[data-span]"?presets:[],
  createElement:()=>new Element(),
  addEventListener(){},
  body:{append(){}}
};
const calls=[];
const plotted=[];
const originalGlobal={};
for(const k of ["document","window","Plotly","fetch","localStorage"])originalGlobal[k]=globalThis[k];
globalThis.document=docs;
globalThis.window={innerWidth:1200};
globalThis.localStorage={getItem:()=>null,setItem(){}};
globalThis.Plotly={react:async(...args)=>{plotted.push(args)}};
globalThis.fetch=async(url)=>{
  const u=new URL(url);calls.push(u);
  if(u.hostname==="api.open-meteo.com" &&
      (u.searchParams.has("past_days")||u.searchParams.has("forecast_days")) &&
      (u.searchParams.has("start_date")||u.searchParams.has("end_date"))) {
    return {ok:false,status:400,json:async()=>({reason:"Conflicting date parameters"})};
  }
  const requested=u.searchParams.get("hourly").split(",");
  const start=u.searchParams.get("start_date"),end=u.searchParams.get("end_date");
  const times=[start+"T12:00",moveDay(start,Math.min(8,Math.floor((Date.parse(end)-Date.parse(start))/86400000)))+"T12:00"];
  const hourly={time:times};
  for(const key of requested){
    hourly[key]=key==="weather_code"?[1,3]:key==="temperature_2m"?[19,21]:
      key==="precipitation"?[.1,.3]:key==="wind_speed_10m"?[17,22]:
      key==="wind_direction_10m"?[90,270]:[70,80];
  }
  return {ok:true,status:200,json:async()=>({hourly})};
};
async function until(predicate,tries=1500) {
 for(let i=0;i<tries;i++){
   if(predicate())return;
   await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error("Timed out");
}
test("page loads all required controls and boots the multi-layer chart",async()=>{
  const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
  assert.match(html,/src="\.\/app\.mjs"/);
  assert.match(html,/id="map"/);
  assert.match(html,/id="layer-panel"/);
  assert.match(html,/value="ncep_gfs_seamless"/);
  await import("./app.mjs");
  await until(()=>plotted.length>=1);
  assert.ok(plotted.some(args=>args[0]===element("#plot") && args[1].length>=12),"multiple weather layers drawn");
  assert.equal(element("#load").disabled,false);
  assert.match(element("#status").textContent,/σημεία στο γράφημα/);
  assert.ok(calls.some(url=>url.hostname==="archive-api.open-meteo.com"));
  const forecast=calls.find(url=>url.hostname==="api.open-meteo.com");
  assert.ok(forecast);
  assert.equal(forecast.searchParams.get("models"),"best_match");
  assert.equal(forecast.searchParams.has("past_days"),false);
  assert.equal(forecast.searchParams.has("forecast_days"),false);
  assert.equal(forecast.searchParams.get("temperature_unit"),"celsius");
  assert.equal(forecast.searchParams.get("wind_speed_unit"),"kmh");
});
test("changing forecast model requests corresponding model and redraws charts",async()=>{
  const previous=plotted.length;
  element("#model").value="ncep_gfs_seamless";
  element("#model").fire("change");
  await until(()=>plotted.length>previous);
  const modelCalls=calls.filter(url=>url.hostname==="api.open-meteo.com");
  assert.equal(modelCalls.at(-1).searchParams.get("models"),"ncep_gfs_seamless");
  assert.match(element("#chart-title").textContent,/NOAA GFS/);
});
test("pastward timeline pan fetches new historical data without full reset",async()=>{
  const originalCount=calls.filter(c=>c.hostname==="archive-api.open-meteo.com").length;
  const past=moveDay(dayISO(Date.now()),-240);
  const old=moveDay(past,-15);
  element("#plot").fire("plotly_relayout");
  element("#plot").listeners.plotly_relayout({
    "xaxis.range[0]":old+"T00:00:00.000Z",
    "xaxis.range[1]":past+"T23:59:59.000Z"
  });
  await until(()=>calls.filter(c=>c.hostname==="archive-api.open-meteo.com").length>originalCount);
  assert.ok(plotted.length>=3);
});
test("invalid dates cause no API request",async()=>{
  const before=calls.length;
  element("#start").value="2026-11-20";
  element("#end").value="2026-11-10";
  element("#load").fire("click");
  assert.equal(calls.length,before);
  assert.match(element("#status").textContent,/πρέπει να προηγείται/);
});
