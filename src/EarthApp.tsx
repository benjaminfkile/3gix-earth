// The exposed module `./EarthApp`: the renderer filling its parent, with
// this app owning all input (design sections 1 and 3).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, CircularProgress, CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { GxRenderer, type Connection, type Renderer } from "3gix-renderer";
import { hubBase, loadConfig, missingVariables, type EarthConfig } from "./config";
import { DEFAULT_START, EARTH_FRAME } from "./earth";
import { deg, toDirection } from "./geo/wgs84";
import { latestSolarNoon } from "./geo/solar";

const theme = createTheme({ palette: { mode: "dark" } });

type Loaded = { state: "loading" } | { state: "failed"; message: string } | { state: "ready"; config: EarthConfig };

/** Places the camera at the start and sets the clock to the latest local solar noon there. */
export function startView(renderer: Renderer, nowMs: number = Date.now()): void {
  const start = DEFAULT_START;
  renderer.placeOver(EARTH_FRAME, toDirection(start.lat, start.lon), start.height, deg(start.tilt));
  renderer.setTime(latestSolarNoon(start.lon, nowMs));
}

export default function EarthApp() {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadConfig()
      .then((config) => live && setLoaded({ state: "ready", config }))
      .catch((e: unknown) => live && setLoaded({ state: "failed", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, []);

  const config = loaded.state === "ready" ? loaded.config : null;
  const missing = config ? missingVariables(config) : [];
  const connection = useMemo<Connection | null>(
    () => (config ? { hubUrl: hubBase(), apiKey: config.apiKey, spaceId: config.spaceId, buildId: config.buildId } : null),
    [config],
  );

  const onReady = useCallback((renderer: Renderer) => {
    try {
      startView(renderer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
  } else if (connection) {
    body = (
      <GxRenderer
        connection={connection}
        controls="none"
        hud={false}
        onReady={onReady}
        onError={setError}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", bgcolor: "black" }}>
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
