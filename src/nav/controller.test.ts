import { describe, expect, it, vi } from "vitest";
import type { Pose } from "3gix-renderer";
import { orientationFrom } from "../geo/enu";
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
    for (let i = 0; i < 50; i++) nav.wheel(400, 450, -2000);
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
    nav.wheel(400, 300, -100);
    expect(fromPosition(pose().position).height).toBeLessThan(before);
    nav.wheel(400, 300, 300);
    expect(fromPosition(pose().position).height).toBeGreaterThan(before);
  });
});
