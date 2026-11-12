import test from "node:test";
import assert from "node:assert/strict";
import {moveDay, dayISO, splitDateChunks, validateRange, normalizeHourly, mergeHourly, aggregateForView, csvForRows, buildForecastParams, beaufort, windArrow, weatherIcon, FORECAST_MODELS, cumulativeRain, archiveBlocks, ALL_LAYERS} from "./data.mjs";
test("leap dates",()=>{assert.equal(moveDay("2024-02-28",1),"2024-02-29");assert.equal(dayISO(Date.UTC(2024,1,29)),"2024-02-29")});
test("chunks are contiguous",()=>assert.deepEqual(splitDateChunks("2025-01-01","2025-01-10",4),[{start:"2025-01-01",end:"2025-01-04"},{start:"2025-01-05",end:"2025-01-08"},{start:"2025-01-09",end:"2025-01-10"}]));
test("date validation",()=>{assert.throws(()=>validateRange("2025-04-02","2025-04-01"));assert.throws(()=>validateRange("2025-02-31","2025-03-01"));assert.throws(()=>validateRange("1940-01-01","2025-01-01"))});
test("API UTC timestamps",()=>{const a=normalizeHourly({hourly:{time:["2025-01-01T00:00"],temperature_2m:[10]}},"history");assert.equal(a[0].t,Date.parse("2025-01-01T00:00:00Z")/1000);assert.equal(a[0].pressure_msl,null)});
test("forecast supersedes overlap",()=>{const a=normalizeHourly({hourly:{time:["2025-01-01T00:00"],temperature_2m:[10]}},"history");const b=normalizeHourly({hourly:{time:["2025-01-01T00:00"],temperature_2m:[12]}},"forecast");const c=mergeHourly(a,b);assert.equal(c.length,1);assert.equal(c[0].kind,"forecast");assert.equal(c[0].temperature_2m,12)});
test("daily aggregation",()=>{const rows=normalizeHourly({hourly:{time:["2025-01-01T00:00","2025-01-01T01:00"],precipitation:[2,3],temperature_2m:[10,14]}},"history");const res=aggregateForView(rows,Date.parse("2025-01-01"),Date.parse("2025-03-20"));assert.equal(res.resolution,"daily");assert.equal(res.rows[0].precipitation,5);assert.equal(res.rows[0].temperature_2m,12)});
test("CSV export",()=>{const a=normalizeHourly({hourly:{time:["2025-01-01T00:00"],temperature_2m:[19]}},"history");const csv=csvForRows(a);assert.match(csv,/time_utc,source/);assert.match(csv,/2025-01-01T00:00:00.000Z,history,19/)});

test("forecast builder uses explicit date range and never sends mutually exclusive relative days",()=>{
  const q=new URLSearchParams(buildForecastParams(
    {latitude:37.9838,longitude:23.7275}, "2026-11-05", "2026-11-27"
  ));
  assert.equal(q.get("start_date"),"2026-11-05");
  assert.equal(q.get("end_date"),"2026-11-27");
  assert.equal(q.has("past_days"),false);
  assert.equal(q.has("forecast_days"),false);
  assert.ok(q.get("hourly").includes("precipitation_probability"));
  assert.equal(q.get("timezone"),"GMT");
});
test("forecast builder rejects bad locations and inverted date ranges",()=>{
  assert.throws(()=>buildForecastParams({latitude:NaN,longitude:23},"2026-11-05","2026-11-27"));
  assert.throws(()=>buildForecastParams({latitude:38,longitude:23},"2026-11-27","2026-11-05"));
});

test("Beaufort is correctly mapped from km/h, including bounds",()=>{
  assert.equal(beaufort(0),0);
  assert.equal(beaufort(5),1);
  assert.equal(beaufort(6),2);
  assert.equal(beaufort(19),3);
  assert.equal(beaufort(20),4);
  assert.equal(beaufort(39),6);
  assert.equal(beaufort(62),8);
  assert.equal(beaufort(118),12);
  assert.equal(beaufort(-1),null);
});
test("wind arrows point in blowing-to direction, and icons follow WMO",()=>{
  assert.equal(windArrow(0),"↓");
  assert.equal(windArrow(90),"←");
  assert.equal(windArrow(180),"↑");
  assert.equal(windArrow(270),"→");
  assert.equal(weatherIcon(0),"☀️");
  assert.equal(weatherIcon(3),"☁️");
  assert.equal(weatherIcon(95),"⛈️");
});
test("daily accumulation resets on UTC day boundary",()=>{
  const rows=[
    {t:Date.parse("2026-11-10T23:00:00Z")/1000,precipitation:1.5},
    {t:Date.parse("2026-11-11T00:00:00Z")/1000,precipitation:2},
    {t:Date.parse("2026-11-11T01:00:00Z")/1000,precipitation:.5}
  ];
  assert.deepEqual(cumulativeRain(rows,"daily").map(x=>x.rain_cumulative),[1.5,2,2.5]);
  assert.deepEqual(cumulativeRain(rows,"total").map(x=>x.rain_cumulative),[1.5,3.5,4]);
});
test("archive chunks are stable UTC-aligned for lazy backward browsing",()=>{
  const old=archiveBlocks("2025-12-31","2026-01-06",90);
  const repeat=archiveBlocks("2025-12-30","2026-01-06",90);
  assert.ok(old.length>=1);
  assert.deepEqual(old,repeat);
});
test("forecast model selection and chart layers are explicitly supported",()=>{
  assert.ok(FORECAST_MODELS.some(model=>model.id==="ecmwf_ifs025"));
  assert.ok(FORECAST_MODELS.some(model=>model.id==="ncep_gfs_seamless"));
  assert.ok(FORECAST_MODELS.some(model=>model.id==="icon_seamless"));
  assert.ok(ALL_LAYERS.some(layer=>layer.id==="rain_cumulative"));
  assert.equal(buildForecastParams({latitude:38,longitude:23},"2026-11-10","2026-11-20","ecmwf_ifs025").models,"ecmwf_ifs025");
});
