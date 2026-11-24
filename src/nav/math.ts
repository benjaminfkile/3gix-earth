// The math of Earth mode navigation (design section 4). Pure: no renderer,
// no DOM. Positions are in frame 4's axes, meters; angles in radians.

import type { Pose, Vec3 } from "3gix-renderer";
import { enu, headingTilt, orientationFrom, rotate, type Quat } from "../geo/enu";
import { fromPosition, rad, toPosition, unit } from "../geo/wgs84";

/** The camera never goes below the ground plus this, meters. */
export const CLEARANCE = 2;
/** Tilt range: from 5 degrees below level to straight down. */
export const MIN_TILT = rad(5);
export const MAX_TILT = Math.PI / 2;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

export const clampTilt = (t: number): number => Math.min(MAX_TILT, Math.max(MIN_TILT, t));

/** Movement speed for a height above the ground, meters per second: the same feel at 50 m and at 500 km. */
export function speedFor(heightAboveGround: number): number {
  return Math.max(1, heightAboveGround);
}

/** The pose raised, if needed, to the ground (`elevation` above the ellipsoid) plus the clearance. Orientation kept. */
export function withClearance(pose: Pose, elevation: number): Pose {
  const g = fromPosition(pose.position);
  const floor = elevation + CLEARANCE;
  if (g.height >= floor) return pose;
  return { ...pose, position: toPosition({ lat: g.lat, lon: g.lon, height: floor }) };
}

/** The view ray through a pixel (top left origin) of a `width` by `height` view with a vertical field of view `fov`, in frame axes. */
export function pixelRay(orientation: Quat, x: number, y: number, width: number, height: number, fov: number): Vec3 {
  const t = Math.tan(fov / 2);
  const aspect = width / height;
  const cam: Vec3 = [((2 * x) / width - 1) * t * aspect, (1 - (2 * y) / height) * t, -1];
  return unit(rotate(orientation, cam)) ?? [0, 0, -1];
}

/** Where a ray first meets the sphere of `radius` about the frame origin, or null. */
export function raySphere(origin: Vec3, direction: Vec3, radius: number): Vec3 | null {
  const d = unit(direction);
  if (!d) return null;
  const b = dot(origin, d);
  const c = dot(origin, origin) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t = c > 0 ? -b - s : -b + s;
  if (t < 0) return null;
  return add(origin, d, t);
}

/** The unit quaternion turning direction `a` onto direction `b`. */
export function rotationBetween(a: Vec3, b: Vec3): Quat {
  const ua = unit(a);
  const ub = unit(b);
  if (!ua || !ub) return [0, 0, 0, 1];
  const c = dot(ua, ub);
  if (c > 1 - 1e-15) return [0, 0, 0, 1];
  let axis = cross(ua, ub);
  if (len(axis) < 1e-12) axis = Math.abs(ua[0]) < 0.9 ? cross(ua, [1, 0, 0]) : cross(ua, [0, 1, 0]);
  const n = unit(axis) as Vec3;
  const half = Math.acos(Math.max(-1, Math.min(1, c))) / 2;
  const s = Math.sin(half);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(half)];
}

/** The product `a * b` of two quaternions (b applied first). */
export function quatMul([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** The pose with roll against the local up taken out, keeping where it looks as near as possible. */
export function level(pose: Pose): Pose {
  const { heading, tilt } = headingTilt(pose.position, pose.orientation as Quat);
  return { ...pose, orientation: orientationFrom(pose.position, heading, tilt) };
}

/**
 * Pan: the camera turned about the frame origin so that the ray through the
 * pointer, which now meets the grab sphere at `under`, meets it at `grab`
 * instead. The grabbed ground point stays under the pointer. When `under`
 * equals `grab` nothing moves.
 */
export function pan(pose: Pose, grab: Vec3, under: Vec3): Pose {
  const q = rotationBetween(under, grab);
  if (q[3] === 1) return pose;
  const position = rotate(q, pose.position);
  const orientation = quatMul(q, pose.orientation as Quat);
  return level({ ...pose, position, orientation });
}

/**
 * Zoom: the camera moved along the line to `target` so its distance becomes
 * `factor` times what it was (below 1 zooms in). The orientation is kept, so
 * the target stays under the same pixel.
 */
export function zoomToward(pose: Pose, target: Vec3, factor: number): Pose {
  const f = Math.max(0, factor);
  return { ...pose, position: add(target, sub(pose.position, target), f) };
}

/** The pose at `position` looking at `target` with no roll; `fallbackHeading` when looking straight down. */
export function lookAt(pose: Pose, position: Vec3, target: Vec3, fallbackHeading: number): Pose {
  const f = unit(sub(target, position));
  if (!f) return { ...pose, position };
  const g = fromPosition(position);
  const axes = enu(g.lat, g.lon);
  const tilt = Math.asin(Math.max(-1, Math.min(1, -dot(f, axes.up))));
  const horizontal = Math.hypot(dot(f, axes.east), dot(f, axes.north));
  const heading = horizontal < 1e-9 ? fallbackHeading : Math.atan2(dot(f, axes.east), dot(f, axes.north));
  return { ...pose, position, orientation: orientationFrom(position, heading, tilt) };
}

/**
 * Orbit: the camera turned around `pivot` (on the ground) by `dHeading`
 * (clockwise from above) and tilted by `dTilt` (positive toward straight
 * down), keeping its distance and keeping the pivot at the view center.
 * The tilt seen from the pivot stays within 5 to 90 degrees below level.
 */
export function orbit(pose: Pose, pivot: Vec3, dHeading: number, dTilt: number): Pose {
  const range = len(sub(pivot, pose.position));
  if (range < 1e-6) return pose;
  const g = fromPosition(pivot);
  const axes = enu(g.lat, g.lon);
  const d = unit(sub(pivot, pose.position)) as Vec3;
  const heading = headingTilt(pose.position, pose.orientation as Quat).heading + dHeading;
  const tilt = clampTilt(Math.asin(Math.max(-1, Math.min(1, -dot(d, axes.up)))) + dTilt);
  const levelDir = add([axes.north[0] * Math.cos(heading), axes.north[1] * Math.cos(heading), axes.north[2] * Math.cos(heading)], axes.east, Math.sin(heading));
  const forward = add([levelDir[0] * Math.cos(tilt), levelDir[1] * Math.cos(tilt), levelDir[2] * Math.cos(tilt)], axes.up, -Math.sin(tilt));
  const position = add(pivot, forward, -range);
  return lookAt(pose, position, pivot, heading);
}

/** Smooth start and stop over `t` in [0, 1]. */
export function ease(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

/** The position a fraction `t` (eased) of the way from `a` to `b`. */
export function between(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(a, sub(b, a), ease(t));
}
