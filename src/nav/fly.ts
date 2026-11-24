// Fly mode (design section 4): free flight through `setFlightInput` and
// `setSpeed`. Keys, the touch joystick, and the boost button are turned into
// one held flight input; looking with the mouse or a finger turns the camera
// in place with `setCamera`. The pure parts (keys and joystick to flight
// input) come first; the controller and the DOM listeners after.

import type { FlightInput, Pose, Renderer, Vec3 } from "3gix-renderer";
import { EARTH_FRAME, RIDE } from "../earth";
import { headingTilt, type Quat } from "../geo/enu";
import { groundUnder } from "../geo/ground";
import { fromPosition, rad } from "../geo/wgs84";
import { turned } from "../view";
import { speedFor, withClearance } from "./math";

/** Arrow keys turn this much each renderer tick (about 1.2 radians a second at 60 ticks a second). */
export const KEY_LOOK = 0.02;
/** Mouse or finger look, radians per pixel. */
export const DRAG_LOOK = 0.003;
/** Looking up or down stops short of straight up or down. */
const MAX_LOOK_TILT = rad(89);

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
 * along its -z). `look` is yaw (positive left), pitch (positive up), roll.
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
  const look: Vec3 = [(k("ArrowLeft") - k("ArrowRight")) * KEY_LOOK, (k("ArrowUp") - k("ArrowDown")) * KEY_LOOK, 0];
  return { move, look, boost: boostButton || keys.has("ShiftLeft") || keys.has("ShiftRight") };
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

export class FlyController {
  private keys = new Set<string>();
  private stick: Stick = ZERO;
  private boost = false;
  private speed = 0;
  private sent: FlightInput | null = null;

  constructor(private readonly r: FlyRenderer) {
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
    return true;
  }

  keyUp(code: string): boolean {
    if (!FLY_KEYS.has(code)) return false;
    this.keys.delete(code);
    this.send();
    return true;
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
    const pose = this.r.getCamera();
    if (pose.frameId !== EARTH_FRAME) return;
    const { heading, tilt } = headingTilt(pose.position, pose.orientation as Quat);
    const t = Math.max(-MAX_LOOK_TILT, Math.min(MAX_LOOK_TILT, tilt + dy * DRAG_LOOK));
    this.r.setCamera(turned(pose, heading + dx * DRAG_LOOK, t), RIDE);
  }

  /** Lets go of every key, the stick, and boost, and clears the renderer's flight input. */
  clear(): void {
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
