import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GxRendererProps } from "3gix-renderer";
import { hubBase } from "./config";
import { DEFAULT_START, EARTH_FRAME } from "./earth";
import { latestSolarNoon } from "./geo/solar";
import { deg, fromPosition, rad, toPosition } from "./geo/wgs84";
import { headingTilt, orientationFrom, type Quat } from "./geo/enu";
import { framing } from "./flight";
import { instantAt } from "./time";

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
    setTimeScale: vi.fn(),
    getTime: vi.fn(() => ({ utcMs: Date.UTC(2026, 10, 23, 19, 36), originUtcMs: 0, nowUtcMs: Date.UTC(2026, 10, 23, 22, 0), timeScale: 1 })),
    layers: vi.fn(() => [
      { id: "terrain", overlay: false, exclusive: false, shown: true },
      { id: "labels", overlay: true, exclusive: false, shown: false },
    ]),
    setShown: vi.fn(),
    getComputeBudget: vi.fn(() => 6),
    setComputeBudget: vi.fn(),
    setControls: vi.fn(),
    setHud: vi.fn(),
    setFlightInput: vi.fn(),
    setSpeed: vi.fn(),
  },
}));

vi.mock("./DebugPanel", () => ({ DebugPanel: () => <div data-testid="debug-panel" /> }));

// The Maps JavaScript API: the provider renders its children, and the
// `places` library is a stand in with one suggestion.
const places = vi.hoisted(() => {
  const place = {
    fetchFields: async () => {},
    displayName: "Missoula",
    location: { lat: () => 46.8721, lng: () => -113.994 },
    viewport: { getNorthEast: () => ({ lat: () => 46.95, lng: () => -113.9 }), getSouthWest: () => ({ lat: () => 46.8, lng: () => -114.1 }) },
  };
  return {
    AutocompleteSessionToken: class {},
    AutocompleteSuggestion: {
      fetchAutocompleteSuggestions: async () => ({
        suggestions: [{ placePrediction: { placeId: "p1", text: { text: "Missoula, MT" }, mainText: { text: "Missoula" }, secondaryText: { text: "MT" }, toPlace: () => place } }],
      }),
    },
  };
});
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMapsLibrary: () => places,
}));

// The flight is checked in flight.test.ts; here only where it goes.
const flights = vi.hoisted(() => ({ fly: vi.fn(() => () => {}) }));
vi.mock("./flight", async (orig) => ({ ...(await orig<typeof import("./flight")>()), fly: flights.fly }));

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
  window.localStorage.clear();
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
    // Rides with Earth, and the clock goes first.
    expect(mock.renderer.setCamera.mock.calls[0][1]).toEqual({ ride: true });
    expect(mock.renderer.setTime.mock.invocationCallOrder[0]).toBeLessThan(
      mock.renderer.setCamera.mock.invocationCallOrder[0],
    );
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

  it("refreshes the ground elevation when tiles arrive under a still camera", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    act(() => mock.props?.onReady?.(mock.renderer as never));
    mock.renderer.surfaceHeight.mockReturnValue({ height: 980, level: 12, finer: false } as never);
    act(() => mock.props?.onSettled?.({ seconds: 1 }));
    const readout = await screen.findByLabelText("readout");
    expect(readout.textContent).toContain("Ground elevation (above ellipsoid) 980 m");
    mock.renderer.surfaceHeight.mockReturnValue(null);
  });

  it("switches to Fly mode and back from the toolbar, remembered, never moving the camera and clearing the flight input", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    const { unmount } = render(<EarthApp />);
    const view = (await screen.findByTestId("gx")).parentElement as HTMLElement;
    act(() => mock.props?.onReady?.(mock.renderer as never));
    mock.renderer.setCamera.mockClear();
    expect(screen.getByRole("button", { name: "Earth" })).toHaveProperty("ariaPressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Fly" }));
    expect(window.localStorage.getItem("gx-earth.mode")).toBe("fly");
    expect(mock.renderer.setSpeed).toHaveBeenCalled();
    fireEvent.keyDown(view, { code: "KeyW" });
    expect(mock.renderer.setFlightInput).toHaveBeenLastCalledWith({ move: [0, 0, -1], look: [0, 0, 0], boost: false });

    fireEvent.click(screen.getByRole("button", { name: "Earth" }));
    expect(mock.renderer.setFlightInput).toHaveBeenLastCalledWith(null);
    expect(window.localStorage.getItem("gx-earth.mode")).toBe("earth");
    // Keys do nothing in Earth mode.
    mock.renderer.setFlightInput.mockClear();
    fireEvent.keyDown(view, { code: "KeyW" });
    expect(mock.renderer.setFlightInput).not.toHaveBeenCalled();
    expect(mock.renderer.setCamera).not.toHaveBeenCalled();
    unmount();

    // Remembered across loads.
    window.localStorage.setItem("gx-earth.mode", "fly");
    render(<EarthApp />);
    await screen.findByTestId("gx");
    expect(screen.getByRole("button", { name: "Fly" })).toHaveProperty("ariaPressed", "true");
  });

  it("searches without moving the camera, then flies to the chosen place's framing", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "maps" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    act(() => mock.props?.onReady?.(mock.renderer as never));
    mock.renderer.setCamera.mockClear();
    const box = screen.getByLabelText("search places");
    box.focus();
    fireEvent.change(box, { target: { value: "Missoula" } });
    fireEvent.keyDown(box, { key: "s" });
    expect(await screen.findByText("MT")).toBeTruthy();
    expect(mock.renderer.setCamera).not.toHaveBeenCalled();
    expect(flights.fly).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Missoula"));
    await waitFor(() => expect(flights.fly).toHaveBeenCalledTimes(1));
    const vp = { north: rad(46.95), south: rad(46.8), east: rad(-113.9), west: rad(-114.1) };
    // jsdom lays out nothing: the view is 0 by 0, so the aspect falls back to 16:9.
    const want = framing({ lat: rad(46.8721), lon: rad(-113.994) }, vp, rad(50), 16 / 9);
    const [r, to] = flights.fly.mock.calls[0] as unknown as [unknown, typeof want];
    expect(r).toBe(mock.renderer);
    expect(to.lat).toBeCloseTo(want.lat, 12);
    expect(to.lon).toBeCloseTo(want.lon, 12);
    expect(to.height).toBeCloseTo(want.height, 6);
    expect(to.heading).toBe(0);
    expect(deg(to.tilt)).toBeCloseTo(45, 9);
  });

  it("saves the view as a bookmark in local storage and flies to it", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    act(() => mock.props?.onReady?.(mock.renderer as never));
    const position = toPosition({ lat: rad(10), lon: rad(20), height: 3000 });
    const original = mock.renderer.getCamera.getMockImplementation()!;
    onTestFinished(() => void mock.renderer.getCamera.mockImplementation(original));
    mock.renderer.getCamera.mockReturnValue({ frameId: 4, position, orientation: orientationFrom(position, rad(90), rad(30)), speed: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Bookmarks" }));
    fireEvent.change(screen.getByLabelText("bookmark name"), { target: { value: "Spot" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const stored = JSON.parse(window.localStorage.getItem("gx-earth.bookmarks") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Spot");
    expect(deg(stored[0].place.lat)).toBeCloseTo(10, 9);
    expect(stored[0].place.height).toBeCloseTo(3000, 6);
    expect(deg(stored[0].place.heading)).toBeCloseTo(90, 9);
    fireEvent.click(screen.getByText("Spot"));
    expect(flights.fly).toHaveBeenCalledWith(mock.renderer, stored[0].place);
  });

  it("sets the time from the slider at the camera's longitude, plays, pauses, and goes to now", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    act(() => mock.props?.onReady?.(mock.renderer as never));
    fireEvent.click(screen.getByRole("button", { name: "Time" }));
    mock.renderer.setTime.mockClear();
    fireEvent.change(screen.getByLabelText("time of day"), { target: { value: 12 * 3600 } });
    const drawn = mock.renderer.getTime().utcMs;
    expect(mock.renderer.setTime).toHaveBeenCalledWith(instantAt(DEFAULT_START.lon, drawn, 12 * 3600));
    // Local mean noon at 113.994 W is 7.5996 h after 12:00 UTC.
    expect(mock.renderer.setTime.mock.calls[0][0]).toBeCloseTo(Date.UTC(2026, 10, 23, 12) + (113.994 / 360) * 86_400_000, 0);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(mock.renderer.setTimeScale).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: "3600x" }));
    fireEvent.click(screen.getByRole("button", { name: "Now" }));
    expect(mock.renderer.setTime).toHaveBeenLastCalledWith(NOW);
  });

  it("shows each layer with a switch that calls setShown, and the compute budget", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    act(() => mock.props?.onReady?.(mock.renderer as never));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    const terrain = screen.getByRole("switch", { name: "terrain" }) as HTMLInputElement;
    expect(terrain.checked).toBe(true);
    fireEvent.click(terrain);
    expect(mock.renderer.setShown).toHaveBeenCalledWith("terrain", false);
    fireEvent.click(screen.getByRole("switch", { name: "labels (overlay)" }));
    expect(mock.renderer.setShown).toHaveBeenCalledWith("labels", true);
    expect(screen.getByText(/Compute budget: 6 of 6 workers/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Compute budget/), { target: { value: 0 } });
    expect(mock.renderer.setComputeBudget).toHaveBeenCalledWith(0);
  });

  it("switches the layout at 600 px: floating panels above, one bottom sheet below", async () => {
    const at = (width: number) =>
      vi.stubGlobal("matchMedia", (query: string) => {
        const max = /max-width:\s*([\d.]+)px/.exec(query);
        return {
          matches: max ? width <= Number(max[1]) : false,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        };
      });
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    at(600);
    const wide = render(<EarthApp />);
    await screen.findByTestId("gx");
    act(() => mock.props?.onReady?.(mock.renderer as never));
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Layers" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "open panels" })).toBeNull();
    wide.unmount();

    at(599);
    render(<EarthApp />);
    await screen.findByTestId("gx");
    act(() => mock.props?.onReady?.(mock.renderer as never));
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Bookmarks" })).toBeNull();
    // Search, compass, and the mode toggle stay on screen.
    expect(screen.getByLabelText("search places")).toBeTruthy();
    expect(screen.getByRole("button", { name: "north up" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fly" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "open panels" }));
    for (const tab of ["Time", "Layers", "Bookmarks", "Settings"]) expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Layers" }));
    fireEvent.click(screen.getByRole("switch", { name: "terrain" }));
    expect(mock.renderer.setShown).toHaveBeenCalledWith("terrain", false);
  });
});
