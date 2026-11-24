// The time of day slider's math (design section 5 item 5): the current local
// day at a longitude, in mean solar time. Longitude in radians, east
// positive; instants in UTC milliseconds; the slider's value in seconds.

const DAY_MS = 86_400_000;

/** Play speeds offered, as playback rates. */
export const PLAY_SPEEDS = [1, 60, 600, 3600] as const;

/** How far mean solar time at a longitude runs ahead of UTC, milliseconds. */
function lonShiftMs(lon: number): number {
  return (lon / (2 * Math.PI)) * DAY_MS;
}

/** The UTC instant at which the local mean solar day holding `utcMs` starts at a longitude. */
export function localDayStart(lon: number, utcMs: number): number {
  const shift = lonShiftMs(lon);
  return Math.floor((utcMs + shift) / DAY_MS) * DAY_MS - shift;
}

/** The slider's value for an instant: seconds since the local day's start. */
export function secondsOfDay(lon: number, utcMs: number): number {
  return (utcMs - localDayStart(lon, utcMs)) / 1000;
}

/** The UTC instant for a slider value on the local day holding `dayOfMs`. */
export function instantAt(lon: number, dayOfMs: number, seconds: number): number {
  return localDayStart(lon, dayOfMs) + seconds * 1000;
}

/** A slider value as local mean solar time, `hh:mm`. */
export function clockText(seconds: number): string {
  const m = Math.floor(seconds / 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
