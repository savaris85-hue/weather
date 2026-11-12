import {
  FIELDS, EARLIEST, MAX_DAYS, dayISO, moveDay, validateRange,
  normalizeHourly, mergeHourly, aggregateForView, csvForRows,
  buildForecastParams, beaufort, windArrow, weatherIcon,
  FORECAST_MODELS, ALL_LAYERS, DEFAULT_LAYERS, cumulativeRain,
  archiveBlocks
} from "./data.mjs";

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
const LAYOUT_KEY = "wtm-layout-v2";
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
  map:null, marker:null, debounce:null, searchId:0, loading:false
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
function layerList() {
  const target=$("#layer-options");target.replaceChildren();
  ALL_LAYERS.forEach(layer=>{
    const label=document.createElement("label");label.className="layer-item";
    const check=document.createElement("input");check.type="checkbox";check.checked=state.enabled.has(layer.id);
    check.dataset.layer=layer.id;check.addEventListener("change",()=>{
      if(check.checked)state.enabled.add(layer.id);else state.enabled.delete(layer.id);
      renderChart();
    });
    const title=document.createElement("span");title.textContent=layer.label;
    label.append(check,title);target.append(label);
  });
}
function persistLayout() {
  try {localStorage.setItem(LAYOUT_KEY,JSON.stringify({layers:[...state.enabled],rainMode:state.rainMode}));}
  catch {showStatus("Η αποθήκευση δεν είναι διαθέσιμη σε αυτόν τον browser.",true);}
}
function restoreLayout() {
  try {
    const saved=JSON.parse(localStorage.getItem(LAYOUT_KEY)||"null");
    if(saved && Array.isArray(saved.layers)) {
      state.enabled=new Set(saved.layers.filter(id=>ALL_LAYERS.some(x=>x.id===id)));
      state.rainMode=saved.rainMode==="total"?"total":"daily";
    }
  } catch {/* private mode, no local storage */}
  $("#rain-mode").value=state.rainMode;
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
  const color=history?"#25354a":"#d94336";
  return {
    type:isBars?"bar":"scatter",mode:isBars?undefined:"lines",xaxis:"x",yaxis:axis,
    x:arr.map(row=>new Date(row.t*1000).toISOString()),
    y:arr.map(row=>Number.isFinite(yValue(row,field))?yValue(row,field):null),
    line:{color,width:history?1.7:2.1,shape:"linear"},
    marker:{color:field==="precipitation"?"#528fe0":color,opacity:.78},
    opacity:history?.85:1,showlegend:false,name:(history?"ERA5":"Forecast")+" · "+labelFor(field),
    hovertemplate:"%{x|%d %b %Y %H:%M} UTC<br>%{y:.1f}<extra>"+(history?"ERA5":"Forecast")+"</extra>"
  };
}
function symbolicTrace(rows,field,axis,history=true) {
  const src=history?"history":"forecast";
  const selected=sampleRows(rows.filter(row=>row.kind===src && Number.isFinite(row[field])),52);
  const isWind=field==="wind_direction_10m";
  return {
    type:"scatter",mode:"text",xaxis:"x",yaxis:axis,showlegend:false,
    x:selected.map(row=>new Date(row.t*1000).toISOString()),
    y:selected.map(()=>.55),
    text:selected.map(row=>isWind?windArrow(row.wind_direction_10m):weatherIcon(row.weather_code)),
    textfont:{size:isWind?15:19,color:history?"#25354a":"#d94336"},
    name:isWind?"Wind direction":"Weather icons",
    customdata:selected.map(row=>isWind?Math.round(row.wind_direction_10m)+"° from":String(row.weather_code)),
    hovertemplate:"%{x|%d %b %Y %H:%M} UTC<br>%{customdata}<extra>"+(history?"ERA5":"Forecast")+"</extra>"
  };
}
function arrayForPlot() {
  const raw=aggregateForView(state.rows,state.view[0],state.view[1]);
  const rows=cumulativeRain(raw.rows,state.rainMode);
  return {rows,resolution:raw.resolution};
}
async function renderChart() {
  if(typeof Plotly==="undefined") {
    showStatus("Το Plotly δεν φορτώθηκε. Έλεγξε την πρόσβαση στο CDN.",true);return;
  }
  const layers=ALL_LAYERS.filter(layer=>state.enabled.has(layer.id));
  if(!layers.length) {
    controls.plot.replaceChildren();
    showStatus("Επίλεξε κάποιο layer.",true);return;
  }
  const {rows,resolution}=arrayForPlot();
  const data=[];
  const n=layers.length;
  const gap=.011;
  const size=(1-(n-1)*gap)/n;
  const layout={
    autosize:true,height:Math.max(540,140+n*87),
    paper_bgcolor:"#fff",plot_bgcolor:"#fff",
    font:{size:11,color:"#32455f",family:"system-ui, Arial"},
    margin:{l:100,r:12,t:22,b:68},dragmode:"pan",hovermode:"x unified",
    bargap:.2,barmode:"overlay",showlegend:false,
    xaxis:{
      type:"date",anchor:"y",range:state.view.map(ms=>new Date(ms).toISOString()),
      gridcolor:"#e4eaf4",tickformat:resolution==="hourly"?"%a %d %b":"%b %Y",
      showgrid:true,
      rangeslider:{visible:true,thickness:.055,bgcolor:"#eaf0f9",bordercolor:"#bccadd"},
      rangeselector:{visible:false}
    },
    shapes:[{
      type:"line",xref:"x",yref:"paper",x0:new Date(startOfDay(today)).toISOString(),
      x1:new Date(startOfDay(today)).toISOString(),y0:0,y1:1,
      line:{color:"#937ad1",width:1.5,dash:"dash"}
    }]
  };
  layers.forEach((layer,i)=>{
    const key=i===0?"yaxis":"yaxis"+(i+1);
    const axis=i===0?"y":"y"+(i+1);
    const top=1-i*(size+gap);
    const icons=layer.id==="icons",dirs=layer.id==="wind_direction_10m";
    const name=icons?"weather_code":layer.id;
    if(icons||dirs) {
      data.push(symbolicTrace(rows,name,axis,true),symbolicTrace(rows,name,axis,false));
    } else {
      data.push(plotLines(rows,name,axis,true),plotLines(rows,name,axis,false));
    }
    const spec={
      anchor:"x",domain:[Math.max(0,top-size),top],gridcolor:"#ebf0f7",zeroline:false,
      tickfont:{size:10,color:"#657890"},
      title:{text:layer.label.split(" · ")[0] +(layer.unit?"<br>("+layer.unit+")":""),font:{size:10,color:"#253f65"},standoff:4},
      automargin:false,showgrid:!icons&&!dirs
    };
    if(icons||dirs){spec.range=[0,1];spec.showticklabels=false;spec.showgrid=false;spec.fixedrange=true;}
    if(["cloud_cover","relative_humidity_2m","precipitation_probability"].includes(layer.id)) spec.range=[0,100];
    if(layer.id==="wind_speed_10m"||layer.id==="wind_gusts_10m")spec.range=[0,12];
    layout[key]=spec;
  });
  // The bottom scrollbar is attached to the shared x-axis, and expands as data is fetched.
  $("#chart-title").textContent=state.place.name+" · Ιστορικό + "+modelConfig().label;
  $("#chart-subtitle").textContent=formatDate(state.view[0])+" — "+formatDate(state.view[1])+
    " · "+(resolution==="hourly"?"Ωριαία":"Ημερήσια")+" ανάλυση · UTC";
  $("#period-summary").textContent="Zoom / Pan · Scroll left loads earlier data";
  state.plotting=true;
  try {
    await Plotly.react(controls.plot,data,layout,{
      responsive:true,scrollZoom:true,displaylogo:false,
      modeBarButtonsToRemove:["lasso2d","select2d","toImage"],doubleClick:"reset"
    });
    if(!state.plotBound && typeof controls.plot.on==="function") {
      controls.plot.on("plotly_relayout",onRelayout);
      state.plotBound=true;
    }
  } finally {state.plotting=false;}
}
function onRelayout(event) {
  if(state.plotting || !event)return;
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
  layerList();renderChart();
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
applyPreset(15);
setupMap();
refresh({reason:"initial"});
