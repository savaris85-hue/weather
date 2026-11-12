import test from "node:test";
import assert from "node:assert/strict";
import {historicalSamplesWindows,calculateClimateSummary,climateQueryParams,isClimateSupported,quantile,historicalSamplesCustomRange} from "./climate.mjs";

test("30-day or shorter climatology uses same calendar dates in each preceding year",()=>{
 const items=historicalSamplesWindows("2026-11-09","2026-11-23",44,2026);
 assert.equal(items.length,44);
 assert.equal(items[0].year,1982);
 assert.deepEqual(items.at(-1),{year:2025,start:"2025-11-09",end:"2025-11-23"});
 assert.equal(isClimateSupported("2026-11-09","2026-11-23"),true);
 assert.equal(isClimateSupported("2024-01-01","2024-03-01"),false);
});
test("climatology handles year rollover safely and non-leap February",()=>{
 const periods=historicalSamplesWindows("2026-12-26","2027-01-08",10,2026);
 assert.deepEqual(periods.at(-1),{year:2025,start:"2025-12-26",end:"2026-01-08"});
 const leap=historicalSamplesWindows("2024-02-29","2024-02-29",2,2024);
 assert.equal(leap.at(-1).start,"2023-02-28");
});
test("percentiles are real calculated 10th/90th percentiles, not previous-year values",()=>{
 assert.equal(quantile([0,10,20,30,40],.1),4);
 assert.equal(quantile([0,10,20,30,40],.9),36);
 assert.equal(quantile([],.5),null);
});
test("historical summary aggregates actual same-day hourly distributions",()=>{
 const yearValues=[13,15,17,19,21,23,25,27,29,31];
 const samples=yearValues.map((temperature_2m,i)=>({
  year:2016+i,
  rows:[{t:Date.parse((2016+i)+"-11-12T12:00:00Z")/1000,
    temperature_2m,wind_speed_10m:16,relative_humidity_2m:65}]
 }));
 const stats=calculateClimateSummary(samples,"2026-11-12","2026-11-12");
 assert.equal(stats.years,10);
 assert.deepEqual(stats.yearRange,[2016,2025]);
 assert.equal(stats.times.length,24);
 assert.equal(stats.fields.temperature_2m.count[12],10);
 assert.equal(stats.fields.temperature_2m.mean[12],22);
 assert.equal(stats.fields.temperature_2m.p10[12],14.8);
 assert.ok(Math.abs(stats.fields.temperature_2m.p90[12]-29.2)<1e-9);
 assert.equal(stats.previous.temperature_2m[12],31);
 assert.equal(stats.fields.temperature_2m.mean[11],null);
});
test("historical fetch only requests real ERA5 variables, never forecast probability",()=>{
 const q=new URLSearchParams(climateQueryParams({latitude:37.89,longitude:23.74},
   "2020-11-11","2020-11-23"));
 assert.equal(q.get("models"),"era5");
 assert.equal(q.get("timezone"),"GMT");
 assert.ok(q.get("hourly").includes("temperature_2m"));
 assert.ok(!q.get("hourly").includes("precipitation_probability"));
 assert.equal(q.get("start_date"),"2020-11-11");
 assert.equal(q.has("past_days"),false);
});

test("single-year and two/three-year baselines are supported and not mislabeled as decades",()=>{
  const one=historicalSamplesWindows("2026-11-10","2026-11-15",1,2026);
  assert.deepEqual(one,[{year:2025,start:"2025-11-10",end:"2025-11-15"}]);
  const two=historicalSamplesWindows("2026-11-10","2026-11-15",2,2026);
  assert.deepEqual(two.map(x=>x.year),[2024,2025]);
  const three=historicalSamplesWindows("2026-11-10","2026-11-15",3,2026);
  assert.deepEqual(three.map(x=>x.year),[2023,2024,2025]);
  const stats=calculateClimateSummary([{year:2025,rows:[
    {t:Date.parse("2025-11-10T12:00:00Z")/1000,temperature_2m:23}
  ]}],"2026-11-10","2026-11-10");
  assert.equal(stats.fields.temperature_2m.count[12],1);
  assert.equal(stats.fields.temperature_2m.mean[12],23);
  assert.equal(stats.fields.temperature_2m.p10[12],23);
  assert.equal(stats.fields.temperature_2m.p90[12],23);
});
test("selected custom historical reference years are explicit and bounded",()=>{
  const windows=historicalSamplesCustomRange("2026-11-11","2026-11-18",1999,2004);
  assert.deepEqual(windows.map(w=>w.year),[1999,2000,2001,2002,2003,2004]);
  assert.deepEqual(windows.at(0),{year:1999,start:"1999-11-11",end:"1999-11-18"});
  assert.throws(()=>historicalSamplesCustomRange("2026-11-11","2026-11-18",1940,2020));
  assert.throws(()=>historicalSamplesCustomRange("2026-11-11","2026-11-18",2020,2019));
  assert.throws(()=>historicalSamplesCustomRange("2026-11-11","2026-11-18",2026,2026));
});
