// Local axes, camera heading and tilt, and great-circle distance in frame
// 4's axes (design section 8).
//
// Camera conventions, from the renderer's `camera.rs` and the API's pose
// (`api.md` section 2): the pose's orientation is a unit quaternion
// `[x, y, z, w]` that turns camera axes into frame axes. The camera looks
// along its local -z, +x is right, +y is up. So in frame axes the forward
// direction is `rotate(q, [0, 0, -1])` and the camera's up is
// `rotate(q, [0, 1, 0])`.
//
// Heading is the compass direction of the view, radians clockwise from
// north. Tilt is the angle below level, radians: 0 looks at the horizon,
// pi/2 looks straight down. Both are taken against the local east, north,
// up axes of the WGS84 ellipsoid (geodetic up) at the camera's position.

import type { FrameInfo, Pose, Vec3 } from "3gix-renderer";
import { WGS84_A, WGS84_B, fromPosition, unit } from "./wgs84";

/** A unit quaternion `[x, y, z, w]`. */
export type Quat = [number, number, number, number];

/** The local east, north, and up unit vectors at a latitude and longitude, in frame 4's axes. */
export interface Enu {
  east: Vec3;
  north: Vec3;
  up: Vec3;
}

export function enu(lat: number, lon: number): Enu {
  const sl = Math.sin(lat);
  const cl = Math.cos(lat);
  const so = Math.sin(lon);
  const co = Math.cos(lon);
  return {
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
    up: [cl * co, cl * so, sl],
  };
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

/** Rotates a vector by a unit quaternion `[x, y, z, w]`. */
export function rotate([x, y, z, w]: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [x, y, z];
  const t = scale(cross(u, v), 2);
  return add(add(v, t, w), cross(u, t));
}

/** The quaternion of a rotation whose columns are the given orthonormal right handed axes. */
export function quatFromAxes(xa: Vec3, ya: Vec3, za: Vec3): Quat {
  const [m00, m10, m20] = xa;
  const [m01, m11, m21] = ya;
  const [m02, m12, m22] = za;
  const trace = m00 + m11 + m22;
  let q: Quat;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const n = Math.hypot(...q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** The camera's forward and up directions in frame axes. */
export function cameraAxes(orientation: Quat): { forward: Vec3; up: Vec3 } {
  return { forward: rotate(orientation, [0, 0, -1]), up: rotate(orientation, [0, 1, 0]) };
}

/** Heading (radians clockwise from north, in [0, 2 pi)) and tilt (radians below level) of a camera orientation at a position. */
export function headingTilt(position: Vec3, orientation: Quat): { heading: number; tilt: number } {
  const g = fromPosition(position);
  const axes = enu(g.lat, g.lon);
  const { forward, up } = cameraAxes(orientation);
  const tilt = Math.asin(Math.max(-1, Math.min(1, -dot(forward, axes.up))));
  // Forward plus camera up keeps a horizontal part from level to straight
  // down, so the heading stays defined when looking straight down.
  const h = add(forward, up);
  let heading = Math.atan2(dot(h, axes.east), dot(h, axes.north));
  if (heading < 0) heading += 2 * Math.PI;
  if (heading >= 2 * Math.PI) heading = 0;
  return { heading, tilt };
}

/** The camera orientation at a position looking along a heading and a tilt below level, with no roll. */
export function orientationFrom(position: Vec3, heading: number, tilt: number): Quat {
  const g = fromPosition(position);
  const axes = enu(g.lat, g.lon);
  const level = add(scale(axes.north, Math.cos(heading)), axes.east, Math.sin(heading));
  const forward = add(scale(level, Math.cos(tilt)), axes.up, -Math.sin(tilt));
  const up = add(scale(level, Math.sin(tilt)), axes.up, Math.cos(tilt));
  const right = cross(forward, up);
  return quatFromAxes(right, up, scale(forward, -1));
}

/** Mean Earth radius (IUGG), meters, for great-circle distance. */
export const MEAN_RADIUS = 6371008.8;

/** Great-circle distance in meters between two latitudes and longitudes (radians), on a sphere of mean radius. */
export function greatCircleDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const s1 = Math.sin((lat2 - lat1) / 2);
  const s2 = Math.sin((lon2 - lon1) / 2);
  const a = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * MEAN_RADIUS * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/** The pose at a position with a heading and tilt, keeping a speed. */
export function poseAt(frameId: number, position: Vec3, heading: number, tilt: number, speed: number): Pose {
  return { frameId, position, orientation: orientationFrom(position, heading, tilt), speed };
}

/**
 * Compares a frame's reported surface radii with WGS84. Returns a message
 * when either differs by more than 1 m, null when they agree or the frame
 * has not reported its surface yet.
 */
export function wgs84Mismatch(frame: FrameInfo | undefined): string | null {
  const s = frame?.surface;
  if (!s) return null;
  const da = s.radiusXy - WGS84_A;
  const db = s.radiusZ - WGS84_B;
  if (Math.abs(da) <= 1 && Math.abs(db) <= 1) return null;
  return `frame ${frame.id} surface radii (${s.radiusXy} m, ${s.radiusZ} m) differ from WGS84 (${WGS84_A} m, ${WGS84_B} m)`;
}

/** Where a ray from `origin` along `direction` first meets the WGS84 ellipsoid, or null. */
export function rayEllipsoid(origin: Vec3, direction: Vec3): Vec3 | null {
  const d = unit(direction);
  if (!d) return null;
  // Scale z so the ellipsoid becomes a sphere of radius a.
  const k = WGS84_A / WGS84_B;
  const o: Vec3 = [origin[0], origin[1], origin[2] * k];
  const v: Vec3 = [d[0], d[1], d[2] * k];
  const a = dot(v, v);
  const b = 2 * dot(o, v);
  const c = dot(o, o) - WGS84_A * WGS84_A;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  return add(origin, d, t);
}
