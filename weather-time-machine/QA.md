# Weather Time Machine QA checklist

## Automated
- node --test weather-time-machine/*.test.mjs
- forecast query uses start_date/end_date only
- date and longitude/latitude validation
- historical data parsed in UTC
- predicted data merged into historical timeline
- simulated startup fetches archive and forecast data, then calls chart renderer
- simulated invalid date does not issue an API request

## Browser acceptance scenarios
- Open /weather-time-machine/ with developer console visible.
- Initial 30-day view displays hourly records and all five default layers.
- Switching to 7-day view updates chart without an HTTP 400.
- Switching to 1-year view uses daily aggregation and preserves total rainfall.
- Search another city and load its timeline.
- Pick a historical 2015 date range and check the reanalysis-only view.
- Toggle °F/mph/in and verify temperatures and wind values change.
- Export CSV and verify UTC timestamps and source column.
- Zoom and pan, then click Reset zoom.

## Known verification boundary
The automated UI test uses a simulated DOM, mocked fetch responses and a mocked Plotly renderer.
It is not a replacement for a real browser test against the actual Open-Meteo endpoints.
