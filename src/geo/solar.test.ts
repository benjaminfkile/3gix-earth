import { describe, expect, it } from "vitest";
import { latestSolarNoon } from "./solar";
import { rad } from "./wgs84";

const MINUTE = 60_000;

describe("latestSolarNoon", () => {
  it("is near 12:00 UTC at Greenwich after noon", () => {
    const now = Date.UTC(2026, 2, 21, 15, 0);
    const noon = latestSolarNoon(0, now);
    expect(Math.abs(noon - Date.UTC(2026, 2, 21, 12, 0))).toBeLessThan(10 * MINUTE);
  });

  it("is the day before when now is before noon", () => {
    const now = Date.UTC(2026, 2, 21, 9, 0);
    const noon = latestSolarNoon(0, now);
    expect(Math.abs(noon - Date.UTC(2026, 2, 20, 12, 0))).toBeLessThan(10 * MINUTE);
  });

  it("follows the equation of time in early November", () => {
    // Solar noon at Greenwich on 3 November is near 11:44 UTC.
    const noon = latestSolarNoon(0, Date.UTC(2026, 10, 3, 18, 0));
    expect(Math.abs(noon - Date.UTC(2026, 10, 3, 11, 44))).toBeLessThan(2 * MINUTE);
  });

  it("shifts by longitude", () => {
    // Missoula, about 113.994 W: about 7 h 36 m after Greenwich.
    const now = Date.UTC(2026, 10, 23, 23, 0);
    const noon = latestSolarNoon(rad(-113.994), now);
    expect(noon).toBeLessThanOrEqual(now);
    expect(now - noon).toBeLessThan(86_400_000);
    expect(Math.abs(noon - Date.UTC(2026, 10, 23, 19, 22))).toBeLessThan(3 * MINUTE);
  });

  it("is never after now, east and west of the antimeridian", () => {
    for (const lonDeg of [179.9, -179.9, 0, 90, -90]) {
      for (let h = 0; h < 24; h++) {
        const now = Date.UTC(2026, 5, 1, h, 17);
        const noon = latestSolarNoon(rad(lonDeg), now);
        expect(noon).toBeLessThanOrEqual(now);
        expect(now - noon).toBeLessThan(86_400_000);
      }
    }
  });
});
