import { describe, expect, it } from "vitest";
import { WGS84_A, WGS84_B, deg, fromDirection, fromPosition, rad, toDirection, toPosition } from "./wgs84";

const places: Array<[string, number, number, number]> = [
  ["north pole", 90, 0, 0],
  ["north pole high", 90, 45, 20000],
  ["south pole", -90, 0, 1500],
  ["equator at 0", 0, 0, 0],
  ["equator at 90 E", 0, 90, 250],
  ["equator below the ellipsoid", 0, -45, -400],
  ["antimeridian west side", 12.5, 179.9999999, 100],
  ["antimeridian east side", -12.5, -179.9999999, 100],
  ["antimeridian", 33, 180, 5000],
  ["Missoula 20 km up", 46.8721, -113.994, 20000],
  ["near the north pole", 89.9999, -30, 10],
  ["low orbit", -35, 150, 400000],
];

function lonClose(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe("wgs84", () => {
  it("knows points on the axes", () => {
    const x = toPosition({ lat: 0, lon: 0, height: 0 });
    expect(x[0]).toBeCloseTo(WGS84_A, 6);
    expect(Math.abs(x[1])).toBeLessThan(1e-6);
    const y = toPosition({ lat: 0, lon: rad(90), height: 0 });
    expect(y[1]).toBeCloseTo(WGS84_A, 6);
    const z = toPosition({ lat: rad(90), lon: 0, height: 0 });
    expect(z[2]).toBeCloseTo(WGS84_B, 6);
    expect(Math.hypot(z[0], z[1])).toBeLessThan(1e-6);
  });

  for (const [name, latDeg, lonDeg, height] of places) {
    it(`round trips ${name}`, () => {
      const p = toPosition({ lat: rad(latDeg), lon: rad(lonDeg), height });
      const g = fromPosition(p);
      expect(Math.abs(deg(g.lat) - latDeg)).toBeLessThan(1e-9);
      if (Math.abs(latDeg) < 90) expect(lonClose(deg(g.lon), lonDeg)).toBeLessThan(1e-9);
      expect(Math.abs(g.height - height)).toBeLessThan(1e-6);
      const back = toPosition(g);
      expect(Math.hypot(back[0] - p[0], back[1] - p[1], back[2] - p[2])).toBeLessThan(1e-6);
    });

    it(`round trips the direction of ${name}`, () => {
      const d = toDirection(rad(latDeg), rad(lonDeg));
      expect(Math.hypot(...d)).toBeCloseTo(1, 12);
      const g = fromDirection(d);
      expect(Math.abs(deg(g.lat) - latDeg)).toBeLessThan(1e-9);
      if (Math.abs(latDeg) < 90) expect(lonClose(deg(g.lon), lonDeg)).toBeLessThan(1e-9);
    });
  }

  it("keeps the two sides of the antimeridian apart", () => {
    const west = fromPosition(toPosition({ lat: 0, lon: rad(179.5), height: 0 }));
    const east = fromPosition(toPosition({ lat: 0, lon: rad(-179.5), height: 0 }));
    expect(deg(west.lon)).toBeCloseTo(179.5, 9);
    expect(deg(east.lon)).toBeCloseTo(-179.5, 9);
  });

  it("rejects a zero direction", () => {
    expect(() => fromDirection([0, 0, 0])).toThrow();
  });
});
