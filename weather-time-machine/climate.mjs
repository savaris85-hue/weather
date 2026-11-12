// Original ERA5 climatology calculations using Open-Meteo historical weather data.
const DAY=86400000;
const FIELDS=["temperature_2m","relative_humidity_2m","dew_point_2m","cloud_cover","precipitation","pressure_msl","wind_speed_10m","shortwave_radiation"];
export const CLIMATE_FIELDS=Object.freeze(FIELDS);
export const MIN_CLIMATE_YEARS=1;
const iso=ms=>new Date(ms).toISOString().slice(0,10);
const shiftYear=(date,year)=>{
  const mmdd=date.slice(5);
  // Non-leap-year February 29 is compared with February 28.
  return year+"-"+(mmdd==="02-29" && !(year%4===0&&(year%100!==0||year%400===0))?"02-28":mmdd);
};
export function historicalSamplesWindows(start,end,years=20,nowYear=2026) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))throw Error("Invalid ISO dates");
  const begin=Date.parse(start+"T00:00:00Z"),finish=Date.parse(end+"T00:00:00Z");
  const days=(finish-begin)/DAY+1;
  if(!Number.isFinite(days)||days<1||days>32)return [];
  const referenceStartYear=Number(start.slice(0,4));
  const maxYear=Math.min(nowYear-1,referenceStartYear-1);
  const first=Math.max(1940,maxYear-years+1);
  const wraps=Number(end.slice(0,4))>referenceStartYear;
  const periods=[];
  for(let year=first;year<=maxYear;year++) {
    const a=shiftYear(start,year);
    const b=shiftYear(end,year+(wraps?1:0));
    if(b<a) continue;
    periods.push({year,start:a,end:b});
  }
  return periods;
}
const keyFromDate=s=>s.slice(5,10)+"T"+s.slice(11,13);
const average=values=>values.reduce((a,b)=>a+b,0)/values.length;
export function quantile(sorted,position) {
  if(!sorted.length)return null;
  if(sorted.length===1)return sorted[0];
  const p=(sorted.length-1)*Math.max(0,Math.min(1,position));
  const lo=Math.floor(p),hi=Math.ceil(p),f=p-lo;
  return sorted[lo]*(1-f)+sorted[hi]*f;
}
export function calculateClimateSummary(sampleSets,targetStart,targetEnd,minimum=MIN_CLIMATE_YEARS) {
  const index=new Map();
  const byYear=new Map();
  for(const {year,rows} of sampleSets){
    const yrIndex=new Map();
    for(const row of rows){
      if(!Number.isFinite(row.t))continue;
      const t=new Date(row.t*1000).toISOString();
      const key=keyFromDate(t);
      const item=index.get(key)||{};
      for(const field of FIELDS) {
        const number=row[field];
        if(Number.isFinite(number)){
          if(!item[field])item[field]=[];
          item[field].push(number);
        }
      }
      index.set(key,item);yrIndex.set(key,row);
    }
    byYear.set(year,yrIndex);
  }
  const start=Date.parse(targetStart+"T00:00:00Z"),end=Date.parse(targetEnd+"T00:00:00Z");
  const times=[];
  const fields=Object.fromEntries(FIELDS.map(field=>[field,{mean:[],p10:[],p90:[],count:[]}]));
  const previous=Object.fromEntries(FIELDS.map(field=>[field,[]]));
  const lastYear=Number(targetStart.slice(0,4))-1;
  for(let t=start;t<end+DAY;t+=3600000){
    const date=new Date(t).toISOString();
    const key=keyFromDate(date);
    const row=index.get(key)||{};
    times.push(date);
    for(const field of FIELDS){
      const nums=(row[field]||[]).slice().sort((a,b)=>a-b);
      const enough=nums.length>=minimum;
      fields[field].mean.push(enough?average(nums):null);
      fields[field].p10.push(enough?quantile(nums,.1):null);
      fields[field].p90.push(enough?quantile(nums,.9):null);
      fields[field].count.push(nums.length);
      const prior=byYear.get(lastYear)?.get(key)?.[field];
      previous[field].push(Number.isFinite(prior)?prior:null);
    }
  }
  return {times,fields,previous,years:sampleSets.length,yearRange:sampleSets.length?
    [Math.min(...sampleSets.map(x=>x.year)),Math.max(...sampleSets.map(x=>x.year))]:null};
}
export function climateQueryParams(location,start,end) {
  if(!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude))throw Error("Invalid coordinates");
  return {latitude:location.latitude,longitude:location.longitude,
    hourly:FIELDS.join(","),models:"era5",
    start_date:start,end_date:end,timezone:"GMT",
    temperature_unit:"celsius",wind_speed_unit:"kmh",precipitation_unit:"mm"};
}
export function isClimateSupported(start,end) {
  const delta=(Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/DAY;
  return delta>=0&&delta<=31;
}


// A user-selected climatology baseline is a list of *whole reference years*
// rather than an arbitrary subset of dates. Each year's month/day/hour
// is matched to the visible calendar period, including year-crossing periods.
// Allow 1-44 years to avoid excessive free-API requests.
export function historicalSamplesCustomRange(start,end,fromYear,toYear) {
  if(!Number.isInteger(fromYear)||!Number.isInteger(toYear) ||
     fromYear<1940||toYear<fromYear||toYear-fromYear+1>44 ||
     toYear>Math.min(2025,Number(start.slice(0,4))-1)) {
    throw new Error("Επίλεξε συνεχόμενα 1–44 έτη από το 1940 έως το προηγούμενο έτος.");
  }
  const days=(Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/DAY+1;
  if(!Number.isFinite(days)||days<1||days>32) return [];
  const wraps=Number(end.slice(0,4))>Number(start.slice(0,4));
  return Array.from({length:toYear-fromYear+1},(_,i)=>{
    const year=fromYear+i;
    return {year,start:shiftYear(start,year),end:shiftYear(end,year+(wraps?1:0))};
  });
}
