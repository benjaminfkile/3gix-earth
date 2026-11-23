// WGS84 geodesy in frame 4's axes (design section 8): +z is the north
// pole, +x is longitude 0, +y is longitude 90 degrees east. Angles are
// radians, lengths meters.

import type { Vec3 } from "3gix-renderer";

/** Semi-major axis, meters. */
export const WGS84_A = 6378137;
/** Flattening. */
export const WGS84_F = 1 / 298.257223563;
/** Semi-minor axis, meters. */
export const WGS84_B = WGS84_A * (1 - WGS84_F);
/** First eccentricity squared. */
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);

/** A geodetic place: latitude and longitude in radians, height above the ellipsoid in meters. */
export interface Geodetic {
  lat: number;
  lon: number;
  height: number;
}

/** Degrees to radians. */
export const rad = (deg: number): number => (deg * Math.PI) / 180;
/** Radians to degrees. */
export const deg = (r: number): number => (r * 180) / Math.PI;

/** Longitude wrapped to (-pi, pi]. */
export function wrapLon(lon: number): number {
  const w = Math.atan2(Math.sin(lon), Math.cos(lon));
  return w === -Math.PI ? Math.PI : w;
}

/** The position of a geodetic place in frame 4's axes. */
export function toPosition({ lat, lon, height }: Geodetic): Vec3 {
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return [
    (n + height) * cosLat * Math.cos(lon),
    (n + height) * cosLat * Math.sin(lon),
    (n * (1 - WGS84_E2) + height) * sinLat,
  ];
}

/** The geodetic place of a position in frame 4's axes. */
export function fromPosition([x, y, z]: Vec3): Geodetic {
  const p = Math.hypot(x, y);
  const lon = p === 0 ? 0 : Math.atan2(y, x);
  let lat = Math.atan2(z, p * (1 - WGS84_E2));
  for (let i = 0; i < 20; i++) {
    const sinLat = Math.sin(lat);
    const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    const next = Math.atan2(z + WGS84_E2 * n * sinLat, p);
    const done = Math.abs(next - lat) < 1e-15;
    lat = next;
    if (done) break;
  }
  const sinLat = Math.sin(lat);
  // Stable at the poles and the equator alike.
  const height = p * Math.cos(lat) + z * sinLat - WGS84_A * Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return { lat, lon, height };
}

/** The unit vector of a position, or null when it is zero or not finite. */
export function unit(v: Vec3): Vec3 | null {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!(len > 0) || !Number.isFinite(len)) return null;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * The unit direction from the frame origin through the place on the
 * ellipsoid at this latitude and longitude: the direction `placeOver` and
 * `surfaceHeight` take.
 */
export function toDirection(lat: number, lon: number): Vec3 {
  return unit(toPosition({ lat, lon, height: 0 })) as Vec3;
}

/** The latitude and longitude of the ellipsoid point along a direction from the frame origin. */
export function fromDirection(direction: Vec3): { lat: number; lon: number } {
  const d = unit(direction);
  if (!d) throw new Error("the direction is zero or not finite");
  // Where the ray meets the ellipsoid x^2/a^2 + y^2/a^2 + z^2/b^2 = 1.
  const t = 1 / Math.sqrt((d[0] * d[0] + d[1] * d[1]) / (WGS84_A * WGS84_A) + (d[2] * d[2]) / (WGS84_B * WGS84_B));
  const { lat, lon } = fromPosition([d[0] * t, d[1] * t, d[2] * t]);
  return { lat, lon };
}
