import { describe, expect, it, vi } from "vitest";
import { groundUnder } from "./ground";
import { deg, fromPosition, rad, toDirection, toPosition, unit } from "./wgs84";
import type { Vec3 } from "3gix-renderer";

describe("groundUnder", () => {
  const p = toPosition({ lat: rad(46.8721), lon: rad(-113.994), height: 20_000 });

  it("asks along the direction of the ellipsoid point under the position and stands on its normal", () => {
    const surfaceHeight = vi.fn(() => ({ height: 978, level: 12, finer: false }));
    const g = groundUnder({ surfaceHeight }, p);
    const [frame, dir] = surfaceHeight.mock.calls[0] as unknown as [number, Vec3];
    expect(frame).toBe(4);
    const want = toDirection(rad(46.8721), rad(-113.994));
    expect(Math.hypot(dir[0] - want[0], dir[1] - want[1], dir[2] - want[2])).toBeLessThan(1e-12);
    expect(g.elevation).toBe(978);
    expect(g.loaded).toBe(true);
    const at = fromPosition(g.point);
    expect(deg(at.lat)).toBeCloseTo(46.8721, 9);
    expect(deg(at.lon)).toBeCloseTo(-113.994, 9);
    expect(at.height).toBeCloseTo(978, 6);
    // The ground lies on the geodetic normal through the position.
    const d = unit([p[0] - g.point[0], p[1] - g.point[1], p[2] - g.point[2]]) as Vec3;
    const up = unit(toPosition({ lat: rad(46.8721), lon: rad(-113.994), height: 1 }).map((v, i) => v - toPosition({ lat: rad(46.8721), lon: rad(-113.994), height: 0 })[i]) as Vec3) as Vec3;
    expect(d[0] * up[0] + d[1] * up[1] + d[2] * up[2]).toBeCloseTo(1, 9);
  });

  it("falls back to the reference ellipsoid", () => {
    const g = groundUnder({ surfaceHeight: () => null }, p);
    expect(g.elevation).toBe(0);
    expect(g.loaded).toBe(false);
    expect(fromPosition(g.point).height).toBeCloseTo(0, 6);
  });
});
