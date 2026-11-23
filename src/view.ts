// What the controls show for a pose, the address bar (design sections 5
// and 6), and the debug panel's points (section 7). Pure: no renderer, no
// React.

import type { Pose, Vec3 } from "3gix-renderer";
import { EARTH_FRAME } from "./earth";
import { cameraAxes, headingTilt, orientationFrom, rayEllipsoid, type Quat } from "./geo/enu";
import { groundUnder, type SurfaceSource } from "./geo/ground";
import { deg, fromPosition, rad, toPosition, wrapLon } from "./geo/wgs84";

/** A camera place in Earth terms: radians and meters. */
export interface Place {
  lat: number;
  lon: number;
  /** Meters above the ground. */
  height: number;
  /** Radians clockwise from north. */
  heading: number;
  /** Radians below level. */
  tilt: number;
}

/** Everything the readout and compass show. */
export interface Readout extends Place {
  /** The surface height above the reference ellipsoid under the camera, meters. */
  elevation: number;
}

export function readoutOf(source: SurfaceSource, pose: Pose): Readout {
  const g = fromPosition(pose.position);
  const ground = groundUnder(source, pose.position);
  const { heading, tilt } = headingTilt(pose.position, pose.orientation as Quat);
  return { lat: g.lat, lon: g.lon, height: g.height - ground.elevation, elevation: ground.elevation, heading, tilt };
}

/** The pose for a place, its height taken above the ground there. */
export function poseOf(source: SurfaceSource, place: Place, speed: number): Pose {
  const foot = toPosition({ lat: place.lat, lon: place.lon, height: 0 });
  const ground = groundUnder(source, foot);
  const position = toPosition({ lat: place.lat, lon: place.lon, height: ground.elevation + place.height });
  return { frameId: EARTH_FRAME, position, orientation: orientationFrom(position, place.heading, place.tilt), speed };
}

/** The same pose turned to a heading and tilt, without moving. */
export function turned(pose: Pose, heading: number, tilt: number): Pose {
  return { ...pose, orientation: orientationFrom(pose.position, heading, tilt) };
}

/** Degrees with 5 decimals and a hemisphere letter. */
export function formatAngle(r: number, pos: string, neg: string): string {
  return `${Math.abs(deg(r)).toFixed(5)}° ${r < 0 ? neg : pos}`;
}

/** Meters or kilometers for display. */
export function formatLength(m: number): string {
  return Math.abs(m) >= 10_000 ? `${(m / 1000).toFixed(1)} km` : `${m.toFixed(0)} m`;
}

/** `lat, lon` in signed degrees for the clipboard. */
export function latLonText(lat: number, lon: number): string {
  return `${deg(lat).toFixed(5)}, ${deg(lon).toFixed(5)}`;
}

// Address bar (section 6).

/** The place in a query string, or null when it does not hold a full, valid one. */
export function placeFromSearch(search: string): Place | null {
  const q = new URLSearchParams(search);
  const n = (k: string, d?: number) => {
    const v = q.get(k);
    if (v === null || v.trim() === "") return d;
    const x = Number(v);
    return Number.isFinite(x) ? x : undefined;
  };
  const lat = n("lat");
  const lon = n("lon");
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90) return null;
  const h = n("h", 20_000);
  const heading = n("heading", 0);
  const tilt = n("tilt", 45);
  if (h === undefined || heading === undefined || tilt === undefined) return null;
  return {
    lat: rad(lat),
    lon: wrapLon(rad(lon)),
    height: Math.max(2, h),
    heading: rad(((heading % 360) + 360) % 360),
    tilt: rad(Math.min(90, Math.max(-90, tilt))),
  };
}

/** The query string with the place written in, other parameters kept. */
export function searchWithPlace(search: string, p: Place): string {
  const q = new URLSearchParams(search);
  q.set("lat", deg(p.lat).toFixed(6));
  q.set("lon", deg(p.lon).toFixed(6));
  q.set("h", p.height.toFixed(1));
  q.set("heading", deg(p.heading).toFixed(2));
  q.set("tilt", deg(p.tilt).toFixed(2));
  return `?${q.toString()}`;
}

/** Whether the query string asks for the debug panel. */
export function debugFromSearch(search: string): boolean {
  return new URLSearchParams(search).get("debug") === "1";
}

// Debug panel (section 7).

export interface LatLng {
  lat: number;
  lng: number;
}

/** What the two maps show for a pose. Degrees and meters, as Google's APIs take them. */
export interface DebugView {
  /** Under the camera. */
  camera: LatLng;
  /** Compass degrees. */
  heading: number;
  /** Where the screen center meets the ground, or null when it meets nothing. */
  center: LatLng | null;
  /**
   * The camera for `Map3DElement`, null when the view center meets nothing.
   * Google takes the center's altitude above mean sea level; this gives the
   * height above the ellipsoid, so the two differ by the geoid there.
   */
  map3d: {
    center: LatLng & { altitude: number };
    /** Meters from the camera to the center. */
    range: number;
    /** Degrees from straight down (0) to the horizon (90). */
    tilt: number;
    heading: number;
    /** Vertical field of view, degrees. */
    fov: number;
  } | null;
}

/**
 * The debug view of a pose. `centerHit` is the `raycast` at the view
 * center; when it misses, the ray is met with the reference ellipsoid.
 */
export function debugView(pose: Pose, centerHit: Vec3 | null, fovDeg: number): DebugView {
  const g = fromPosition(pose.position);
  const { heading, tilt } = headingTilt(pose.position, pose.orientation as Quat);
  const hit = centerHit ?? rayEllipsoid(pose.position, cameraAxes(pose.orientation as Quat).forward);
  const camera = { lat: deg(g.lat), lng: deg(g.lon) };
  if (!hit) return { camera, heading: deg(heading), center: null, map3d: null };
  const c = fromPosition(hit);
  const center = { lat: deg(c.lat), lng: deg(c.lon) };
  const range = Math.hypot(hit[0] - pose.position[0], hit[1] - pose.position[1], hit[2] - pose.position[2]);
  return {
    camera,
    heading: deg(heading),
    center,
    map3d: { center: { ...center, altitude: c.height }, range, tilt: 90 - deg(tilt), heading: deg(heading), fov: fovDeg },
  };
}

/** Calls `fn` at most once per `ms`, the last call always delivered. */
export function throttle<T>(ms: number, fn: (v: T) => void, now: () => number = () => performance.now()): { push(v: T): void; cancel(): void } {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { v: T } | null = null;
  const fire = () => {
    timer = null;
    if (!pending) return;
    const { v } = pending;
    pending = null;
    last = now();
    fn(v);
  };
  return {
    push(v) {
      pending = { v };
      if (timer) return;
      const wait = last + ms - now();
      if (wait <= 0) fire();
      else timer = setTimeout(fire, wait);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
