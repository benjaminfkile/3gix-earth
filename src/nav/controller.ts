// The navigation controller: owns the camera in Earth mode (design section
// 4). It reads the pose from the renderer's `camera` event (`onCamera`) and
// writes with `setCamera(pose, { ride: true })`. Every write keeps the
// ground clearance and sets the speed from the height above the ground.

import type { Pose, Renderer, Vec3 } from "3gix-renderer";
import { EARTH_FRAME, RIDE } from "../earth";
import { headingTilt, rayEllipsoid, type Quat } from "../geo/enu";
import { groundUnder } from "../geo/ground";
import { fromPosition, rad } from "../geo/wgs84";
import type { Gestures, Pinch } from "./input";
import { between, orbit, pan, pixelRay, raySphere, speedFor, withClearance, zoomTilt, zoomToward } from "./math";

/** What the controller needs from the renderer. */
export type NavRenderer = Pick<Renderer, "setCamera" | "getCamera" | "raycast" | "surfaceHeight" | "getFov">;

/** Radians of turn or tilt per pixel of drag. */
const TURN_PER_PX = 0.005;
/** Wheel: the distance to the point is multiplied by exp(notches times this). */
const WHEEL_RATE = 0.2;
/** Double click: how far the flight goes, as the distance left over the distance before. */
const FLY_FACTOR = 0.35;
/** Double click flight time, seconds. */
export const FLY_SECONDS = 0.8;
/** Never farther from Earth's center than this, meters (out past the Moon's orbit is no use here). */
const MAX_RADIUS = 1e8;

export interface NavOptions {
  /** The view's size in CSS pixels. */
  size(): { width: number; height: number };
  frame?: (fn: () => void) => number;
  cancelFrame?: (id: number) => void;
  now?: () => number;
}

export class NavController implements Gestures {
  private pose: Pose | null = null;
  private grab: Vec3 | null = null;
  private flight: number | null = null;
  /** The tilt the user chose, which zoom eases away from far out and back to close in. */
  private userTilt: number | null = null;
  /** The tilt the last zoom left; any other tilt now means the user (or a control) changed it. */
  private zoomLeft: number | null = null;
  private readonly frame: (fn: () => void) => number;
  private readonly cancelFrame: (id: number) => void;
  private readonly now: () => number;

  constructor(
    private readonly r: NavRenderer,
    private readonly opts: NavOptions,
  ) {
    this.frame = opts.frame ?? ((fn) => requestAnimationFrame(fn));
    this.cancelFrame = opts.cancelFrame ?? ((id) => cancelAnimationFrame(id));
    this.now = opts.now ?? (() => performance.now());
  }

  /** The `camera` event. */
  onCamera(pose: Pose): void {
    if (pose.frameId === EARTH_FRAME) this.pose = pose;
  }

  private current(): Pose | null {
    if (!this.pose) {
      const p = this.r.getCamera();
      if (p.frameId === EARTH_FRAME) this.pose = p;
    }
    return this.pose;
  }

  /** Writes a pose: clearance, speed from height, ride with Earth. */
  write(pose: Pose): Pose {
    const g = fromPosition(pose.position);
    if (!Number.isFinite(g.height) || Math.hypot(...pose.position) > MAX_RADIUS) return this.pose ?? pose;
    const ground = groundUnder(this.r, pose.position);
    const safe = withClearance(pose, ground.elevation);
    const out = { ...safe, speed: speedFor(fromPosition(safe.position).height - ground.elevation) };
    this.r.setCamera(out, RIDE);
    this.pose = out;
    return out;
  }

  private ray(pose: Pose, x: number, y: number): Vec3 {
    const { width, height } = this.opts.size();
    return pixelRay(pose.orientation as Quat, x, y, width, height, rad(this.r.getFov()));
  }

  /** The ground point under a pixel: `raycast`, falling back to the reference ellipsoid. */
  groundAt(x: number, y: number): Vec3 | null {
    const pose = this.current();
    if (!pose) return null;
    const hit = this.r.raycast(x, y);
    if (hit && hit.frameId === EARTH_FRAME) return hit.position;
    return rayEllipsoid(pose.position, this.ray(pose, x, y));
  }

  private stopFlight(): void {
    if (this.flight !== null) this.cancelFrame(this.flight);
    this.flight = null;
  }

  press(): void {
    this.stopFlight();
  }

  panStart(x: number, y: number): void {
    this.grab = this.groundAt(x, y);
  }

  panMove(x: number, y: number): void {
    const pose = this.current();
    if (!pose || !this.grab) return;
    const under = raySphere(pose.position, this.ray(pose, x, y), Math.hypot(...this.grab));
    if (!under) return;
    const next = pan(pose, this.grab, under);
    if (next !== pose) this.write(next);
  }

  private zoomAt(x: number, y: number, factor: number): void {
    const pose = this.current();
    if (!pose || factor === 1) return;
    const target = this.groundAt(x, y);
    if (!target) return;
    const tilt = headingTilt(pose.position, pose.orientation as Quat).tilt;
    if (this.userTilt === null || this.zoomLeft === null || Math.abs(tilt - this.zoomLeft) > 1e-3) this.userTilt = tilt;
    let next = zoomToward(pose, target, Math.min(5, Math.max(0.2, factor)));
    // Far out the view eases toward straight down around the zoom target,
    // so the target stays under the camera instead of over the horizon.
    const ground = groundUnder(this.r, next.position).elevation;
    const want = zoomTilt(this.userTilt, fromPosition(next.position).height - ground);
    if (Math.abs(want - tilt) > 1e-6) next = orbit(next, target, 0, want - tilt);
    const out = this.write(next);
    this.zoomLeft = headingTilt(out.position, out.orientation as Quat).tilt;
  }

  /** Wheel notches (normalized by the input), down (zoom out) positive. */
  wheel(x: number, y: number, notches: number): void {
    this.zoomAt(x, y, Math.exp(notches * WHEEL_RATE));
  }

  /** Tilt and turn around the ground point at the screen center. */
  orbit(dx: number, dy: number): void {
    this.turn(-dx * TURN_PER_PX, dy * TURN_PER_PX);
  }

  private turn(dHeading: number, dTilt: number): void {
    const pose = this.current();
    if (!pose || (dHeading === 0 && dTilt === 0)) return;
    const { width, height } = this.opts.size();
    const pivot = this.groundAt(width / 2, height / 2);
    if (!pivot) return;
    this.write(orbit(pose, pivot, dHeading, dTilt));
  }

  pinch(p: Pinch): void {
    this.zoomAt(p.x, p.y, p.factor);
    this.turn(-p.twist, p.dy * TURN_PER_PX);
  }

  /** Flies toward the point, animated over FLY_SECONDS with easing. */
  double(x: number, y: number): void {
    const pose = this.current();
    if (!pose) return;
    const target = this.groundAt(x, y);
    if (!target) return;
    this.stopFlight();
    const from = pose.position;
    const to = zoomToward(pose, target, FLY_FACTOR).position;
    const start = this.now();
    const step = () => {
      const t = (this.now() - start) / (FLY_SECONDS * 1000);
      const at = this.current() ?? pose;
      this.write({ ...at, position: between(from, to, t) });
      this.flight = t < 1 ? this.frame(step) : null;
    };
    this.flight = this.frame(step);
  }

  dispose(): void {
    this.stopFlight();
  }
}
