import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GxRendererProps } from "3gix-renderer";
import { hubBase } from "./config";
import { DEFAULT_START, EARTH_FRAME } from "./earth";
import { latestSolarNoon } from "./geo/solar";
import { deg, fromPosition, rad, toPosition } from "./geo/wgs84";
import { headingTilt, orientationFrom, type Quat } from "./geo/enu";

// The package's Renderer and GxRenderer are mocked: no GPU, no hub.
const mock = vi.hoisted(() => ({
  props: null as GxRendererProps | null,
  renderer: {
    placeOver: vi.fn(),
    setCamera: vi.fn(),
    getCamera: vi.fn(() => ({ frameId: 4, position: [0, 0, 7e6], orientation: [0, 0, 0, 1], speed: 25 })),
    surfaceHeight: vi.fn(() => null),
    raycast: vi.fn(() => null),
    frames: vi.fn(() => []),
    getFov: vi.fn(() => 50),
    setTime: vi.fn(),
    setControls: vi.fn(),
    setHud: vi.fn(),
  },
}));

vi.mock("./DebugPanel", () => ({ DebugPanel: () => <div data-testid="debug-panel" /> }));

vi.mock("3gix-renderer", () => ({
  Renderer: class {},
  GxRenderer: (props: GxRendererProps) => {
    mock.props = props;
    return <canvas data-testid="gx" />;
  },
}));

import EarthApp from "./EarthApp";

const NOW = Date.UTC(2026, 10, 23, 22, 0);

function serveConfig(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

beforeEach(() => {
  mock.props = null;
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("EarthApp", () => {
  it("passes the hub base and keys from the config, with controls none and the HUD off", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "build", mapsKey: "maps" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/earth-config\.json$/));
    expect(mock.props?.connection).toEqual({ hubUrl: hubBase(), apiKey: "key", spaceId: "space", buildId: "build" });
    expect(mock.props?.controls).toBe("none");
    expect(mock.props?.hud).toBe(false);
  });

  it("places the camera at the start facing north and sets the clock to local noon after ready", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    expect(mock.renderer.setCamera).not.toHaveBeenCalled();
    act(() => mock.props?.onReady?.(mock.renderer as never));

    expect(mock.renderer.setCamera).toHaveBeenCalledTimes(1);
    const pose = mock.renderer.setCamera.mock.calls[0][0];
    expect(pose.frameId).toBe(EARTH_FRAME);
    expect(pose.speed).toBe(25);
    const at = fromPosition(pose.position);
    expect(deg(at.lat)).toBeCloseTo(46.8721, 9);
    expect(deg(at.lon)).toBeCloseTo(-113.994, 9);
    // No tile loaded: the ellipsoid is the ground.
    expect(at.height).toBeCloseTo(20_000, 6);
    const ht = headingTilt(pose.position, pose.orientation as Quat);
    expect(ht.heading).toBeCloseTo(0, 9);
    expect(deg(ht.tilt)).toBeCloseTo(45, 9);

    const noon = mock.renderer.setTime.mock.calls[0][0] as number;
    expect(noon).toBe(latestSolarNoon(DEFAULT_START.lon, NOW));
    expect(noon).toBeLessThanOrEqual(NOW);
    // 23 November 2026 at about 113.994 W: solar noon near 19:22 UTC.
    expect(Math.abs(noon - Date.UTC(2026, 10, 23, 19, 22))).toBeLessThan(3 * 60_000);
  });

  it("starts where the address bar says", async () => {
    window.history.replaceState(null, "", "/?lat=10&lon=20&h=500&heading=90&tilt=60");
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    act(() => mock.props?.onReady?.(mock.renderer as never));
    const pose = mock.renderer.setCamera.mock.calls[0][0];
    const at = fromPosition(pose.position);
    expect(deg(at.lat)).toBeCloseTo(10, 6);
    expect(at.height).toBeCloseTo(500, 6);
    expect(deg(headingTilt(pose.position, pose.orientation as Quat).heading)).toBeCloseTo(90, 6);
  });

  it("shows the readout and compass from camera events, writes the URL, and turns north up in place", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    act(() => mock.props?.onReady?.(mock.renderer as never));
    const position = toPosition({ lat: rad(46.8721), lon: rad(-113.994), height: 21_000 });
    const pose = { frameId: 4, position, orientation: orientationFrom(position, rad(90), rad(45)), speed: 25 };
    mock.renderer.surfaceHeight.mockReturnValue({ height: 1000, level: 10, finer: false } as never);
    mock.renderer.getCamera.mockReturnValue(pose as never);
    act(() => mock.props?.onCamera?.(pose));
    const readout = await screen.findByLabelText("readout");
    expect(readout.textContent).toContain("46.87210\u00b0 N");
    expect(readout.textContent).toContain("113.99400\u00b0 W");
    expect(readout.textContent).toContain("20.0 km");
    expect(readout.textContent).toContain("Heading 90.0");
    expect(new URLSearchParams(window.location.search).get("heading")).toBe("90.00");

    mock.renderer.setCamera.mockClear();
    fireEvent.click(screen.getByLabelText("north up"));
    const north = mock.renderer.setCamera.mock.calls[0][0];
    expect(north.position).toEqual(position);
    expect(headingTilt(north.position, north.orientation as Quat).heading).toBeCloseTo(0, 9);
    expect(deg(headingTilt(north.position, north.orientation as Quat).tilt)).toBeCloseTo(45, 9);

    mock.renderer.setCamera.mockClear();
    fireEvent.click(screen.getByText("Down"));
    const down = mock.renderer.setCamera.mock.calls[0][0];
    expect(down.position).toEqual(position);
    expect(deg(headingTilt(down.position, down.orientation as Quat).tilt)).toBeCloseTo(90, 6);
  });

  it("reports what a click hit", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    const hit = toPosition({ lat: rad(-12.5), lon: rad(30), height: 250 });
    act(() => mock.props?.onHit?.({ hit: { frameId: 4, position: hit, distance: 10, kind: "surface" }, x: 1, y: 2, button: 0 }));
    expect((await screen.findByText(/12\.50000\u00b0 S 30\.00000\u00b0 E, elevation 250 m/)).textContent).toBeTruthy();
  });

  it("shows the debug panel with debug=1", async () => {
    window.history.replaceState(null, "", "/?debug=1");
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "maps" });
    render(<EarthApp />);
    expect(await screen.findByTestId("debug-panel")).toBeTruthy();
  });

  it("names a missing setting", async () => {
    serveConfig({ apiKey: "", spaceId: "space", buildId: "", mapsKey: "" });
    render(<EarthApp />);
    expect(await screen.findByText(/GX_API_KEY/)).toBeTruthy();
    expect(screen.queryByTestId("gx")).toBeNull();
  });

  it("shows a config that cannot be loaded", async () => {
    serveConfig({}, 404);
    render(<EarthApp />);
    expect(await screen.findByText(/earth-config\.json.*404/)).toBeTruthy();
  });

  it("shows a renderer error", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    act(() => mock.props?.onError?.("WebGPU is not available"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("WebGPU is not available"));
  });
});
