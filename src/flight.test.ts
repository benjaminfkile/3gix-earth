import { describe, expect, it, vi } from "vitest";
import type { Pose } from "3gix-renderer";
import { FLIGHT_SECONDS, FRAME_TILT, POINT_HEIGHT, flightAt, fly, framing, type FlightRenderer } from "./flight";
import { greatCircleDistance, headingTilt, MEAN_RADIUS, orientationFrom, type Quat } from "./geo/enu";
import { deg, fromPosition, rad, toPosition } from "./geo/wgs84";
import type { Place } from "./view";

const FOV = rad(50);

describe("framing", () => {
  it("puts a point 2 km above the ground, facing north at 45 degrees, looking at it", () => {
    const target = { lat: rad(46.8721), lon: rad(-113.994) };
    const p = framing(target, null, FOV, 16 / 9);
    expect(p.height).toBeCloseTo(POINT_HEIGHT, 6);
    expect(p.heading).toBe(0);
    expect(p.tilt).toBeCloseTo(FRAME_TILT, 12);
    expect(p.lon).toBeCloseTo(target.lon, 12);
    // At 45 degrees the level distance to the point equals the height.
    expect(greatCircleDistance(p.lat, p.lon, target.lat, target.lon)).toBeCloseTo(POINT_HEIGHT, 0);
    expect(p.lat).toBeLessThan(target.lat);
  });

  it("stands back until the viewport fills the view", () => {
    // About 10 km by 10 km at the equator.
    const half = 5000 / MEAN_RADIUS;
    const vp = { north: half, south: -half, east: half, west: -half };
    const wide = framing({ lat: 0, lon: 0 }, vp, FOV, 2);
    // Narrow view: the width fills it, at range width / 2 / tan(hfov / 2).
    const tall = framing({ lat: 0, lon: 0 }, vp, FOV, 0.5);
    const hFov = 2 * Math.atan(Math.tan(FOV / 2) * 0.5);
    expect(tall.height).toBeCloseTo((5000 / Math.tan(hFov / 2)) * Math.sin(FRAME_TILT), 3);
    // Wide view: the foreshortened depth fills the vertical field of view.
    expect(wide.height).toBeCloseTo(((5000 * Math.sin(FRAME_TILT)) / Math.tan(FOV / 2)) * Math.sin(FRAME_TILT), 3);
    expect(tall.height).toBeGreaterThan(wide.height);
    expect(wide.heading).toBe(0);
  });

  it("centers on the viewport, across the antimeridian too", () => {
    const vp = { north: rad(10), south: rad(0), east: rad(-170), west: rad(170) };
    const p = framing({ lat: 0, lon: 0 }, vp, FOV, 1);
    expect(Math.abs(deg(p.lon))).toBeCloseTo(180, 9);
    const width = rad(20) * MEAN_RADIUS * Math.cos(rad(5));
    expect(p.height).toBeCloseTo((width / 2 / Math.tan(FOV / 2)) * Math.sin(FRAME_TILT), 0);
  });
});

const place = (latDeg: number, lonDeg: number, height: number, headingDeg = 0, tiltDeg = 45): Place => ({
  lat: rad(latDeg),
  lon: rad(lonDeg),
  height,
  heading: rad(headingDeg),
  tilt: rad(tiltDeg),
});

describe("flightAt", () => {
  it("starts and ends at the two places", () => {
    const a = place(46.87, -113.99, 20_000, 30, 60);
    const b = place(48.85, 2.35, 2000, 0, 45);
    for (const [t, p] of [[0, a], [1, b]] as const) {
      const f = flightAt(a, b, t);
      expect(f.lat).toBeCloseTo(p.lat, 9);
      expect(f.lon).toBeCloseTo(p.lon, 9);
      expect(f.height).toBeCloseTo(p.height, 3);
      expect(f.heading).toBeCloseTo(p.heading, 9);
      expect(f.tilt).toBeCloseTo(p.tilt, 9);
    }
  });

  it("goes up, over, and down for long distances, not for short ones", () => {
    const far = flightAt(place(46.87, -113.99, 2000), place(48.85, 2.35, 2000), 0.5);
    expect(far.height).toBeGreaterThan(1_000_000);
    const near = flightAt(place(46.87, -113.99, 2000), place(46.8701, -113.99, 2000), 0.5);
    expect(near.height).toBeCloseTo(2000, 3);
  });

  it("turns the short way", () => {
    const f = flightAt(place(0, 0, 1000, 350), place(0, 0, 1000, 10), 0.5);
    expect(deg(f.heading)).toBeCloseTo(0, 6);
  });
});

describe("fly", () => {
  it("steps the camera each frame for 2 s and ends at the place, riding", () => {
    const position = toPosition({ lat: rad(46.87), lon: rad(-113.99), height: 20_000 });
    let pose: Pose = { frameId: 4, position, orientation: orientationFrom(position, 0, rad(45)), speed: 3 };
    const r = {
      getCamera: vi.fn(() => pose),
      setCamera: vi.fn((p: Pose, _o?: unknown) => {
        pose = p;
      }),
      surfaceHeight: vi.fn(() => null),
    };
    let now = 0;
    const frames: Array<() => void> = [];
    const to = place(48.85, 2.35, 2000);
    fly(r as unknown as FlightRenderer, to, { now: () => now, frame: (fn) => (frames.push(fn), () => {}) });
    while (frames.length > 0) {
      now += 1000 / 60;
      frames.shift()!();
    }
    expect(now).toBeCloseTo(FLIGHT_SECONDS * 1000, -2);
    expect(r.setCamera.mock.calls.every((c) => (c[1] as { ride?: boolean } | undefined)?.ride === true)).toBe(true);
    const g = fromPosition(pose.position);
    expect(deg(g.lat)).toBeCloseTo(48.85, 6);
    expect(deg(g.lon)).toBeCloseTo(2.35, 6);
    expect(g.height).toBeCloseTo(2000, 3);
    const ht = headingTilt(pose.position, pose.orientation as Quat);
    expect(ht.tilt).toBeCloseTo(rad(45), 6);
    expect(pose.speed).toBe(3);
  });

  it("stops where it got to", () => {
    const position = toPosition({ lat: 0, lon: 0, height: 1000 });
    let pose: Pose = { frameId: 4, position, orientation: orientationFrom(position, 0, rad(45)), speed: 1 };
    const r = { getCamera: () => pose, setCamera: vi.fn((p: Pose) => (pose = p)), surfaceHeight: () => null };
    let cancelled = false;
    const stop = fly(r as unknown as FlightRenderer, place(1, 1, 1000), { now: () => 0, frame: () => () => (cancelled = true) });
    stop();
    expect(cancelled).toBe(true);
    expect(r.setCamera).toHaveBeenCalledTimes(1);
  });
});
