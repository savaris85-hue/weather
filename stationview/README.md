# StationView — live community weather dashboards

**StationView** is an independent, mobile-first weather station explorer. Its tablet-like, editable instrument dashboard is inspired by the interaction patterns of historical PWS dashboard applications; all graphics, branding and code are original. It has **real live data by default, not fabricated demo readings**.

## Start here (no API key)

Open **[StationView on GitHub Pages](https://savaris85-hue.github.io/weather/stationview/)** in Chrome, Firefox, Safari, or a recent mobile browser. On the first launch, the **station map opens automatically**, with no station ID or location entry required. Stations from the **openSenseMap public community network** load for the visible map area; they refresh when you pan or zoom, within provider limits (up to 300 displayed per query). Tap a pin or list item to open its dashboard. Tap an empty location to choose the closest recently reporting weather sensor. Search and GPS are purely optional. You may also use GPS with the browser's permission. It shows current readings actually reported by those sensors. Some stations measure only air quality, or are offline; they will not provide all weather widgets.

**Important limitation:** openSenseMap is a separate community network. It is *not* the Weather Underground/WunderStation station directory. The Weather Company PWS endpoints require a valid API key; no legitimate, generally available key-free endpoint covers the entire Weather Underground amateur station network. StationView does not pretend otherwise. You can optionally add a known Weather Company PWS station ID in **Stations → Add by ID** and configure your own key in **Settings**. The key is not embedded in this repository and is saved only in the current browser's `localStorage`.

## Features

- Saved stations, station switching via swipe/arrows/keyboard, reorder/remove/rename.
- Per-station editable tile layout; temperature, wind, humidity, dew point, pressure, rainfall, astronomy, forecast, station details, map, sensor-dependent UV/solar/indoor widgets.
- Expand a tile to see a detailed infographic or a chart. Charts include time range, multiple series with independent units/axes, comparative periods/stations, crosshair tooltip, wheel zoom and drag-pan, visible-range summaries, CSV and PNG export (requires Chart.js CDN).
- Auto-loading station discovery on a Leaflet map: visible-area bounding-box queries, one-time retry on provider HTTP 422 with smaller limits and fallback radius requests, touch-friendly map pins and zoomed-out clustering; city search and GPS are optional. Map tiles use third-party key-free services rather than the OSM Foundation volunteer tile host that rejected the previous build.
- Real sensor history from openSenseMap (when available); optional Weather Company historical hourly/daily queries in ≤31-day chunks. IndexedDB caches historical requests. A station's history is never invented.
- Open-Meteo **forecast** for the station coordinates (hourly and 10 days), clearly labeled as model data rather than station measurements.
- English/Greek, light/dark/system themes, temperature/wind/pressure/rain conversions, water-year month, JSON backup/import, optional PWS CORS proxy.
- Installable static PWA shell with local caching, while remote weather data still requires internet and providers' availability.

## Run locally

```sh
cd stationview
python -m http.server 8000
```

Visit `http://localhost:8000/`. For GPS, use localhost or HTTPS. The interface is vanilla HTML, CSS, and JavaScript — no build step. Only Chart.js and Leaflet load from CDNs; the app remains navigable if either is blocked. The nearest-station finder needs access to the openSenseMap API and the chosen stations must be reporting data. Check browser DevTools if your browser, firewall, or extensions block CORS/network calls.

## Hosting for free

This directory lives under `weather/stationview/` on GitHub. If the existing `weather` repository's GitHub Pages source is `main` / root, the URL is:

`https://savaris85-hue.github.io/weather/stationview/`

To use another repository, enable **Settings → Pages → Deploy from a branch → main → /(root)**. Alternatively deploy this folder as a static site on Netlify (no build command, publish directory `stationview`). Public static hosting does not bypass any PWS provider's authentication requirements.

## Optional Weather Company PWS key

The Weather Company developer portal (`developer.weather.com`) documents the PWS `/v2/pws` current, rapid, hourly, summary, and historical endpoints. PWS keys are typically associated with a Weather Underground member account and registered personal weather station. Product access and quotas depend on your key. Add the key under **Settings → PWS connection**, then add a PWS ID in the station list. The app sends `format=json`, `units=m`, and `numericPrecision=decimal`, and converts displayed units locally. Browser access may be blocked by provider CORS even for a valid key; you can deploy the **optional Cloudflare Worker** in `worker.js` and paste its full public URL into **Settings → Proxy URL**. A proxy does **not** give key-free access.

## Known limitations

- Weather Underground station discovery and measurements across its entire network **cannot be provided without authorized API access**. Stations on the map are not Wundermap stations. Map queries are bounded to the visible region and capped; at world-level zoom you must zoom in to load stations. The openSenseMap station network is different; coverage and sensors vary significantly by region.
- Charts and map tiles need their CDN/map provider; offline PWA mode only guarantees the static shell and cached data that the app already stored in memory/IndexedDB, not new live weather data.
- Historical data availability, rate limits, quality, and the original sensor time zone depend on each source. openSenseMap allows up to one month per sensor-history request; very long ranges use multiple rate-paced requests and may be incomplete. Custom water-year totals require enough daily source coverage; missing totals display an em dash rather than a made-up number.
- Model forecasts and actual PWS sensor readings are fundamentally different products. Sunrise/sunset and moon phase are client-side astronomical estimates.
- Open-Meteo's free endpoint has **noncommercial usage terms**; commercial deployments should verify and license API usage. Attribution is displayed for OpenStreetMap France, openmaps.fr/OpenTopoMap and Esri imagery as appropriate. These tile hosts have separate usage restrictions and may occasionally block or rate-limit requests. Avoid bulk automated scraping of community APIs.
- PWS API keys stored in `localStorage` are readable by scripts running on the same origin. Use HTTPS, trusted hosting, and do not share the device/browser profile. JSON exports omit the key by default.

## Files

- `index.html` — complete single-file app (inline app CSS and vanilla JS)
- `sw.js` — static shell service worker
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png` — install metadata and original PWA icons
- `worker.js` — optional allowlisted Cloudflare Worker proxy for **your** own PWS key

Data: [openSenseMap API](https://docs.opensensemap.org/) · [Open-Meteo](https://open-meteo.com/en/docs) · [PWS Historical API](https://developer.weather.com/docs/openapi/pws-historical-2-0).
