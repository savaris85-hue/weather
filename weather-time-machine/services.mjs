// Shared browser-side limiter for the free weather API. Foreground forecasts
// take priority over optional climatology requests. Never retry indefinitely.
export function createWeatherRequestQueue(fetcher, options={}) {
  const minGap=options.minGapMs ?? 1200;
  const sleeper=options.sleep ?? (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const clock=options.now ?? (()=>Date.now());
  const tasks=[];
  let active=false, nextAt=0, cooldownUntil=0;
  async function drain() {
    if(active)return;
    active=true;
    try {
      while(tasks.length){
        tasks.sort((a,b)=>b.priority-a.priority || a.order-b.order);
        const job=tasks.shift();
        if(job.signal?.aborted) {job.reject(abortError());continue}
        try {
          const ready=Math.max(nextAt,cooldownUntil);
          if(ready>clock())await sleeper(ready-clock());
          if(job.signal?.aborted)throw abortError();
          const response=await fetcher(job.url,{signal:job.signal});
          nextAt=clock()+minGap;
          if(response.status===429) {
            let reason="Too many requests";
            try {const json=await response.json();reason=json.reason||reason}catch{}
            const seconds=Math.max(1,Math.min(60,Number(response.headers?.get?.("retry-after"))||0));
            cooldownUntil=Math.max(cooldownUntil,clock()+
              (seconds>1 ? seconds*1000 : [4000,10000,18000][Math.min(job.attempt,2)]));
            if(job.attempt<2 && !job.signal?.aborted) {
              tasks.push({...job,attempt:job.attempt+1});
            }else job.reject(Object.assign(new Error("Open-Meteo HTTP 429 — όριο αιτημάτων. Δοκίμασε ξανά σε λίγο."),{status:429,reason}));
            continue;
          }
          if(!response.ok) {
            let reason="";
            try{const payload=await response.json();reason=payload.reason||""}catch{}
            throw Object.assign(new Error("Open-Meteo HTTP "+response.status+(reason?" — "+reason:"")),{status:response.status});
          }
          job.resolve(await response.json());
        }catch(error){job.reject(error)}
      }
    }finally {active=false}
  }
  let order=0;
  return function request(url,signal,priority=5){
    if(signal?.aborted)return Promise.reject(abortError());
    return new Promise((resolve,reject)=>{
      tasks.push({url,signal,priority,order:order++,attempt:0,resolve,reject});
      void drain();
    });
  };
}
function abortError(){const error=new Error("Aborted");error.name="AbortError";return error}
export function placeLabel(place) {
  if(!place)return "Επιλεγμένη περιοχή";
  const name=String(place.name||"").trim();
  const country=String(place.country||"").trim();
  if(!name || /^coordinates$/i.test(name) || /^coordinates[\s,]/i.test(name))return "Επιλεγμένη περιοχή";
  return country && !name.toLocaleLowerCase().includes(country.toLocaleLowerCase())?name+", "+country:name;
}
export function nearestPlaceName(result) {
  const a=result?.address||{};
  const local=[a.neighbourhood,a.suburb,a.quarter,a.city_district,a.village,a.town,a.city,a.municipality,a.hamlet,a.county,a.state].find(x=>typeof x==="string"&&x.trim());
  if(!local)return null;
  const country=typeof a.country==="string"?a.country:"";
  return {name:local.trim(),country,timezone:"GMT"};
}
