// The constants of the view (design section 3).

import { rad } from "./geo/wgs84";

/** Earth's frame in the registry. */
export const EARTH_FRAME = 4;

/** The start when the address bar gives none: above Missoula, Montana. */
export const DEFAULT_START = {
  /** Radians, north positive. */
  lat: rad(46.8721),
  /** Radians, east positive. */
  lon: rad(-113.994),
  /** Meters above the ground. */
  height: 20_000,
  /** Radians clockwise from north: facing north. */
  heading: 0,
  /** Radians below level. */
  tilt: rad(45),
};

/**
 * Every camera placement rides with Earth (`setCamera(pose, { ride: true })`):
 * the camera keeps its place in Earth's axes while Earth spins and moves
 * along its orbit. A free camera would stay put in space and drift off.
 */
export const RIDE = { ride: true } as const;
