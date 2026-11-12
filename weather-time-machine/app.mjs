import {
  FIELDS, EARLIEST, MAX_DAYS, dayISO, moveDay, validateRange,
  normalizeHourly, mergeHourly, aggregateForView, csvForRows,
  buildForecastParams, beaufort, windArrow, weatherIcon,
  FORECAST_MODELS, ALL_LAYERS, DEFAULT_LAYERS, cumulativeRain,
  archiveBlocks
} from "./data.mjs";
import {historicalSamplesWindows, historicalSamplesCustomRange, climateQueryParams, calculateClimateSummary, isClimateSupported} from "./climate.mjs";

const $ = selector => document.querySelector(selector);
const DAY = 86400000;
const iso = ms => dayISO(ms);
const startOfDay = date => Date.parse(date + "T00:00:00Z");
const today = iso(Date.now());
const cutoff = moveDay(today, -6); // ERA5 is normally released with ~5 days of lag.
const earliestMs = startOfDay(EARLIEST);
const DEFAULT_COORDS = { name:"Elliniko",country:"Greece",latitude:37.89,longitude:23.74,timezone:"Europe/Athens" };
const ARCHIVE_CHUNK_DAYS = 90;
const MIN_WINDOW_MS = 3 * 3600000;
const NAV_PRELOAD_DAYS = 6;
const LAYOUT_KEY = "wtm-layout-v4";
const PIN_KEY = "wtm-pinned-cities-v1";
const PALETTES = {
  classic:{history:"#243446",forecast:"#d8392d",climate:"#98a4b3"},
  ocean:{history:"#173f7a",forecast:"#009eae",climate:"#93a7bc"},
  contrast:{history:"#171717",forecast:"#a11386",climate:"#68788c"}
};
const LAYER_CLASSIC = Object.freeze({
  icons:"#b98218",cloud_cover:"#617c9b",precipitation_probability:"#b04b68",
  precipitation:"#247fca",rain_cumulative:"#356ab5",temperature_2m:"#d94437",
  relative_humidity_2m:"#1498a6",dew_point_2m:"#a5658e",
  pressure_msl:"#555db7",wind_speed_10m:"#b6772d",
  wind_gusts_10m:"#8754a2",wind_direction_10m:"#277e68",
  shortwave_radiation:"#d19415",uv_index:"#8060bc"
});
function paletteColors(palette){
  const shift = palette==="ocean"?{temperature_2m:"#008cba",relative_humidity_2m:"#118b8f",pressure_msl:"#225aa9",wind_speed_10m:"#277a8d"}:
    palette==="contrast"?{temperature_2m:"#a11386",relative_humidity_2m:"#153377",precipitation:"#424299"}:{};
  return {...LAYER_CLASSIC,...shift};
}
function blend(hex,other,amount){
  const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const a=rgb(hex),b=rgb(other);
  return "#"+a.map((v,i)=>Math.round(v*(1-amount)+b[i]*amount).toString(16).padStart(2,"0")).join("");
}
function layerColor(id){return state.layerColors[id]||state.colors.forecast}
function lineColor(id,history){return blend(layerColor(id),history?"#ffffff":"#101522",history?.45:.2)}
const controls = {
  place:$("#place"), start:$("#start"), end:$("#end"), model:$("#model"),
  status:$("#status"), plot:$("#plot"), layers:$("#layer-panel")
};
const state = {
  place:{...DEFAULT_COORDS}, model:"best_match",
  enabled:new Set(DEFAULT_LAYERS), rainMode:"daily",
  archive:new Map(), forecast:new Map(), rows:[],
  view:null, controller:null, loadId:0,
  renderPending:false, plotting:false, plotBound:false,
  map:null, marker:null, debounce:null, searchId:0, loading:false,
  climateYears:20, climate:null, climateKey:null, climateCache:new Map(), climateController:null, climateTimer:null,
  compareLastYear:false, palette:"classic", colors:{...PALETTES.classic}, rowHeight:112,
  layerColors:paletteColors("classic"), forecastWeight:3.5, pins:[],
  climateYearFrom:2000,climateYearTo:2020,
  overviewBound:false, overviewPlotting:false
};
const formatDate = value => new Date(value).toLocaleDateString("el-GR",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});
const fmt = (v,digits=0) => Number.isFinite(v) ? Number(v).toFixed(digits) : "—";
const showStatus = (message,error=false) => {
  controls.status.textContent=message;
  controls.status.className=error?"error":"";
};
const modelConfig = () => FORECAST_MODELS.find(m=>m.id===state.model)||FORECAST_MODELS[0];
const maxForecast = () => moveDay(today,modelConfig().days-1);
const maxMs = () => startOfDay(moveDay(maxForecast(),1))-1;
function clampViewport(from,to) {
  let a=Math.max(earliestMs,from),b=Math.min(maxMs(),to);
  if(b-a<MIN_WINDOW_MS) {
    b=Math.min(maxMs(),a+MIN_WINDOW_MS);
    a=Math.max(earliestMs,b-MIN_WINDOW_MS);
  }
  return [a,b];
}
function applyPreset(days) {
  const end=moveDay(today,Math.min(modelConfig().days-1,11));
  const start=moveDay(end,-days+1);
  state.view=clampViewport(startOfDay(start),startOfDay(moveDay(end,1))-1);
  syncDates();
  document.querySelectorAll("[data-span]").forEach(button => {
    button.classList.toggle("active",Number(button.dataset.span)===days);
  });
}
function syncDates() {
  controls.start.value=iso(state.view[0]);
  controls.end.value=iso(state.view[1]);
  updateStickyDates();
  updateRangeLabels();
}
function query(base,parameters) {return base+"?"+new URLSearchParams(parameters).toString();}
async function json(url,signal) {
  const response=await fetch(url,{signal});
  if(!response.ok) {
    let reason="";
    try { const payload=await response.json(); reason=payload.reason||""; } catch {}
    throw new Error("Open-Meteo HTTP "+response.status+(reason?" — "+reason:""));
  }
  return response.json();
}
async function limitedMap(items,worker,limit=3) {
  let index=0;
  const results=new Array(items.length);
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(index<items.length) {
      const i=index++;
      results[i]=await worker(items[i],i);
    }
  }));
  return results;
}
function archiveQuery(start,end) {
  return query("https://archive-api.open-meteo.com/v1/archive",{
    latitude:state.place.latitude,longitude:state.place.longitude,
    hourly:FIELDS.join(","),start_date:start,end_date:end,
    timezone:"GMT",models:"era5",
    temperature_unit:"celsius",wind_speed_unit:"kmh",precipitation_unit:"mm"
  });
}
function forecastQuery() {
  // Explicit dates; NEVER combine with past_days or forecast_days (HTTP 400).
  const from=moveDay(today,-7),to=maxForecast();
  return query("https://api.open-meteo.com/v1/forecast",
    buildForecastParams(state.place,from,to,state.model));
}
function resetData() {
  if(state.controller) state.controller.abort();
  state.archive.clear();state.forecast.clear();state.rows=[];
  state.climateCache.clear();state.climate=null;state.climateKey=null;
  if(state.climateController)state.climateController.abort();
  state.loadId++;
}
function rebuildRows() {
  const historical=[...state.archive.values()].flat();
  const prediction=state.forecast.get(state.model)||[];
  state.rows=mergeHourly(historical,prediction);
}
async function ensureData(from,to,signal) {
  const min=iso(Math.max(earliestMs,from-NAV_PRELOAD_DAYS*DAY));
  const requestedEnd=iso(Math.min(maxMs(),to+NAV_PRELOAD_DAYS*DAY));
  const historyEnd=requestedEnd<cutoff?requestedEnd:cutoff;
  let needed=[];
  if(min<=historyEnd) {
    needed=archiveBlocks(min,historyEnd,ARCHIVE_CHUNK_DAYS)
      .filter(block=>!state.archive.has(block.key));
  }
  const forecastNeeded=to >= startOfDay(moveDay(today,-7)) && !state.forecast.has(state.model);
  if(!needed.length && !forecastNeeded) return;
  const tasks=[];
  if(needed.length) {
    tasks.push(limitedMap(needed,async(block,index)=>{
      const fromDate=block.start<EARLIEST?EARLIEST:block.start;
      const toDate=block.end>cutoff?cutoff:block.end;
      const api=await json(archiveQuery(fromDate,toDate),signal);
      if(signal.aborted) return;
      state.archive.set(block.key,normalizeHourly(api,"history"));
      showStatus("Φόρτωση παλιότερων δεδομένων: "+(index+1)+"/"+needed.length);
    },3));
  }
  if(forecastNeeded) tasks.push((async()=>{
    const api=await json(forecastQuery(),signal);
    if(signal.aborted) return;
    state.forecast.set(state.model,normalizeHourly(api,"forecast"));
  })());
  await Promise.all(tasks);
  if(signal.aborted)return;
  rebuildRows();
}
async function refresh(options={}) {
  const reason=options.reason||"navigation";
  if(state.controller)state.controller.abort();
  const controller=new AbortController();state.controller=controller;
  const id=++state.loadId;
  state.loading=true;
  $("#load").disabled=true;
  try {
    state.view=clampViewport(state.view[0],state.view[1]);
    syncDates();
    showStatus("Φόρτωση δεδομένων · "+modelConfig().label+"…");
    await ensureData(state.view[0],state.view[1],controller.signal);
    if(controller.signal.aborted || id!==state.loadId)return;
    await renderChart();
    if(controller.signal.aborted || id!==state.loadId)return;
    updateCurrent();
    scheduleClimate();
    const visible=aggregateForView(state.rows,state.view[0],state.view[1]);
    showStatus("✓ "+visible.rows.length.toLocaleString("el-GR")+" σημεία στο γράφημα · "+
      (visible.resolution==="hourly"?"ωριαία":"ημερήσια")+" ανάλυση · "+
      "σύρε αριστερά για πιο παλιά δεδομένα ("+reason+")");
  } catch(error) {
    if(error?.name!=="AbortError" && id===state.loadId) {
      showStatus("Δεν φορτώθηκαν όλα τα δεδομένα: "+error.message,true);
    }
  } finally {
    if(id===state.loadId){state.loading=false;$("#load").disabled=false}
  }
}
function moveWindow(direction) {
  const width=state.view[1]-state.view[0];
  const shift=Math.max(DAY,Math.round(width*.8))*direction;
  state.view=clampViewport(state.view[0]+shift,state.view[1]+shift);
  syncDates();
  refresh({reason:direction<0?"past":"future"});
}
function zoom(factor) {
  const mid=(state.view[0]+state.view[1])/2;
  const half=Math.max(MIN_WINDOW_MS/2,(state.view[1]-state.view[0])*factor/2);
  state.view=clampViewport(mid-half,mid+half);
  syncDates();refresh({reason:"zoom"});
}
function chooseDates() {
  const start=controls.start.value,end=controls.end.value;
  validateRange(start,end);
  if(end>maxForecast()) throw new Error("Το μοντέλο "+modelConfig().label+" προβλέπει έως "+maxForecast()+".");
  state.view=clampViewport(startOfDay(start),startOfDay(moveDay(end,1))-1);
}
function clearSelectedPreset() {
  document.querySelectorAll("[data-span]").forEach(button=>button.classList.remove("active"));
}
function pinKey(place){return Number(place.latitude).toFixed(3)+":"+Number(place.longitude).toFixed(3)}
function persistPins(){
  try{localStorage.setItem(PIN_KEY,JSON.stringify(state.pins))}catch{/* browser may disable storage */}
}
function renderPins(){
  const target=$("#pinned-cities");target.replaceChildren();
  $("#pin-count").textContent=state.pins.length+"/5";
  const active=state.pins.some(p=>pinKey(p)===pinKey(state.place));
  $("#pin-current").textContent=active?"★ Αποθηκευμένη":"☆ Αποθήκευση πόλης";
  $("#pin-current").disabled=active||state.pins.length>=5;
  if(!state.pins.length){
    const empty=document.createElement("span");
    empty.className="pin-empty";empty.textContent="Καρφίτσωσε έως 5 πόλεις για γρήγορη εναλλαγή.";
    target.append(empty);
  }
  state.pins.forEach((place,index)=>{
    const wrapper=document.createElement("span");wrapper.className="pin-item";
    if(pinKey(place)===pinKey(state.place))wrapper.classList.add("active");
    const open=document.createElement("button");open.className="pin-chip";open.type="button";
    open.textContent=place.name+", "+(place.country||"");
    open.title="Μετάβαση σε "+place.name;
    open.addEventListener("click",()=>{
      state.place={...place};
      controls.place.value=place.name+", "+(place.country||"");
      locationChanged();
    });
    const remove=document.createElement("button");remove.className="pin-remove";remove.type="button";
    remove.setAttribute("aria-label","Αφαίρεση "+place.name);
    remove.textContent="×";
    remove.addEventListener("click",()=>{
      state.pins.splice(index,1);persistPins();renderPins();
    });
    wrapper.append(open,remove);target.append(wrapper);
  });
}
function restorePins(){
  try{
    const pins=JSON.parse(localStorage.getItem(PIN_KEY)||"[]");
    if(Array.isArray(pins))state.pins=pins.filter(p=>p&&Number.isFinite(p.latitude)&&
      Number.isFinite(p.longitude)&&typeof p.name==="string").slice(0,5);
  }catch{state.pins=[]}
  renderPins();
}
$("#pin-current").addEventListener("click",()=>{
  if(state.pins.length>=5 || state.pins.some(p=>pinKey(p)===pinKey(state.place)))return;
  state.pins.push({...state.place});persistPins();renderPins();
});
function layerList() {
  const target=$("#layer-options");target.replaceChildren();
  ALL_LAYERS.forEach(layer=>{
    const label=document.createElement("label");label.className="layer-item";
    const check=document.createElement("input");check.type="checkbox";check.checked=state.enabled.has(layer.id);
    check.dataset.layer=layer.id;check.addEventListener("change",()=>{
      if(check.checked)state.enabled.add(layer.id);else state.enabled.delete(layer.id);
      renderChart();
    });
    const title=document.createElement("span");title.className="layer-title";title.textContent=layer.label;
    const picker=document.createElement("input");picker.type="color";picker.className="layer-color";
    picker.value=state.layerColors[layer.id]||LAYER_CLASSIC[layer.id];picker.dataset.layerColor=layer.id;
    picker.setAttribute("aria-label","Χρώμα: "+layer.label);
    picker.setAttribute("title","Χρώμα γραμμής: "+layer.label);
    picker.addEventListener("input",()=>{
      state.layerColors[layer.id]=picker.value;
      state.palette="custom";$("#wave-palette").value="custom";
      renderChart();
    });
    label.append(check,title,picker);target.append(label);
  });
}
function persistLayout() {
  try {localStorage.setItem(LAYOUT_KEY,JSON.stringify({layers:[...state.enabled],rainMode:state.rainMode,
    climateYears:state.climateYears,compareLastYear:state.compareLastYear,
    palette:state.palette,colors:state.colors,rowHeight:state.rowHeight,
    layerColors:state.layerColors,forecastWeight:state.forecastWeight,
    climateYearFrom:state.climateYearFrom,climateYearTo:state.climateYearTo}));}
  catch {showStatus("Η αποθήκευση δεν είναι διαθέσιμη σε αυτόν τον browser.",true);}
}
function restoreLayout() {
  try {
    const saved=JSON.parse(localStorage.getItem(LAYOUT_KEY)||"null");
    if(saved && Array.isArray(saved.layers)) {
      state.enabled=new Set(saved.layers.filter(id=>ALL_LAYERS.some(x=>x.id===id)));
      state.rainMode=saved.rainMode==="total"?"total":"daily";
      state.climateYears=[0,1,2,3,10,20,44,"custom"].includes(saved.climateYears)?saved.climateYears:20;
      state.compareLastYear=!!saved.compareLastYear;
      state.rowHeight=Number.isFinite(saved.rowHeight)?Math.min(190,Math.max(82,saved.rowHeight)):112;
      state.palette=PALETTES[saved.palette]?saved.palette:(saved.palette==="custom"?"custom":"classic");
      state.colors={...PALETTES.classic,...(saved.colors||{})};
      state.layerColors={...paletteColors(state.palette),...Object.fromEntries(
        Object.entries(saved.layerColors||{}).filter(([key,value])=>ALL_LAYERS.some(x=>x.id===key)&&/^#[0-9a-fA-F]{6}$/.test(value))
      )};
      state.forecastWeight=Number.isFinite(saved.forecastWeight)?Math.max(2,Math.min(5,saved.forecastWeight)):3.5;
      state.climateYearFrom=Number.isInteger(saved.climateYearFrom)?saved.climateYearFrom:2000;
      state.climateYearTo=Number.isInteger(saved.climateYearTo)?saved.climateYearTo:2020;
    }
  } catch {/* private mode, no local storage */}
  $("#rain-mode").value=state.rainMode;
  $("#climate-years").value=String(state.climateYears);
  $("#climate-year-from").value=String(state.climateYearFrom);
  $("#climate-year-to").value=String(state.climateYearTo);
  $("#climate-custom-range").hidden=state.climateYears!=="custom";
  $("#forecast-weight").value=String(state.forecastWeight);
  $("#compare-last-year").checked=state.compareLastYear;
  $("#height-slider").value=String(state.rowHeight);
  $("#wave-palette").value=state.palette;
  for(const kind of ["history","forecast","climate"])$("#"+kind+"-color").value=state.colors[kind];
  layerList();
}
function sampleRows(rows,target=72) {
  if(rows.length<=target)return rows;
  const stride=Math.max(1,Math.ceil(rows.length/target));
  return rows.filter((_,i)=>i%stride===0);
}
function yValue(row,field) {
  if(field==="wind_speed_10m" || field==="wind_gusts_10m")return beaufort(row[field]);
  return row[field];
}
function labelFor(id) {return ALL_LAYERS.find(x=>x.id===id)?.label||id;}
function plotLines(rows,field,axis,history=true) {
  const src=history?"history":"forecast";
  const arr=rows.filter(row=>row.kind===src);
  const isBars=["precipitation","precipitation_probability"].includes(field);
  const color=lineColor(field,history);
  return {
    type:isBars?"bar":"scatter",mode:isBars?undefined:"lines",xaxis:"x",yaxis:axis,
    x:arr.map(row=>new Date(row.t*1000).toISOString()),
    y:arr.map(row=>Number.isFinite(yValue(row,field))?yValue(row,field):null),
    line:{color,width:history?1.5:state.forecastWeight,shape:"linear"},
    marker:{color,opacity:history?.6:1},
    opacity:history?.95:1,showlegend:false,name:(history?"ERA5":"Forecast")+" · "+labelFor(field),
    hovertemplate:"%{x|%a %d %b %Y %H:%M} UTC<br>%{y:.1f}<extra>"+(history?"Ιστορικό ERA5":"Πρόγνωση")+"</extra>"
  };
}
function symbolicTrace(rows,field,axis,history=true) {
  const src=history?"history":"forecast";
  const selected=sampleRows(rows.filter(row=>row.kind===src && Number.isFinite(row[field])),56);
  const isWind=field==="wind_direction_10m";
  return {
    type:"scatter",mode:"text",xaxis:"x",yaxis:axis,showlegend:false,
    x:selected.map(row=>new Date(row.t*1000).toISOString()),
    y:selected.map(()=>.55),
    text:selected.map(row=>isWind?windArrow(row.wind_direction_10m):weatherIcon(row.weather_code)),
    textfont:{size:isWind?16:19,color:lineColor(isWind?"wind_direction_10m":"icons",history)},
    name:isWind?"Wind direction":"Weather icons",
    customdata:selected.map(row=>isWind?Math.round(row.wind_direction_10m)+"° from":String(row.weather_code)),
    hovertemplate:"%{x|%a %d %b %Y %H:%M} UTC<br>%{customdata}<extra>"+(history?"ERA5":"Forecast")+"</extra>"
  };
}
function arrayForPlot() {
  const raw=aggregateForView(state.rows,state.view[0],state.view[1]);
  return {rows:cumulativeRain(raw.rows,state.rainMode),resolution:raw.resolution};
}
function climateKey(){
  return [state.place.latitude,state.place.longitude,iso(state.view[0]),iso(state.view[1]),
    state.climateYears,state.climateYearFrom,state.climateYearTo].join("|");
}
function scheduleClimate(force=false){
  clearTimeout(state.climateTimer);
  if(state.climateController)state.climateController.abort();
  const label=$("#climate-status");
  const from=iso(state.view[0]),to=iso(state.view[1]);
  if(!state.climateYears) {
    state.climate=null;state.climateKey=null;
    label.textContent="Γκρίζες κλιματικές ζώνες: απενεργοποιημένες.";
    if(force)renderChart();
    return;
  }
  if(!isClimateSupported(from,to)) {
    state.climate=null;state.climateKey=null;
    label.textContent="Τα κλιματικά ποσοστημόρια εμφανίζονται για παράθυρα έως 32 ημερών. Κάνε zoom in.";
    if(force)renderChart();
    return;
  }
  const key=climateKey();
  if(state.climateKey===key && state.climate)return;
  state.climate=null;state.climateKey=null;
  const existing=state.climateCache.get(key);
  if(existing) {
    state.climate=existing;state.climateKey=key;
    label.textContent="Κλιματική σύγκριση ERA5: "+existing.years+" έτη ("+existing.yearRange?.join("–")+")";
    renderChart();
    return;
  }
  label.textContent="Φόρτωση ιστορικής κλιματικής σύγκρισης ("+(state.climateYears==="custom"?state.climateYearFrom+"–"+state.climateYearTo:state.climateYears+" έτη")+")…";
  state.climateTimer=setTimeout(()=>loadClimate(key,from,to),force?30:650);
}
async function loadClimate(key,from,to){
  if(state.climateController)state.climateController.abort();
  const ctrl=new AbortController();state.climateController=ctrl;
  const viewYear=new Date(state.view[0]).getUTCFullYear();
  let windows=[];
  try{
    windows=state.climateYears==="custom"?
      historicalSamplesCustomRange(from,to,state.climateYearFrom,state.climateYearTo):
      historicalSamplesWindows(from,to,state.climateYears,viewYear);
  }catch(error){
    $("#climate-status").textContent=error.message;return;
  }
  if(windows.length<1) {
    $("#climate-status").textContent="Δεν υπάρχουν διαθέσιμα προηγούμενα έτη για σύγκριση.";
    return;
  }
  const results=[];
  let completed=0,failed=0;
  try{
    await limitedMap(windows,async win=>{
      if(ctrl.signal.aborted)return;
      const url=query("https://archive-api.open-meteo.com/v1/archive",
        climateQueryParams(state.place,win.start,win.end));
      try {
        const api=await json(url,ctrl.signal);
        if(ctrl.signal.aborted)return;
        results.push({year:win.year,rows:normalizeHourly(api,"climate")});
      } catch(error) {
        if(error?.name==="AbortError")throw error;
        failed++;
      }
      completed++;
      if(!ctrl.signal.aborted)$("#climate-status").textContent=
        "Υπολογισμός κλίματος ERA5: "+completed+"/"+windows.length+" έτη…";
    },3);
    if(ctrl.signal.aborted||key!==climateKey())return;
    if(results.length<1) {
      $("#climate-status").textContent="Δεν βρέθηκαν ιστορικά δεδομένα για τα επιλεγμένα έτη.";
      return;
    }
    const summary=calculateClimateSummary(results,from,to);
    summary.loaded=completed;summary.failed=failed;
    state.climateCache.set(key,summary);
    if(state.climateCache.size>4)state.climateCache.delete(state.climateCache.keys().next().value);
    state.climateKey=key;state.climate=summary;
    $("#climate-status").textContent=(summary.years===1?"Γκρίζα: 1 ιστορικό έτος, χωρίς στατιστικό εύρος: ":"Γκρίζα: μέσος ERA5 + 10–90% από ")+
      summary.years+" έτη ("+summary.yearRange?.join("–")+")"+
      (failed?" · "+failed+" αστοχίες φόρτωσης":"");
    await renderChart();
  }catch(error){
    if(error?.name!=="AbortError" && key===climateKey())$("#climate-status").textContent=
      "Δεν φορτώθηκε το κλιματικό υπόβαθρο: "+error.message;
  }
}
function rgba(hex,alpha){
  const h=hex.replace("#","");
  const n=parseInt(h,16);
  return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+alpha+")";
}
function bandTraces(layer,axis){
  if(!state.climate||state.climateKey!==climateKey())return [];
  const series=state.climate.fields[layer];
  if(!series||!series.mean.some(Number.isFinite))return [];
  const conv=layer==="wind_speed_10m"||layer==="wind_gusts_10m"
    ? (arr=>arr.map(x=>Number.isFinite(x)?beaufort(x):null))
    : (arr=>arr);
  const common={type:"scatter",mode:"lines",xaxis:"x",yaxis:axis,
    x:state.climate.times,showlegend:false,connectgaps:false};
  const lower={...common,y:conv(series.p10),line:{color:"rgba(150,150,150,.02)",width:.3},
    hoverinfo:"skip",name:"10ο εκατοστημόριο"};
  const upper={...common,y:conv(series.p90),fill:"tonexty",fillcolor:rgba(state.colors.climate,.20),
    line:{color:rgba(state.colors.climate,.30),width:.6},hoverinfo:"skip",name:"10–90% ιστορικό"};
  const avg={...common,y:conv(series.mean),line:{color:state.colors.climate,width:1.4},
    name:"Κλιματικός μέσος ("+state.climate.years+" έτη)",
    hovertemplate:"%{x|%d %b %H:%M} UTC<br>Ιστορικός μέσος: %{y:.1f}<extra>ERA5</extra>"};
  const out=[lower,upper,avg];
  if(state.compareLastYear && state.climate.previous[layer]?.some(Number.isFinite)){
    out.push({...common,y:conv(state.climate.previous[layer]),
      line:{color:rgba(state.colors.climate,.9),width:1.2,dash:"dot"},
      name:"Πέρυσι",hovertemplate:"%{x|%d %b %H:%M} UTC<br>Πέρυσι: %{y:.1f}<extra>Previous year</extra>"});
  }
  return out;
}
function niceDays(from,to) {
  const span=(to-from)/DAY;
  if(span>45)return null;
  const smallScreen=(controls.plot.clientWidth||window.innerWidth)<650;
  const step=smallScreen?(span<=8?1:span<=17?3:span<=28?4:7):(span<=17?1:span<=28?2:4);
  const start=Math.floor(from/DAY)*DAY;
  const values=[],labels=[];
  const days=["Κυρ","Δευ","Τρι","Τετ","Πεμ","Παρ","Σαβ"];
  const months=["Ιαν","Φεβ","Μαρ","Απρ","Μαι","Ιουν","Ιουλ","Αυγ","Σεπ","Οκτ","Νοε","Δεκ"];
  for(let ms=start;ms<=to;ms+=step*DAY){
    const d=new Date(ms),mid=ms+12*3600000;
    if(mid<from||mid>to)continue;
    values.push(new Date(mid).toISOString());
    labels.push("<b>"+days[d.getUTCDay()]+"</b><br>"+String(d.getUTCDate()).padStart(2,"0")+" "+months[d.getUTCMonth()]);
  }
  return {values,labels};
}
function timeShapes(from,to){
  const now=Date.now();
  const startDay=startOfDay(today);
  const shapes=[];
  const addRect=(a,b,color)=>{
    if(b<=a||b<from||a>to)return;
    shapes.push({type:"rect",xref:"x",yref:"paper",
      x0:new Date(Math.max(a,from)).toISOString(),
      x1:new Date(Math.min(b,to)).toISOString(),y0:0,y1:1,
      line:{width:0},fillcolor:color,layer:"below"});
  };
  addRect(from,now,"rgba(228,234,242,.14)");
  addRect(now,Math.min(to,now+14*DAY),"rgba(255,233,217,.30)");
  addRect(startDay,startDay+DAY,"rgba(183,145,238,.21)");
  // Midnight guides remain visible when vertical day ticks are dense.
  if((to-from)/DAY<=32){
    for(let t=Math.ceil(from/DAY)*DAY;t<to;t+=DAY){
      shapes.push({type:"line",xref:"x",yref:"paper",
        x0:new Date(t).toISOString(),x1:new Date(t).toISOString(),y0:0,y1:1,
        line:{color:"#dbe3ed",width:.85},layer:"below"});
    }
  }
  if(now>=from && now<=to)shapes.push({
    type:"line",xref:"x",yref:"paper",
    x0:new Date(now).toISOString(),x1:new Date(now).toISOString(),y0:0,y1:1,
    line:{color:"#f49c14",width:2.7},layer:"above"
  });
  return shapes;
}

const DATE_MONTHS=["Ιαν","Φεβ","Μαρ","Απρ","Μαΐ","Ιουν","Ιουλ","Αυγ","Σεπ","Οκτ","Νοε","Δεκ"];
const DATE_DAYS=["Κυρ","Δευ","Τρι","Τετ","Πεμ","Παρ","Σαβ"];
function friendlyUTC(ms,year=true){
  const d=new Date(ms);
  const val=String(d.getUTCDate()).padStart(2,"0")+" "+DATE_MONTHS[d.getUTCMonth()];
  return year?val+" "+d.getUTCFullYear():val;
}
function setStickyGeometry(){
  if(!document.documentElement?.style?.setProperty)return;
  const header=document.querySelector("#site-header");
  const toolbar=document.querySelector("#main-controls");
  const mobile=(window.innerWidth||1200)<=800;
  const hh=header?.getBoundingClientRect?.().height||50;
  const th=mobile?0:(toolbar?.getBoundingClientRect?.().height||55);
  document.documentElement.style.setProperty("--header-h",Math.round(hh)+"px");
  document.documentElement.style.setProperty("--toolbar-h",Math.round(th)+"px");
}
function updateStickyDates(){
  if(!state.view)return;
  const area=$("#sticky-date-values");
  if(!area)return;
  const {0:from,1:to}=state.view;
  const count=(window.innerWidth||1200)<440?3:(window.innerWidth||1200)<800?4:8;
  area.replaceChildren();
  for(let i=0;i<count;i++){
    const when=from+(to-from)*(i/(count-1));
    const d=new Date(when);
    const node=document.createElement("span");
    node.className="sticky-day";
    if(iso(when)===today)node.classList.add("is-today");
    const line=document.createElement("span");
    line.textContent=DATE_DAYS[d.getUTCDay()];
    const date=document.createElement("strong");
    date.textContent=friendlyUTC(when,false);
    node.append(line,date);area.append(node);
  }
  $("#sticky-date-summary").textContent=friendlyUTC(from,false)+" – "+friendlyUTC(to,false);
}
function updateRangeLabels(){
  if(!state.view)return;
  const [from,to]=state.view;
  $("#nav-from-date").textContent=friendlyUTC(from);
  $("#nav-to-date").textContent=friendlyUTC(to);
  const days=Math.max(1,Math.round((to-from)/DAY)+1);
  $("#nav-duration").textContent=days===1?"1 ημέρα":days+" ημέρες";
}
function updateNavigatorDates(){
  updateRangeLabels();
  if(!state.rows.length)return;
  const points=state.rows.map(row=>row.t*1000).filter(Number.isFinite);
  if(!points.length)return;
  const min=Math.min(...points),max=Math.max(...points);
  $("#nav-loaded-range").textContent="Φορτωμένο: "+friendlyUTC(min)+" – "+friendlyUTC(max);
  const ticks=$("#nav-date-ticks");
  ticks.replaceChildren();
  const screen=window.innerWidth||1200;
  const count=screen<440?3:screen<800?4:screen<1200?6:8;
  for(let i=0;i<count;i++){
    const date=min+(max-min)*(i/(count-1));
    const node=document.createElement("span");
    node.className="nav-date-tick";
    node.textContent=friendlyUTC(date,(max-min)>330*DAY);
    ticks.append(node);
  }
}
if(typeof ResizeObserver==="function"){
  const observer=new ResizeObserver(()=>setStickyGeometry());
  const header=$("#site-header"),toolbar=$("#main-controls");
  if(header)observer.observe(header);
  if(toolbar)observer.observe(toolbar);
}
if(typeof window.addEventListener==="function")window.addEventListener("resize",()=>{
  setStickyGeometry();updateStickyDates();updateNavigatorDates();
});
setStickyGeometry();
async function drawOverview(){
  if(typeof Plotly==="undefined"||!$("#overview"))return;
  const full=sampleRows(state.rows.filter(row=>Number.isFinite(row.temperature_2m)),2200);
  const trace={type:"scatter",mode:"lines",name:"Temperature overview",showlegend:false,
    x:full.map(row=>new Date(row.t*1000).toISOString()),
    y:full.map(row=>row.temperature_2m),
    line:{color:lineColor("temperature_2m",false),width:1.4},hoverinfo:"skip"};
  state.overviewPlotting=true;
  try{
    await Plotly.react($("#overview"),[trace],{
      height:(window.innerWidth||1200)<800?143:152,autosize:true,paper_bgcolor:"#f6f9ff",plot_bgcolor:"#ffffff",
      font:{size:11,color:"#486188"},margin:{l:(window.innerWidth||1200)<800?14:24,r:18,t:5,b:27},
      showlegend:false,dragmode:"pan",
      xaxis:{type:"date",range:state.view.map(ms=>new Date(ms).toISOString()),
        showticklabels:true,tickformat:"%d %b",tickfont:{size:10,color:"#476488"},
        ticks:"outside",ticklen:4,tickcolor:"#8caad3",
        gridcolor:"#e4ecf8",showgrid:true,
        rangeslider:{visible:true,thickness:.62,bgcolor:"#dce9fc",bordercolor:"#83a7e8",borderwidth:2}},
      yaxis:{visible:false,fixedrange:true}
    },{responsive:true,scrollZoom:false,displayModeBar:false});
    const element=$("#overview");
    updateNavigatorDates();
    if(!state.overviewBound&&typeof element.on==="function"){
      element.on("plotly_relayout",onRelayout);
      state.overviewBound=true;
    }
  }finally{state.overviewPlotting=false}
}
function chartGutter(){
  const width=controls.plot.clientWidth||window.innerWidth||1200;
  const mobile=width<650;
  const gutter=Math.min(width*.38,mobile?113:198);
  const domain=Math.min(.42,gutter/Math.max(250,width-35));
  return {mobile,gutter,domain};
}
function labelText(layer,mobile){
  const names={
    precipitation_probability:mobile?"Πιθανότητα<br>βροχής":"Πιθανότητα<br>βροχής",
    rain_cumulative:"Αθροιστική<br>βροχή",
    relative_humidity_2m:"Σχετική υγρασία",
    wind_direction_10m:"Διεύθυνση<br>ανέμου",
    wind_speed_10m:"Ένταση ανέμου",
    wind_gusts_10m:"Ριπές ανέμου",
    shortwave_radiation:"Ηλιακή<br>ακτινοβολία",
    temperature_2m:"Θερμοκρασία",
    dew_point_2m:"Σημείο δρόσου",
    pressure_msl:"Ατμοσφαιρική<br>πίεση",
    cloud_cover:"Νεφοκάλυψη",
    precipitation:"Βροχόπτωση",
    uv_index:"Δείκτης UV",
    icons:"Καιρός"
  };
  return names[layer.id]||layer.label.split(" · ")[0];
}
async function renderChart(){
  if(typeof Plotly==="undefined") {
    showStatus("Το Plotly δεν φορτώθηκε. Έλεγξε την πρόσβαση στο CDN.",true);return;
  }
  const layers=ALL_LAYERS.filter(layer=>state.enabled.has(layer.id));
  if(!layers.length) {
    controls.plot.replaceChildren();showStatus("Επίλεξε κάποιο layer.",true);return;
  }
  const {rows,resolution}=arrayForPlot();
  const data=[];
  const n=layers.length,gap=.014,size=(1-(n-1)*gap)/n;
  const from=state.view[0],to=state.view[1];
  const dayTicks=niceDays(from,to);
  updateStickyDates();updateRangeLabels();
  const {mobile,gutter,domain}=chartGutter();
  const layout={
    autosize:true,height:Math.max(580,145+n*state.rowHeight),
    paper_bgcolor:"#fff",plot_bgcolor:"#fff",
    font:{size:12,color:"#2b3e58",family:"system-ui, Arial"},
    margin:{l:mobile?9:16,r:mobile?5:18,t:mobile?70:64,b:35},dragmode:"pan",hovermode:"x unified",
    bargap:.18,barmode:"overlay",showlegend:false,annotations:[],
    xaxis:{
      type:"date",anchor:"y",side:"top",domain:[domain,1],
      range:state.view.map(ms=>new Date(ms).toISOString()),
      gridcolor:"#e4eaf4",tickformat:resolution==="hourly"?"%a %d %b":"%b %Y",
      showgrid:true,tickfont:{size:mobile?10:12,color:"#24446d"},ticks:"outside",
      ticklen:6,tickcolor:"#a6b7cc",tickangle:0,
      rangeslider:{visible:false}
    },
    shapes:timeShapes(from,to)
  };
  if(dayTicks&&dayTicks.values.length){
    layout.xaxis.tickmode="array";
    layout.xaxis.tickvals=dayTicks.values;
    layout.xaxis.ticktext=dayTicks.labels;
  }
  layers.forEach((layer,i)=>{
    const key=i===0?"yaxis":"yaxis"+(i+1);
    const axis=i===0?"y":"y"+(i+1);
    const top=1-i*(size+gap);
    const icons=layer.id==="icons",dirs=layer.id==="wind_direction_10m";
    const name=icons?"weather_code":layer.id;
    if(icons||dirs){
      data.push(symbolicTrace(rows,name,axis,true),symbolicTrace(rows,name,axis,false));
    }else{
      data.push(...bandTraces(name,axis),plotLines(rows,name,axis,true),plotLines(rows,name,axis,false));
    }
    const spec={
      anchor:"x",domain:[Math.max(0,top-size),top],
      gridcolor:"#e6edf5",zeroline:false,
      tickfont:{size:11,color:"#526783"},
      automargin:false,showgrid:!icons&&!dirs,
      showline:true,linecolor:"#d1dbe9",linewidth:.7
    };
    if(icons||dirs){spec.range=[0,1];spec.showticklabels=false;spec.showgrid=false;spec.fixedrange=true;}
    if(["cloud_cover","relative_humidity_2m","precipitation_probability"].includes(layer.id))spec.range=[0,100];
    if(layer.id==="wind_speed_10m"||layer.id==="wind_gusts_10m")spec.range=[0,12];
    layout[key]=spec;
    layout.annotations.push({
      xref:"paper",yref:"paper",x:.008,y:top-.003,
      xanchor:"left",yanchor:"top",showarrow:false,align:"left",
      text:"<b>"+labelText(layer,mobile)+"</b>"+(layer.unit?"<br>"+layer.unit:""),
      font:{size:mobile?10:13,color:lineColor(layer.id,false)}
    });
  });
  $("#chart-title").textContent=state.place.name+" · Ιστορικό + "+modelConfig().label;
  $("#chart-subtitle").textContent=formatDate(from)+" — "+formatDate(to)+
    " · "+(resolution==="hourly"?"Ωριαία":"Ημερήσια")+" ανάλυση · UTC";
  $("#period-summary").textContent="Πορτοκαλί: τώρα · Μοβ: σήμερα · Γκρίζο: κλιματικό ιστορικό";
  for(const kind of ["history","forecast","climate"]){
    const swatch=$("#legend-"+kind);
    if(swatch)swatch.style.background=kind==="climate"?state.colors.climate:lineColor("temperature_2m",kind==="history");
  }
  state.plotting=true;
  try{
    await Plotly.react(controls.plot,data,layout,{
      responsive:true,scrollZoom:true,displaylogo:false,
      modeBarButtonsToRemove:["lasso2d","select2d","toImage"],doubleClick:"reset"
    });
    if(!state.plotBound && typeof controls.plot.on==="function"){
      controls.plot.on("plotly_relayout",onRelayout);
      state.plotBound=true;
    }
  }finally{state.plotting=false}
  await drawOverview();
}
function onRelayout(event) {
  if(state.plotting || state.overviewPlotting || !event)return;
  const a=event["xaxis.range[0]"] ?? event["xaxis.range"]?.[0];
  const b=event["xaxis.range[1]"] ?? event["xaxis.range"]?.[1];
  if(a==null||b==null)return;
  const left=Date.parse(a),right=Date.parse(b);
  if(!Number.isFinite(left)||!Number.isFinite(right)||left>=right)return;
  const proposed=clampViewport(left,right);
  const changed=Math.abs(proposed[0]-state.view[0])+Math.abs(proposed[1]-state.view[1]);
  if(changed<3600000)return;
  state.view=proposed;
  syncDates();clearSelectedPreset();
  clearTimeout(state.debounce);
  state.debounce=setTimeout(()=>refresh({reason:"timeline pan/zoom"}),300);
}
function updateCurrent() {
  const now=Date.now()/1000;
  const forecast=state.forecast.get(state.model)||[];
  const nearest=forecast.filter(row=>row.t<=now).at(-1) || forecast[0] ||
    state.rows.filter(row=>row.t<=now && row.t>=now-2*86400).at(-1);
  const p=state.place;
  $("#current-place").textContent=p.name+", "+(p.country||"");
  if(!nearest) {
    $("#current-time").textContent="Δεν υπάρχουν τρέχοντα δεδομένα";
    return;
  }
  $("#current-time").textContent=new Date(nearest.t*1000).toLocaleString("el-GR",{timeZone:"UTC"})+" UTC · "+(nearest.kind==="forecast"?modelConfig().label:"ERA5");
  $("#current-icon").textContent=weatherIcon(nearest.weather_code);
  $("#current-temp").textContent=fmt(nearest.temperature_2m,1)+" °C";
  $("#current-desc").textContent=nearest.kind==="forecast"?"Προγνωστική εκτίμηση":"Ιστορική αναανάλυση";
  $("#current-cloud").textContent=fmt(nearest.cloud_cover)+"%";
  $("#current-humidity").textContent=fmt(nearest.relative_humidity_2m)+"%";
  $("#current-wind").textContent=fmt(beaufort(nearest.wind_speed_10m))+" Bft";
  $("#current-direction").textContent=windArrow(nearest.wind_direction_10m)+" "+fmt(nearest.wind_direction_10m)+"°";
  $("#current-pressure").textContent=fmt(nearest.pressure_msl)+" hPa";
  $("#current-rain").textContent=fmt(nearest.precipitation,1)+" mm";
}
// Optional radar: RainViewer free API supports recent (~2h) past frames only.
// Respect API rate limits, provider attribution and the post-2025 blue palette.
const radarState={frames:[],host:null,layer:null,index:0,timer:null};
function stopRadar(){
  if(radarState.timer)clearInterval(radarState.timer);
  radarState.timer=null;$("#radar-play").textContent="▶";
}
function removeRadar(){
  stopRadar();
  if(radarState.layer && state.map){state.map.removeLayer(radarState.layer);radarState.layer=null}
}
function radarAt(index){
  if(!state.map||!radarState.frames.length)return;
  const frame=radarState.frames[(index+radarState.frames.length)%radarState.frames.length];
  radarState.index=(index+radarState.frames.length)%radarState.frames.length;
  if(!/^\/v2\/radar\/\d+$/.test(frame.path))throw Error("Unexpected radar tile frame");
  const url=radarState.host+frame.path+"/256/{z}/{x}/{y}/2/1_1.png";
  if(radarState.layer)state.map.removeLayer(radarState.layer);
  radarState.layer=L.tileLayer(url,{
    tileSize:256,maxNativeZoom:7,maxZoom:18,opacity:.68,
    attribution:'Radar © <a href="https://www.rainviewer.com/">RainViewer</a>'
  }).addTo(state.map);
  $("#radar-time").textContent=new Date(frame.time*1000).toLocaleTimeString("el-GR",{
    hour:"2-digit",minute:"2-digit",timeZone:"UTC"
  })+" UTC · τελευταίες 2 ώρες";
}
async function setRadar(enabled){
  removeRadar();
  if(!enabled){
    $("#radar-time").textContent="Radar ανενεργό";
    for(const id of ["#radar-prev","#radar-play","#radar-next"])$(id).disabled=true;
    return;
  }
  $("#radar-time").textContent="Φόρτωση RainViewer…";
  try{
    if(!state.map)throw Error("Χάρτης μη διαθέσιμος");
    const response=await json("https://api.rainviewer.com/public/weather-maps.json");
    if(!$("#radar-toggle").checked)return;
    const hostUrl=new URL(response.host);
    if(hostUrl.protocol!=="https:"|| !hostUrl.hostname.endsWith(".rainviewer.com"))throw Error("Μη έγκυρος tile server");
    const frames=(response.radar?.past||[]).filter(f=>Number.isFinite(f.time)&&/^\/v2\/radar\/\d+$/.test(f.path));
    if(!frames.length)throw Error("Δεν υπάρχουν διαθέσιμα πρόσφατα frames radar");
    radarState.host=hostUrl.origin;radarState.frames=frames;
    for(const id of ["#radar-prev","#radar-play","#radar-next"])$(id).disabled=false;
    radarAt(frames.length-1);
  }catch(error){
    $("#radar-toggle").checked=false;
    removeRadar();
    $("#radar-time").textContent="Radar προσωρινά μη διαθέσιμο: "+error.message;
  }
}
$("#radar-toggle").addEventListener("change",()=>setRadar($("#radar-toggle").checked));
$("#radar-prev").addEventListener("click",()=>radarAt(radarState.index-1));
$("#radar-next").addEventListener("click",()=>radarAt(radarState.index+1));
$("#radar-play").addEventListener("click",()=>{
  if(radarState.timer){stopRadar();return}
  if(!radarState.frames.length)return;
  $("#radar-play").textContent="❚❚";
  // Slow playback reduces tile requests to stay within the free service limits.
  radarState.timer=setInterval(()=>radarAt(radarState.index+1),5000);
});

function setupMap() {
  if(typeof L==="undefined")return;
  try {
    state.map=L.map("map",{zoomControl:true,scrollWheelZoom:false}).setView([state.place.latitude,state.place.longitude],6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:18,attribution:"© OpenStreetMap contributors"
    }).addTo(state.map);
    state.marker=L.marker([state.place.latitude,state.place.longitude]).addTo(state.map);
    state.map.on("click",event=>{
      state.place={
        name:"Coordinates",country:event.latlng.lat.toFixed(3)+", "+event.latlng.lng.toFixed(3),
        latitude:event.latlng.lat,longitude:event.latlng.lng,timezone:"GMT"
      };
      controls.place.value="Coordinates "+state.place.country;
      locationChanged();
    });
    $("#map").querySelector(".map-fallback")?.remove();
  }catch(error){console.warn("Map unavailable",error);}
}
function locationChanged() {
  renderPins();
  resetData();
  $("#current-place").textContent=state.place.name+", "+(state.place.country||"");
  state.marker?.setLatLng([state.place.latitude,state.place.longitude]);
  state.map?.setView([state.place.latitude,state.place.longitude],6);
  refresh({reason:"location"});
}
let searchTimeout;
controls.place.addEventListener("input",()=>{
  clearTimeout(searchTimeout);
  const token=++state.searchId;
  searchTimeout=setTimeout(async()=>{
    const term=controls.place.value.trim();
    if(term.length<2){$("#suggestions").style.display="none";return}
    try {
      const result=await json(query("https://geocoding-api.open-meteo.com/v1/search",{
        name:term,count:7,language:"en",format:"json"
      }));
      if(token!==state.searchId)return;
      const box=$("#suggestions");box.replaceChildren();
      for(const loc of result.results||[]) {
        const button=document.createElement("button");button.className="suggestion";
        button.textContent=[loc.name,loc.admin1,loc.country].filter(Boolean).join(", ");
        button.onclick=()=>{
          state.place={
            name:loc.name,country:loc.country,latitude:loc.latitude,
            longitude:loc.longitude,timezone:loc.timezone
          };
          controls.place.value=button.textContent;
          box.style.display="none";locationChanged();
        };
        box.append(button);
      }
      box.style.display=box.children.length?"block":"none";
    } catch(error){if(token===state.searchId)showStatus("Location search: "+error.message,true)}
  },300);
});
document.addEventListener("click",event=>{
  if(!event.target.closest(".location-search"))$("#suggestions").style.display="none";
});
$("#load").addEventListener("click",()=>{
  try {chooseDates();clearSelectedPreset();refresh({reason:"manual date range"});}
  catch(error){showStatus(error.message,true);}
});
$("#model").addEventListener("change",()=>{
  state.model=controls.model.value;
  const range=clampViewport(...state.view);
  state.view=range;
  syncDates();refresh({reason:"forecast model changed"});
});
document.querySelectorAll("[data-span]").forEach(button=>button.addEventListener("click",()=>{
  applyPreset(Number(button.dataset.span));refresh({reason:"preset"});
}));
$("#back").addEventListener("click",()=>moveWindow(-1));
$("#forward").addEventListener("click",()=>moveWindow(1));
$("#zoom-in").addEventListener("click",()=>zoom(.55));
$("#zoom-out").addEventListener("click",()=>zoom(1.8));
$("#today").addEventListener("click",()=>{applyPreset(15);refresh({reason:"today"})});
$("#help-btn").addEventListener("click",()=>{
  const node=$("#help");node.style.display=node.style.display==="block"?"none":"block";
});
$("#layers-toggle").addEventListener("click",()=>{
  controls.layers.hidden=!controls.layers.hidden;
  $("#layers-toggle").setAttribute("aria-expanded",String(!controls.layers.hidden));
});
$("#close-layers").addEventListener("click",()=>{
  controls.layers.hidden=true;$("#layers-toggle").setAttribute("aria-expanded","false");
});
$("#rain-mode").addEventListener("change",()=>{
  state.rainMode=$("#rain-mode").value;renderChart();
});
$("#save-layout").addEventListener("click",()=>{persistLayout();showStatus("✓ Η διάταξη αποθηκεύτηκε στον browser.")});
$("#reset-layout").addEventListener("click",()=>{
  state.enabled=new Set(DEFAULT_LAYERS);state.rainMode="daily";$("#rain-mode").value="daily";
  state.climateYears=20;state.compareLastYear=false;state.rowHeight=112;
  state.palette="classic";state.colors={...PALETTES.classic};
  state.layerColors=paletteColors("classic");state.forecastWeight=3.5;
  state.climateYearFrom=2000;state.climateYearTo=2020;
  $("#climate-years").value="20";$("#compare-last-year").checked=false;
  $("#climate-custom-range").hidden=true;
  $("#climate-year-from").value="2000";$("#climate-year-to").value="2020";
  $("#forecast-weight").value="3.5";
  $("#height-slider").value="112";$("#wave-palette").value="classic";
  for(const kind of ["history","forecast","climate"])$("#"+kind+"-color").value=state.colors[kind];
  layerList();scheduleClimate(true);renderChart();
});
$("#climate-years").addEventListener("change",()=>{
  const selected=$("#climate-years").value;
  state.climateYears=selected==="custom"?"custom":Number(selected);
  $("#climate-custom-range").hidden=selected!=="custom";
  if(selected==="custom"){
    $("#climate-status").textContent="Διάλεξε έτος έναρξης και λήξης και πάτησε Εφαρμογή.";
    state.climate=null;state.climateKey=null;renderChart();
  } else {
    scheduleClimate(true);renderChart();
  }
});
$("#climate-apply").addEventListener("click",()=>{
  const from=Number($("#climate-year-from").value),to=Number($("#climate-year-to").value);
  try{
    historicalSamplesCustomRange(iso(state.view[0]),iso(state.view[1]),from,to);
    state.climateYears="custom";
    $("#climate-years").value="custom";
    state.climateYearFrom=from;state.climateYearTo=to;
    scheduleClimate(true);renderChart();
  }catch(error){
    $("#climate-status").textContent=error.message;
  }
});
$("#compare-last-year").addEventListener("change",()=>{
  state.compareLastYear=$("#compare-last-year").checked;
  renderChart();
});
$("#height-slider").addEventListener("input",()=>{
  state.rowHeight=Number($("#height-slider").value);renderChart();
});
$("#forecast-weight").addEventListener("input",()=>{
  state.forecastWeight=Number($("#forecast-weight").value);renderChart();
});
$("#wave-palette").addEventListener("change",()=>{
  state.palette=$("#wave-palette").value;
  if(PALETTES[state.palette]){
    state.colors={...PALETTES[state.palette]};
    state.layerColors=paletteColors(state.palette);
    layerList();
  }
  for(const kind of ["history","forecast","climate"])$("#"+kind+"-color").value=state.colors[kind];
  renderChart();
});
for(const kind of ["history","forecast","climate"])$("#"+kind+"-color").addEventListener("input",()=>{
  state.palette="custom";state.colors[kind]=$("#"+kind+"-color").value;
  if(kind==="forecast"){
    for(const layer of ALL_LAYERS)state.layerColors[layer.id]=state.colors.forecast;
    layerList();
  }
  $("#wave-palette").value="custom";renderChart();
});
$("#export").addEventListener("click",()=>{
  const rows=state.rows.filter(row=>row.t*1000>=state.view[0] && row.t*1000<=state.view[1]);
  if(!rows.length){showStatus("Δεν υπάρχουν δεδομένα για εξαγωγή.",true);return}
  const csv=csvForRows(rows);
  const file=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(file),a=document.createElement("a");
  a.href=url;a.download="weather-time-machine-"+iso(state.view[0])+"-"+iso(state.view[1])+".csv";
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
});
restoreLayout();
restorePins();
applyPreset(15);
setupMap();
refresh({reason:"initial"});
