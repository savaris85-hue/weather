# API replacement feasibility — Anagenisis Meteo (27 Nov 2026)

**Decision: NO production API switch. Preserve the current site and the experimental bilingual UI.**

This spike only adds an isolated, unimported adapter and deterministic unit tests. No API traffic or UI flows are changed, no ads are enabled, and the live Render service follows `main` as before.

## Feature-by-feature parity

| Requirement today | MET Norway Locationforecast | Copernicus ERA5 time-series |
|---|---|---|
| Up to 15/16 days of future prediction | Only about 9–10 days globally | Not a forecast |
| Forecast model dropdown: Best Match, ECMWF, NOAA GFS, DWD ICON | Single provider; not the same selectable models | Not a forecast |
| Dynamic historical access 1940–present for any map click | No worldwide historical weather via Locationforecast | Yes, but retrieval requires CDS dataset/API access, post-processing, cache and potentially significant latency |
| Weather bars for **hourly** precipitation | Later forecast steps may be 6-hour aggregate periods; cannot represent them as hourly bars without fabrication | Historical aggregate must be normalized carefully |
| Wind chart in Beaufort | Available wind speed in m/s; unit conversion to km/h is straightforward | Available vector components; requires processing |
| Relative humidity, cloud cover, dew point, temperature, pressure | Largely available and mappable | Available with suitable mapping |
| Shortwave radiation in W/m² | Not in Locationforecast response | Historical variable available |
| Near-identical browser UX from a static Render site | Requires proxy/cache: browser-only use discouraged by MET Norway and cannot reliably send required User-Agent | Requires backend, CDS credentials, and storage |

**No silent substitution:** missing fields are null, never invented; a six-hour rain sum must not be displayed as hourly rain. The adapter includes a feature-parity inspector with a strict refusal threshold. Existing UI remains untouched.

## Commercial terms and cost

- Open-Meteo explicitly considers advertisements commercial. Its standard plan does not include the historical API; Professional or higher is necessary for the existing historical graphs. See https://open-meteo.com/en/terms and https://open-meteo.com/en/pricing.
- Third-party price trackers as of 2026 show **€29/month Standard** and **€99/month Professional** (the public official pricing page currently renders plan details but not a verifiable monetary amount in the extracted HTML). Check checkout for the current exact amount, currency, taxes, and billing before buying. Sources: https://datacircle.dev/current-weather-apis/open-meteo/free-get-v1-forecast-current-weather and https://openapipricing.com/weather/open-meteo .
- MET Norway allows commercial use with CC BY 4.0 attribution, but mandates identification, caching and restrained traffic. Documentation: https://api.met.no/doc/FAQ and https://api.met.no/doc/locationforecast/HowTO.
- Copernicus ERA5 time series is CC BY, global and hourly back to 1940, but needs data engineering to maintain interactive latency: https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels-timeseries .

## Next architecture if lower API cost becomes the priority

Develop a separately hosted cached weather-data service capable of combining MET Norway forecasts with licensed ERA5 historical data, benchmark against the current UX using real data, and only switch when the feature-parity gate and performance tests pass. Keep the permanent branch `archive/anagenisis-meteo-stable-2026-11-27` and the existing main branch untouched until then. Do not commit any service credentials or payment API keys to GitHub.
