import { describe, expect, it } from "vitest";
import type { Pose, Vec3 } from "3gix-renderer";
import { headingTilt, orientationFrom, type Quat } from "../geo/enu";
import { fromPosition, rad, toPosition } from "../geo/wgs84";
import { CLEARANCE, MIN_TILT, ease, orbit, pan, pixelRay, raySphere, rotationBetween, speedFor, withClearance, zoomToward } from "./math";
import { rotate } from "../geo/enu";

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function poseAbove(lat: number, lon: number, height: number, heading: number, tilt: number): Pose {
  const position = toPosition({ lat: rad(lat), lon: rad(lon), height });
  return { frameId: 4, position, orientation: orientationFrom(position, rad(heading), rad(tilt)), speed: 1 };
}

describe("nav math", () => {
  it("rotationBetween turns one direction onto another", () => {
    const q = rotationBetween([1, 0, 0], [0, 1, 0]);
    const v = rotate(q, [1, 0, 0]);
    expect(dist(v, [0, 1, 0])).toBeLessThan(1e-12);
    expect(rotationBetween([0, 0, 1], [0, 0, 1])).toEqual([0, 0, 0, 1]);
  });

  it("a pan of zero pixels moves nothing", () => {
    const pose = poseAbove(46.87, -113.99, 20_000, 30, 45);
    const grab = toPosition({ lat: rad(47), lon: rad(-114), height: 0 });
    expect(pan(pose, grab, grab)).toBe(pose);
  });

  it("pan keeps the grabbed ground point under the pointer", () => {
    const pose = poseAbove(46.87, -113.99, 20_000, 0, 60);
    const [w, h, fov] = [800, 600, rad(50)];
    const r = Math.hypot(...toPosition({ lat: rad(46.87), lon: rad(-113.99), height: 0 }));
    const grab = raySphere(pose.position, pixelRay(pose.orientation as Quat, 400, 300, w, h, fov), r)!;
    const under = raySphere(pose.position, pixelRay(pose.orientation as Quat, 500, 350, w, h, fov), r)!;
    const next = pan(pose, grab, under);
    const now = raySphere(next.position, pixelRay(next.orientation as Quat, 500, 350, w, h, fov), r)!;
    expect(dist(now, grab)).toBeLessThan(1);
    // Turning about the center moves over a sphere, not the ellipsoid: the height drifts a little.
    expect(Math.abs(fromPosition(next.position).height - 20_000)).toBeLessThan(0.01 * dist(grab, under));
  });

  it("zoom toward a point scales the distance and keeps the orientation", () => {
    const pose = poseAbove(0, 0, 10_000, 0, 90);
    const target = toPosition({ lat: rad(0.01), lon: 0, height: 0 });
    const next = zoomToward(pose, target, 0.5);
    expect(dist(next.position, target)).toBeCloseTo(dist(pose.position, target) / 2, 6);
    expect(next.orientation).toEqual(pose.orientation);
    expect(zoomToward(pose, target, 1).position).toEqual(pose.position);
  });

  it("orbit keeps the distance and the pivot at the view center, and clamps the tilt", () => {
    const pose = poseAbove(10, 20, 5000, 0, 90);
    const pivot = toPosition({ lat: rad(10), lon: rad(20), height: 0 });
    const next = orbit(pose, pivot, rad(30), -rad(40));
    expect(dist(next.position, pivot)).toBeCloseTo(dist(pose.position, pivot), 3);
    const fwd = rotate(next.orientation as Quat, [0, 0, -1]);
    const toPivot = [pivot[0] - next.position[0], pivot[1] - next.position[1], pivot[2] - next.position[2]].map((x) => x / dist(next.position, pivot));
    expect(fwd[0] * toPivot[0] + fwd[1] * toPivot[1] + fwd[2] * toPivot[2]).toBeGreaterThan(1 - 1e-9);
    expect(headingTilt(next.position, next.orientation as Quat).heading).toBeCloseTo(rad(30), 2);
    const flat = orbit(pose, pivot, 0, -Math.PI);
    expect(headingTilt(flat.position, flat.orientation as Quat).tilt).toBeGreaterThan(MIN_TILT - rad(0.1));
    expect(fromPosition(flat.position).height).toBeGreaterThan(0);
  });

  it("clearance keeps the camera at the ground plus 2 m", () => {
    const pose = poseAbove(0, 0, 50, 0, 45);
    const raised = withClearance(pose, 100);
    expect(fromPosition(raised.position).height).toBeCloseTo(100 + CLEARANCE, 6);
    expect(withClearance(pose, 10)).toBe(pose);
  });

  it("speed follows the height", () => {
    expect(speedFor(50)).toBe(50);
    expect(speedFor(500_000)).toBe(500_000);
    expect(speedFor(0)).toBe(1);
  });

  it("eases from 0 to 1", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(0.1)).toBeLessThan(0.1);
  });
});
