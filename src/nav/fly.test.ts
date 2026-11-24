import { describe, expect, it, vi } from "vitest";
import type { Pose } from "3gix-renderer";
import { enu, headingTilt, orientationFrom, rotate, type Quat } from "../geo/enu";
import { fromPosition, rad, toPosition } from "../geo/wgs84";
import { DRAG_LOOK, FlyController, KEY_LOOK, MAX_LOOK_TILT, arrowLook, attachFly, flightInput, stickVector, type FlyRenderer } from "./fly";
import { speedFor } from "./math";

const ELEVATION = 1000;

/** The horizon's roll: the camera's right axis against the local vertical, radians. */
function roll(p: Pose): number {
  const g = fromPosition(p.position);
  const right = rotate(p.orientation as Quat, [1, 0, 0]);
  const up = enu(g.lat, g.lon).up;
  return Math.asin(right[0] * up[0] + right[1] * up[1] + right[2] * up[2]);
}

function setup(height = 500, tilt = rad(10)) {
  const position = toPosition({ lat: rad(46.87), lon: rad(-113.99), height: ELEVATION + height });
  let pose: Pose = { frameId: 4, position, orientation: orientationFrom(position, 0, tilt), speed: 1 };
  const frames: Array<() => void> = [];
  const r = {
    setCamera: vi.fn((p: Pose, _o?: unknown) => {
      pose = p;
    }),
    getCamera: vi.fn(() => pose),
    surfaceHeight: vi.fn(() => ({ height: ELEVATION, level: 10, finer: false })),
    setFlightInput: vi.fn(),
    setSpeed: vi.fn(),
  };
  const fly = new FlyController(r as unknown as FlyRenderer, (fn) => {
    frames.push(fn);
    return () => frames.splice(frames.indexOf(fn), 1);
  });
  /** Runs `n` animation frames. */
  const run = (n: number) => {
    for (let i = 0; i < n; i++) frames.shift()?.();
  };
  return { fly, r, pose: () => pose, run, frames };
}

describe("flightInput", () => {
  it("maps the keys to camera axes: W forward (-z), A/D sideways, E/Space up, Q/C down", () => {
    expect(flightInput(new Set())).toEqual({ move: [0, 0, 0], look: [0, 0, 0], boost: false });
    expect(flightInput(new Set(["KeyW"])).move).toEqual([0, 0, -1]);
    expect(flightInput(new Set(["KeyS"])).move).toEqual([0, 0, 1]);
    expect(flightInput(new Set(["KeyD", "KeyE"])).move).toEqual([1, 1, 0]);
    expect(flightInput(new Set(["KeyA", "KeyC"])).move).toEqual([-1, -1, 0]);
    expect(flightInput(new Set(["Space", "KeyE"])).move).toEqual([0, 1, 0]);
    expect(flightInput(new Set(["KeyW", "KeyS", "KeyQ", "Space"])).move).toEqual([0, 0, 0]);
  });

  it("never sends look (arrow keys turn through setCamera) and boosts with either Shift", () => {
    expect(flightInput(new Set(["ArrowLeft", "ArrowUp"])).look).toEqual([0, 0, 0]);
    expect(arrowLook(new Set(["ArrowLeft", "ArrowUp"]))).toEqual({ heading: -KEY_LOOK, tilt: -KEY_LOOK });
    expect(arrowLook(new Set(["ArrowRight", "ArrowDown"]))).toEqual({ heading: KEY_LOOK, tilt: KEY_LOOK });
    expect(flightInput(new Set(["ShiftLeft"])).boost).toBe(true);
    expect(flightInput(new Set(["ShiftRight"])).boost).toBe(true);
    expect(flightInput(new Set(), undefined, true).boost).toBe(true);
  });

  it("maps the joystick: up flies forward, right moves right, kept inside the unit circle", () => {
    expect(flightInput(new Set(), { x: 0, y: -1 }).move).toEqual([0, 0, -1]);
    expect(flightInput(new Set(), { x: 0.5, y: 0 }).move).toEqual([0.5, 0, 0]);
    const s = stickVector({ x: 3, y: 4 });
    expect(s.x).toBeCloseTo(0.6);
    expect(s.y).toBeCloseTo(0.8);
    expect(stickVector({ x: 0.3, y: -0.4 })).toEqual({ x: 0.3, y: -0.4 });
    expect(stickVector({ x: NaN, y: 0 })).toEqual({ x: 0, y: 0 });
    // Keys and stick together never pass 1.
    expect(flightInput(new Set(["KeyW"]), { x: 0, y: -1 }).move).toEqual([0, 0, -1]);
  });
});

describe("FlyController", () => {
  it("sets the speed from the height above the ground", () => {
    const { fly, r, pose } = setup(500);
    expect(r.setSpeed).toHaveBeenLastCalledWith(speedFor(500));
    const p = toPosition({ lat: rad(46.87), lon: rad(-113.99), height: ELEVATION + 200_000 });
    fly.onCamera({ ...pose(), position: p });
    expect(r.setSpeed.mock.calls.at(-1)?.[0]).toBeCloseTo(speedFor(200_000), 3);
    expect(speedFor(200_000) / speedFor(500)).toBeCloseTo(400);
  });

  it("lifts a pose that comes within 2 m of the ground", () => {
    const { fly, r, pose } = setup();
    const low = toPosition({ lat: rad(46.87), lon: rad(-113.99), height: ELEVATION + 0.5 });
    fly.onCamera({ ...pose(), position: low });
    expect(r.setCamera).toHaveBeenCalledTimes(1);
    expect(r.setCamera.mock.calls[0][1]).toEqual({ ride: true });
    expect(fromPosition(pose().position).height).toBeCloseTo(ELEVATION + 2, 6);
    r.setCamera.mockClear();
    fly.onCamera(pose());
    expect(r.setCamera).not.toHaveBeenCalled();
  });

  it("holds the flight input for keys and clears it when everything is let go", () => {
    const { fly, r } = setup();
    expect(fly.keyDown("KeyW")).toBe(true);
    expect(r.setFlightInput).toHaveBeenLastCalledWith({ move: [0, 0, -1], look: [0, 0, 0], boost: false });
    expect(fly.keyDown("KeyW")).toBe(true);
    expect(r.setFlightInput).toHaveBeenCalledTimes(1);
    expect(fly.keyDown("KeyZ")).toBe(false);
    fly.keyUp("KeyW");
    expect(r.setFlightInput).toHaveBeenLastCalledWith(null);
    fly.setStick({ x: 0, y: -0.5 });
    fly.setBoost(true);
    expect(r.setFlightInput).toHaveBeenLastCalledWith({ move: [0, 0, -0.5], look: [0, 0, 0], boost: true });
    fly.clear();
    expect(r.setFlightInput).toHaveBeenLastCalledWith(null);
  });

  it("looks by turning in place", () => {
    const { fly, pose } = setup();
    const before = pose();
    fly.look(100, 50);
    const after = pose();
    expect(after.position).toEqual(before.position);
    const a = headingTilt(after.position, after.orientation as Quat);
    expect(a.heading).toBeCloseTo(100 * DRAG_LOOK, 6);
    expect(a.tilt).toBeCloseTo(rad(10) + 50 * DRAG_LOOK, 6);
  });

  it("turns with the arrow keys each frame until let go, without a flight input", () => {
    const { fly, r, pose, run, frames } = setup();
    fly.keyDown("ArrowLeft");
    expect(r.setFlightInput).not.toHaveBeenCalled();
    run(10);
    expect(headingTilt(pose().position, pose().orientation as Quat).heading).toBeCloseTo(2 * Math.PI - 10 * KEY_LOOK, 6);
    fly.keyUp("ArrowLeft");
    run(1);
    expect(frames).toHaveLength(0);
  });

  it("keeps the heading through a left turn then a pitch, tilted down", () => {
    const { fly, pose, run } = setup(500, rad(45));
    fly.keyDown("ArrowLeft");
    run(Math.round(rad(90) / KEY_LOOK));
    fly.keyUp("ArrowLeft");
    run(1);
    const turnedLeft = headingTilt(pose().position, pose().orientation as Quat).heading;
    expect(Math.abs(roll(pose()))).toBeLessThan(1e-9);
    fly.keyDown("ArrowUp");
    run(20);
    fly.keyUp("ArrowUp");
    run(1);
    const a = headingTilt(pose().position, pose().orientation as Quat);
    expect(a.heading).toBeCloseTo(turnedLeft, 9);
    expect(a.tilt).toBeCloseTo(rad(45) - 20 * KEY_LOOK, 9);
    fly.look(0, 300);
    expect(headingTilt(pose().position, pose().orientation as Quat).heading).toBeCloseTo(turnedLeft, 9);
  });

  it("never rolls the horizon and clamps tilt at 89 degrees", () => {
    const { fly, pose } = setup(500, rad(30));
    const moves: Array<[number, number]> = [[-500, 0], [0, 400], [800, -900], [-300, 2000], [1234, -77], [0, -5000]];
    for (const [dx, dy] of moves) {
      fly.look(dx, dy);
      expect(Math.abs(roll(pose()))).toBeLessThan(1e-9);
      expect(Math.abs(headingTilt(pose().position, pose().orientation as Quat).tilt)).toBeLessThanOrEqual(MAX_LOOK_TILT + 1e-9);
    }
    expect(headingTilt(pose().position, pose().orientation as Quat).tilt).toBeCloseTo(-MAX_LOOK_TILT, 9);
  });
});

describe("attachFly", () => {
  function mount() {
    const el = document.createElement("div");
    const input = document.createElement("input");
    el.appendChild(input);
    document.body.appendChild(el);
    const f = { keyDown: vi.fn((c: string) => c === "KeyW"), keyUp: vi.fn(() => true), look: vi.fn(), clear: vi.fn() };
    const detach = attachFly(el, f);
    return { el, input, f, detach };
  }

  it("takes keys only while the view itself has focus, and keeps them from the page", () => {
    const { el, input, f, detach } = mount();
    const page = vi.fn();
    document.addEventListener("keydown", page);
    input.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }));
    expect(f.keyDown).not.toHaveBeenCalled();
    expect(page).toHaveBeenCalledTimes(1);
    const e = new KeyboardEvent("keydown", { code: "KeyW", bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    expect(f.keyDown).toHaveBeenCalledWith("KeyW");
    expect(e.defaultPrevented).toBe(true);
    expect(page).toHaveBeenCalledTimes(1);
    el.dispatchEvent(new FocusEvent("blur"));
    expect(f.clear).toHaveBeenCalled();
    document.removeEventListener("keydown", page);
    detach();
    el.remove();
  });

  it("looks by dragging on the view", () => {
    const { el, f, detach } = mount();
    const fire = (type: string, target: EventTarget, x: number, y: number) => {
      const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      Object.assign(e, { pointerId: 1, pointerType: "touch" });
      target.dispatchEvent(e);
    };
    fire("pointerdown", el, 10, 10);
    fire("pointermove", window, 30, 15);
    expect(f.look).toHaveBeenCalledWith(20, 5);
    fire("pointerup", window, 30, 15);
    fire("pointermove", window, 50, 15);
    expect(f.look).toHaveBeenCalledTimes(1);
    detach();
    el.remove();
  });
});
