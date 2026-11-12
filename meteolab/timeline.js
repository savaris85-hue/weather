/* MeteoLab v1.0 — synchronized ECharts scientific timeline.
   Sources: Open-Meteo current forecast + Open-Meteo ERA5 DAILY historical reanalysis.
   The past is DAILY resolution; NEVER interpolate daily history into fictional hourly measurements.
   All timestamps/intervals shown in UTC. All wind magnitudes are in Beaufort. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const DAY=86400000,HOUR=3600000,EARLIEST=Date.UTC(1940,0,1),ARCHIVE_LAG=8*DAY;
const colors={temperature:"#ff9865",humidity:"#6ad3e6",precipitation:"#77a5fa",probability:"#e66b86",pressure:"#e9c46b",wind:"#bf94fa",cloud:"#c6d5eb",direction:"#62deaa",dew:"#e4a7bb",gusts:"#ac8cf6"};
const layers=[
 {key:"temperature",name:"🌡️ Temperature",unit:"°C",height:94},
 {key:"humidity",name:"💧 Humidity",unit:"%",height:88},
 {key:"precipitation",name:"🌧️ Precipitation",unit:"mm",height:88},
 {key:"probability",name:"☂ Rain probability",unit:"%",height:76},
 {key:"pressure",name:"◉ Air pressure",unit:"hPa",height:88},
 {key:"wind",name:"〰 Wind speed",unit:"Bft",height:85},
 {key:"cloud",name:"☁ Cloud cover",unit:"%",height:80},
 {key:"direction",name:"➤ Wind direction",unit:"arrows",height:63},
 {key:"dew",name:"◌ Dew point",unit:"°C",height:76},
 {key:"gusts",name:"⌁ Wind gusts",unit:"Bft",height:76}
];
const defaults={temperature:true,humidity:true,precipitation:true,probability:true,pressure:true,wind:true,cloud:true,direction:true,dew:false,gusts:false};
let active=false,chart=null,forecast=null,forecastExtra=null,place=null,model="best_match",lang="el";
let enabled={...defaults},heights=Object.fromEntries(layers.map(x=>[x.key,x.height]));
let history=new Map(),historyOldest=null,historyLoading=false,historySeq=0,forecastSeq=0;
let shown=[Date.now()-4*DAY,Date.now()+3*DAY],minData=0,maxData=0,renderLock=false,zoomDebounce=null,resizeObs=null;
let dbPromise=null,cacheOn=true;
function en(){return lang==="en"}function status(x){const e=$("tlStatus");if(e)e.textContent=x}
function dateUTC(ms){return new Date(ms).toISOString().slice(0,10)}
function number(x){return x===undefined||x===null||!Number.isFinite(Number(x))?null:Number(x)}
function bft(kmh){if(kmh===null||kmh===undefined||!Number.isFinite(Number(kmh)))return null;return Math.min(12,Math.max(0,Math.round(Math.pow(Number(kmh)/3.6/.836,2/3))))}
function timestamp(str){if(!str)return NaN;return Date.parse(str.endsWith("Z")?str:str+"Z")}
function metric(val,unit){const v=number(val);return v===null?"—":v.toFixed(unit==="mm"?1:unit==="°C"?1:unit==="hPa"?0:0)+" "+unit}
function loadLayout(){
 try{const d=JSON.parse(localStorage.getItem("meteolab-timeline-layout")||"null");
 if(d?.enabled&&typeof d.enabled==="object")for(const k of layers.map(l=>l.key))if(typeof d.enabled[k]==="boolean")enabled[k]=d.enabled[k];
 if(d?.heights)for(const k of layers.map(l=>l.key))if(Number.isFinite(d.heights[k]))heights[k]=Math.max(48,Math.min(230,d.heights[k]));
 }catch(e){}
}
function saveLayout(){try{localStorage.setItem("meteolab-timeline-layout",JSON.stringify({enabled,heights}))}catch(e){}}
function openDB(){
 if(!("indexedDB" in window))return Promise.resolve(null);
 if(!dbPromise)dbPromise=new Promise(resolve=>{try{const q=indexedDB.open("meteolab-archive-v1",1);q.onupgradeneeded=()=>q.result.createObjectStore("chunks");q.onsuccess=()=>resolve(q.result);q.onerror=()=>resolve(null)}catch(e){resolve(null)}});
 return dbPromise;
}
async function cachedChunk(key){
 const db=await openDB();if(!db)return null;
 return new Promise(resolve=>{try{const req=db.transaction("chunks","readonly").objectStore("chunks").get(key);req.onsuccess=()=>resolve(req.result?.rows||null);req.onerror=()=>resolve(null)}catch(e){resolve(null)}});
}
async function storeChunk(key,rows){
 const db=await openDB();if(!db)return;
 try{const tx=db.transaction("chunks","readwrite");tx.objectStore("chunks").put({rows,stamp:Date.now()},key)}catch(e){}
}
function historyKey(start,end){return [place?.lat?.toFixed(4),place?.lon?.toFixed(4),"era5",dateUTC(start),dateUTC(end)].join("|")}
function archiveRow(t,raw,i){
 return {t,temperature:number(raw.temperature_2m_mean?.[i]),humidity:number(raw.relative_humidity_2m_mean?.[i]),precipitation:number(raw.precipitation_sum?.[i]),pressure:number(raw.pressure_msl_mean?.[i]),wind:bft(raw.wind_speed_10m_max?.[i]),cloud:number(raw.cloud_cover_mean?.[i]),probability:null,direction:number(raw.wind_direction_10m_dominant?.[i]),dew:number(raw.dew_point_2m_mean?.[i]),gusts:null,kind:"history"};
}
async function requestArchive(start,end,seq){
 if(start> end)return[];
 const key=historyKey(start,end);
 let rows=await cachedChunk(key);
 if(!rows){
  const url="https://archive-api.open-meteo.com/v1/archive?"+new URLSearchParams({latitude:String(place.lat),longitude:String(place.lon),start_date:dateUTC(start),end_date:dateUTC(end),timezone:"UTC",models:"era5",daily:"temperature_2m_mean,relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_max,pressure_msl_mean,cloud_cover_mean,dew_point_2m_mean,wind_direction_10m_dominant"});
  const response=await fetch(url);if(!response.ok)throw Error("Archive "+response.status);
  const json=await response.json();if(json.error)throw Error(json.reason||"Archive error");
  const daily=json.daily;if(!daily?.time?.length)throw Error("No historical archive returned");
  rows=daily.time.map((day,i)=>archiveRow(timestamp(day+"T12:00:00"),daily,i));
  storeChunk(key,rows).catch(()=>{});
 }
 if(seq!==historySeq)return[];
 for(const row of rows)history.set(row.t,row);
 return rows;
}
async function moreHistory(reset=false){
 if(historyLoading||!place)return;
 if(reset){history.clear();historyOldest=null;historySeq++}
 const seq=historySeq,limit=Date.now()-ARCHIVE_LAG;
 const end=historyOldest===null?Math.min(limit,Date.now()-DAY):historyOldest-DAY;
 if(end<EARLIEST){status(en()?"Reached the beginning of the available 1940+ archive.":"Έφτασες στην αρχή του διαθέσιμου ιστορικού (1940+).");return}
 const start=Math.max(EARLIEST,end-89*DAY);
 historyLoading=true;
 status((en()?"Loading historical weather: ":"Φόρτωση ιστορικού: ")+dateUTC(start)+" → "+dateUTC(end));
 try{
  const items=await requestArchive(start,end,seq);
  if(seq!==historySeq)return;
  if(items.length){historyOldest=Math.min(...items.map(x=>x.t));render();status((en()?"ERA5 daily history loaded to ":"Ημερήσιο ιστορικό ERA5 έως ")+dateUTC(historyOldest))}
 }catch(err){if(seq===historySeq)status((en()?"History unavailable: ":"Δεν φορτώθηκε το ιστορικό: ")+String(err.message||err))}
 finally{if(seq===historySeq)historyLoading=false}
}
function utcFormatter(t){return new Date(t).toLocaleString(en()?"en-GB":"el-GR",{timeZone:"UTC",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+" UTC"}
function buildForecast(){
 const data=forecast?.hourly;if(!data?.time)return[];
 const aux=forecastExtra?.hourly||{},auxTimes=new Map((aux.time||[]).map((t,i)=>[timestamp(t),i]));
 const coreOffset=Number(forecast?.utc_offset_seconds)||0;
 return data.time.map((time,i)=>{
  const t=timestamp(time)-coreOffset*1000,j=auxTimes.get(timestamp(time)-coreOffset*1000);
  const value=k=>j===undefined?null:number(aux[k]?.[j]);
  return {t,kind:"forecast",temperature:number(data.temperature_2m?.[i]),humidity:number(data.relative_humidity_2m?.[i]),
   precipitation:number(data.precipitation?.[i]),probability:number(data.precipitation_probability?.[i]),
   pressure:value("pressure_msl"),wind:bft(data.wind_speed_10m?.[i]),cloud:number(data.cloud_cover?.[i]),
   direction:value("wind_direction_10m"),dew:value("dew_point_2m"),gusts:bft(value("wind_gusts_10m")),code:number(data.weather_code?.[i])};
 }).filter(x=>Number.isFinite(x.t));
}
async function loadForecastExtra(){
 if(!place)return;
 const seq=++forecastSeq,lat=place.lat,lon=place.lon;
 try{
  const p=new URLSearchParams({latitude:String(lat),longitude:String(lon),timezone:"UTC",past_days:"10",forecast_days:"14",hourly:"temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,cloud_cover,wind_speed_10m,weather_code,pressure_msl,wind_direction_10m,dew_point_2m,wind_gusts_10m"});
  if(model!=="best_match")p.set("models",model);
  const res=await fetch("https://api.open-meteo.com/v1/forecast?"+p);
  if(!res.ok)throw Error("Additional parameters unavailable");
  const result=await res.json();if(seq!==forecastSeq)return;
  forecastExtra=result;render();
 }catch(e){if(seq===forecastSeq){forecastExtra=null;render();status(en()?"Some extended layers are unavailable for this model.":"Ορισμένα πρόσθετα layers δεν διατίθενται από αυτό το μοντέλο.")}}
}
function buildRecentModel(){
 const h=forecastExtra?.hourly;if(!h?.time?.length)return[];
 const core=buildForecast(),firstCore=core.length?Math.min(...core.map(r=>r.t)):Infinity;
 return h.time.map((time,i)=>({t:timestamp(time),kind:"recent-model",temperature:number(h.temperature_2m?.[i]),humidity:number(h.relative_humidity_2m?.[i]),
 precipitation:number(h.precipitation?.[i]),probability:number(h.precipitation_probability?.[i]),pressure:number(h.pressure_msl?.[i]),
 wind:bft(h.wind_speed_10m?.[i]),cloud:number(h.cloud_cover?.[i]),direction:number(h.wind_direction_10m?.[i]),
 dew:number(h.dew_point_2m?.[i]),gusts:bft(h.wind_gusts_10m?.[i]),code:number(h.weather_code?.[i])}))
 .filter(r=>Number.isFinite(r.t)&&r.t<firstCore&&r.t>=Date.now()-11*DAY);
}
function rowsAll(){
 const f=buildForecast(),recent=buildRecentModel();
 const firstRecent=recent.length?Math.min(...recent.map(r=>r.t)):Infinity;
 const firstFuture=f.length?Math.min(...f.map(r=>r.t)):Infinity;
 const cutoff=Math.min(firstRecent,firstFuture);
 const past=[...history.values()].filter(r=>r.t<cutoff).sort((a,b)=>a.t-b.t);
 return [...past,...recent,...f].sort((a,b)=>a.t-b.t);
}
function drawLayerControls(){
 const root=$("tlLayerControls");if(!root)return;
 root.innerHTML=layers.map(layer=>'<div class="tl-layer"><input type="checkbox" aria-label="'+layer.name+'" data-layer="'+layer.key+'" '+(enabled[layer.key]?"checked":"")+'><span class="tl-layer-symbol" style="background:'+colors[layer.key]+'"></span><span>'+layer.name+'</span><span class="tl-layer-height"><button data-height="'+layer.key+'" data-dir="-1" title="Shrink">−</button><button data-height="'+layer.key+'" data-dir="1" title="Grow">+</button></span></div>').join("");
 root.querySelectorAll("[data-layer]").forEach(ch=>ch.onchange=e=>{const k=e.target.dataset.layer;enabled[k]=e.target.checked;saveLayout();render()});
 root.querySelectorAll("[data-height]").forEach(btn=>btn.onclick=()=>{const k=btn.dataset.height;heights[k]=Math.max(48,Math.min(230,heights[k]+Number(btn.dataset.dir)*16));saveLayout();render()});
}
function chartSeries(layer,rows,gridIndex,now){
 const hist=rows.filter(r=>r.kind==="history"&&r[layer.key]!=null).map(r=>[r.t,r[layer.key]]);
 const recent=rows.filter(r=>r.kind==="recent-model"&&r[layer.key]!=null).map(r=>[r.t,r[layer.key]]);
 const fut=rows.filter(r=>r.kind==="forecast"&&r[layer.key]!=null).map(r=>[r.t,r[layer.key]]);
 const base={xAxisIndex:gridIndex,yAxisIndex:gridIndex,showSymbol:false,connectNulls:false,emphasis:{focus:"series"},large:true,animation:false};
 const name=layer.name.replace(/^[^ ]+ /,""),color=colors[layer.key];
 if(layer.key==="direction"){
  return [{...base,type:"scatter",name:name+" direction",data:rows.filter(r=>r.direction!=null&&r.wind!=null).filter((r,i)=>r.kind==="history"||i%3===0).map(r=>({value:[r.t,0],symbol:"arrow",symbolSize:17,symbolRotate:(r.direction+180)%360,itemStyle:{color:"#68deb5"},label:{show:false},_deg:r.direction})),tooltip:{valueFormatter:()=>"Wind direction (meteorological)"}}];
 }
 const isRain=layer.key==="precipitation";
 const make=(data,historical)=>({...base,name:(historical?"ERA5 daily · ":"Forecast hourly · ")+name,type:isRain?"bar":"line",
 data,barMaxWidth:9,barGap:"-100%",smooth:!isRain,sampling:"lttb",lineStyle:{width:historical?1.7:2.2,type:historical?"dashed":"solid"},itemStyle:{color:historical?"#68c8e5":color},areaStyle:isRain?{color:historical?"#68c8e542":color+"4a"}:undefined,markLine:(!historical?{silent:true,symbol:"none",label:{show:false},lineStyle:{color:"#e8d0fc",width:1.5,type:"dashed"},data:[{xAxis:now}]}:undefined)});
 const recentLine={...base,name:"Recent model hourly · "+name,type:isRain?"bar":"line",data:recent,
 barMaxWidth:8,smooth:!isRain,sampling:"lttb",lineStyle:{width:1.8,type:"dotted"},
 itemStyle:{color:"#6bd5b2"},areaStyle:isRain?{color:"#6bd5b24a"}:undefined};
 return [make(hist,true),recentLine,make(fut,false)];
}
function render(){
 if(!active||!window.echarts)return;
 if(!chart){const node=$("tlChart");chart=echarts.init(node,null,{renderer:"canvas"});chart.on("datazoom",onZoom);chart.on("dblclick",()=>resetRange());chart.on("finished",()=>{})}
 const activeLayers=layers.filter(x=>enabled[x.key]);if(!activeLayers.length){$("tlChart").style.height="200px";chart.clear();status("Choose at least one graph layer.");return}
 const rows=rowsAll(),now=Date.now(),total=activeLayers.reduce((s,x)=>s+heights[x.key],0)+95;
 $("tlChart").style.height=Math.max(380,total)+"px";chart.resize();
 if(!rows.length){status("Waiting for weather data…");return}
 const grids=[],xAxis=[],yAxis=[],series=[],axisIndices=[];
 let top=35;
 for(let i=0;i<activeLayers.length;i++){
  const layer=activeLayers[i],h=heights[layer.key];
  grids.push({left:70,right:24,top:top,height:h-12,containLabel:false});
  xAxis.push({type:"time",gridIndex:i,axisLine:{lineStyle:{color:"#41516e"}},axisTick:{show:false},axisLabel:{show:i===activeLayers.length-1,color:"#92aace",fontSize:10,hideOverlap:true},splitLine:{show:true,lineStyle:{color:"#35445e",opacity:.65}},minInterval:3600000});
  yAxis.push({type:"value",gridIndex:i,name:layer.name+" ("+layer.unit+")",nameLocation:"middle",nameGap:50,nameTextStyle:{fontSize:10,color:"#afc2dc"},axisLine:{show:false},axisLabel:{color:"#8ca6c9",fontSize:10},splitLine:{lineStyle:{color:"#33415a",opacity:.7}},scale:layer.key!=="probability"&&layer.key!=="humidity"&&layer.key!=="cloud",min:["humidity","probability","cloud","wind","gusts","precipitation"].includes(layer.key)?0:undefined,max:["humidity","probability","cloud"].includes(layer.key)?100:layer.key==="direction"?1:layer.key==="wind"||layer.key==="gusts"?12:undefined});
  axisIndices.push(i);series.push(...chartSeries(layer,rows,i,now));top+=h;
 }
 const xMin=Math.min(historyOldest??Infinity,...rows.map(r=>r.t)),xMax=Math.max(...rows.map(r=>r.t)),start=Math.max(xMin,shown[0]),end=Math.min(xMax,shown[1]);
 minData=xMin;maxData=xMax;
 const opts={backgroundColor:"#172137",animation:false,grid:grids,xAxis,yAxis,series,
 tooltip:{trigger:"axis",confine:true,backgroundColor:"#14243c",borderColor:"#526688",textStyle:{color:"#e1edff",fontSize:11},axisPointer:{type:"cross",crossStyle:{color:"#c0d8ff"}},formatter:params=>{if(!params?.length)return"";const stamp=Number(params[0].axisValue);return '<b>'+utcFormatter(stamp)+'</b><br>'+params.filter(p=>p.value?.[1]!=null).slice(0,10).map(p=>'<span style="color:'+p.color+'">●</span> '+p.seriesName+': <b>'+Number(p.value[1]).toFixed(1)+'</b>').join("<br>")}},
 axisPointer:{show:true,link:[{xAxisIndex:"all"}],label:{backgroundColor:"#355276"}},
 dataZoom:[{type:"inside",xAxisIndex:axisIndices,filterMode:"none",zoomOnMouseWheel:true,moveOnMouseMove:true,moveOnMouseWheel:true,startValue:start,endValue:end,throttle:65},{type:"slider",xAxisIndex:axisIndices,filterMode:"none",height:24,bottom:5,backgroundColor:"#101a2e",borderColor:"#405371",fillerColor:"#4a78b64b",handleStyle:{color:"#7faee8"},textStyle:{color:"#acc1dd",fontSize:10},startValue:start,endValue:end}],
 graphic:[{type:"text",left:76,top:9,style:{text:"ERA5 DAILY / RECENT MODEL HOURLY",font:"10px sans-serif",fill:"#75cce7"}},{type:"text",right:26,top:9,style:{text:"FORECAST  ·  HOURLY",font:"10px sans-serif",fill:"#ffb37e"}}]
 };
 renderLock=true;chart.setOption(opts,true);renderLock=false;
 $("tlTitle").textContent=(place?.name||"Athens")+" — Weather Timeline";
 $("tlRange").textContent=dateUTC(start)+" → "+dateUTC(end)+" UTC";
 $("tlSource").innerHTML="Forecast: Open-Meteo "+String(model).replace(/_/g," ")+"<br>Recent model: archived forecast (hourly)<br>Historical: ERA5 daily reanalysis<br>"+history.size+" archived days";
 $("tlIconRow").innerHTML=buildIcons(buildForecast(),start,end);
 if(historyOldest===null)status(en()?"Forecast loaded. Loading daily history…":"Η πρόγνωση φορτώθηκε. Ανακτάται το ημερήσιο ιστορικό…");
}
function buildIcons(rows,start,end){
 const filtered=rows.filter(r=>r.t>=start&&r.t<=end&&r.code!=null).filter((_,i)=>i%Math.max(1,Math.ceil((end-start)/HOUR/10))===0).slice(0,12);
 const icon=c=>c===0?"☀️":c<=2?"🌤️":c===3?"☁️":c>=95?"⛈️":c>=71&&c<=77?"❄️":c>=51?"🌧️":"🌫️";
 return filtered.length?filtered.map(r=>'<span class="tl-icon-item">'+icon(r.code)+'<small>'+new Date(r.t).toLocaleDateString("en-GB",{timeZone:"UTC",day:"numeric",month:"short"})+'</small></span>').join(""):'<span class="tl-side-info">Icons are shown for available hourly forecasts.</span>';
}
function zoomRange(start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
 const width=Math.max(HOUR*3,Math.min(365*DAY*10,end-start)),mid=(start+end)/2;
 shown=[mid-width/2,mid+width/2];if(chart){renderLock=true;chart.dispatchAction({type:"dataZoom",dataZoomIndex:0,startValue:shown[0],endValue:shown[1]});renderLock=false}
 $("tlRange").textContent=dateUTC(shown[0])+" → "+dateUTC(shown[1])+" UTC";
 maybeLoadOlder();
}
function onZoom(){
 if(renderLock||!chart)return;
 clearTimeout(zoomDebounce);
 zoomDebounce=setTimeout(()=>{
  const z=chart.getOption()?.dataZoom?.[0];if(!z)return;
  let s=number(z.startValue),e=number(z.endValue);
  if(s===null||e===null){const p=number(z.start),q=number(z.end);if(p===null||q===null)return;s=minData+(maxData-minData)*p/100;e=minData+(maxData-minData)*q/100}
  if(!Number.isFinite(s)||!Number.isFinite(e)||e<=s)return;
  shown=[s,e];$("tlRange").textContent=dateUTC(s)+" → "+dateUTC(e)+" UTC";
  maybeLoadOlder();
 },160);
}
function maybeLoadOlder(){if(historyOldest!==null&&shown[0]<=historyOldest+18*DAY&&!historyLoading)moreHistory(false)}
function stepHistory(back){const width=shown[1]-shown[0],step=Math.max(DAY,width*.66);zoomRange(shown[0]+(back?-step:step),shown[1]+(back?-step:step))}
function preset(days){const now=Date.now();shown=[now-Math.min(7,days)*DAY/2,now+(days-Math.min(7,days)/2)*DAY];if(days>14)shown=[now-(days-14)*DAY,now+14*DAY];render();maybeLoadOlder()}
function resetRange(){shown=[Date.now()-3*DAY,Date.now()+4*DAY];render()}
function download(filename,blob){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function exportCSV(){
 const enabledKeys=layers.filter(l=>enabled[l.key]).map(l=>l.key),rows=rowsAll().filter(r=>r.t>=shown[0]&&r.t<=shown[1]);
 const cols=["utc_timestamp","source",...enabledKeys];const val=x=>'"'+String(x??"").replace(/"/g,'""')+'"';
 const csv="\uFEFF"+cols.join(",")+"\r\n"+rows.map(r=>[new Date(r.t).toISOString(),r.kind,...enabledKeys.map(k=>r[k])].map(val).join(",")).join("\r\n");
 download("meteolab-timeline.csv",new Blob([csv],{type:"text/csv;charset=utf-8"}));
}
function exportPNG(){if(!chart)return;const a=document.createElement("a");a.download="meteolab-timeline.png";a.href=chart.getDataURL({type:"png",pixelRatio:2,backgroundColor:"#172137"});a.click()}
function resetLayout(){enabled={...defaults};heights=Object.fromEntries(layers.map(x=>[x.key,x.height]));saveLayout();drawLayerControls();render()}
function connectControls(){
 loadLayout();drawLayerControls();
 $("tlPresets").querySelectorAll("[data-days]").forEach(b=>b.onclick=()=>{$("tlPresets").querySelectorAll("button").forEach(x=>x.classList.remove("active"));b.classList.add("active");preset(Number(b.dataset.days))});
 $("tlBack").onclick=()=>stepHistory(true);$("tlForward").onclick=()=>stepHistory(false);
 $("tlZoomIn").onclick=()=>{const mid=(shown[0]+shown[1])/2,half=(shown[1]-shown[0])*.38;zoomRange(mid-half,mid+half)};
 $("tlZoomOut").onclick=()=>{const mid=(shown[0]+shown[1])/2,half=(shown[1]-shown[0])*.66;zoomRange(mid-half,mid+half)};
 $("tlReset").onclick=resetRange;
 $("tlDate").onchange=e=>{const ms=timestamp(e.target.value+"T12:00:00");if(Number.isFinite(ms)){shown=[ms-3.5*DAY,ms+3.5*DAY];render();if(historyOldest===null||shown[0]<historyOldest){loadAround(ms)}}};
 $("tlExportCsv").onclick=exportCSV;$("tlExportPng").onclick=exportPNG;$("tlExportPdf").onclick=()=>window.print();
 $("tlShowAll").onclick=()=>{for(const l of layers)enabled[l.key]=true;saveLayout();drawLayerControls();render()};
 $("tlResetLayout").onclick=resetLayout;
 $("tlOpenCompare").onclick=()=>document.querySelector('[data-view="compare"]')?.click();
 if("ResizeObserver" in window){resizeObs=new ResizeObserver(()=>{if(active)chart?.resize()});resizeObs.observe($("tlChart"))}
}
async function loadAround(ms){
 if(!place||historyLoading)return;
 historySeq++;history.clear();historyOldest=null;
 const seq=historySeq,end=Math.min(Date.now()-ARCHIVE_LAG,ms+45*DAY),start=Math.max(EARLIEST,end-89*DAY);
 historyLoading=true;
 try{const items=await requestArchive(start,end,seq);if(seq!==historySeq)return;if(items.length){historyOldest=Math.min(...items.map(x=>x.t));render();status("Historical data loaded · "+items.length+" daily rows")}}
 catch(e){status("History unavailable: "+e.message)}
 finally{if(seq===historySeq)historyLoading=false}
}
function receive(evt){
 const d=evt.detail;if(!d?.forecast||!d.location)return;
 const locationChanged=place?.lat!==d.location.lat||place?.lon!==d.location.lon;
 const modelChanged=model!==d.model;
 place={...d.location};model=d.model||"best_match";lang=d.lang||"el";forecast=d.forecast;forecastExtra=null;
 if(locationChanged){historySeq++;history.clear();historyOldest=null;historyLoading=false}
 if(locationChanged||modelChanged)loadForecastExtra();
 if(active){render();if(locationChanged||historyOldest===null)moreHistory(false)}
}
function activate(){
 active=true;
 if(!window.echarts){status("ECharts unavailable. Check your connection to the chart library CDN.");return}
 if(!chart)render();else chart.resize();
 if(place&&historyOldest===null)moreHistory(false);
}
function initialize(){
 connectControls();
 window.addEventListener("meteolab:forecast",receive);
 window.addEventListener("meteolab:language",e=>{lang=e.detail?.lang||"el";if(active)render()});
 window.addEventListener("meteolab:ready",e=>{if(e.detail?.location&&!place)place=e.detail.location;lang=e.detail?.lang||"el"});
 if(document.querySelector("#view-timeline.active"))activate();
}
window.MeteoTimeline={activate,moreHistory,resetRange,exportPNG,exportRows:()=>rowsAll().filter(r=>r.t>=shown[0]&&r.t<=shown[1]).map(r=>({utc:new Date(r.t).toISOString(),source:r.kind,...Object.fromEntries(layers.filter(l=>enabled[l.key]).map(l=>[l.key,r[l.key]]))})),getState:()=>({shown:[...shown],loadedDays:history.size,oldest:historyOldest,layers:{...enabled},location:place})};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);else initialize();
})();
