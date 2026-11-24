// One input path for mouse, touch, and pen over the view's container
// (pointer events), turned into Earth mode gestures (design section 4).
//
// A press that moves less than 4 px before release is a click or tap: it
// is left to the renderer's `hit` event (inspect, section 5 item 3) and
// never pans. Two such taps close together are a double click or tap.

/** Pixels a press must move before it is a drag. */
export const DRAG_PX = 4;
const DOUBLE_MS = 350;
const DOUBLE_PX = 24;

export interface Pinch {
  /** The fingers' midpoint, view pixels. */
  x: number;
  y: number;
  /** The distance between the fingers before over after this move: below 1 when they spread. */
  factor: number;
  /** The fingers' turn since the last move, radians, clockwise on screen. */
  twist: number;
  /** The midpoint's vertical move since the last move, pixels, down positive. */
  dy: number;
}

export interface Gestures {
  /** Any press: stops a running flight. */
  press(): void;
  panStart(x: number, y: number): void;
  panMove(x: number, y: number): void;
  /** Right drag or Ctrl + left drag, pixels since the last move. */
  orbit(dx: number, dy: number): void;
  pinch(p: Pinch): void;
  /** Wheel at a point, pixels, down (zoom out) positive. */
  wheel(x: number, y: number, deltaY: number): void;
  double(x: number, y: number): void;
}

interface Pointer {
  x: number;
  y: number;
}

type Mode =
  | { kind: "idle" }
  | { kind: "pending"; drag: "pan" | "orbit"; startX: number; startY: number }
  | { kind: "pan" }
  | { kind: "orbit"; x: number; y: number }
  | { kind: "pinch"; dist: number; angle: number; midY: number }
  | { kind: "done" };

/** Listens on `el` until the returned function is called. */
export function attachInput(el: HTMLElement, g: Gestures, now: () => number = () => performance.now()): () => void {
  const pointers = new Map<number, Pointer>();
  let mode: Mode = { kind: "idle" };
  let lastTap: { t: number; x: number; y: number } | null = null;
  const prevTouchAction = el.style.touchAction;
  el.style.touchAction = "none";

  const local = (e: { clientX: number; clientY: number }): Pointer => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const two = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
  };

  const startPinch = () => {
    const t = two();
    mode = { kind: "pinch", dist: t.dist, angle: t.angle, midY: t.midY };
  };

  /** Presses on the view itself, not on the controls placed over it. */
  const onView = (target: EventTarget | null) => target === el || target instanceof HTMLCanvasElement;

  const down = (e: PointerEvent) => {
    if (!onView(e.target)) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;
    g.press();
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      const drag = e.button === 2 || e.ctrlKey ? "orbit" : "pan";
      mode = { kind: "pending", drag, startX: p.x, startY: p.y };
    } else if (pointers.size === 2) {
      startPinch();
    }
  };

  const move = (e: PointerEvent) => {
    const p0 = pointers.get(e.pointerId);
    if (!p0) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    switch (mode.kind) {
      case "pending":
        if (Math.hypot(p.x - mode.startX, p.y - mode.startY) < DRAG_PX) return;
        if (mode.drag === "pan") {
          g.panStart(mode.startX, mode.startY);
          g.panMove(p.x, p.y);
          mode = { kind: "pan" };
        } else {
          g.orbit(p.x - mode.startX, p.y - mode.startY);
          mode = { kind: "orbit", x: p.x, y: p.y };
        }
        return;
      case "pan":
        g.panMove(p.x, p.y);
        return;
      case "orbit":
        g.orbit(p.x - mode.x, p.y - mode.y);
        mode = { kind: "orbit", x: p.x, y: p.y };
        return;
      case "pinch": {
        if (pointers.size < 2) return;
        const t = two();
        let twist = t.angle - mode.angle;
        if (twist > Math.PI) twist -= 2 * Math.PI;
        if (twist < -Math.PI) twist += 2 * Math.PI;
        g.pinch({ x: t.midX, y: t.midY, factor: t.dist > 0 ? mode.dist / t.dist : 1, twist, dy: t.midY - mode.midY });
        mode = { kind: "pinch", dist: t.dist, angle: t.angle, midY: t.midY };
        return;
      }
      default:
        return;
    }
  };

  const up = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (mode.kind === "pending" && pointers.size === 0 && e.type === "pointerup") {
      const t = now();
      if (lastTap && t - lastTap.t < DOUBLE_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < DOUBLE_PX) {
        lastTap = null;
        g.double(p.x, p.y);
      } else {
        lastTap = { t, x: p.x, y: p.y };
      }
    } else if (mode.kind !== "pending") {
      lastTap = null;
    }
    if (pointers.size === 2) {
      startPinch();
    } else if (pointers.size === 1) {
      // From a pinch back to one finger: that finger pans from where it is.
      const [rest] = [...pointers.values()];
      mode = mode.kind === "pinch" ? { kind: "pending", drag: "pan", startX: rest.x, startY: rest.y } : mode;
    } else {
      mode = { kind: "idle" };
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    }
  };

  const wheel = (e: WheelEvent) => {
    if (!onView(e.target)) return;
    e.preventDefault();
    g.press();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
    const p = local(e);
    g.wheel(p.x, p.y, e.deltaY * scale);
  };

  const menu = (e: Event) => {
    if (onView(e.target)) e.preventDefault();
  };

  el.addEventListener("pointerdown", down);
  el.addEventListener("wheel", wheel, { passive: false });
  el.addEventListener("contextmenu", menu);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("wheel", wheel);
    el.removeEventListener("contextmenu", menu);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    el.style.touchAction = prevTouchAction;
  };
}
