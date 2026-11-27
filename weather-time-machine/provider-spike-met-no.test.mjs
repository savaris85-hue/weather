import test from "node:test";
import assert from "node:assert/strict";
import {metNorwayToWeatherRows,metSymbolToWmo,inspectProviderParity} from "./provider-spike-met-no.mjs";

test("MET Norway maps temperature, pressure, wind conversion, rain interval and codes",()=>{
 const response={properties:{timeseries:[
  {time:"2026-11-27T12:00:00Z",data:{
    instant:{details:{air_temperature:22.5,relative_humidity:55,air_pressure_at_sea_level:1016,
      cloud_area_fraction:35,dew_point_temperature:10,wind_speed:5,wind_speed_of_gust:8,
      wind_from_direction:220,ultraviolet_index_clear_sky:3}},
    next_1_hours:{details:{precipitation_amount:0.2,probability_of_precipitation:35},
      summary:{symbol_code:"lightrain_day"}}
  }}
 ]}};
 const [row]=metNorwayToWeatherRows(response);
 assert.equal(row.temperature_2m,22.5);
 assert.equal(row.wind_speed_10m,18);
 assert.equal(row.wind_gusts_10m,28.8);
 assert.equal(row.wind_direction_10m,220);
 assert.equal(row.precipitation,0.2);
 assert.equal(row.precipitation_probability,35);
 assert.equal(row.weather_code,61);
 assert.equal(row.shortwave_radiation,null);
});
test("MET Norway 6-hour total is not deceptively plotted as one-hour precipitation",()=>{
 const rows=metNorwayToWeatherRows({properties:{timeseries:[
 {time:"2026-11-27T18:00:00Z",data:{
   instant:{details:{air_temperature:15}},
   next_6_hours:{details:{precipitation_amount:12},summary:{symbol_code:"rain_night"}}
 }}
 ]}});
 assert.equal(rows[0].precipitation,null);
 assert.equal(rows[0].weather_code,63);
 assert.equal(rows[0].precipitation_probability,null);
});
test("feature-parity gate rejects provider with shorter forecasts and missing history",()=>{
 const start=Date.parse("2026-11-27T00:00:00Z");
 const rows=Array.from({length:11},(_,i)=>({
   t:(start+i*86400000)/1000,temperature_2m:15,wind_speed_10m:20
 }));
 const report=inspectProviderParity(rows,start);
 assert.equal(report.canReplace,false);
 assert.equal(report.supportsHistoryFrom1940,false);
 assert.equal(report.supportsMultiModelChoice,false);
 assert.equal(report.requiresServerSideCache,true);
 assert.equal(report.maxStepHours,24);
 assert.equal(report.coverage.shortwave_radiation,0);
 assert.equal(metSymbolToWmo("clearsky_day"),0);
 assert.equal(metSymbolToWmo("not-a-real-symbol"),null);
 assert.throws(()=>metNorwayToWeatherRows({}),/Invalid/);
});
