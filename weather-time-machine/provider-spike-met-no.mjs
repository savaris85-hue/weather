// Feasibility spike only: this module is NOT imported by the production app.
// MET Norway is CC BY 4.0 and permits commercial reuse. Its API requires
// an identifiable User-Agent and is not recommended for direct browser calls.
// A production deployment would need a caching server-side adapter.
// The forecast has ~9-10 days, sometimes 6-hourly timestamps, and no ERA5 history.
const FIELDS={
  temperature_2m:"air_temperature",
  relative_humidity_2m:"relative_humidity",
  pressure_msl:"air_pressure_at_sea_level",
  cloud_cover:"cloud_area_fraction",
  dew_point_2m:"dew_point_temperature",
  wind_speed_10m:"wind_speed",
  wind_gusts_10m:"wind_speed_of_gust",
  wind_direction_10m:"wind_from_direction",
  uv_index:"ultraviolet_index_clear_sky"
};
// No shortwave_radiation or an ERA5 history counterpart.
// Rain for next_6_hours is a six-hour total, NOT an hourly amount.
const SYMBOLS={
  clearsky:0,fair:1,partlycloudy:2,cloudy:3,fog:45,
  lightrain:61,rain:63,heavyrain:65,
  lightsleet:66,sleet:67,heavysleet:67,
  lightsnow:71,snow:73,heavysnow:75,
  lightrainshowers:80,rainshowers:81,heavyrainshowers:82,
  lightsnowshowers:85,snowshowers:86,heavysnowshowers:86,
  rainandthunder:95,heavyrainandthunder:95
};
const number = input => Number.isFinite(input)?input:null;
export function metSymbolToWmo(symbol){
  if(!symbol)return null;
  return SYMBOLS[String(symbol).replace(/_(day|night|polartwilight)$/,"")]??null;
}
export function metNorwayToWeatherRows(payload){
  const points=payload?.properties?.timeseries;
  if(!Array.isArray(points))throw new Error("Invalid MET Norway locationforecast response");
  return points.map(point=>{
    const t=Date.parse(point.time)/1000;
    if(!Number.isFinite(t))return null;
    const instant=point.data?.instant?.details||{};
    const next1=point.data?.next_1_hours;
    // Hourly rain cannot be inferred from a 6-hour sum. Preserve a null gap.
    const row={t,kind:"forecast"};
    for(const [field,source] of Object.entries(FIELDS)){
      const value=number(instant[source]);
      row[field]=(field==="wind_speed_10m"||field==="wind_gusts_10m")&&value!==null
        ?value*3.6:value;
    }
    row.precipitation=number(next1?.details?.precipitation_amount);
    row.precipitation_probability=number(next1?.details?.probability_of_precipitation);
    row.weather_code=metSymbolToWmo(next1?.summary?.symbol_code ??
      point.data?.next_6_hours?.summary?.symbol_code ??
      point.data?.next_12_hours?.summary?.symbol_code);
    row.shortwave_radiation=null;
    return row;
  }).filter(Boolean);
}
export function inspectProviderParity(rows,nowMs=Date.now()){
  if(!Array.isArray(rows))throw new Error("Invalid rows");
  const times=rows.map(r=>r.t*1000).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!times.length)return {canReplace:false,reason:"No forecast data"};
  const gaps=times.slice(1).map((t,i)=>(t-times[i])/3600000);
  const fields=["temperature_2m","relative_humidity_2m","pressure_msl","cloud_cover",
    "dew_point_2m","wind_speed_10m","wind_gusts_10m","wind_direction_10m",
    "precipitation","precipitation_probability","uv_index","weather_code",
    "shortwave_radiation"];
  const coverage=Object.fromEntries(fields.map(field=>[field,
    rows.filter(row=>Number.isFinite(row[field])).length/rows.length]));
  const futureDays=(times[times.length-1]-nowMs)/86400000;
  const maxStepHours=Math.max(0,...gaps);
  return {
    canReplace:futureDays>=14&&maxStepHours<=1&&fields.every(field=>coverage[field]>=0.95),
    futureDays:Math.max(0,Math.round(futureDays*10)/10),
    maxStepHours,
    coverage,
    supportsHistoryFrom1940:false,
    supportsMultiModelChoice:false,
    requiresServerSideCache:true
  };
}
