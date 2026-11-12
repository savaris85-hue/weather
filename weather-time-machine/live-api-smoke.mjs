import {FIELDS, dayISO, moveDay, buildForecastParams, FORECAST_MODELS} from "./data.mjs";
const today=dayISO(Date.now());
const place={latitude:37.89,longitude:23.74};
const start=moveDay(today,-2);
const end=moveDay(today,2);
const failures=[];
async function check(name,base,params) {
  const url=base+"?"+new URLSearchParams(params);
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
    const data=await response.json();
    if(!response.ok || !Array.isArray(data?.hourly?.time)) {
      failures.push(name+": HTTP "+response.status+" "+(data?.reason||"no hourly data"));
      return;
    }
    const count=data.hourly.time.length;
    console.log("OK",name,count,"hourly periods",Object.keys(data.hourly).length-1,"variables");
  } catch(error){ failures.push(name+": "+error.message); }
}
for(const model of FORECAST_MODELS) {
  await check("forecast "+model.label,"https://api.open-meteo.com/v1/forecast",
    buildForecastParams(place,start,end,model.id));
}
const archiveEnd=moveDay(today,-8);
await check("archive ERA5","https://archive-api.open-meteo.com/v1/archive",{
  latitude:place.latitude,longitude:place.longitude,models:"era5",
  hourly:FIELDS.join(","),start_date:moveDay(archiveEnd,-2),end_date:archiveEnd,
  timezone:"GMT",temperature_unit:"celsius",wind_speed_unit:"kmh",precipitation_unit:"mm"
});
if(failures.length) {
  console.error("Live API contract failures:\n"+failures.join("\n"));
  process.exitCode=1;
}
