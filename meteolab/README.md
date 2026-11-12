# MeteoLab Web v1.0

A free, static, bilingual (Greek/English) weather workspace, accessible at the GitHub Pages path **/weather/meteolab/** when GitHub Pages is configured to publish the repository root from the main branch.

## MeteoLab v1.0 — Weather Timeline Explorer (2026-11-12)

The default landing screen now opens the dedicated dark **Weather Timeline** workstation inspired by scientific multi-panel weather visualizations (all styling and functionality is original). It uses **Apache ECharts 5.6** as an additional CDN dependency; earlier Chart.js dashboards, history, comparisons, rules, cloud AI, alerts, pinned locations and data/settings remain intact.

### Features delivered

- Ten individually switchable stacked scientific panels: Celsius temperature, humidity, precipitation, rain probability, mean sea-level pressure, Beaufort wind, cloud cover, meteorological wind direction arrows, dew point and Beaufort wind gusts.
- Shared ECharts time axes with linked crosshair, tooltips, wheel zoom, drag-pan, bottom range slider, zoom buttons and 3/7/14/30/90/365 day presets. Daily history is **not** interpolated to pretend it has hourly temporal resolution.
- Now boundary, distinct ERA5 daily reanalysis vs hourly Open-Meteo forecast styling, weather-code icon strip, color legend and adjustable per-panel heights; persist enabled layers and panel sizes in localStorage.
- Automatic historical fetch in 90-day ERA5 chunks when nearing the earliest loaded date (backwards to 1940 when available), manual older/newer navigation and jump-to-date. IndexedDB caches fetched chunks on supporting browsers; there is no server database to operate.
- Selected location/forecast model propagated from the existing main MeteoLab UI. The main forecast has the city's timezone; its time values are converted using the API's UTC offset before joining with an independent UTC extended-variables fetch. For a timezone offset change within one 14-day forecast, transition hours may be approximate.
- Historical daily aggregates: mean temperature, relative humidity, precipitation, peak wind, mean pressure, mean cloud cover, mean dew point and dominant direction. Probability and some wind-gust series are unavailable from the historic dataset and remain blank rather than being invented.
- Available hourly model parameters are requested for pressure, wind direction, dew point and wind gusts. Variables unsupported by a selected model remain blank.
- Export visible time-window weather rows to UTF-8 CSV, graph snapshot PNG, or browser print-to-PDF; global app exports are wired as well.
- View real multi-model comparisons in the existing Compare page; not yet superimposed into the new single timeline. Rules/alerts are preserved rather than recreated.

### QA and limitations

- Verified the new and original JavaScript compile, no duplicate DOM IDs and no missing referenced elements.
- Ran mocked integration tests: location+forecast event, extended hourly model response, ERA5 daily response, synchronized 8-axis/15-series ECharts options, historical fetch, wind-direction symbol series and CSV dataset availability.
- **Real external chart CDN, GitHub Pages rendering, live Open-Meteo response and the UX of mouse-wheel/pan cannot be end-to-end verified from the available test environment.** Do not describe those checks as completed.
- Backwards exploration is conditional on available source coverage, API quotas, network, CDN and browser memory. It does not literally provide infinite data. Historical data is model reanalysis, not a local station's raw observations. Open-Meteo's free offering is subject to usage terms and noncommercial restrictions.

## Working features

- Search worldwide locations with Open-Meteo geocoding.
- Four forecast choices through Open-Meteo: best match, NOAA GFS, ECMWF IFS and DWD ICON (availability varies by location, variables and forecast horizon).
- Current weather estimates, daily forecasts up to 14 days where provided, hourly table, weather chart.
- Minimal Leaflet map with **OpenFreeMap Positron vector tiles**, rendered using the MapLibre GL / Leaflet adapter; correct 256 px OpenStreetMap raster fallback instead of the broken 512 px tile scaling. The UI lets you manually choose OpenFreeMap or OSM fallback. Radar (RainViewer, past only) loads on demand; NASA GIBS is a daily satellite composite. **Neither radar nor satellite is a 14-day future radar forecast.**
- Sampled model-point forecast overlays for rain, temperature, cloud cover, wind, Beaufort and relative humidity. This is **not a continuous gridded forecast/radar field**.
- Draw and locally save geofences; rules linked to a geofence evaluate forecast at the simple vertex-mean center, not throughout the polygon.
- Configurable rule metrics, AND/OR second condition, thresholds, 1–4 consecutive forecast hours, per-rule 3–24 hour cooldown, lead times (whole hours), look-ahead and in-app/browser notifications. Geofences can be drawn from the Rules screen. Checks run **only while the page remains open**.
- Expanded local Greek/English prompt interpreter for forecast questions and rule suggestions. Supported examples include rain probability plus Beaufort AND checks, multi-hour persistence, and a radius around a geocoded place converted into a 36-vertex polygon on approval. **This is an interpretable rule parser, not a general LLM**; unsupported phrases require manual review.
- Export/Import local JSON settings; no registration needed.
- Five pinned places saved locally, selectable from the persistent header; unpin individually.
- Sticky navigation sidebar and persistent search header on scroll.
- Temperature is always Celsius and wind always Beaufort in forecasts and charts; display settings for precipitation (mm / in), distance (km / mi) and atmospheric pressure (hPa / inHg), with saved alert thresholds normalized internally.
- Chart-layer toggles for temperature, precipitation, Beaufort wind and relative humidity, including selectable combinations and humidity in hourly forecast tables / day details.
- Historical Weather view, with week/month/year time scales and dynamic leftward scrolling to earlier periods. Loads daily archived Open-Meteo historical reanalysis (ERA5-backed), with monthly aggregation in year mode, humidity and Beaufort in chart and table. The historical model analysis is not necessarily a real weather-station measurement.

## New in v0.5

- **Forecast cards remain sticky** near the top while scrolling through the 14-day forecast page; sidebar and search are sticky too.
- **Chart zoom/time compression:** separate zoom (+/-), time-scale slider, horizontal pan and reset controls for forecast and historical graphs. Ctrl+wheel zooms the historical timeline and pointer drag pans it.
- **Historical date anchor:** choose any archival end date instead of being forced to the latest available week; the label reflects the **currently visible range**, not the entire data accumulated in memory. Week/month/year view controls load earlier periods when scrolled left; older/newer buttons remain available.
- **Comparisons page:** two aligned plots plus overlay for the same relative days in different calendar years, using archived ERA5 daily reanalysis; select comparison years, reference date, length (7/14/30/90 days) and variable (temperature, humidity, precipitation or Beaufort wind). Also compare several present-day model forecasts (GFS, ECMWF, ICON, best match) on common 6-hour display intervals with unavailable periods left blank. No statistical confidence or bias-calibration claims.
- **BI dashboard:** 16 weather and derived indicators, alongside daily/hourly forecasts and a 14-day × 24-hour heatmap with 5 variables. The optional extended current values are requested separately so failure does not break the main forecast.
- **Exports:** CSV for the current forecast, historical timeline, comparisons and heatmap; PNG for Chart.js graphs; print dialog for **Save as PDF**, using print CSS. This is a browser print-to-PDF workflow, not a server-generated PDF attachment.
- **Source limitations:** the free static deployment does not deliver background notifications, working Google OAuth or a hosted LLM. Google, Telegram and 24/7 push require secure infrastructure and account authorization. Archive reanalysis is not an observed local weather station series; comparing it with live forecasts does not prove model skill.

## New in v0.6 — animated, map-free weather workspace

- Maps, radar overlays, map tiles and geofence drawing are **temporarily removed from the visible UI**. The app no longer initializes Leaflet or loads the OpenFreeMap/OSM tile libraries at startup. **Existing saved geofences remain in local storage and previously configured geofence rules are retained.** Creating new map polygons is disabled until the map editor returns.
- A custom animated weather hero replaces the failing map, with moving clouds, sunlight, rain and snow, live numerically sourced temperature, weather conditions, sunrise/sunset and feels-like temperature. The graphics are original SVG/CSS and include a `prefers-reduced-motion` fallback.
- All fourteen daily forecast cards show weather illustrations with soft animation. Additional visual cards show rain, clouds, pressure and UV values and animate their indicator bars.
- Subtle animations are added to the existing Chart.js weather charts; users who prefer reduced motion don't receive these animations.
- A natural-language **weather chat** is available on the overview, grounded in the selected Open-Meteo city and model. With no AI model loaded it uses the existing deterministic forecast summarizer.
- **Hosted cloud LLM (updated v0.7):** the WebGPU/WebLLM download and local AI runtime have been removed. Instead, the chat connects (on explicit click) to Puter.js hosted AI. After Puter account sign-in, the app retrieves the currently available catalogue and prioritizes :free variants and DeepSeek. Models without :free use the account's monthly allowance and may consume purchased credits when the allowance is exhausted; the app never performs a purchase or upgrade. Puter account free allowances, model availability and limits can change. Browser-based weather answers still work without sign-in.
- The remote cloud LLM is provided a bounded, structured extract of real Open-Meteo forecasts (current, 14-day daily, and matching hourly values) and is instructed not to invent missing data, promise alert delivery, or claim live radar nowcasting. LLM outputs can nonetheless be inaccurate; check the actual charts for decisions.
- Rule-builder prompt assistant remains deterministic and cannot autonomously activate an alert. Existing user-saved rules continue evaluating while the page is open only.

## Known limitations / future extensions

- **Google Sign-In:** not activated; requires a Google OAuth project/client and authorized origins, ideally a secure backend for persistent server-side accounts.
- **Telegram:** not activated; requires a backend to safeguard Telegram bot credentials, scheduler and delivery integration.
- **Background push & scheduled checks:** not available from static hosting alone. Browser notifications are best effort and only generated during page activity.
- **Minute-scale rain arrival / 10-minute alerts:** not supported by this hourly forecasting engine. Requires licensed high-resolution near-real-time radar, tracking / calibrated nowcasting and reliable server execution.
- **14-day data:** model availability differs; ECMWF, ICON and other sources may not provide every variable or all fourteen days. Nulls displayed as missing.
- Open-Meteo free noncommercial/public usage subject to current licensing/rate limits; RainViewer tile terms and NASA imagery limitations apply. Providers can update APIs.
- UI depends on Leaflet, Chart.js and Lucide CDNs; network access is required.

## Run locally

Serve the repository directory over HTTP and browse to `/meteolab/`, or open `meteolab/index.html` in a modern browser (HTTP hosting recommended).

Suggested command from repository root:

```bash
python3 -m http.server 8080
```

Then browse http://localhost:8080/meteolab/.

## Security

Do not put Telegram tokens, Google OAuth client secrets, Firebase private credentials, or other secrets in this public repository or browser JavaScript. For future adapters, use a secure backend with environment secrets, authentication, scheduling and rate limiting.

## Credits

Open-Meteo; RainViewer; NASA GIBS; OpenStreetMap Foundation; OSM France; Leaflet; Chart.js; Lucide.


## QA performed (2026-11-10)

- Main application JavaScript parsed successfully using V8 syntax validation.
- Tested representative Greek and English prompt parsing: combined rain probability + Beaufort; consecutive forecast hours; circular radius geofence; rejection of unsupported 10-minute arrival alerts.
- Verified internal DOM element IDs referenced in the JavaScript exist.
- Verified AND scientific rule condition matching on synthetic hourly fixture data, and generation of 36 polygon vertices for radius geofences.
- Live map tile connectivity, browser network behavior, and the GitHub Pages endpoint could **not** be end-to-end verified in the available sandbox, which blocks external web network access; map service errors are therefore not claimed resolved by a live visual test.
- Additional v0.4 synthetic tests: 21 historic daily records loaded and 21 older records prepended; historical humidity columns verified, hourly forecast humidity and Beaufort verified, chart layer datasets verified, pin count capped at five, and map mounted in its final UI slot before Leaflet initializes. These are logic/mocked-environment tests rather than real browser network tests.

## v0.5 QA (2026-11-11)

- Verified JavaScript syntax and that every static DOM ID referenced by the main script exists; no duplicate element IDs.
- Ran mocked tests for map order, vector layer activation, fallback tile size and manual raster selection. **External map tile rendering could not be tested end-to-end.**
- Tested historical comparison with two 7-day ERA5 response fixtures, and forecast model comparisons with three 7-day hourly fixtures sampled at six-hour intervals. Both comparisons produced aligned datasets.
- Tested BI card generation (16 cards), heatmap generation, historical range labeling after scrolling, pinned locations, humidity and Beaufort chart/table outputs.
- User should hard-reload public GitHub Pages after deployment to avoid older cached inline JavaScript.

## v0.6 QA (2026-11-11)

- Main inline JavaScript and new separate `ai-local.js` pass syntax compilation.
- All literal ID-based JavaScript DOM references are present and there are no duplicate HTML IDs.
- Confirmed that the map navigation button and map libraries are absent from the active UI; saved geofence data and existing rules are not removed.
- Confirmed weather icon rendering helper, animated CSS and browser reduced-motion rule are present.
- Confirmed cloud AI Puter authentication requires an explicit user action, there is no embedded secret or API key, and no WebGPU or local model download.
- **Browser visual QA, real Puter sign-in/cloud model API calls and real network/weather endpoint E2E tests remain outstanding**; mocked account/catalogue/response tests cannot replace live testing.

## v0.7 — Cloud AI replacement

The Weather Assistant no longer uses a local LLM or downloads an on-device model. Click **Connect online AI** to sign into Puter. The model selector lists currently available :free model variants first, preferring DeepSeek when a free variant exists. DeepSeek's usual API is paid; a provider-free variant is not guaranteed, and Puter's standard DeepSeek service can consume monthly allowance/purchased credits. The default fallback is always the free deterministic Open-Meteo forecast responder whenever cloud access is unavailable.

**Costs and privacy:** the Puter platform requires user authentication. Each account receives limited free monthly usage. When no free model variant exists, regular hosted model calls can consume that allowance and—if already purchased—account credits. The MeteoLab UI has no billing/top-up action. Cloud AI receives the currently selected city's weather forecast context and the user's question; don't send sensitive information as a prompt. Only enable cloud AI if you accept Puter's terms and metering.

QA: checked both scripts' syntax and DOM references; executed simulated sign-in, model-catalogue ranking (prefer free DeepSeek), chat request and normalized response handling. Actual Puter sign-in/network calls were not performed in a live browser.
