# MeteoLab Web v0.5

A free, static, bilingual (Greek/English) weather workspace, accessible at the GitHub Pages path **/weather/meteolab/** when GitHub Pages is configured to publish the repository root from the main branch.

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
