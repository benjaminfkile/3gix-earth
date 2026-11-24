# 3gix-earth

A micro frontend (MFE) for exploring Earth with the 3GIX renderer (`3gix-renderer`). `3gix-shell` loads it at runtime through Module Federation; it also runs on its own for development.

It is the Module Federation remote `gx_earth`, exposing `./EarthApp`: a React component that takes no props and fills its parent. It draws Earth (frame 4) with the renderer's `GxRenderer`, with the renderer's own controls and HUD off. On start it places the camera where the address bar says (`?lat=&lon=&h=&heading=&tilt=`, degrees and meters above the ground) or else 20 km above Missoula, Montana, facing north 45 degrees below level, and sets the clock to the latest local solar noon there. While the camera moves it shows a readout (latitude, longitude, height above the ground, ground elevation above the ellipsoid, heading; click to copy), a compass (click for north up) with a straight down button, and writes the place back into the address bar. Earth mode navigation, mouse and touch through one pointer path: left drag or one finger pans (the grabbed ground point stays under the pointer), the wheel or a pinch zooms toward the pointer or the fingers' midpoint, right drag or Ctrl + left drag tilts and turns around the ground point at the view center, a two finger twist turns and a two finger vertical drag tilts, and a double click or double tap flies toward the point (0.8 s). One wheel notch is the same zoom step on every device (pixel, line, and page wheel modes normalized, at most 2 notches an event). Zooming out eases the tilt toward straight down from 50 km above the ground to 1000 km, and back to the user's tilt zooming in, so the zoom target stays under the camera. The Earth / Fly toggle at the top left switches modes (remembered in local storage); switching never moves the camera and lets go of any flight input. Fly mode moves through the renderer's flight input (`move` and `boost` only) and looks through `setCamera`, keeping heading and tilt (clamped to 89 degrees up and down) so the horizon never rolls: click the view to focus it (and take pointer lock where supported), then W/S forward and back, A/D left and right, E/Q or Space/C up and down, arrow keys or the mouse (drag, or moves while pointer locked) to look, Shift to boost. Keys count only while the view itself has focus, so typing in a box over the view never moves the camera, and the keys used never reach the page. On touch devices or screens below 600 px a joystick at the lower left moves, dragging elsewhere looks, and a Boost button boosts. In Fly mode a pose within 2 m of the ground is lifted, and the flight speed is set from the height above the ground. The camera never goes below the ground plus 2 m, and its speed follows its height above the ground. The search box at the top (Google Places autocomplete, Places API New, through the Maps JavaScript API `places` library; needs `GX_MAPS_KEY`) suggests places as you type (debounced, arrow keys and Enter or a tap to choose); typing never moves the camera. Choosing a place flies the camera there in about 2 s (up, over, and down for long distances), framed so the place's viewport fills the view at 45 degrees tilt facing north, or 2 km above the ground for a place without a viewport. The Bookmarks button under the mode toggle saves the current view with a name and lists the saved views (local storage): click one to fly there, or rename or delete it. A press, wheel, or key on the view stops a flight. Every camera write rides with Earth (`setCamera(pose, { ride: true })`). A click on the view (a press that moves less than 4 px) reports the latitude, longitude, and elevation it hit. The Settings button turns the renderer's HUD and the debug panel on; `?debug=1` opens the debug panel too: a Google top-down map (road, satellite, terrain; click to go there) and Google's photorealistic 3D map following the renderer's camera, which need `GX_MAPS_KEY`. The hub address and keys never reach the repository: the dev server reads them from the environment.

Design: `docs/design.md`. Build plan: `docs/plan.md`.

## Environment

| Variable | Use |
|---|---|
| `GX_HUB_URL` | Where the dev server forwards `/hub/*` (prefix removed, WebSockets included). Server side only. |
| `GX_API_KEY`, `GX_SPACE_ID` | The hub connection the page uses. Required: the view names a missing one. |
| `GX_BUILD_ID` | Optional build to draw; empty for the space's current one. |
| `GX_MAPS_KEY` | Google Maps Platform browser key: the search box (Places API, New), the debug panel's Maps JavaScript API and 3D map (Map Tiles API). |
| `GX_TLS_CERT`, `GX_TLS_KEY` | Certificate and key paths. With both set the server uses HTTPS, otherwise HTTP. |
| `GX_HOST` | Address to bind, default `localhost`. |
| `GX_EARTH_PORT` | Port, default `5181`. |

The dev and preview servers answer `/earth-config.json` with `{ apiKey, spaceId, buildId, mapsKey }` from these variables and send CORS headers allowing any origin (local development only). The page resolves `/earth-config.json` and the hub base `/hub` against its own module URL, so inside the shell they still reach this server.

Set the variables in your shell. `.env*` and `*.pem` files are ignored by git.

## Run it alone

```sh
npm install
export GX_HUB_URL=... GX_API_KEY=... GX_SPACE_ID=...
npm run dev        # http://localhost:5181 (https with the TLS variables)
```

`npm run build` then `npm run preview` serves the production build on the same port. The browser needs WebGPU.

## Run it inside 3gix-shell

Start this dev server (or `build` and `preview`), then start `3gix-shell` (`npm run dev` there, port 5180 by default). The shell loads `/remoteEntry.js` from this server: by default from the same host as the shell page on port 5181, or from `GX_EARTH_URL` when set in the shell's environment. When the shell is served over HTTPS, serve this MFE over HTTPS too.

## Scripts

| Script | Does |
|---|---|
| `dev` | Vite dev server with the hub proxy and `/remoteEntry.js`. |
| `build` | Production build into `dist/` (`dist/remoteEntry.js` is the remote entry). |
| `preview` | Serves `dist/` with the same proxy, config, and CORS. |
| `test` | vitest with jsdom; the renderer package is mocked. |
| `typecheck` | `tsc` in strict mode. |
| `ci` | typecheck, tests, build, then prints `ci ok`. |

## Layout

- `src/EarthApp.tsx`: the exposed module.
- `src/main.tsx`: the stand-alone page.
- `src/config.ts`: the page config and hub base.
- `src/earth.ts`: Earth's frame id and the default start.
- `src/geo/wgs84.ts`: WGS84 latitude, longitude, height to and from frame 4's axes.
- `src/geo/solar.ts`: local solar noon.
- `src/geo/enu.ts`: local east, north, up axes, heading and tilt to and from a camera orientation, great-circle distance, the WGS84 check against `frames()`.
- `src/geo/ground.ts`: the ground under a point from `surfaceHeight`, the ellipsoid when nothing is loaded.
- `src/view.ts`: the readout, the address bar, the debug panel's points, and the throttle.
- `src/controls.tsx`: the readout, compass, and settings controls.
- `src/DebugPanel.tsx`: the debug panel's two Google maps (advanced markers, the camera's with a heading arrow), placed below the toolbar.
- `src/nav/input.ts`: pointer input on the view (mouse, touch, pen) turned into gestures; presses under 4 px are clicks.
- `src/nav/math.ts`: pure navigation math: pan, zoom toward a point, orbit, clearance, speed by height, easing.
- `src/nav/controller.ts`: the navigation controller, which owns the camera in Earth mode.
- `src/nav/fly.ts`: Fly mode: keys, joystick, and boost to flight input, look, clearance, speed, and the view's key and pointer listeners.
- `src/search.tsx`: the search box and the Places library behind a small interface.
- `src/flight.ts`: the framing of a place and the animated flight to a place.
- `src/bookmarks.ts`, `src/BookmarksPanel.tsx`: bookmarks in local storage and their control.
- `src/mode.ts`: the navigation mode in local storage.
- `src/flyControls.tsx`: the mode toggle, the joystick, and the boost button.
