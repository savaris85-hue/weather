/* MeteoLab day-by-day forecast player — standalone progressive enhancement, no accounts. */
(()=>{"use strict";
const rootIds=["dayPlaybackOverview","dayPlaybackForecast"];
let data=null,selected=0,index=0,playing=true,lang="el",town="";let tick=null,playingStarted=false;
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const gr=()=>lang!=="en",tr=(el,en)=>gr()?el:en,arr=(o,k)=>Array.isArray(o?.[k])?o[k]:[];
const bft=kmh=>kmh==null?null:Math.min(12,Math.max(0,Math.round(Math.pow(Number(kmh)/3.6/.836,2/3))));
function dayDate(i){return data?.daily?.time?.[i]||null}
function hoursFor(i){
 const day=dayDate(i),h=data?.hourly;if(!h||!day)return[];
 return arr(h,"time").map((time,j)=>({time,hh:Number(time.slice(11,13)),temp:h.temperature_2m?.[j],feel:h.apparent_temperature?.[j],wind:h.wind_speed_10m?.[j],dir:h.wind_direction_10m?.[j],rain:h.precipitation?.[j],chance:h.precipitation_probability?.[j],cloud:h.cloud_cover?.[j],humidity:h.relative_humidity_2m?.[j],code:h.weather_code?.[j],day:h.is_day?.[j]})).filter(r=>r.time.slice(0,10)===day);
}
const fmt=(n,d=0)=>n==null||!Number.isFinite(Number(n))?"—":Number(n).toFixed(d);
function daytime(row,i){
 if(row?.day!=null)return !!row.day;
 const sunrise=data?.daily?.sunrise?.[i]?.slice(11,16)||"07:00",sunset=data?.daily?.sunset?.[i]?.slice(11,16)||"19:00";
 return row?.time?.slice(11,16)>=sunrise&&row?.time?.slice(11,16)<sunset;
}
function weatherCode(code,light){
 if(code>=95)return light?"⛈️":"⛈️";
 if(code>=71&&code<=77)return "❄️";
 if((code>=51&&code<=67)||(code>=80&&code<=82))return "🌧️";
 if(code===45||code===48)return "🌫️";
 if(code===3)return "☁️";
 if(code===2)return light?"⛅":"☁️";
 if(code===1)return light?"🌤️":"🌙";
 return light?"☀️":"🌙";
}
function desc(code){
 if(code>=95)return tr("Καταιγίδα","Thunderstorm");
 if(code>=71&&code<=77)return tr("Χιόνι","Snow");
 if((code>=51&&code<=67)||(code>=80&&code<=82))return tr("Βροχή","Rain");
 if(code===45||code===48)return tr("Ομίχλη","Fog");
 if(code>=3)return tr("Συννεφιά","Cloudy");
 if(code===2)return tr("Μερική νέφωση","Partly cloudy");
 return tr("Αίθριος","Clear");
}
function cardinal(v){
 if(v==null)return "—";
 const p=["Β","ΒΑ","Α","ΝΑ","Ν","ΝΔ","Δ","ΒΔ"],q=["N","NE","E","SE","S","SW","W","NW"];
 return (gr()?p:q)[Math.round((Number(v)%360)/45)%8];
}
function fmtDate(v){if(!v)return"—";const d=new Date(v+"T12:00:00Z");return new Intl.DateTimeFormat(gr()?"el-GR":"en-US",{weekday:"long",day:"numeric",month:"long",timeZone:"UTC"}).format(d)}
function at(r,i){
 const start=data?.daily?.sunrise?.[i]?.slice(11,16)||"07:00",stop=data?.daily?.sunset?.[i]?.slice(11,16)||"19:00";
 const hh=r?.time?.slice(11,16)||"12:00";
 const mins=s=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
 const dawn=mins(start),dusk=mins(stop),now=mins(hh),light=daytime(r,i);
 const prog=light?Math.max(0,Math.min(1,(now-dawn)/Math.max(1,dusk-dawn))):Math.max(0,Math.min(1,now<dawn?(now+1440-dusk)/(dawn+1440-dusk):(now-dusk)/(dawn+1440-dusk)));
 return {start,stop,hh,light,prog};
}
function template(target){
 return '<div class="ml-day-head"><div><div class="ml-day-eyebrow">'+tr("ΩΡΙΑΙΑ ΚΙΝΗΣΗ ΤΟΥ ΚΑΙΡΟΥ","HOURLY WEATHER ANIMATION")+'</div><h3 data-ml-date>—</h3><div class="ml-day-source">'+tr("Πρόγνωση ανά ώρα · όχι πραγματική δορυφορική εικόνα","Hourly forecast · not live satellite imagery")+'</div></div><div class="ml-day-stepday"><button type="button" data-ml-prevday aria-label="Previous day">‹</button><span data-ml-daycount>—</span><button type="button" data-ml-nextday aria-label="Next day">›</button></div></div>'+
 '<div class="ml-day-sky" data-ml-sky><div class="ml-day-stars"></div><div class="ml-day-arc"></div><div class="ml-day-celestial" data-ml-celestial></div><div class="ml-day-clouds" data-ml-clouds></div><div class="ml-day-rain" data-ml-rain></div><div class="ml-day-core"><div class="ml-day-icon" data-ml-icon>🌤️</div><div><div class="ml-day-temp" data-ml-temp>—</div><div class="ml-day-desc" data-ml-desc>—</div><div class="ml-day-isnight" data-ml-isnight></div></div></div><div class="ml-day-wind"><span class="ml-day-arrow" data-ml-arrow>➤</span><span data-ml-wind>—</span></div></div>'+
 '<div class="ml-day-meta"><span>☂ <strong data-ml-rainmm>—</strong></span><span>☔ <strong data-ml-chance>—</strong></span><span>☁ <strong data-ml-cover>—</strong></span><span>💧 <strong data-ml-humidity>—</strong></span><span>🌡 <strong data-ml-feel>—</strong></span></div>'+
 '<div class="ml-day-controls"><button type="button" data-ml-play class="ml-day-play">❚❚</button><button type="button" data-ml-back aria-label="Previous hour">−1h</button><span data-ml-hour>—</span><button type="button" data-ml-next aria-label="Next hour">+1h</button><input type="range" data-ml-range min="0" max="23" value="0" aria-label="Hour of day"><span data-ml-sun>—</span></div>'+
 '<div class="ml-day-clockline" data-ml-clock></div>';
}
function setText(w,sel,v){const e=w.querySelector(sel);if(e)e.textContent=v}
function render(){
 if(!data)return;
 const rows=hoursFor(selected);
 if(!rows.length){for(const id of rootIds){const w=$(id);if(w)w.innerHTML='<p class="ml-day-unavailable">'+tr("Δεν υπάρχει διαθέσιμη ωριαία πρόγνωση για αυτή την ημέρα.","No hourly forecast is available for this day.")+"</p>"}return}
 index=Math.min(Math.max(index,0),rows.length-1);
 const r=rows[index],sun=at(r,selected),wind=bft(r.wind),cloud=r.cloud??0,precip=r.rain??0;
 for(const id of rootIds){
  const w=$(id);if(!w)continue;
  if(!w.querySelector("[data-ml-sky]")){w.innerHTML=template(id);bind(w)}
  setText(w,"[data-ml-date]",fmtDate(dayDate(selected)));
  setText(w,"[data-ml-daycount]",(selected+1)+" / "+Math.min(14,data.daily.time.length));
  setText(w,"[data-ml-icon]",weatherCode(r.code,sun.light));
  setText(w,"[data-ml-temp]",fmt(r.temp,1)+" °C");
  setText(w,"[data-ml-desc]",desc(r.code));
  setText(w,"[data-ml-isnight]",sun.light?tr("Ημέρα","Day"):tr("Νύχτα","Night"));
  setText(w,"[data-ml-wind]",wind==null?"—":wind+" Bft · "+cardinal(r.dir));
  setText(w,"[data-ml-rainmm]",fmt(r.rain,1)+" mm");
  setText(w,"[data-ml-chance]",fmt(r.chance)+"%");
  setText(w,"[data-ml-cover]",fmt(r.cloud)+"%");
  setText(w,"[data-ml-humidity]",fmt(r.humidity)+"%");
  setText(w,"[data-ml-feel]",fmt(r.feel,1)+" °C");
  setText(w,"[data-ml-hour]",sun.hh);
  setText(w,"[data-ml-sun]",sun.start+" ☀ "+sun.stop);
  const sky=w.querySelector("[data-ml-sky]");sky.classList.toggle("ml-night",!sun.light);sky.classList.toggle("ml-rainy",precip>0.15);
  const celestial=w.querySelector("[data-ml-celestial]");celestial.classList.toggle("ml-moon",!sun.light);
  celestial.style.left=(7+sun.prog*86)+"%";celestial.style.top=(68-Math.sin(Math.PI*sun.prog)*49)+"%";
  const cloudDiv=w.querySelector("[data-ml-clouds]");cloudDiv.style.opacity=String(Math.max(.03,Math.min(.95,cloud/100)));
  cloudDiv.innerHTML=Array.from({length:Math.max(1,Math.min(5,Math.round(cloud/24)))},(_,i)=>'<span class="ml-cloud" style="left:'+(6+i*21)%90+'%;top:'+(14+i%3*19)+'%;animation-delay:-'+(i*1.2)+'s"></span>').join("");
  const rainDiv=w.querySelector("[data-ml-rain]");rainDiv.innerHTML=precip>.15?Array.from({length:Math.min(40,5+Math.round(precip*6))},(_,i)=>'<i style="left:'+(i*37)%97+'%;animation-delay:-'+(i*.17)+'s"></i>').join(""):"";
  const arrow=w.querySelector("[data-ml-arrow]");arrow.style.transform="rotate("+((r.dir??0)+180)+"deg)";
  const range=w.querySelector("[data-ml-range]");range.max=String(rows.length-1);range.value=String(index);
  const play=w.querySelector("[data-ml-play]");play.textContent=playing?"❚❚":"▶";play.title=playing?tr("Παύση","Pause"):tr("Αναπαραγωγή","Play");
  const ticks=w.querySelector("[data-ml-clock]");ticks.innerHTML=rows.map((h,i)=>'<span class="'+(i===index?"selected":"")+'" data-ml-jump="'+i+'">'+((i%3===0||i===index)?esc(h.time.slice(11,16)):"·")+'</span>').join("");
  ticks.querySelectorAll("[data-ml-jump]").forEach(b=>b.onclick=()=>{index=Number(b.dataset.mlJump);playing=false;render()});
 }
 document.querySelectorAll("[data-day]").forEach(b=>b.classList.toggle("selected",Number(b.dataset.day)===selected));
}
function bind(w){
 const action=(s,f)=>{const b=w.querySelector(s);if(b)b.addEventListener("click",f)};
 action("[data-ml-play]",()=>{playing=!playing;render()});
 action("[data-ml-back]",()=>{playing=false;index=Math.max(0,index-1);render()});
 action("[data-ml-next]",()=>{playing=false;index=Math.min(hoursFor(selected).length-1,index+1);render()});
 action("[data-ml-prevday]",()=>selectDay(Math.max(0,selected-1)));
 action("[data-ml-nextday]",()=>selectDay(Math.min(Math.min(14,data.daily.time.length)-1,selected+1)));
 w.querySelector("[data-ml-range]")?.addEventListener("input",e=>{index=Number(e.target.value);playing=false;render()});
}
function selectDay(i,focus=false){
 if(!data?.daily?.time?.length)return;
 selected=Math.max(0,Math.min(Math.min(data.daily.time.length,14)-1,Number(i)||0));index=0;playing=true;
 window.MeteoSelectForecastDay?.(selected);
 render();
 if(focus){const box=$("dayPlaybackOverview");if(box&&box.getClientRects().length)box.scrollIntoView({behavior:"smooth",block:"center"})}
}
function update(payload){
 if(!payload?.forecast)return;data=payload.forecast;lang=payload.lang||lang;town=payload.location?.name||town;
 if(Number.isInteger(payload.selectedDay))selected=payload.selectedDay;selected=Math.min(selected,Math.max(0,(data.daily?.time?.length||1)-1));index=0;render();
}
function start(){if(playingStarted)return;playingStarted=true;
 window.addEventListener("meteolab:forecast",e=>update(e.detail));
 window.addEventListener("meteolab:language",e=>{lang=e.detail?.lang||"el";render()});
 document.addEventListener("visibilitychange",()=>{if(document.hidden)playing=false});
 tick=setInterval(()=>{if(!playing||document.hidden||!data)return;const n=hoursFor(selected).length;if(!n)return;index=(index+1)%n;render()},1300);
}
window.MeteoDayPlayback={update,selectDay,render};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();