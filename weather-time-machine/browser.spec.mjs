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
