// Fly mode (design section 4): free flight through `setFlightInput` and
// `setSpeed`. Keys, the touch joystick, and the boost button are turned into
// one held flight input for moving (`move` and `boost`, never `look`).
// Looking (arrow keys, mouse, finger) is applied here instead: heading and
// tilt are kept as state, heading turns about the local vertical and tilt
// about the camera's right axis, and the orientation is written with
// `setCamera` built from the two, so the horizon never rolls. The renderer's
// `look` turns about the camera's own axes, which rolls the horizon after a
// turn while tilted. The pure parts (keys and joystick to flight input) come
// first; the controller and the DOM listeners after.

import type { FlightInput, Pose, Renderer, Vec3 } from "3gix-renderer";
import { EARTH_FRAME, RIDE } from "../earth";
import { headingTilt, type Quat } from "../geo/enu";
import { groundUnder } from "../geo/ground";
import { fromPosition, rad } from "../geo/wgs84";
import { turned } from "../view";
import { speedFor, withClearance } from "./math";

/** Arrow keys turn this much each animation frame (about 1.2 radians a second at 60 frames a second). */
export const KEY_LOOK = 0.02;
/** Mouse or finger look, radians per pixel. */
export const DRAG_LOOK = 0.003;
/** Looking up or down stops short of straight up or down. */
export const MAX_LOOK_TILT = rad(89);

/** The keys Fly mode reads (`KeyboardEvent.code`). */
export const FLY_KEYS = new Set([
  "KeyW",
  "KeyS",
  "KeyA",
  "KeyD",
  "KeyE",
  "KeyQ",
  "Space",
  "KeyC",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
]);

/** A joystick deflection: x right and y down, each in -1 to 1. */
export interface Stick {
  x: number;
  y: number;
}

const ZERO: Stick = { x: 0, y: 0 };

/**
 * The flight input for held keys (codes), a joystick deflection, and the
 * boost button. Camera axes: +x right, +y up, -z forward (the camera looks
 * along its -z). `look` is always zero: looking is applied with `setCamera`
 * (see `arrowLook`).
 */
export function flightInput(keys: ReadonlySet<string>, stick: Stick = ZERO, boostButton = false): FlightInput {
  const k = (code: string) => (keys.has(code) ? 1 : 0);
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const s = stickVector(stick);
  const move: Vec3 = [
    clamp(k("KeyD") - k("KeyA") + s.x),
    clamp(Math.min(1, k("KeyE") + k("Space")) - Math.min(1, k("KeyQ") + k("KeyC"))),
    clamp(k("KeyS") - k("KeyW") + s.y),
  ];
  return { move, look: [0, 0, 0], boost: boostButton || keys.has("ShiftLeft") || keys.has("ShiftRight") };
}

/** The turn the held arrow keys make in one frame: heading (radians, positive right) and tilt (radians, positive down). */
export function arrowLook(keys: ReadonlySet<string>): { heading: number; tilt: number } {
  const k = (code: string) => (keys.has(code) ? 1 : 0);
  return { heading: (k("ArrowRight") - k("ArrowLeft")) * KEY_LOOK, tilt: (k("ArrowDown") - k("ArrowUp")) * KEY_LOOK };
}

/** A joystick deflection kept inside the unit circle. Pushing up (y negative) flies forward. */
export function stickVector({ x, y }: Stick): Stick {
  const n = Math.hypot(x, y);
  if (!Number.isFinite(n) || n === 0) return ZERO;
  return n > 1 ? { x: x / n, y: y / n } : { x, y };
}

/** Whether a flight input holds nothing. */
export function idle(f: FlightInput): boolean {
  return !f.boost && f.move.every((v) => v === 0) && f.look.every((v) => v === 0);
}

/** What Fly mode needs from the renderer. */
export type FlyRenderer = Pick<Renderer, "setCamera" | "getCamera" | "surfaceHeight" | "setFlightInput" | "setSpeed">;

/** Runs `fn` before the next frame; returns a cancel. */
export type FrameScheduler = (fn: () => void) => () => void;

const animationFrame: FrameScheduler = (fn) => {
  if (typeof requestAnimationFrame !== "function") {
    const t = setTimeout(fn, 16);
    return () => clearTimeout(t);
  }
  const id = requestAnimationFrame(fn);
  return () => cancelAnimationFrame(id);
};

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

export class FlyController {
  private keys = new Set<string>();
  private stick: Stick = ZERO;
  private boost = false;
  private speed = 0;
  private sent: FlightInput | null = null;
  /** The look state, and the orientation last written from it (null until the first look). */
  private heading = 0;
  private tilt = 0;
  private written: Quat | null = null;
  private cancelFrame: (() => void) | null = null;

  constructor(
    private readonly r: FlyRenderer,
    private readonly frame: FrameScheduler = animationFrame,
  ) {
    const pose = r.getCamera();
    if (pose.frameId === EARTH_FRAME) this.updateSpeed(pose);
  }

  /** The `camera` event: ground clearance and speed from height. */
  onCamera(pose: Pose): void {
    if (pose.frameId !== EARTH_FRAME) return;
    const ground = groundUnder(this.r, pose.position).elevation;
    const safe = withClearance(pose, ground);
    if (safe !== pose) this.r.setCamera(safe, RIDE);
    this.updateSpeed(safe, ground);
  }

  private updateSpeed(pose: Pose, ground = groundUnder(this.r, pose.position).elevation): void {
    const speed = speedFor(fromPosition(pose.position).height - ground);
    // Only when it changes by more than 1 percent: the camera event comes every tick in flight.
    if (Math.abs(speed - this.speed) <= 0.01 * this.speed) return;
    this.speed = speed;
    this.r.setSpeed(speed);
  }

  /** A key went down; true when Fly mode uses it. */
  keyDown(code: string): boolean {
    if (!FLY_KEYS.has(code)) return false;
    if (this.keys.has(code)) return true;
    this.keys.add(code);
    this.send();
    this.startArrows();
    return true;
  }

  keyUp(code: string): boolean {
    if (!FLY_KEYS.has(code)) return false;
    this.keys.delete(code);
    this.send();
    return true;
  }

  private startArrows(): void {
    if (this.cancelFrame || !ARROWS.some((a) => this.keys.has(a))) return;
    const step = () => {
      this.cancelFrame = null;
      const t = arrowLook(this.keys);
      if (t.heading === 0 && t.tilt === 0) return;
      this.turn(t.heading, t.tilt);
      this.cancelFrame = this.frame(step);
    };
    this.cancelFrame = this.frame(step);
  }

  setStick(stick: Stick): void {
    this.stick = stick;
    this.send();
  }

  setBoost(on: boolean): void {
    this.boost = on;
    this.send();
  }

  /** Turns the camera in place by a mouse or finger move, pixels. Right and down look right and down. */
  look(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.turn(dx * DRAG_LOOK, dy * DRAG_LOOK);
  }

  /**
   * Turns the heading about the local vertical and the tilt about the
   * camera's right axis (radians; positive right and down), with no roll.
   * The state is taken again from the pose when something else turned the
   * camera since the last look (the compass, a flight).
   */
  turn(dHeading: number, dTilt: number): void {
    const pose = this.r.getCamera();
    if (pose.frameId !== EARTH_FRAME) return;
    const q = pose.orientation as Quat;
    if (!this.written || q.some((v, i) => v !== this.written![i])) {
      const ht = headingTilt(pose.position, q);
      this.heading = ht.heading;
      this.tilt = ht.tilt;
    }
    const full = 2 * Math.PI;
    this.heading = (((this.heading + dHeading) % full) + full) % full;
    this.tilt = Math.max(-MAX_LOOK_TILT, Math.min(MAX_LOOK_TILT, this.tilt + dTilt));
    const next = turned(pose, this.heading, this.tilt);
    this.written = next.orientation as Quat;
    this.r.setCamera(next, RIDE);
  }

  /** Lets go of every key, the stick, and boost, and clears the renderer's flight input. */
  clear(): void {
    this.cancelFrame?.();
    this.cancelFrame = null;
    this.keys.clear();
    this.stick = ZERO;
    this.boost = false;
    this.sent = null;
    this.r.setFlightInput(null);
  }

  private send(): void {
    const f = flightInput(this.keys, this.stick, this.boost);
    if (idle(f)) {
      if (this.sent !== null) {
        this.sent = null;
        this.r.setFlightInput(null);
      }
      return;
    }
    this.sent = f;
    this.r.setFlightInput(f);
  }

  dispose(): void {
    this.clear();
  }
}

/** What the DOM listeners drive. */
export interface FlyInput {
  keyDown(code: string): boolean;
  keyUp(code: string): boolean;
  look(dx: number, dy: number): void;
  clear(): void;
}

/**
 * Fly mode's listeners on the view's container `el`. Keys count only while
 * the view itself has focus (not a box or button placed over it), and the
 * keys used are kept from the page. A mouse click takes pointer lock where
 * supported, then mouse moves look; otherwise (and for touch) dragging on
 * the view looks. Losing focus lets go of everything.
 */
export function attachFly(el: HTMLElement, f: FlyInput): () => void {
  const prevTabIndex = el.getAttribute("tabindex");
  const prevTouchAction = el.style.touchAction;
  el.tabIndex = 0;
  el.style.touchAction = "none";
  const onView = (target: EventTarget | null) => target === el || target instanceof HTMLCanvasElement;
  const locked = () => typeof document !== "undefined" && document.pointerLockElement === el;
  let drag: { id: number; x: number; y: number } | null = null;

  const keydown = (e: KeyboardEvent) => {
    if (!onView(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (f.keyDown(e.code)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const keyup = (e: KeyboardEvent) => {
    if (f.keyUp(e.code) && onView(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const blur = () => f.clear();

  const down = (e: PointerEvent) => {
    if (!onView(e.target)) return;
    el.focus({ preventScroll: true });
    if (e.pointerType === "mouse" && typeof el.requestPointerLock === "function" && !locked()) {
      try {
        const p = el.requestPointerLock() as unknown;
        if (p instanceof Promise) p.catch(() => {});
      } catch {
        // Not supported here: dragging looks instead.
      }
    }
    if (drag === null) drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const move = (e: PointerEvent) => {
    if (locked()) {
      f.look(e.movementX ?? 0, e.movementY ?? 0);
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    f.look(e.clientX - drag.x, e.clientY - drag.y);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const up = (e: PointerEvent) => {
    if (drag && drag.id === e.pointerId) drag = null;
  };
  const menu = (e: Event) => {
    if (onView(e.target)) e.preventDefault();
  };

  el.addEventListener("keydown", keydown);
  el.addEventListener("keyup", keyup);
  el.addEventListener("blur", blur);
  el.addEventListener("pointerdown", down);
  el.addEventListener("contextmenu", menu);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  return () => {
    el.removeEventListener("keydown", keydown);
    el.removeEventListener("keyup", keyup);
    el.removeEventListener("blur", blur);
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("contextmenu", menu);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    if (locked()) document.exitPointerLock?.();
    if (prevTabIndex === null) el.removeAttribute("tabindex");
    else el.setAttribute("tabindex", prevTabIndex);
    el.style.touchAction = prevTouchAction;
  };
}
