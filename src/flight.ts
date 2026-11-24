// Flights to a search result or a bookmark (design section 5 items 4 and
// 7): the framing of a place and the animated path to it. The renderer never
// animates (api.md rule 4), so this app steps the camera with `setCamera`
// once per animation frame. Pure math first, then the runner.

import type { Renderer } from "3gix-renderer";
import { RIDE } from "./earth";
import { greatCircleDistance, MEAN_RADIUS } from "./geo/enu";
import { rad, wrapLon } from "./geo/wgs84";
import { poseOf, readoutOf, type Place } from "./view";

/** Radians: latitude and longitude. */
export interface GeoPoint {
  lat: number;
  lon: number;
}

/** A place's viewport, radians. `east` may be less than `west` across the antimeridian. */
export interface Viewport {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** The tilt a search result is seen at: 45 degrees below level. */
export const FRAME_TILT = rad(45);
/** A place without a viewport is seen from this high above the ground, meters. */
export const POINT_HEIGHT = 2000;
/** How long a flight takes, seconds. */
export const FLIGHT_SECONDS = 2;
const MIN_HEIGHT = 50;
const MAX_HEIGHT = 20_000_000;

/**
 * The camera place that frames a target facing north at 45 degrees tilt.
 * With a viewport, the camera stands back along the view ray until the
 * viewport fills the view: its east-west width the horizontal field of view,
 * its north-south depth (foreshortened by the tilt) the vertical one. Without
 * one, the camera is `POINT_HEIGHT` above the ground looking at the point.
 * `fov` is the vertical field of view in radians, `aspect` width over height.
 */
export function framing(target: GeoPoint, viewport: Viewport | null, fov: number, aspect: number): Place {
  let center = target;
  let range: number;
  if (viewport) {
    const span = wrapLon(viewport.east - viewport.west);
    const east = span < 0 ? span + 2 * Math.PI : span;
    const lat = (viewport.north + viewport.south) / 2;
    center = { lat, lon: wrapLon(viewport.west + east / 2) };
    const width = east * MEAN_RADIUS * Math.cos(lat);
    const depth = Math.abs(viewport.north - viewport.south) * MEAN_RADIUS * Math.sin(FRAME_TILT);
    const hFov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    range = Math.max(width / 2 / Math.tan(hFov / 2), depth / 2 / Math.tan(fov / 2));
  } else {
    range = POINT_HEIGHT / Math.sin(FRAME_TILT);
  }
  const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, range * Math.sin(FRAME_TILT)));
  // Facing north, the camera stands south of the center by the level part of the range.
  const back = (height / Math.tan(FRAME_TILT)) / MEAN_RADIUS;
  const lat = Math.max(-Math.PI / 2 + 1e-6, center.lat - back);
  return { lat, lon: center.lon, height, heading: 0, tilt: FRAME_TILT };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const unitOf = (p: GeoPoint): [number, number, number] => [Math.cos(p.lat) * Math.cos(p.lon), Math.cos(p.lat) * Math.sin(p.lon), Math.sin(p.lat)];

/**
 * The place a fraction `t` (0 to 1) along a flight. Latitude and longitude
 * follow the great circle; height goes up, over, and down for long
 * distances (the peak grows with the distance) and eases between the two
 * heights for short ones; heading turns the short way; tilt eases.
 */
export function flightAt(from: Place, to: Place, t: number): Place {
  const s = smooth(Math.max(0, Math.min(1, t)));
  const a = unitOf(from);
  const b = unitOf(to);
  const omega = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  let p = a;
  if (omega > 1e-12) {
    const ka = Math.sin((1 - s) * omega) / Math.sin(omega);
    const kb = Math.sin(s * omega) / Math.sin(omega);
    p = [ka * a[0] + kb * b[0], ka * a[1] + kb * b[1], ka * a[2] + kb * b[2]];
  } else {
    p = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
  }
  const lat = Math.atan2(p[2], Math.hypot(p[0], p[1]));
  const lon = Math.atan2(p[1], p[0]);
  const h0 = Math.max(1, from.height);
  const h1 = Math.max(1, to.height);
  const base = Math.exp(Math.log(h0) + (Math.log(h1) - Math.log(h0)) * s);
  const distance = greatCircleDistance(from.lat, from.lon, to.lat, to.lon);
  const peak = Math.min(MAX_HEIGHT / 4, distance * 0.5);
  const bump = Math.max(0, peak - Math.max(h0, h1)) * 4 * s * (1 - s);
  const dh = wrapLon(to.heading - from.heading);
  const full = 2 * Math.PI;
  return {
    lat,
    lon,
    height: base + bump,
    heading: (((from.heading + dh * s) % full) + full) % full,
    tilt: from.tilt + (to.tilt - from.tilt) * s,
  };
}

export type FlightRenderer = Pick<Renderer, "getCamera" | "setCamera" | "surfaceHeight">;

export interface Clock {
  now(): number;
  frame(fn: () => void): () => void;
}

const browserClock: Clock = {
  now: () => performance.now(),
  frame: (fn) => {
    const id = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(id);
  },
};

/**
 * Flies the camera from where it is to a place in `FLIGHT_SECONDS`, one
 * `setCamera` per frame. Returns a stop function; a stopped flight leaves
 * the camera where it got to.
 */
export function fly(r: FlightRenderer, to: Place, clock: Clock = browserClock, seconds = FLIGHT_SECONDS): () => void {
  const pose = r.getCamera();
  const from = readoutOf(r, pose);
  const start = clock.now();
  let cancel: (() => void) | null = null;
  const step = () => {
    const t = Math.min(1, (clock.now() - start) / (seconds * 1000));
    r.setCamera(poseOf(r, flightAt(from, to, t), r.getCamera().speed), RIDE);
    cancel = t < 1 ? clock.frame(step) : null;
  };
  step();
  return () => {
    cancel?.();
    cancel = null;
  };
}
