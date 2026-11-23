// The exposed module `./EarthApp`: the renderer filling its parent, with
// this app owning all input (design sections 1 and 3), the readout,
// compass, inspect, address bar, and debug panel (sections 5 to 7).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, CircularProgress, CssBaseline, Snackbar, ThemeProvider, createTheme } from "@mui/material";
import { GxRenderer, type Connection, type Hit, type Pose, type Renderer } from "3gix-renderer";
import { hubBase, loadConfig, missingVariables, type EarthConfig } from "./config";
import { DEFAULT_START, EARTH_FRAME } from "./earth";
import { fromPosition } from "./geo/wgs84";
import { latestSolarNoon } from "./geo/solar";
import { headingTilt, wgs84Mismatch, type Quat } from "./geo/enu";
import { Compass, ReadoutPanel, Settings, type SettingsState } from "./controls";
import { DebugPanel } from "./DebugPanel";
import {
  debugFromSearch,
  debugView,
  formatAngle,
  formatLength,
  placeFromSearch,
  poseOf,
  readoutOf,
  searchWithPlace,
  throttle,
  turned,
  type DebugView,
  type LatLng,
  type Place,
  type Readout,
} from "./view";
import { rad } from "./geo/wgs84";

const theme = createTheme({ palette: { mode: "dark" } });

type Loaded = { state: "loading" } | { state: "failed"; message: string } | { state: "ready"; config: EarthConfig };

/** The start place: the address bar's when it holds one (section 6), else the default (section 3). */
export function startPlace(search: string = window.location.search): Place {
  return placeFromSearch(search) ?? DEFAULT_START;
}

/**
 * Sets the clock to the latest local solar noon at a place, then places the
 * camera there (facing its heading and tilt). The clock goes first: a camera
 * placed with `setCamera` is free, and a later time change leaves it where it
 * is in space while Earth moves on along its orbit.
 */
export function startView(renderer: Renderer, place: Place = startPlace(), nowMs: number = Date.now()): void {
  renderer.setTime(latestSolarNoon(place.lon, nowMs));
  renderer.setCamera(poseOf(renderer, place, renderer.getCamera().speed));
}

export default function EarthApp() {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsState>(() => ({ hud: false, debug: debugFromSearch(window.location.search) }));
  const [readout, setReadout] = useState<Readout | null>(null);
  const [debug, setDebug] = useState<DebugView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);
  const checkedFrames = useRef(false);
  const debugOn = useRef(settings.debug);
  debugOn.current = settings.debug;

  useEffect(() => {
    let live = true;
    loadConfig()
      .then((config) => live && setLoaded({ state: "ready", config }))
      .catch((e: unknown) => live && setLoaded({ state: "failed", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, []);

  // Readout and compass at 10 a second, address bar at 2, debug maps at 5.
  const throttles = useMemo(
    () => ({
      readout: throttle<Pose>(100, (pose) => {
        const r = rendererRef.current;
        if (r) setReadout(readoutOf(r, pose));
      }),
      url: throttle<Pose>(500, (pose) => {
        const r = rendererRef.current;
        if (!r) return;
        const search = searchWithPlace(window.location.search, readoutOf(r, pose));
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
      }),
      debug: throttle<Pose>(200, (pose) => {
        const r = rendererRef.current;
        if (!r || !debugOn.current) return;
        const el = viewRef.current;
        const hit = el ? r.raycast(el.clientWidth / 2, el.clientHeight / 2) : null;
        setDebug(debugView(pose, hit && hit.frameId === EARTH_FRAME ? hit.position : null, r.getFov()));
      }),
    }),
    [],
  );
  useEffect(() => () => Object.values(throttles).forEach((t) => t.cancel()), [throttles]);

  const config = loaded.state === "ready" ? loaded.config : null;
  const missing = config ? missingVariables(config) : [];
  const connection = useMemo<Connection | null>(
    () => (config ? { hubUrl: hubBase(), apiKey: config.apiKey, spaceId: config.spaceId, buildId: config.buildId } : null),
    [config],
  );

  const onReady = useCallback((renderer: Renderer) => {
    rendererRef.current = renderer;
    try {
      startView(renderer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onCamera = useCallback(
    (pose: Pose) => {
      if (pose.frameId !== EARTH_FRAME) return;
      const r = rendererRef.current;
      if (r && !checkedFrames.current) {
        const frame = r.frames().find((f) => f.id === EARTH_FRAME);
        if (frame?.surface) {
          checkedFrames.current = true;
          const m = wgs84Mismatch(frame);
          if (m) console.warn(m);
        }
      }
      throttles.readout.push(pose);
      throttles.url.push(pose);
      throttles.debug.push(pose);
    },
    [throttles],
  );

  const onHit = useCallback((h: Hit) => {
    if (!h.hit || h.hit.frameId !== EARTH_FRAME) {
      setMessage("Nothing on Earth there");
      return;
    }
    const g = fromPosition(h.hit.position);
    setMessage(`${formatAngle(g.lat, "N", "S")} ${formatAngle(g.lon, "E", "W")}, elevation ${formatLength(g.height)} above the ellipsoid`);
  }, []);

  /** Turns the camera without moving it. */
  const turn = useCallback((fn: (heading: number, tilt: number) => [number, number]) => {
    const r = rendererRef.current;
    if (!r) return;
    const pose = r.getCamera();
    const { heading, tilt } = headingTilt(pose.position, pose.orientation as Quat);
    const [h, t] = fn(heading, tilt);
    r.setCamera(turned(pose, h, t));
  }, []);

  const goTo = useCallback((at: LatLng) => {
    const r = rendererRef.current;
    if (!r) return;
    const pose = r.getCamera();
    const now = readoutOf(r, pose);
    r.setCamera(poseOf(r, { ...now, lat: rad(at.lat), lon: rad(at.lng) }, pose.speed));
  }, []);

  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => setMessage(`Copied ${text}`),
      () => setMessage(text),
    );
  }, []);

  let body;
  if (loaded.state === "loading") {
    body = <CircularProgress sx={{ position: "absolute", top: "50%", left: "50%", ml: -2.5, mt: -2.5 }} />;
  } else if (loaded.state === "failed") {
    body = <Alert severity="error">{loaded.message}</Alert>;
  } else if (missing.length > 0) {
    body = (
      <Alert severity="error">
        Missing setting: {missing.join(", ")}. Set {missing.length > 1 ? "them" : "it"} in the dev server's environment.
      </Alert>
    );
  } else if (connection && config) {
    body = (
      <>
        <GxRenderer
          connection={connection}
          controls="none"
          hud={settings.hud}
          onReady={onReady}
          onError={setError}
          onCamera={onCamera}
          onHit={onHit}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
        {readout && <ReadoutPanel readout={readout} onCopy={copy} />}
        <Compass heading={readout?.heading ?? 0} onNorthUp={() => turn((_, t) => [0, t])} onStraightDown={() => turn((h) => [h, Math.PI / 2])} />
        <Settings value={settings} onChange={setSettings} />
        {settings.debug && <DebugPanel mapsKey={config.mapsKey} view={debug} onGo={goTo} />}
        <Snackbar open={message !== null} autoHideDuration={6000} onClose={() => setMessage(null)} message={message ?? ""} anchorOrigin={{ vertical: "top", horizontal: "center" }} />
      </>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box ref={viewRef} sx={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", bgcolor: "black" }}>
        {body}
        {error !== null && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ position: "absolute", top: 8, left: 8, right: 8 }}>
            {error}
          </Alert>
        )}
      </Box>
    </ThemeProvider>
  );
}
