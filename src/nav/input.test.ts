import { describe, expect, it, vi } from "vitest";
import { attachInput, type Gestures } from "./input";

function setup() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const g: { [K in keyof Gestures]: ReturnType<typeof vi.fn> } = {
    press: vi.fn(),
    panStart: vi.fn(),
    panMove: vi.fn(),
    orbit: vi.fn(),
    pinch: vi.fn(),
    wheel: vi.fn(),
    double: vi.fn(),
  };
  let t = 0;
  const detach = attachInput(el, g as unknown as Gestures, () => t);
  const fire = (type: string, target: EventTarget, init: Record<string, unknown>) => {
    const e = new MouseEvent(type, { bubbles: true, clientX: init.x as number, clientY: init.y as number, button: (init.button as number) ?? 0, ctrlKey: !!init.ctrl });
    Object.assign(e, { pointerId: init.id ?? 1, pointerType: init.type ?? "mouse" });
    target.dispatchEvent(e);
  };
  return { el, g, detach, fire, tick: (ms: number) => (t += ms) };
}

describe("input", () => {
  it("sets touch-action none on the view", () => {
    const { el, detach } = setup();
    expect(el.style.touchAction).toBe("none");
    detach();
  });

  it("a press that moves less than 4 px is a click, not a pan", () => {
    const { el, g, fire, detach } = setup();
    fire("pointerdown", el, { x: 10, y: 10 });
    fire("pointermove", window, { x: 12, y: 12 });
    fire("pointerup", window, { x: 12, y: 12 });
    expect(g.panStart).not.toHaveBeenCalled();
    expect(g.panMove).not.toHaveBeenCalled();
    detach();
  });

  it("a left drag pans from the press point", () => {
    const { el, g, fire, detach } = setup();
    fire("pointerdown", el, { x: 10, y: 10 });
    fire("pointermove", window, { x: 20, y: 10 });
    fire("pointermove", window, { x: 30, y: 10 });
    fire("pointerup", window, { x: 30, y: 10 });
    expect(g.panStart).toHaveBeenCalledWith(10, 10);
    expect(g.panMove).toHaveBeenLastCalledWith(30, 10);
    detach();
  });

  it("right drag and ctrl drag orbit", () => {
    const { el, g, fire, detach } = setup();
    fire("pointerdown", el, { x: 10, y: 10, button: 2 });
    fire("pointermove", window, { x: 20, y: 15 });
    fire("pointerup", window, { x: 20, y: 15 });
    fire("pointerdown", el, { x: 10, y: 10, ctrl: true });
    fire("pointermove", window, { x: 10, y: 30 });
    fire("pointerup", window, { x: 10, y: 30 });
    expect(g.orbit).toHaveBeenNthCalledWith(1, 10, 5);
    expect(g.orbit).toHaveBeenNthCalledWith(2, 0, 20);
    expect(g.panStart).not.toHaveBeenCalled();
    detach();
  });

  it("two quick taps are a double tap", () => {
    const { el, g, fire, tick, detach } = setup();
    for (let i = 0; i < 2; i++) {
      fire("pointerdown", el, { x: 50, y: 60, type: "touch" });
      fire("pointerup", window, { x: 50, y: 60, type: "touch" });
      tick(100);
    }
    expect(g.double).toHaveBeenCalledWith(50, 60);
    detach();
  });

  it("two fingers pinch, twist, and tilt", () => {
    const { el, g, fire, detach } = setup();
    fire("pointerdown", el, { id: 1, x: 100, y: 100, type: "touch" });
    fire("pointerdown", el, { id: 2, x: 200, y: 100, type: "touch" });
    fire("pointermove", window, { id: 2, x: 300, y: 100, type: "touch" });
    expect(g.pinch).toHaveBeenCalledWith({ x: 200, y: 100, factor: 0.5, twist: 0, dy: 0 });
    expect(g.panStart).not.toHaveBeenCalled();
    detach();
  });

  it("ignores presses on the controls over the view", () => {
    const { el, g, fire, detach } = setup();
    const button = document.createElement("button");
    el.appendChild(button);
    fire("pointerdown", button, { x: 10, y: 10 });
    fire("pointermove", window, { x: 40, y: 10 });
    expect(g.press).not.toHaveBeenCalled();
    expect(g.panStart).not.toHaveBeenCalled();
    detach();
  });
});
