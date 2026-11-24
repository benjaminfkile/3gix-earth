import { describe, expect, it } from "vitest";
import { clockText, instantAt, localDayStart, secondsOfDay } from "./time";
import { rad } from "./geo/wgs84";

describe("time of day", () => {
  it("maps the slider to the UTC instant at a longitude", () => {
    const day = Date.UTC(2026, 10, 23, 22, 0);
    // At 90 W local mean time is UTC minus 6 h: local noon is 18:00 UTC.
    expect(instantAt(rad(-90), day, 12 * 3600)).toBe(Date.UTC(2026, 10, 23, 18, 0));
    // At 90 E local time is UTC plus 6 h: 22:00 UTC is already 04:00 on the 24th.
    expect(instantAt(rad(90), day, 12 * 3600)).toBe(Date.UTC(2026, 10, 24, 6, 0));
    // At longitude 0 the day is the UTC day.
    expect(instantAt(0, day, 0)).toBe(Date.UTC(2026, 10, 23));
  });

  it("round trips an instant through the slider", () => {
    const lon = rad(-113.994);
    const t = Date.UTC(2026, 10, 23, 22, 17, 5);
    const s = secondsOfDay(lon, t);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(86_400);
    expect(instantAt(lon, t, s)).toBeCloseTo(t, 6);
    expect(localDayStart(lon, t)).toBeLessThanOrEqual(t);
  });

  it("formats the clock", () => {
    expect(clockText(0)).toBe("00:00");
    expect(clockText(13 * 3600 + 5 * 60 + 59)).toBe("13:05");
  });
});
