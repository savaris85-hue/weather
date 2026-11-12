import {test,expect} from "@playwright/test";

function fakeResponse(url) {
  const query=new URL(url).searchParams;
  const start=query.get("start_date"),end=query.get("end_date");
  const requested=(query.get("hourly")||"").split(",").filter(Boolean);
  if(query.has("past_days") || query.has("forecast_days")) {
    throw Error("Regression: unexpected conflicting forecast date parameters");
  }
  const from=Date.parse(start+"T00:00:00Z"),to=Date.parse(end+"T00:00:00Z");
  const stamps=[];
  for(let t=from;t<=to;t+=6*3600000)stamps.push(new Date(t).toISOString().slice(0,16));
  const hourly={time:stamps};
  for(const key of requested) {
    hourly[key]=stamps.map((_,i)=>{
      if(key==="temperature_2m")return 16+8*Math.sin(i/6);
      if(key==="relative_humidity_2m")return Math.round(70+20*Math.sin(i/9));
      if(key==="wind_speed_10m")return 2+Math.round(Math.abs(Math.sin(i/4))*40);
      if(key==="wind_gusts_10m")return 6+Math.round(Math.abs(Math.sin(i/4))*50);
      if(key==="wind_direction_10m")return i*45%360;
      if(key==="precipitation")return i%14===0?2.4:0;
      if(key==="pressure_msl")return 1015+6*Math.sin(i/13);
      if(key==="cloud_cover")return Math.round(50+45*Math.sin(i/8));
      if(key==="weather_code")return [0,1,2,3,61,95][Math.floor(i/4)%6];
      if(key==="dew_point_2m")return 9+4*Math.sin(i/7);
      if(key==="precipitation_probability")return i%14===0?70:5;
      if(key==="shortwave_radiation")return i%4===2?550:0;
      if(key==="uv_index")return i%4===2?6:0;
      return 0;
    });
  }
  return {hourly};
}
async function setup(page) {
  const requests=[];
  await page.route(/https:\/\/(archive-api|api)\.open-meteo\.com\/v1\/(archive|forecast)\?/,async route=>{
    const url=route.request().url();requests.push(new URL(url));
    await route.fulfill({status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},
      body:JSON.stringify(fakeResponse(url))});
  });
  await page.goto("/weather-time-machine/",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#status")).toContainText("σημεία στο γράφημα");
  return requests;
}
test("real Chromium renders classic multi-layer timeline with Celsius and Beaufort",async({page},testInfo)=>{
  const requests=await setup(page);
  await expect(page.locator("#plot .main-svg").first()).toBeVisible();
  await expect(page.locator("#overview .main-svg").first()).toBeVisible();
  const layout=await page.locator("#plot").evaluate(el=>el.layout);
  expect(layout.xaxis.side).toBe("top");
  expect(layout.annotations.length).toBeGreaterThan(4);
  expect(layout.shapes.some(s=>s.type==="line" && s.line?.color==="#f49c14")).toBeTruthy();
  expect(layout.shapes.some(s=>s.type==="rect" && s.fillcolor==="rgba(183,145,238,.21)")).toBeTruthy();

  await expect(page.locator("#current-temp")).toContainText("°C");
  await expect(page.locator("#current-wind")).toContainText("Bft");
  await expect(page.locator("#current-icon")).not.toHaveText("·");
  await expect(page.locator("#chart-title")).toContainText("Elliniko");
  expect(requests.some(url=>url.hostname==="archive-api.open-meteo.com")).toBeTruthy();
  expect(requests.some(url=>url.hostname==="api.open-meteo.com")).toBeTruthy();
  await page.screenshot({path:testInfo.outputPath("weather-v2-desktop.png"),fullPage:true});
});
test("real Chromium changes model, layers, cumulative mode and handles date navigation",async({page},testInfo)=>{
  const requests=await setup(page);
  await page.locator("#model").selectOption("ncep_gfs_seamless");
  await expect(page.locator("#chart-title")).toContainText("NOAA GFS");
  expect(requests.some(url=>url.searchParams.get("models")==="ncep_gfs_seamless")).toBeTruthy();
  await page.locator("#layers-toggle").click();
  await expect(page.locator("#layer-options input[type=checkbox]")).toHaveCount(14);
  await page.locator("#layer-options input[data-layer=wind_direction_10m]").uncheck();
  await page.locator("#rain-mode").selectOption("total");
  await page.locator("#save-layout").click();
  await expect(page.locator("#status")).toContainText("αποθηκεύτηκε");
  await page.locator("#close-layers").click();
  await page.locator("#zoom-in").click();
  await expect(page.locator("#chart-subtitle")).toContainText("UTC");
  await page.screenshot({path:testInfo.outputPath("weather-v2-layers.png"),fullPage:true});
});
test("real Chromium can navigate back one year without 3-year loading limit",async({page})=>{
  const requests=await setup(page);
  await page.locator("#start").fill("2025-06-01");
  await page.locator("#end").fill("2025-06-14");
  await page.locator("#load").click();
  await expect(page.locator("#status")).toContainText("σημεία στο γράφημα");
  await expect(page.locator("#chart-subtitle")).toContainText("Ιουν");
  expect(requests.some(url=>url.hostname==="archive-api.open-meteo.com" &&
    url.searchParams.get("start_date")<"2025-07-01")).toBeTruthy();
  await page.locator("#back").click();
  await expect(page.locator("#status")).toContainText("σημεία στο γράφημα");
});

test("actual Chromium computes historical percentiles and user-configurable colors",async({page},testInfo)=>{
  await setup(page);
  await page.locator("#layers-toggle").click();
  await page.locator("#climate-years").selectOption("10");
  await expect(page.locator("#climate-status")).toContainText("Γκρίζα:",{timeout:60000});
  const hasBand=await page.locator("#plot").evaluate(el=>
    el.data.some(s=>String(s.name).includes("ιστορικό") && s.fill==="tonexty"));
  expect(hasBand).toBeTruthy();
  const beforeColor=await page.locator("#plot").evaluate(el=>
    el.data.find(s=>s.name?.startsWith("Forecast · Θερμοκρασία"))?.line?.color);
  await page.locator("#wave-palette").selectOption("ocean");
  await expect.poll(()=>page.locator("#plot").evaluate(el=>
    el.data.find(s=>s.name?.startsWith("Forecast · Θερμοκρασία"))?.line?.color)).not.toBe(beforeColor);
  const bold=await page.locator("#plot").evaluate(el=>{
    const prediction=el.data.find(s=>s.name?.startsWith("Forecast · Θερμοκρασία"));
    const actual=el.data.find(s=>s.name?.startsWith("ERA5 · Θερμοκρασία"));
    return {prediction:prediction?.line?.width,actual:actual?.line?.width};
  });
  expect(bold.prediction).toBeGreaterThan(bold.actual);
  await page.locator("#height-slider").evaluate(el=>{el.value="144";el.dispatchEvent(new Event("input",{bubbles:true}));});
  await expect.poll(()=>page.locator("#plot").evaluate(el=>el.layout?.height)).toBeGreaterThan(1450);
  const main=await page.locator("#plot").boundingBox();
  const navigator=await page.locator("#overview").boundingBox();
  expect(navigator.y).toBeGreaterThanOrEqual(main.y+main.height-4);
  await expect(page.locator("#legend-forecast")).not.toHaveCSS("background-color","rgb(216, 57, 45)");
  await expect(page.locator("#plot")).toHaveAttribute("role","img");
  await page.locator("#save-layout").click();
  await page.screenshot({path:testInfo.outputPath("weather-v3-climate-colors.png"),fullPage:true});
});

test("RainViewer past-radar controls show UTC frame times without pretending to forecast",async({page})=>{
  await page.route("https://api.rainviewer.com/public/weather-maps.json",async route=>{
    await route.fulfill({status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},
      body:JSON.stringify({host:"https://tilecache.rainviewer.com",
        radar:{past:[{time:1794400000,path:"/v2/radar/1794400000"},
          {time:1794400600,path:"/v2/radar/1794400600"}]}})});
  });
  await setup(page);
  await page.locator("#radar-toggle").check();
  await expect(page.locator("#radar-time")).toContainText("UTC");
  await expect(page.locator("#radar-next")).toBeEnabled();
  await page.locator("#radar-prev").click();
  await expect(page.locator("#radar-time")).toContainText("UTC");
  await page.locator("#radar-toggle").uncheck();
  await expect(page.locator("#radar-time")).toHaveText("Radar ανενεργό");
});


test("clear Greek row labels are entirely inside the chart at desktop width",async({page})=>{
  await setup(page);
  await expect(page.locator("#plot .annotation").first()).toBeVisible();
  const positions=await page.locator("#plot").evaluate(el=>{
    const rect=el.getBoundingClientRect();
    return [...el.querySelectorAll(".annotation")].map(label=>{
      const box=label.getBoundingClientRect();
      return {left:box.left,top:box.top,right:box.right,chartLeft:rect.left,chartRight:rect.right};
    });
  });
  expect(positions.length).toBeGreaterThan(4);
  for(const pos of positions){
    expect(pos.left).toBeGreaterThanOrEqual(pos.chartLeft-2);
    expect(pos.right).toBeLessThanOrEqual(pos.chartRight+2);
  }
});

test("user can customize each measurement and make forecast line bolder; settings persist",async({page})=>{
  await setup(page);
  await page.locator("#layers-toggle").click();
  await expect(page.locator("#layer-options input[type=color]")).toHaveCount(14);
  await page.locator("#layer-options input[data-layer-color=temperature_2m]").evaluate(el=>{
    el.value="#b13586";el.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await expect.poll(()=>page.locator("#plot").evaluate(el=>
    el.data.find(s=>s.name?.startsWith("Forecast · Θερμοκρασία"))?.line?.color)).toBe("#912f72");
  await page.locator("#forecast-weight").evaluate(el=>{
    el.value="4.5";el.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await expect.poll(()=>page.locator("#plot").evaluate(el=>
    el.data.find(s=>s.name?.startsWith("Forecast · Θερμοκρασία"))?.line?.width)).toBe(4.5);
  await page.locator("#save-layout").click();
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.locator("#status")).toContainText("σημεία στο γράφημα");
  await page.locator("#layers-toggle").click();
  await expect(page.locator("#layer-options input[data-layer-color=temperature_2m]")).toHaveValue("#b13586");
  await expect(page.locator("#forecast-weight")).toHaveValue("4.5");
});

test("historical reference periods support 1, 2, 3 years and custom 1990–1992",async({page})=>{
  await setup(page);
  await page.locator("#layers-toggle").click();
  for(const years of ["1","2","3"]){
    await page.locator("#climate-years").selectOption(years);
    await expect(page.locator("#climate-status")).toContainText(years+" έτη",{timeout:30000});
  }
  await page.locator("#climate-years").selectOption("custom");
  await expect(page.locator("#climate-custom-range")).toBeVisible();
  await page.locator("#climate-year-from").fill("1990");
  await page.locator("#climate-year-to").fill("1992");
  await page.locator("#climate-apply").click();
  await expect(page.locator("#climate-status")).toContainText("1990–1992",{timeout:30000});
});

test("pins up to five locations in the sidebar and restores them across reload",async({page})=>{
  await page.route(/https:\/\/geocoding-api\.open-meteo\.com\/v1\/search/,async route=>{
    const search=new URL(route.request().url()).searchParams.get("name");
    const number=Number(search.replace("City",""))||1;
    await route.fulfill({status:200,contentType:"application/json",
      headers:{"access-control-allow-origin":"*"},
      body:JSON.stringify({results:[{name:search,country:"Greece",latitude:36+number*.2,longitude:23+number*.3,timezone:"Europe/Athens"}]})});
  });
  await setup(page);
  await page.locator("#pin-current").click();
  await expect(page.locator("#pin-count")).toHaveText("1/5");
  for(let i=1;i<=4;i++){
    await page.locator("#place").fill("City"+i);
    await expect(page.locator("#suggestions button").first()).toBeVisible();
    await page.locator("#suggestions button").first().click();
    await page.locator("#pin-current").click();
  }
  await expect(page.locator("#pin-count")).toHaveText("5/5");
  await expect(page.locator("#pinned-cities .pin-chip")).toHaveCount(5);
  await expect(page.locator("#pin-current")).toBeDisabled();
  await page.reload({waitUntil:"domcontentloaded"});
  await expect(page.locator("#pin-count")).toHaveText("5/5");
  await page.locator("#pinned-cities .pin-chip").nth(1).click();
  await expect(page.locator("#current-place")).toContainText("City1");
  await page.locator("#pinned-cities .pin-remove").nth(0).click();
  await expect(page.locator("#pin-count")).toHaveText("4/5");
});

test("390px mobile viewport keeps labels, city pins, map, charts and controls usable",async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await setup(page);
  await expect(page.locator("#pin-current")).toBeVisible();
  await expect(page.locator("#map")).toBeVisible();
  await expect(page.locator("#current-temp")).toContainText("°C");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(4);
  const labels=await page.locator("#plot").evaluate(el=>{
    const r=el.getBoundingClientRect();
    return [...el.querySelectorAll(".annotation")].map(node=>({
      left:node.getBoundingClientRect().left,chartLeft:r.left
    }));
  });
  expect(labels.length).toBeGreaterThan(4);
  for(const label of labels)expect(label.left).toBeGreaterThanOrEqual(label.chartLeft-3);
  await page.locator("#layers-toggle").click();
  await expect(page.locator("#layer-panel")).toBeVisible();
  await expect(page.locator("#layer-options input[type=color]")).toHaveCount(14);
  await page.screenshot({path:testInfo.outputPath("weather-v4-mobile-390.png"),fullPage:true});
});


test("v5 desktop sticky header, sidebar, controls and date strip remain fixed while scrolling",async({page},testInfo)=>{
  await setup(page);
  await expect(page.locator("#site-header")).toContainText("Developed by");
  await expect(page.locator("#site-header")).toContainText("Antonis Savaris");
  await expect(page.locator("#sticky-date-values .sticky-day")).toHaveCount(8);
  const sticky=await page.evaluate(()=>{
    return ["#site-header","#location-sidebar","#main-controls","#sticky-dates"].map(selector=>({
      selector,position:getComputedStyle(document.querySelector(selector)).position
    }));
  });
  for(const item of sticky)expect(item.position).toBe("sticky");
  await page.evaluate(()=>window.scrollTo(0,950));
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(400);
  const places=await page.evaluate(()=>{
    const header=document.querySelector("#site-header").getBoundingClientRect();
    const sidebar=document.querySelector("#location-sidebar").getBoundingClientRect();
    const toolbar=document.querySelector("#main-controls").getBoundingClientRect();
    const dates=document.querySelector("#sticky-dates").getBoundingClientRect();
    return {header:header.top,sidebar:sidebar.top,toolbar:toolbar.top,dates:dates.top,
      headerHeight:header.height,toolbarHeight:toolbar.height};
  });
  expect(Math.abs(places.header)).toBeLessThan(3);
  expect(Math.abs(places.sidebar-places.headerHeight)).toBeLessThan(6);
  expect(Math.abs(places.toolbar-places.headerHeight)).toBeLessThan(6);
  expect(Math.abs(places.dates-places.headerHeight-places.toolbarHeight)).toBeLessThan(7);
  await page.screenshot({path:testInfo.outputPath("v5-desktop-sticky-after-scroll.png")});
});

test("v5 navigator displays explicit dates, selected window and visible date ticks after navigation",async({page},testInfo)=>{
  await setup(page);
  const before=await page.locator("#nav-from-date").textContent();
  await expect(page.locator("#nav-to-date")).not.toBeEmpty();
  await expect(page.locator("#nav-duration")).toHaveText("15 ημέρες");
  await expect(page.locator("#nav-date-ticks .nav-date-tick")).toHaveCount(8);
  await expect(page.locator("#nav-loaded-range")).toContainText("Φορτωμένο:");
  await expect(page.locator("#overview .main-svg").first()).toBeVisible();
  await expect(page.locator("#overview .rangeslider-container")).toBeVisible();
  await page.locator("#back").click();
  await expect(page.locator("#status")).toContainText("σημεία στο γράφημα");
  await expect(page.locator("#nav-from-date")).not.toHaveText(before);
  await expect(page.locator("#sticky-date-summary")).not.toBeEmpty();
  await page.locator("#overview").scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath("v5-navigator-dates-selection.png")});
});

test("v5 390px mobile keeps header and date ribbon sticky without taking entire screen",async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await setup(page);
  await expect(page.locator("#developer-credit")).toHaveCount(0);
  await expect(page.locator(".developer-credit")).toBeVisible();
  await expect(page.locator("#sticky-date-values .sticky-day")).toHaveCount(3);
  await expect(page.locator("#sticky-date-values .sticky-day:visible")).toHaveCount(3);
  await expect(page.locator("#nav-date-ticks .nav-date-tick")).toHaveCount(3);
  await page.evaluate(()=>window.scrollTo(0,1350));
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(500);
  const dim=await page.evaluate(()=>{
    const header=document.querySelector("#site-header").getBoundingClientRect();
    const ribbon=document.querySelector("#sticky-dates").getBoundingClientRect();
    const toolbar=document.querySelector("#main-controls").getBoundingClientRect();
    return {headerTop:header.top,headerHeight:header.height,ribbonTop:ribbon.top,
      ribbonHeight:ribbon.height,toolbarPosition:getComputedStyle(document.querySelector("#main-controls")).position,
      overflow:document.documentElement.scrollWidth-innerWidth};
  });
  expect(Math.abs(dim.headerTop)).toBeLessThan(3);
  expect(Math.abs(dim.ribbonTop-dim.headerHeight)).toBeLessThan(6);
  expect(dim.toolbarPosition).not.toBe("sticky");
  expect(dim.headerHeight+dim.ribbonHeight).toBeLessThan(175);
  expect(dim.overflow).toBeLessThanOrEqual(4);
  await page.screenshot({path:testInfo.outputPath("v5-mobile-sticky-after-scroll.png")});
});


test("bold forecast starts only at now; earlier forecast-model data stays thin and separately attributed",async({page})=>{
  await setup(page);
  const result=await page.locator("#plot").evaluate(el=>{
    const now=Date.now();
    const matching=el.data.filter(trace=>trace.name?.includes("Θερμοκρασία"));
    const future=matching.find(trace=>trace.name?.startsWith("Forecast ·"));
    const recent=matching.find(trace=>trace.name?.startsWith("Recent model ·"));
    const historical=matching.find(trace=>trace.name?.startsWith("ERA5 ·"));
    return {
      now, future:{x:future?.x,width:future?.line?.width},
      recent:{x:recent?.x,width:recent?.line?.width,dash:recent?.line?.dash,
        attribution:recent?.hovertemplate},
      historical:{width:historical?.line?.width}
    };
  });
  expect(result.future.x.length).toBeGreaterThan(0);
  expect(result.recent.x.length).toBeGreaterThan(0);
  expect(result.historical.width).toBeLessThan(result.future.width);
  expect(result.recent.width).toBeLessThan(result.future.width);
  expect(result.recent.dash).toBe("dot");
  expect(result.recent.attribution).toContain("Πρόσφατη εκτίμηση μοντέλου");
  for(const date of result.future.x)expect(Date.parse(date)).toBeGreaterThanOrEqual(result.now-1000);
  for(const date of result.recent.x)expect(Date.parse(date)).toBeLessThan(result.now);
});


test("map click resolves nearest named locality, updates all UI labels and pins without Coordinates",async({page})=>{
  await page.route(/https:\/\/nominatim\.openstreetmap\.org\/reverse\?/,async route=>{
    await route.fulfill({status:200,contentType:"application/json",
      headers:{"access-control-allow-origin":"*"},
      body:JSON.stringify({address:{town:"Λάρισα",country:"Ελλάδα",state:"Θεσσαλία"}})});
  });
  await setup(page);
  await page.locator("#map").click({position:{x:180,y:155}});
  await expect(page.locator("#current-place")).toContainText("Λάρισα",{timeout:30000});
  await expect(page.locator("#place")).toHaveValue(/Λάρισα/);
  await expect(page.locator("#chart-title")).toContainText("Λάρισα",{timeout:30000});
  await expect(page.locator("#current-place")).not.toContainText("Coordinates");
  await expect(page.locator("#chart-title")).not.toContainText("Elliniko");
  await page.locator("#pin-current").click();
  await expect(page.locator("#pinned-cities")).toContainText("Λάρισα");
  await expect(page.locator("#pinned-cities")).not.toContainText("Coordinates");
});
test("new location recovers from one Open-Meteo 429 without stale Elliniko data or extra click",async({page})=>{
  await setup(page);
  let temporaryFailures=0;
  await page.route(/https:\/\/(archive-api|api)\.open-meteo\.com\/v1\/(archive|forecast)\?/,async route=>{
    const url=route.request().url();
    if(temporaryFailures++===0){
      await route.fulfill({status:429,contentType:"application/json",
        headers:{"access-control-allow-origin":"*"},
        body:JSON.stringify({reason:"Too many concurrent requests"})});
    } else{
      await route.fulfill({status:200,contentType:"application/json",
        headers:{"access-control-allow-origin":"*"},
        body:JSON.stringify(fakeResponse(url))});
    }
  });
  await page.route(/https:\/\/geocoding-api\.open-meteo\.com\/v1\/search/,async route=>{
    await route.fulfill({status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},
      body:JSON.stringify({results:[{name:"Volos",country:"Greece",latitude:39.36,longitude:22.95,timezone:"Europe/Athens"}]})});
  });
  await page.locator("#place").fill("Volos");
  await expect(page.locator("#suggestions button").first()).toBeVisible();
  await page.locator("#suggestions button").first().click();
  await expect(page.locator("#chart-title")).toContainText("Volos",{timeout:30000});
  await expect(page.locator("#current-place")).toContainText("Volos");
  await expect(page.locator("#status")).toContainText("σημεία στο γράφημα",{timeout:60000});
  expect(temporaryFailures).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#chart-title")).not.toContainText("Elliniko");
  await expect(page.locator("#current-temp")).toContainText("°C");
});


test("legacy Coordinates favorite is resolved to town on selection and saved with its name",async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem("wtm-pinned-cities-v1",JSON.stringify([
      {name:"Coordinates",country:"37.945, 22.632",latitude:37.945,longitude:22.632,timezone:"GMT"}
    ]));
  });
  await page.route(/https:\/\/nominatim\.openstreetmap\.org\/reverse\?/,async route=>{
    await route.fulfill({status:200,contentType:"application/json",
      headers:{"access-control-allow-origin":"*"},
      body:JSON.stringify({address:{town:"Κόρινθος",country:"Ελλάδα"}})});
  });
  await setup(page);
  await page.locator("#pinned-cities .pin-chip").first().click();
  await expect(page.locator("#current-place")).toContainText("Κόρινθος",{timeout:30000});
  await expect(page.locator("#pinned-cities .pin-chip").first()).toContainText("Κόρινθος");
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("wtm-pinned-cities-v1")));
  expect(saved[0].name).toBe("Κόρινθος");
});
