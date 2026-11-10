# MeteoLab Web v0.2

A free, static, bilingual (Greek/English) weather workspace, accessible at the GitHub Pages path **/weather/meteolab/** when GitHub Pages is configured to publish the repository root from the main branch.

## Working features

- Search worldwide locations with Open-Meteo geocoding.
- Four forecast choices through Open-Meteo: best match, NOAA GFS, ECMWF IFS and DWD ICON (availability varies by location, variables and forecast horizon).
- Current weather estimates, daily forecasts up to 14 days where provided, hourly table, weather chart.
- Minimal Leaflet map (OpenStreetMap / CARTO), RainViewer past radar animation, and NASA GIBS daily composite satellite imagery. **Neither radar nor satellite is a 14-day future radar forecast.**
- Sampled model-point forecast overlays for rain, temperature, cloud cover, wind, Beaufort and relative humidity. This is **not a continuous gridded forecast/radar field**.
- Draw and locally save geofences; rules linked to a geofence evaluate forecast at the simple vertex-mean center, not throughout the polygon.
- Configurable rule metrics, thresholds, lead times (whole hours), look-ahead and in-app/browser notifications. Checks run **only while the page remains open**.
- Basic local Greek/English command parser for questions and rule suggestions; it is explicitly not a general LLM.
- Export/Import local JSON settings; no registration needed.

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

Open-Meteo; RainViewer; NASA GIBS; OpenStreetMap; CARTO; Leaflet; Chart.js; Lucide.

