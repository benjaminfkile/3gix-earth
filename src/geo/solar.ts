// Local solar noon, from the NOAA equation of time. Longitude in radians,
// east positive; instants in UTC milliseconds.

const DAY_MS = 86_400_000;

/** The equation of time in milliseconds (apparent minus mean solar time) on the UTC day starting at `dayStartMs`. */
export function equationOfTimeMs(dayStartMs: number): number {
  const date = new Date(dayStartMs);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const leap = new Date(Date.UTC(date.getUTCFullYear(), 1, 29)).getUTCMonth() === 1;
  const dayOfYear = Math.floor((dayStartMs - yearStart) / DAY_MS);
  // Fractional year at noon, radians.
  const g = ((2 * Math.PI) / (leap ? 366 : 365)) * dayOfYear;
  const minutes =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  return minutes * 60_000;
}

/** The solar noon at a longitude on the UTC day starting at `dayStartMs`. */
function solarNoonOn(dayStartMs: number, lon: number): number {
  const lonShiftMs = (lon / (2 * Math.PI)) * DAY_MS;
  return dayStartMs + DAY_MS / 2 - lonShiftMs - equationOfTimeMs(dayStartMs);
}

/** The latest local solar noon at a longitude that is not after `nowMs`. */
export function latestSolarNoon(lon: number, nowMs: number): number {
  const today = Math.floor(nowMs / DAY_MS) * DAY_MS;
  let best = -Infinity;
  for (let d = -2; d <= 1; d++) {
    const noon = solarNoonOn(today + d * DAY_MS, lon);
    if (noon <= nowMs && noon > best) best = noon;
  }
  return best;
}
