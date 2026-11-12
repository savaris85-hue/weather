// Pure data utilities for the Weather Time Machine. No browser dependencies.
export const FIELDS = [
  "temperature_2m", "relative_humidity_2m", "precipitation",
  "pressure_msl", "cloud_cover", "wind_speed_10m", "wind_direction_10m",
  "weather_code", "dew_point_2m", "wind_gusts_10m", "shortwave_radiation"
];

// Keep explicit date ranges separate from relative past_days/forecast_days.
// Open-Meteo rejects combining these mutually exclusive parameter families.
export function buildForecastParams(location, start, end, model = "best_match") {
  validateRange(start, end);
  if (![location?.latitude, location?.longitude].every(Number.isFinite)) {
    throw new Error("Invalid location coordinates");
  }
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    models: model,
    hourly: [...FIELDS, "precipitation_probability", "uv_index"].join(","),
    start_date: start,
    end_date: end,
    timezone: "GMT",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm"
  };
}

export const EARLIEST = "1940-01-01";
export const MAX_DAYS = 1120;
const DAY = 86400000;

export function dayISO(input) {
  return new Date(input).toISOString().slice(0, 10);
}

export function moveDay(iso, delta) {
  return dayISO(new Date(iso + "T00:00:00Z").getTime() + delta * DAY);
}

export function splitDateChunks(start, end, maxDays = 92) {
  if (end < start) return [];
  if (!Number.isInteger(maxDays) || maxDays < 1) throw new Error("Invalid chunk size");
  const chunks = [];
  let current = start;
  while (current <= end) {
    const stop = moveDay(current, maxDays - 1);
    const last = stop < end ? stop : end;
    chunks.push({ start: current, end: last });
    current = moveDay(last, 1);
  }
  return chunks;
}

export function validateRange(start, end) {
  const a = Date.parse(start + "T00:00:00Z");
  const b = Date.parse(end + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b) || dayISO(a) !== start || dayISO(b) !== end) {
    throw new Error("Επίλεξε έγκυρες ημερομηνίες.");
  }
  if (a > b) throw new Error("Η αρχική ημερομηνία πρέπει να προηγείται της τελικής.");
  if (start < EARLIEST) throw new Error("Η ιστορική βάση αρχίζει την 1/1/1940.");
  if ((b - a) / DAY > MAX_DAYS) throw new Error("Μέγιστο εύρος 3 ετών ανά αναζήτηση. Μετακινήσου με τα βέλη για παλιότερα.");
  return { start, end };
}

export function normalizeHourly(api, kind) {
  const h = api && api.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  return h.time.map((point, i) => {
    const t = typeof point === "number" ? point : Date.parse(point.endsWith("Z") || /[+-]\d\d:\d\d$/.test(point) ? point : point + "Z") / 1000;
    if (!Number.isFinite(t)) return null;
    const row = { t, kind };
    for (const field of FIELDS) {
      const value = h[field] && h[field][i];
      row[field] = typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    row.precipitation_probability = h.precipitation_probability && typeof h.precipitation_probability[i] === "number"
      ? h.precipitation_probability[i] : null;
    row.uv_index = h.uv_index && typeof h.uv_index[i] === "number" ? h.uv_index[i] : null;
    return row;
  }).filter(Boolean);
}

export function mergeHourly(...sources) {
  // Later sources win: forecast supersedes overlapping reanalysis hours.
  const byTime = new Map();
  for (const source of sources) {
    for (const row of source) {
      const old = byTime.get(row.t) || {};
      byTime.set(row.t, { ...old, ...row });
    }
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

function mean(rows, field) {
  const vals = rows.map(x => x[field]).filter(x => Number.isFinite(x));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function aggregateForView(allRows, startMs, endMs, maxHourlyPoints = 3600) {
  const filtered = allRows.filter(row => row.t * 1000 >= startMs && row.t * 1000 <= endMs);
  const days = (endMs - startMs) / DAY;
  if (days <= 60 && filtered.length <= maxHourlyPoints) {
    return { rows: filtered, resolution: "hourly" };
  }
  // Daily aggregation retains rainfall totals rather than arbitrarily dropping hours.
  const buckets = new Map();
  for (const row of filtered) {
    const key = dayISO(row.t * 1000) + "/" + row.kind;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  const rows = [...buckets.values()].map(group => {
    const out = { t: group[Math.floor(group.length / 2)].t, kind: group[0].kind };
    for (const field of FIELDS) out[field] = mean(group, field);
    const rain = group.map(x => x.precipitation).filter(Number.isFinite);
    out.precipitation = rain.length ? rain.reduce((a, b) => a + b, 0) : null;
    out.precipitation_probability = mean(group, "precipitation_probability");
    const angles = group.map(x => x.wind_direction_10m).filter(Number.isFinite);
    if (angles.length) {
      const s = angles.reduce((a, d) => a + Math.sin(d * Math.PI / 180), 0);
      const c = angles.reduce((a, d) => a + Math.cos(d * Math.PI / 180), 0);
      out.wind_direction_10m = (Math.atan2(s, c) * 180 / Math.PI + 360) % 360;
    }
    return out;
  }).sort((a, b) => a.t - b.t);
  return { rows, resolution: "daily" };
}

export function csvForRows(rows) {
  const keys = ["t", "kind", ...FIELDS, "precipitation_probability", "uv_index"];
  const header = ["time_utc", "source", ...keys.slice(2).map(k => k.startsWith("wind_speed") || k.startsWith("wind_gusts") ? k + "_bft" : k)];
  return [header.join(","), ...rows.map(row => [
    new Date(row.t * 1000).toISOString(), row.kind,
    ...keys.slice(2).map(k => row[k] == null ? "" : (k.startsWith("wind_speed") || k.startsWith("wind_gusts") ? beaufort(row[k]) : row[k]))
  ].join(","))].join("\n");
}


// Meteorological units in this project are fixed to °C and Beaufort.
const BEAUFORT_KMH = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
export function beaufort(kmh) {
  if (!Number.isFinite(kmh) || kmh < 0) return null;
  return BEAUFORT_KMH.findIndex(t => kmh < t) === -1
    ? 12 : BEAUFORT_KMH.findIndex(t => kmh < t);
}
export function windArrow(degrees) {
  if (!Number.isFinite(degrees)) return "·";
  // Arrow shows the direction the wind blows towards (from = meteorological).
  const to = ((degrees + 180) % 360 + 360) % 360;
  return ["↑","↗","→","↘","↓","↙","←","↖"][Math.round(to / 45) % 8];
}
export function weatherIcon(code) {
  if (!Number.isFinite(code)) return "·";
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if ([45,48].includes(code)) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code >= 85 && code <= 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "☁️";
}
export const FORECAST_MODELS = Object.freeze([
  { id:"best_match", label:"Best Match (Open-Meteo)", days:16 },
  { id:"ecmwf_ifs025", label:"ECMWF IFS", days:15 },
  { id:"ncep_gfs_seamless", label:"NOAA GFS", days:16 },
  { id:"icon_seamless", label:"DWD ICON", days:7 }
]);
export const DEFAULT_LAYERS = Object.freeze([
  "icons", "cloud_cover", "precipitation_probability", "precipitation",
  "rain_cumulative", "temperature_2m", "relative_humidity_2m",
  "pressure_msl", "wind_speed_10m", "wind_direction_10m"
]);
export const ALL_LAYERS = Object.freeze([
  {id:"icons",label:"Εικονίδια καιρού · Icons",unit:""},
  {id:"cloud_cover",label:"Νεφοκάλυψη · Cloud Cover",unit:"%"},
  {id:"precipitation_probability",label:"Πιθανότητα βροχής · Probability",unit:"%"},
  {id:"precipitation",label:"Βροχόπτωση · Precipitation",unit:"mm"},
  {id:"rain_cumulative",label:"Αθροιστική βροχή · Cumulative",unit:"mm"},
  {id:"temperature_2m",label:"Θερμοκρασία · Temperature",unit:"°C"},
  {id:"relative_humidity_2m",label:"Υγρασία · Humidity",unit:"%"},
  {id:"dew_point_2m",label:"Σημείο δρόσου · Dew Point",unit:"°C"},
  {id:"pressure_msl",label:"Πίεση · Air Pressure",unit:"hPa"},
  {id:"wind_speed_10m",label:"Άνεμος · Wind Speed",unit:"Bft"},
  {id:"wind_gusts_10m",label:"Ριπές · Wind Gusts",unit:"Bft"},
  {id:"wind_direction_10m",label:"Κατεύθυνση · Wind Direction",unit:""},
  {id:"shortwave_radiation",label:"Ηλιακή ακτινοβολία · Solar Radiation",unit:"W/m²"},
  {id:"uv_index",label:"Δείκτης UV · UV Index (forecast)",unit:""}
]);
export function cumulativeRain(rows, mode="daily") {
  let sum = 0, prevDay = "";
  return rows.map(row => {
    const day = dayISO(row.t * 1000);
    if (mode === "daily" && day !== prevDay) sum = 0;
    prevDay = day;
    if (Number.isFinite(row.precipitation)) sum += Math.max(0,row.precipitation);
    return {...row, rain_cumulative:Math.round(sum * 1000)/1000};
  });
}
export function toEpoch(d) { return Date.parse(d + "T00:00:00Z") / 1000; }
// Fixed 14-day UTC blocks prevent duplicate archive calls while moving through time.
export function archiveBlocks(start, end, days = 14) {
  if (start > end) return [];
  const a = Math.floor(toEpoch(start) / (days * 86400));
  const b = Math.floor(toEpoch(end) / (days * 86400));
  const blocks = [];
  for (let n = a; n <= b; n++) {
    const blockStart = dayISO(n * days * 86400000);
    const blockEnd = moveDay(blockStart, days - 1);
    blocks.push({key:String(n),start:blockStart,end:blockEnd});
  }
  return blocks;
}
