// The exposed module `./EarthApp`: the renderer filling its parent, with
// this app owning all input (design sections 1 and 3), the readout,
// compass, inspect, search, bookmarks, address bar, and debug panel
// (sections 5 to 7).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, CircularProgress, CssBaseline, Snackbar, ThemeProvider, createTheme, useMediaQuery } from "@mui/material";
import { GxRenderer, type Connection, type Hit, type Pose, type Renderer } from "3gix-renderer";
import { hubBase, loadConfig, missingVariables, type EarthConfig } from "./config";
import { DEFAULT_START, EARTH_FRAME, RIDE } from "./earth";
import { fromPosition } from "./geo/wgs84";
import { latestSolarNoon } from "./geo/solar";
import { headingTilt, wgs84Mismatch, type Quat } from "./geo/enu";
import { Compass, ReadoutPanel, Settings, type SettingsState } from "./controls";
import { APIProvider } from "@vis.gl/react-google-maps";
import { DebugPanel } from "./DebugPanel";
import { PlaceSearch, SearchBox, type FoundPlace } from "./search";
import { BookmarksPanel } from "./BookmarksPanel";
import { addBookmark, loadBookmarks, removeBookmark, renameBookmark, saveBookmarks, type Bookmark } from "./bookmarks";
import { fly, framing } from "./flight";
import { NavController } from "./nav/controller";
import { attachInput } from "./nav/input";
import { FlyController, attachFly } from "./nav/fly";
import { BoostButton, Joystick, ModeToggle } from "./flyControls";
import { loadMode, saveMode, type NavMode } from "./mode";
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
  renderer.setCamera(poseOf(renderer, place, renderer.getCamera().speed), RIDE);
}

export default function EarthApp() {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsState>(() => ({ hud: false, debug: debugFromSearch(window.location.search) }));
  const [readout, setReadout] = useState<Readout | null>(null);
  const [debug, setDebug] = useState<DebugView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [renderer, setRenderer] = useState<Renderer | null>(null);
  const navRef = useRef<NavController | null>(null);
  const flyRef = useRef<FlyController | null>(null);
  const [mode, setModeState] = useState<NavMode>(() => loadMode());
  const setMode = useCallback((m: NavMode) => {
    setModeState(m);
    saveMode(m);
  }, []);
  // The touch controls: on touch devices or narrow screens, in Fly mode.
  const coarse = useMediaQuery("(pointer: coarse)");
  const narrow = useMediaQuery("(max-width: 599.95px)");
  const viewRef = useRef<HTMLDivElement | null>(null);
  const checkedFrames = useRef(false);
  const stopFlight = useRef<(() => void) | null>(null);
  const [bookmarks, setBookmarksState] = useState<Bookmark[]>(() => loadBookmarks());
  const setBookmarks = useCallback((fn: (l: Bookmark[]) => Bookmark[]) => {
    setBookmarksState((l) => {
      const next = fn(l);
      saveBookmarks(next);
      return next;
    });
  }, []);
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
    setRenderer(renderer);
  }, []);

  // Navigation (section 4): in Earth mode pointer input on the view and the
  // controller owning the camera; in Fly mode keys, look, and the touch
  // controls through the flight input. Switching never moves the camera:
  // the old mode's cleanup only lets go of its input.
  useEffect(() => {
    const el = viewRef.current;
    if (!renderer || !el) return;
    if (mode === "fly") {
      const fly = new FlyController(renderer);
      flyRef.current = fly;
      const detach = attachFly(el, fly);
      return () => {
        detach();
        fly.dispose();
        flyRef.current = null;
      };
    }
    const nav = new NavController(renderer, { size: () => ({ width: el.clientWidth, height: el.clientHeight }) });
    navRef.current = nav;
    const detach = attachInput(el, nav);
    return () => {
      detach();
      nav.dispose();
      navRef.current = null;
    };
  }, [renderer, mode]);

  // A flight (search result, bookmark) stops when the person takes the
  // camera: any press, wheel, or key on the view, or a mode switch.
  const flyTo = useCallback((place: Place) => {
    const r = rendererRef.current;
    if (!r) return;
    stopFlight.current?.();
    stopFlight.current = fly(r, place);
  }, []);
  useEffect(() => {
    const el = viewRef.current;
    const stop = (e: Event) => {
      const t = e.target;
      if (t === el || t instanceof HTMLCanvasElement) {
        stopFlight.current?.();
        stopFlight.current = null;
      }
    };
    if (!el) return;
    el.addEventListener("pointerdown", stop, true);
    el.addEventListener("wheel", stop, true);
    el.addEventListener("keydown", stop, true);
    return () => {
      el.removeEventListener("pointerdown", stop, true);
      el.removeEventListener("wheel", stop, true);
      el.removeEventListener("keydown", stop, true);
      stopFlight.current?.();
      stopFlight.current = null;
    };
  }, [renderer, mode]);

  const onPlace = useCallback(
    (p: FoundPlace) => {
      const r = rendererRef.current;
      const el = viewRef.current;
      if (!r) return;
      const aspect = el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : 16 / 9;
      flyTo(framing(p.location, p.viewport, rad(r.getFov()), aspect));
      setMessage(p.name);
    },
    [flyTo],
  );

  const saveView = useCallback(
    (name: string) => {
      const r = rendererRef.current;
      if (!r) return;
      const pose = r.getCamera();
      if (pose.frameId !== EARTH_FRAME) return;
      const { elevation: _, ...place } = readoutOf(r, pose);
      setBookmarks((l) => addBookmark(l, name, place));
    },
    [setBookmarks],
  );

  // The readout also refreshes when tiles arrive under a still camera.
  const refreshReadout = useCallback(() => {
    const r = rendererRef.current;
    if (!r) return;
    const pose = r.getCamera();
    if (pose.frameId === EARTH_FRAME) throttles.readout.push(pose);
  }, [throttles]);

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
      navRef.current?.onCamera(pose);
      flyRef.current?.onCamera(pose);
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
    r.setCamera(turned(pose, h, t), RIDE);
  }, []);

  const goTo = useCallback((at: LatLng) => {
    const r = rendererRef.current;
    if (!r) return;
    const pose = r.getCamera();
    const now = readoutOf(r, pose);
    r.setCamera(poseOf(r, { ...now, lat: rad(at.lat), lon: rad(at.lng) }, pose.speed), RIDE);
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
    const overlay = (
      <>
        <PlaceSearch onPlace={onPlace} />
        {settings.debug && <DebugPanel mapsKey={config.mapsKey} view={debug} onGo={goTo} />}
      </>
    );
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
          onSettled={refreshReadout}
          onStats={refreshReadout}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
        {readout && <ReadoutPanel readout={readout} onCopy={copy} />}
        <Compass heading={readout?.heading ?? 0} onNorthUp={() => turn((_, t) => [0, t])} onStraightDown={() => turn((h) => [h, Math.PI / 2])} />
        <Settings value={settings} onChange={setSettings} />
        <ModeToggle mode={mode} onChange={setMode} />
        {mode === "fly" && renderer && (coarse || narrow) && (
          <>
            <Joystick onStick={(s) => flyRef.current?.setStick(s)} />
            <BoostButton onBoost={(on) => flyRef.current?.setBoost(on)} />
          </>
        )}
        {config.mapsKey !== "" ? (
          <APIProvider apiKey={config.mapsKey}>{overlay}</APIProvider>
        ) : (
          <>
            <SearchBox api={null} onPlace={onPlace} />
            {settings.debug && <DebugPanel mapsKey="" view={debug} onGo={goTo} />}
          </>
        )}
        <BookmarksPanel
          list={bookmarks}
          onSave={saveView}
          onGo={(b) => flyTo(b.place)}
          onRename={(id, name) => setBookmarks((l) => renameBookmark(l, id, name))}
          onDelete={(id) => setBookmarks((l) => removeBookmark(l, id))}
        />
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
