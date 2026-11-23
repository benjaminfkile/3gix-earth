import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pose, Vec3 } from "3gix-renderer";
import { orientationFrom } from "./geo/enu";
import { deg, fromPosition, rad, toPosition } from "./geo/wgs84";
import { debugFromSearch, debugView, placeFromSearch, poseOf, readoutOf, searchWithPlace, throttle, turned } from "./view";
import { headingTilt, type Quat } from "./geo/enu";

const flat = { surfaceHeight: () => ({ height: 1000, level: 10, finer: false }) };

function poseAt(latDeg: number, lonDeg: number, height: number, headingDeg: number, tiltDeg: number): Pose {
  const position = toPosition({ lat: rad(latDeg), lon: rad(lonDeg), height });
  return { frameId: 4, position, orientation: orientationFrom(position, rad(headingDeg), rad(tiltDeg)), speed: 10 };
}

describe("readout and placement", () => {
  it("reads height above the ground and the elevation", () => {
    const r = readoutOf(flat, poseAt(46.8721, -113.994, 21_000, 90, 45));
    expect(deg(r.lat)).toBeCloseTo(46.8721, 9);
    expect(r.height).toBeCloseTo(20_000, 6);
    expect(r.elevation).toBe(1000);
    expect(deg(r.heading)).toBeCloseTo(90, 6);
  });

  it("places a pose at a height above the ground, facing its heading", () => {
    const pose = poseOf(flat, { lat: rad(10), lon: rad(20), height: 500, heading: 0, tilt: rad(45) }, 7);
    expect(fromPosition(pose.position).height).toBeCloseTo(1500, 6);
    expect(pose.speed).toBe(7);
    const ht = headingTilt(pose.position, pose.orientation as Quat);
    expect(ht.heading).toBeCloseTo(0, 9);
    expect(deg(ht.tilt)).toBeCloseTo(45, 9);
  });

  it("turns north up and straight down without moving", () => {
    const pose = poseAt(10, 20, 3000, 123, 30);
    const north = turned(pose, 0, rad(30));
    expect(north.position).toEqual(pose.position);
    expect(headingTilt(north.position, north.orientation as Quat).heading).toBeCloseTo(0, 9);
    const down = turned(pose, rad(123), Math.PI / 2);
    expect(down.position).toEqual(pose.position);
    expect(deg(headingTilt(down.position, down.orientation as Quat).tilt)).toBeCloseTo(90, 6);
  });
});

describe("address bar", () => {
  it("round trips a place and keeps other parameters", () => {
    const place = { lat: rad(-33.5), lon: rad(151.25), height: 1234.5, heading: rad(270), tilt: rad(60) };
    const s = searchWithPlace("?debug=1", place);
    expect(debugFromSearch(s)).toBe(true);
    const back = placeFromSearch(s)!;
    expect(deg(back.lat)).toBeCloseTo(-33.5, 6);
    expect(deg(back.lon)).toBeCloseTo(151.25, 6);
    expect(back.height).toBeCloseTo(1234.5, 6);
    expect(deg(back.heading)).toBeCloseTo(270, 6);
    expect(deg(back.tilt)).toBeCloseTo(60, 6);
  });

  it("needs lat and lon and defaults the rest", () => {
    expect(placeFromSearch("")).toBeNull();
    expect(placeFromSearch("?lat=abc&lon=1")).toBeNull();
    expect(placeFromSearch("?lat=95&lon=1")).toBeNull();
    const p = placeFromSearch("?lat=1&lon=2")!;
    expect(p.height).toBe(20_000);
    expect(p.heading).toBe(0);
    expect(deg(p.tilt)).toBeCloseTo(45, 12);
  });

  it("reads debug=1 only", () => {
    expect(debugFromSearch("?debug=0")).toBe(false);
    expect(debugFromSearch("")).toBe(false);
  });
});

describe("debug view", () => {
  it("puts the camera marker under the camera and the center on the hit", () => {
    const pose = poseAt(46.8721, -113.994, 20_000, 0, 45);
    const hit = toPosition({ lat: rad(47.05), lon: rad(-113.994), height: 900 });
    const v = debugView(pose, hit, 50);
    expect(v.camera.lat).toBeCloseTo(46.8721, 9);
    expect(v.camera.lng).toBeCloseTo(-113.994, 9);
    expect(v.heading).toBeCloseTo(0, 6);
    expect(v.center!.lat).toBeCloseTo(47.05, 9);
    expect(v.map3d!.center.altitude).toBeCloseTo(900, 6);
    expect(v.map3d!.tilt).toBeCloseTo(45, 6);
    expect(v.map3d!.fov).toBe(50);
    const d = hit.map((x, i) => x - pose.position[i]) as Vec3;
    expect(v.map3d!.range).toBeCloseTo(Math.hypot(...d), 6);
  });

  it("meets the ellipsoid when the raycast misses, north of the camera", () => {
    const v = debugView(poseAt(0, 0, 10_000, 0, 45), null, 50);
    expect(v.center!.lng).toBeCloseTo(0, 9);
    // About 10 km north at 45 degrees.
    expect(v.center!.lat * 111_320).toBeGreaterThan(9_500);
    expect(v.center!.lat * 111_320).toBeLessThan(10_500);
    expect(v.map3d!.range).toBeCloseTo(10_000 * Math.SQRT2, -2);
  });

  it("has no center looking at the sky", () => {
    const v = debugView(poseAt(0, 0, 10_000, 0, -10), null, 50);
    expect(v.center).toBeNull();
    expect(v.map3d).toBeNull();
  });
});

describe("throttle", () => {
  afterEach(() => vi.useRealTimers());
  it("delivers at most once per period, the last value last", () => {
    vi.useFakeTimers();
    let t = 0;
    const got: number[] = [];
    const th = throttle<number>(100, (v) => got.push(v), () => t);
    th.push(1);
    th.push(2);
    th.push(3);
    expect(got).toEqual([1]);
    t = 100;
    vi.advanceTimersByTime(100);
    expect(got).toEqual([1, 3]);
  });
});
