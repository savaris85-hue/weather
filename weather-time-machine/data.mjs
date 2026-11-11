// Pure data utilities for the Weather Time Machine. No browser dependencies.
export const FIELDS = [
  "temperature_2m", "relative_humidity_2m", "precipitation",
  "pressure_msl", "cloud_cover", "wind_speed_10m", "wind_direction_10m"
];

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
  const keys = ["t", "kind", ...FIELDS, "precipitation_probability"];
  const header = ["time_utc", "source", ...keys.slice(2)];
  return [header.join(","), ...rows.map(row => [
    new Date(row.t * 1000).toISOString(), row.kind,
    ...keys.slice(2).map(k => row[k] == null ? "" : row[k])
  ].join(","))].join("\n");
}
