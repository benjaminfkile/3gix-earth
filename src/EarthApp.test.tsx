import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { GxRendererProps } from "3gix-renderer";
import { hubBase } from "./config";
import { DEFAULT_START, EARTH_FRAME } from "./earth";
import { latestSolarNoon } from "./geo/solar";
import { deg, fromDirection } from "./geo/wgs84";

// The package's Renderer and GxRenderer are mocked: no GPU, no hub.
const mock = vi.hoisted(() => ({
  props: null as GxRendererProps | null,
  renderer: {
    placeOver: vi.fn(),
    setTime: vi.fn(),
    setControls: vi.fn(),
    setHud: vi.fn(),
  },
}));

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

  it("places the camera at the start and sets the clock to local noon after ready", async () => {
    serveConfig({ apiKey: "key", spaceId: "space", buildId: "", mapsKey: "" });
    render(<EarthApp />);
    await screen.findByTestId("gx");
    expect(mock.renderer.placeOver).not.toHaveBeenCalled();
    act(() => mock.props?.onReady?.(mock.renderer as never));

    expect(mock.renderer.placeOver).toHaveBeenCalledTimes(1);
    const [frame, direction, height, pitch] = mock.renderer.placeOver.mock.calls[0];
    expect(frame).toBe(EARTH_FRAME);
    const at = fromDirection(direction);
    expect(deg(at.lat)).toBeCloseTo(46.8721, 9);
    expect(deg(at.lon)).toBeCloseTo(-113.994, 9);
    expect(height).toBe(20_000);
    expect(pitch).toBeCloseTo(45, 12);

    const noon = mock.renderer.setTime.mock.calls[0][0] as number;
    expect(noon).toBe(latestSolarNoon(DEFAULT_START.lon, NOW));
    expect(noon).toBeLessThanOrEqual(NOW);
    // 23 November 2026 at about 113.994 W: solar noon near 19:22 UTC.
    expect(Math.abs(noon - Date.UTC(2026, 10, 23, 19, 22))).toBeLessThan(3 * 60_000);
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
