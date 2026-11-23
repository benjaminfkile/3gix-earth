import { describe, expect, it } from "vitest";
import type { Vec3 } from "3gix-renderer";
import { cameraAxes, enu, greatCircleDistance, headingTilt, orientationFrom, rayEllipsoid, rotate, wgs84Mismatch } from "./enu";
import { WGS84_A, WGS84_B, deg, rad, toPosition } from "./wgs84";

const at = (latDeg: number, lonDeg: number, h = 1000): Vec3 => toPosition({ lat: rad(latDeg), lon: rad(lonDeg), height: h });
const close = (a: Vec3, b: Vec3, eps = 1e-9) => expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(eps);

describe("enu", () => {
  it("is east, north, up at latitude 0, longitude 0", () => {
    const a = enu(0, 0);
    close(a.east, [0, 1, 0]);
    close(a.north, [0, 0, 1]);
    close(a.up, [1, 0, 0]);
  });
});

describe("heading and tilt", () => {
  it("rotates camera -z to forward like the renderer", () => {
    close(rotate([0, 0, 0, 1], [0, 0, -1]), [0, 0, -1]);
  });

  it("faces north and east", () => {
    const p = at(46.8721, -113.994);
    const north = cameraAxes(orientationFrom(p, 0, 0)).forward;
    const e = enu(rad(46.8721), rad(-113.994));
    close(north, e.north);
    const east = cameraAxes(orientationFrom(p, Math.PI / 2, 0)).forward;
    close(east, e.east);
    const ht = headingTilt(p, orientationFrom(p, Math.PI / 2, 0));
    expect(deg(ht.heading)).toBeCloseTo(90, 9);
    expect(ht.tilt).toBeCloseTo(0, 9);
  });

  it("looks straight down and keeps the heading", () => {
    const p = at(10, 20);
    const q = orientationFrom(p, rad(30), Math.PI / 2);
    close(cameraAxes(q).forward, enu(rad(10), rad(20)).up.map((v) => -v) as Vec3);
    const ht = headingTilt(p, q);
    expect(deg(ht.tilt)).toBeCloseTo(90, 6);
    expect(deg(ht.heading)).toBeCloseTo(30, 6);
  });

  it("round trips heading and tilt", () => {
    for (const [lat, lon] of [[0, 0], [46.8721, -113.994], [-89.9, 170], [60, 179.99]]) {
      const p = at(lat, lon, 5000);
      for (const h of [0, 45, 90, 180, 270, 359]) {
        for (const t of [5, 45, 89.9, 90]) {
          const ht = headingTilt(p, orientationFrom(p, rad(h), rad(t)));
          expect(deg(ht.tilt)).toBeCloseTo(t, 6);
          const dh = Math.abs(deg(ht.heading) - h) % 360;
          expect(Math.min(dh, 360 - dh)).toBeLessThan(1e-6);
        }
      }
    }
  });

  it("gives a unit quaternion", () => {
    const q = orientationFrom(at(1, 2), 1, 0.5);
    expect(Math.hypot(...q)).toBeCloseTo(1, 12);
  });
});

describe("great-circle distance", () => {
  it("is a quarter circle from the equator to the pole", () => {
    expect(greatCircleDistance(0, 0, Math.PI / 2, 0)).toBeCloseTo((Math.PI / 2) * 6371008.8, 3);
  });
  it("crosses the antimeridian the short way", () => {
    expect(greatCircleDistance(0, rad(179.5), 0, rad(-179.5))).toBeCloseTo(rad(1) * 6371008.8, 3);
  });
});

describe("WGS84 check", () => {
  const frame = (a: number, b: number) => ({ id: 4, parentId: 1, mass: 1, angularVelocity: [0, 0, 0] as Vec3, hasSurface: true, surface: { radiusEquatorial: a, radiusPolar: b, heightFloor: -11000 } });
  it("passes within 1 m", () => expect(wgs84Mismatch(frame(WGS84_A + 0.5, WGS84_B - 0.5))).toBeNull());
  it("reports more than 1 m", () => expect(wgs84Mismatch(frame(6371000, 6371000))).toMatch(/differ from WGS84/));
  it("waits for the surface", () => expect(wgs84Mismatch(undefined)).toBeNull());
});

describe("rayEllipsoid", () => {
  it("hits straight down", () => {
    const p = at(0, 0, 1000);
    close(rayEllipsoid(p, [-1, 0, 0]) as Vec3, [WGS84_A, 0, 0], 1e-6);
    expect(rayEllipsoid(p, [1, 0, 0])).toBeNull();
  });
});
