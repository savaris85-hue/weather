# Weather Time Machine — v2

A clean-room, independent weather history explorer inspired by the **interaction style** of the former WeatherSpark Dashboard and WeatherDave. This project does **not** copy WeatherDave/WeatherSpark source code, assets, branding, or proprietary data.

## Live website

When GitHub Pages is active: https://savaris85-hue.github.io/weather/weather-time-machine/

## What works

- **Historic ERA5 reanalysis back to 1940**, with a growing timeline cache and automatic backward fetching on chart pan/zoom. Earliest historical date: January 1, 1940.
- **Selectable forecast model**: Open-Meteo Best Match, ECMWF IFS, NOAA GFS, DWD ICON. Different models have different supported geographic coverage and forecast horizons; unavailable data is **not invented**.
- Historical data is visually distinguished from forecast data.
- **Always Celsius (°C)**, **always Beaufort (Bft)** for wind displayed in the application. The Open-Meteo API transports wind in km/h; conversions to Beaufort are done in the browser.
- Multi-pane stacked charts with synchronized time axis: weather icons (WMO codes), cloud cover, precipitation probability, hourly rain, **cumulative rain** (daily reset or total for selected range), temperature, relative humidity, dew point, pressure, wind speed, wind gusts, **direction arrows**, solar radiation and forecast UV index.
- Interactive Plotly drag-pan, wheel-zoom, bottom mini-range slider, independent +/− zoom buttons, preset 3/7/15-day and 3-year time spans, backward/forward buttons, date range jump.
- OpenStreetMap city overview, click-to-change coordinates, global search using Open-Meteo Geocoding.
- Layer toggles and saved chart layout in the local browser (when storage is available).
- CSV of selected *hourly* data, with Beaufort wind speed/gust columns.
- Responsive layout and user-visible errors/status.

## How infinite scrolling works

The initial view loads a small slice of weather data. Historical requests are split into stable, approximately 90-day UTC chunks, cached for the current location, and fetched in parallel (maximum 3). As the user moves further left, new blocks are fetched; no arbitrary 3-year history boundary exists. Browsing stops at 1940 because the source data do not go further. The mini timeline expands as historical data is fetched. Plotting uses hourly values on short ranges and daily summaries over wider time spans for performance.

## Run and test

The project requires a web browser and Internet access; no API key is needed under Open-Meteo's applicable terms.

From repo root:

    python3 -m http.server 8080

Then open: http://localhost:8080/weather-time-machine/

Unit and simulated UI tests:

    node --test weather-time-machine/*.test.mjs

Files:
- index.html — WeatherDave-like layout and Leaflet map container
- app.mjs — interactive Plotly/Leaflet app with infinite timeline and forecast-model switching
- data.mjs — UTC normalization, queries, conversion functions, aggregation and CSV
- data.test.mjs — data and calculation unit/regression tests
- ui.test.mjs — mocked DOM/API app-startup and timeline interaction tests
- QA.md — acceptance checklist

## Deploy

In the weather repository, GitHub Settings → Pages → Build and deployment → Deploy from a branch → main / (root). The project then uses the path /weather-time-machine/. The website URL should only be treated as live after GitHub Pages deployment has actually succeeded.

## Data sources & limitations

- **Historical**: Open-Meteo Historical Weather API, explicitly selected ERA5. Modelled reanalysis, not certified measurements from a specific station. ERA5 is released with a delay, so a buffer before the forecast data is necessary.
- **Forecast**: Open-Meteo Forecast API; the models parameter selects which weather model is used. Explicit start_date and end_date are used; past_days and forecast_days are never combined with explicit dates.
- **Icons**: derived from public WMO weather codes; direction arrows point **to where the wind is blowing**, while the underlying numeric wind direction is the meteorological **from** direction.
- **Precipitation probability, UV and certain fields** are only available when provided by the selected model. UV is forecast-only; no historical UV record is invented.
- **Cumulative rainfall** can be daily with UTC midnight reset or sum since the visible time window began.
- **Mapping**: OpenStreetMap tile basemap via Leaflet. No live radar/satellite animation is claimed or rendered.
- Data sources: https://open-meteo.com/ and https://www.openstreetmap.org/copyright . Third-party services have their own usage, attribution and licensing terms. Free Open-Meteo API access is intended for non-commercial use.

## Roadmap

- Optional true station observation overlays and climatological normals
- Real radar imagery from a licensed provider, without misrepresenting it as Open-Meteo historical data
- Richer weather icons including day/night states
- User-controlled comparison of two forecasts and uncertainty bands

## License

The original authored code is MIT-licensed. Plotly, Leaflet, map tiles and Open-Meteo APIs/data have their own licences and terms.


## WeatherDave-inspired v3: climate interpretation and readability

The pale gray lines are **not simply the previous year's forecast**. They are historical climate statistics by calendar day and hour. This implementation independently calculates, from real Open-Meteo ERA5 hourly reanalysis:
- mean value by the same month/day/hour over the previous selectable **10, 20 or 44 years**;
- the **10th and 90th percentiles**, shown as a pale gray uncertainty/reference envelope;
- optional last-year same-calendar-date dotted comparison line (separate control).

No climate values are invented; missing sample years remain missing. Historical baseline is requested only for visible windows of up to 32 days to protect API rate limits. A maximum of 3 concurrent requests are made; data are cached during a session. Default is 20 years for responsiveness; switch to 44 years in the Graphs panel for a WeatherDave-scale reference. Climate comparison is not displayed for the non-station historical precipitation probability layer or when insufficient reference records exist.

The present time is highlighted by an **orange vertical line**, the current UTC calendar day by a **purple background**, and the next 14 days by a warm-tinted background distinct from the past. Recent historical ERA5 is dark and forecast is red by default. Daily two-row Greek date labels are at the **top**, aligned with the plot for easy reading. The left-hand row labels are horizontal and larger. The bottom overview shows *only temperature* so it is no longer a spaghetti-like combination of every chart.

In the Graphs panel: adjustable row heights, three color presets and custom history/forecast/climate line colors; settings save to the local browser. Temperatures stay in °C and winds in Beaufort.

## Optional radar (personal / educational)

The left map has a switchable RainViewer past-radar overlay and Play / Previous / Next controls. Frames are limited to about the **past two hours**, with timestamps shown in UTC. Since 2026 the public RainViewer API no longer supplies satellite infrared/nowcast imagery, and limits free radar tiles to zoom level 7 with the Universal Blue scheme. The map correctly degrades to the OpenStreetMap base map if radar is unavailable. The free API may be used only under RainViewer's personal/educational/small-community terms, with visible attribution: https://www.rainviewer.com/api.html . Do not mistake recorded radar for a future rain forecast.

## Verification

GitHub Actions runs Node.js unit tests, mocked browser startup checks, API smoke requests for ERA5 and all selectable forecast models, and Playwright Chromium browser interaction tests. These do not establish that arbitrary third-party providers will always be available; runtime errors are surfaced rather than hiding failures. The original independent code is MIT-licensed; third-party data services retain their own usage restrictions.


## v4 · Readable row labels, per-measurement colors, custom climatology and five pinned cities

- **Readable Greek labels**: row names render *inside a reserved chart column*, not as negative Plotly annotations outside the chart. Main plot gets an adaptive left-side domain for labels and y-axis ticks. Small screen day labels are spaced out to avoid crowding.
- **Each of the 14 weather layers has an independently editable color** in Graphs. Historic values use a lighter stroke of that layer's hue; **forecast values use the darker, thicker stroke of that same hue**. Default forecast thickness 3.5px; editable from 2 to 5px. Existing Classic, Ocean and Contrast presets remain and reset the measurement palette to a coordinated scheme.
- **Selectable ERA5 reference years**: previous **1, 2, 3, 10, 20 or 44 years**, or a **custom inclusive historical year interval** (up to 44 years from 1940 through the year before the viewed date). Same calendar days and hours are compared. A single-year baseline is clearly labeled as one historical year rather than a statistical climate distribution. Changing the period changes both the mean and gray 10th–90th percentile envelope.
- **Pin five cities** to the left-hand sidebar. Favorites are stored locally in the browser (not on any server), and can be switched or removed. No login required; settings and pinned cities are local to that device/browser.
- **Mobile UX**: stacked 2-column date controls, horizontally scrollable header shortcuts and pinned city chips, touch-friendly color selectors, a small visible OpenStreetMap map, full-width graphs with mobile-specific date tick density, and the Graphs settings as a bottom sheet.
- App still uses **°C and Beaufort**, Open-Meteo forecast model selection, historic ERA5, independent waveform color settings, radar and CSV export.

Data licences remain unchanged. The free Open-Meteo API has usage limits: requesting 44 historical years can require multiple network calls and may take longer than a 1/2/3-year comparison. Tests use mocked weather data for deterministic UI checks, in addition to separate live Open-Meteo API contract tests.
