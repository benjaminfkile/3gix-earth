# 3gix-earth design

Approved by Ben 2026-11-23. This is the contract for this repository. When code and this document disagree, the code is wrong.

`3gix-earth` is a micro frontend (MFE) for exploring Earth with the 3GIX renderer. A bare host app, `3gix-shell`, loads it at runtime. The MFE also runs on its own for development.

The renderer is a component that knows nothing about any body (`3gix-renderer/docs/api.md`, `3GIXHub/docs/architecture/rendering.md` section 8). Everything about Earth lives here: latitude and longitude, place names, how a person likes to move over the ground. Nothing in this repository asks for a change to the renderer, the core, or the hub; if the renderer API lacks something, that is reported, not worked around.

## 1. Stack

- Vite, React 19, TypeScript (strict), Material UI (MUI) for every control, no other component library.
- Module Federation through `@module-federation/vite`. The remote is named `gx_earth` and exposes `./EarthApp`, a React component that takes no props and fills its parent.
- Shared as singletons with the shell: `react`, `react-dom`, `@mui/material`, `@emotion/react`, `@emotion/styled`.
- The renderer package `3gix-renderer`, installed from the GitHub release tarball of `3gix-renderer` (`https://github.com/benjaminfkile/3gix-renderer/releases/download/v<version>/3gix-renderer-<version>.tgz`), pinned to one version. Only its public exports are used.
- Tests: vitest with jsdom. The `Renderer` class is mocked; no test needs a GPU or a hub.
- `npm run ci` runs type checks, tests, and the production build, and prints `ci ok`.

## 2. Configuration and serving

Nothing that names a machine, an address, or a key is committed. The dev server reads its settings from environment variables:

| Variable | Use |
|---|---|
| `GX_HUB_URL` | Where the dev server forwards hub requests (server side only, never sent to the browser). |
| `GX_API_KEY`, `GX_SPACE_ID`, `GX_BUILD_ID` (optional) | The hub connection the page uses. |
| `GX_MAPS_KEY` | The Google Maps Platform browser key (Places, Maps JavaScript, Map Tiles). |
| `GX_TLS_CERT`, `GX_TLS_KEY` | Paths to a certificate and key. When both are set the dev server uses HTTPS; otherwise HTTP. |
| `GX_HOST` | Address to bind (default `localhost`). |
| `GX_EARTH_PORT` | Port (default `5181`). |

1. **Hub proxy.** The dev server forwards `/hub/*` to `GX_HUB_URL` (prefix removed, WebSocket upgrades included). The page always talks to the hub through its own origin, so an HTTPS page never calls a plain HTTP hub.
2. **Page config.** The dev server answers `/earth-config.json` with `{ apiKey, spaceId, buildId, mapsKey }` from the environment.
3. **Origins.** Inside the shell, the MFE's code runs on the shell's page. Every URL the MFE builds for itself (the hub base, `/earth-config.json`) is resolved against the MFE's own origin with `new URL(path, import.meta.url)`, never against the page. The dev server sends CORS headers that allow any origin (local development only).
4. A missing variable shows a clear message in the view naming the variable, never a blank screen.

## 3. The view

1. `EarthApp` renders `GxRenderer` filling its parent, with `controls: "none"`: this app owns all input (section 4).
2. Earth is frame 4, hard coded in one constant.
3. **Start.** From the address bar (section 6) when present, otherwise above Missoula, Montana (46.8721 N, 113.9940 W), 20 km up, 45 degrees below level, facing north. After `ready` the clock is set to the most recent local solar noon at the start longitude (not later than now), so the first view is lit. Time stays changeable (section 5).
4. Built-in HUD off by default; a settings switch turns it on.

## 4. Moving around

The camera never moves by itself in the renderer. This app moves it with `setCamera` and `setFlightInput`, and may animate it (for example a flight to a search result). Every placement uses `setCamera(pose, { ride: true })`, so the camera keeps its place in Earth's axes while Earth spins and moves along its orbit; a free camera would stay put in space and drift off.

Common to both modes:
- **Ground clearance.** The camera never goes below the ground plus 2 m. The ground under the camera comes from `surfaceHeight(4, direction)`; when no tile is loaded, the reference ellipsoid is the ground.
- **Speed follows height.** Movement speed scales with the height above the ground, so motion feels the same at 50 m and at 500 km.
- Switching modes never moves the camera.

**Earth mode** (the default), like a digital globe:
- Mouse: left drag pans (the grabbed ground point stays under the pointer, using `raycast`); wheel zooms toward the point under the pointer; right drag (or Ctrl + left drag) tilts and turns around the point at the screen center; double click flies toward the point.
- Touch: one finger pans; pinch zooms toward the fingers' midpoint; two finger twist turns; two finger vertical drag tilts; double tap zooms in.
- Tilt range from straight down (90 degrees below level) to 5 degrees below level.

**Fly mode**, free flight:
- Keyboard: W/S forward and back, A/D left and right, E/Q (and Space/C) up and down, arrow keys or mouse drag to look, Shift to boost. Pointer lock on click where supported.
- Touch: a virtual joystick at the lower left moves; dragging anywhere else looks; a boost button.
- Uses `setFlightInput` and `setSpeed`.

A toggle in the toolbar switches modes; the choice is remembered (local storage).

## 5. Controls

All MUI, placed over the view. On wide screens floating panels; below 600 px wide the readout, time, layers, and debug panel live in a bottom sheet (`SwipeableDrawer`), and the search box, compass, and mode toggle stay on screen.

1. **Readout.** Latitude and longitude (degrees, 5 decimals, N/S/E/W), height above the ground, ground elevation (the renderer's surface height above the reference ellipsoid, labeled as such), and heading. Tap to copy `lat, lon`.
2. **Compass.** Shows heading; tap to turn north up without moving. A button turns the view straight down.
3. **Inspect.** A click or tap that is not a drag reports the latitude, longitude, and elevation of the point hit (`hit` event).
4. **Search.** A search box with Google Places autocomplete (Places API, New). Choosing a result flies the camera to it, framed so the place's viewport fills the view at 45 degrees tilt.
5. **Time of day.** A slider over the current day, a Now button, play and pause, and play speed (`setTime`, `setTimeScale`).
6. **Layers.** Each layer from `layers()` with a switch (`setShown`), and the compute budget (`setComputeBudget`).
7. **Bookmarks.** Save the current view with a name, list, go to, delete (local storage).
8. **Settings.** HUD on or off, mode, debug panel on or off.

## 6. Address bar

The view is in the query string: `lat`, `lon`, `h` (meters above the ground), `heading` and `tilt` (degrees). It updates at most twice a second while moving (replace, not push). Loading a URL with these starts there.

## 7. Debug panel

Shown when `?debug=1` or the settings switch is on. A side panel on wide screens, the bottom sheet on narrow ones. For checking that the renderer's Earth lines up with Google's.

1. **Top-down map** (Maps JavaScript API, `@vis.gl/react-google-maps`), road, satellite, or terrain. It follows the renderer: a marker under the camera with a heading arrow, a marker where the screen center hits the ground (`raycast` at the view center), and a line between them. Clicking or tapping the map moves the renderer there, keeping height, heading, and tilt.
2. **3D view** (Google's photorealistic 3D map, `Map3DElement`, through the Map Tiles API). Its camera copies the renderer's: the point looked at, the distance to it, heading, tilt, and field of view, so the two views show the same scene side by side.
3. Both update at most 5 times a second and never block the renderer's frame.

## 8. Geodesy

`src/geo/` holds the only Earth math: WGS84 (a = 6378137 m, f = 1/298.257223563) conversion between latitude, longitude, height and positions in frame 4's axes (the frame's +z is the north pole, +x is longitude 0, as the renderer's `--start-on` directions use), local east-north-up axes, heading and tilt from a camera orientation and back, and great-circle distance. Heading is clockwise from north and tilt is the angle below level, both against the geodetic east, north, up axes at the camera; the camera looks along its local -z with +y up (the renderer's convention). When `frames()` reports frame 4's surface radii, a mismatch with WGS84 above 1 m is logged once.

## 9. Proof

- Unit tests for `src/geo` (round trips to 1e-6 m and 1e-9 degrees, known points), the navigation math, the URL state, and each control with the `Renderer` mocked.
- The reviewer checks every wave in a real browser with WebGPU against a real hub, at desktop size and at phone size with touch, and inside the shell.
