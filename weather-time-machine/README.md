# Weather Time Machine ☀️

Independent open-source historical weather and forecast dashboard inspired by the classic WeatherSpark *experience*. No WeatherSpark or WeatherDave proprietary code, images or branding are used.

## Demo
When GitHub Pages is enabled for the repository: https://savaris85-hue.github.io/weather/weather-time-machine/

## Features
- Location search via Open-Meteo Geocoding
- Hourly ERA5 historical reanalysis dating back to 1940
- Up to 16 days of forecasts, with history versus forecast colors
- Interactive linked timelines, zoom, pan, range slider and date navigation
- Temperature, humidity, rainfall, pressure, wind, clouds, wind direction
- Hourly short-range charts and daily long-range aggregates
- Unit conversion, CSV export, mobile-friendly layout
- No API key, account, or backend required for ordinary non-commercial use

## Run
From repository root, run: python3 -m http.server 8080

Visit: http://localhost:8080/weather-time-machine/

Test with Node.js 20+: node --test weather-time-machine/data.test.mjs

## Deploy
GitHub repository Settings → Pages → Build and deployment → Deploy from a branch → main / (root). Committing code alone does not automatically enable Pages.

## Data and limitations
Uses https://open-meteo.com/ Historical Weather API, Forecast API, and Geocoding API. Historic results are ERA5 modeled reanalysis, not certified station observations. An explicit ERA5 model gives a consistent long series. Recent values come from forecast model retrospective runs. UTC timestamps are used. A maximum of about three years can be loaded at a time. Long periods require multiple HTTP requests and can be slow. Open-Meteo licence and non-commercial/free API limits apply. The browser-accessible API and actual published deployment have not been end-to-end tested here.

Not yet included: weather radar layer, local station records, climatological normal overlay, saved locations, offline caching.

## Files
- index.html: static responsive Plotly dashboard
- data.mjs: validation, timeline UTC normalization, aggregation, export
- data.test.mjs: Node.js unit tests
- LICENSE: MIT licence for original project code only (third-party services have separate licences).
