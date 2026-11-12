# Anagenisis Meteo · Free branded hosting

The Weather Time Machine application is in `weather-time-machine/` inside the public repository `savaris85-hue/weather`. The separate Render static-site deployment configured by `render.yaml` makes it possible to expose **only the weather dashboard** at the root of a non-personal free hostname.

**Preferred public address (not reserved yet):** `https://anagenisis-meteo.onrender.com/`

Alternative naming if unavailable: `anagenisis-weather.onrender.com` or `anagenisis-weather-time.onrender.com`.

## Connect once

1. Authorize Render to connect to the existing GitHub repository `savaris85-hue/weather` through the Render app/dashboard.
2. Create a **Blueprint** from this repository using the `render.yaml` in the repository root (or a Static Site with publish directory `weather-time-machine`).
3. Use the free Static Site service type. Confirm the proposed service name and its actual assigned `onrender.com` URL in Render; names must be unique and availability is not guaranteed.
4. Keep production branch `main`; updates to this branch then deploy automatically.
5. Visit the new URL and confirm the dashboard loads, forecast API data appear, mobile layout works, and the browser console shows no blocking errors. The existing GitHub Pages site stays untouched as fallback.

Render's standard static site includes a no-cost `onrender.com` subdomain and automatic TLS; monthly included bandwidth and build quotas apply. This is a **free hosted subdomain**, not a separately owned top-level domain such as `.gr` or `.com`.

Do **not** set the new address as a GitHub Pages CNAME: the service is hosted by Render and the GitHub repository root currently serves a different page. A Render deployment publishes the `weather-time-machine` folder independently.

## API and commercial-use considerations

The public Open-Meteo Free API is for **non-commercial** use only. A branded business or promotional deployment can require a commercial API subscription, regardless of the fact that web hosting is free. See https://open-meteo.com/en/terms. The app should retain attribution to Open-Meteo, OpenStreetMap and RainViewer under each provider's terms.
