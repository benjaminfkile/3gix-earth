import { describe, expect, it, vi } from "vitest";
import type { Pose } from "3gix-renderer";
import { headingTilt, orientationFrom, type Quat } from "../geo/enu";
import { fromPosition, rad, toPosition } from "../geo/wgs84";
import { NavController, type NavRenderer } from "./controller";

const ELEVATION = 1000;

function setup(height = 3000, tilt = 45) {
  const position = toPosition({ lat: rad(46.87), lon: rad(-113.99), height: ELEVATION + height });
  let pose: Pose = { frameId: 4, position, orientation: orientationFrom(position, 0, rad(tilt)), speed: 1 };
  const r = {
    setCamera: vi.fn((p: Pose) => {
      pose = p;
    }),
    getCamera: vi.fn(() => pose),
    raycast: vi.fn(() => null),
    surfaceHeight: vi.fn(() => ({ height: ELEVATION, level: 10, finer: false })),
    getFov: vi.fn(() => 50),
  };
  const frames: (() => void)[] = [];
  let t = 0;
  const nav = new NavController(r as unknown as NavRenderer, {
    size: () => ({ width: 800, height: 600 }),
    frame: (fn) => frames.push(fn),
    cancelFrame: () => {},
    now: () => t,
  });
  nav.onCamera(pose);
  return { nav, r, frames, advance: (ms: number) => (t += ms), pose: () => pose };
}

const heights = (r: { setCamera: { mock: { calls: unknown[][] } } }) => r.setCamera.mock.calls.map((c) => fromPosition((c[0] as Pose).position).height);

describe("NavController", () => {
  it("a pan of zero pixels writes nothing", () => {
    const { nav, r } = setup();
    nav.panStart(400, 300);
    nav.panMove(400, 300);
    expect(r.setCamera).not.toHaveBeenCalled();
  });

  it("every write rides with Earth and sets the speed from the height", () => {
    const { nav, r } = setup();
    nav.panStart(400, 300);
    nav.panMove(450, 320);
    expect(r.setCamera).toHaveBeenCalledTimes(1);
    const [pose, opts] = r.setCamera.mock.calls[0] as unknown as [Pose, unknown];
    expect(opts).toEqual({ ride: true });
    expect(pose.speed).toBeCloseTo(fromPosition(pose.position).height - ELEVATION, 3);
  });

  it("no gesture puts the camera below the ground plus 2 m", () => {
    const { nav, r, frames, advance } = setup(10, 80);
    for (let i = 0; i < 50; i++) nav.wheel(400, 450, -2);
    for (let i = 0; i < 20; i++) nav.pinch({ x: 400, y: 500, factor: 0.2, twist: 0.1, dy: -40 });
    for (let i = 0; i < 20; i++) nav.orbit(30, -200);
    nav.panStart(400, 590);
    for (let i = 0; i < 20; i++) nav.panMove(400, 100 + i * 10);
    nav.double(400, 400);
    while (frames.length) {
      advance(100);
      frames.shift()!();
    }
    const hs = heights(r);
    expect(hs.length).toBeGreaterThan(50);
    for (const h of hs) expect(h).toBeGreaterThanOrEqual(ELEVATION + 2 - 1e-6);
  });

  it("double click flies toward the point over about 0.8 s and stops at a press", () => {
    const { nav, r, frames, advance, pose } = setup(3000, 90);
    const start = fromPosition(pose().position).height;
    nav.double(400, 300);
    advance(400);
    frames.shift()!();
    const mid = fromPosition(pose().position).height;
    expect(mid).toBeLessThan(start);
    advance(400);
    frames.shift()!();
    expect(frames.length).toBe(0);
    // No raycast hit in the mock: the point is on the ellipsoid, 4000 m below.
    const end = fromPosition(pose().position).height;
    expect(end).toBeCloseTo((ELEVATION + 3000) * 0.35, -1);
    nav.double(400, 300);
    nav.press();
    const calls = r.setCamera.mock.calls.length;
    expect(calls).toBe(2);
  });

  it("wheel zooms toward the point under the pointer", () => {
    const { nav, pose } = setup(3000, 90);
    const before = fromPosition(pose().position).height;
    nav.wheel(400, 300, -1);
    expect(fromPosition(pose().position).height).toBeLessThan(before);
    nav.wheel(400, 300, 2);
    expect(fromPosition(pose().position).height).toBeGreaterThan(before);
  });

  it("zooming far out eases to straight down over the zoom target, and back to the user's tilt zooming in", () => {
    const { nav, pose } = setup(4500, 30);
    const start = fromPosition(pose().position);
    for (let i = 0; i < 60; i++) nav.wheel(400, 300, 2);
    const far = pose();
    const g = fromPosition(far.position);
    expect(g.height).toBeGreaterThan(1e6);
    expect(headingTilt(far.position, far.orientation as Quat).tilt).toBeCloseTo(Math.PI / 2, 3);
    // Still over the same part of Earth, not over the other side.
    expect(Math.abs(g.lat - start.lat)).toBeLessThan(rad(5));
    expect(Math.abs(g.lon - start.lon)).toBeLessThan(rad(5));
    for (let i = 0; i < 60; i++) nav.wheel(400, 300, -2);
    const near = pose();
    expect(fromPosition(near.position).height).toBeLessThan(ELEVATION + 50_000);
    expect(headingTilt(near.position, near.orientation as Quat).tilt).toBeCloseTo(rad(30), 2);
  });
});
