# 3gix-earth

A micro frontend (MFE) for exploring Earth with the 3GIX renderer (`3gix-renderer`). `3gix-shell` loads it at runtime through Module Federation; it also runs on its own for development.

It is the Module Federation remote `gx_earth`, exposing `./EarthApp`: a React component that takes no props and fills its parent. It draws Earth (frame 4) with the renderer's `GxRenderer`, with the renderer's own controls and HUD off. On start it places the camera where the address bar says (`?lat=&lon=&h=&heading=&tilt=`, degrees and meters above the ground) or else 20 km above Missoula, Montana, facing north 45 degrees below level, and sets the clock to the latest local solar noon there. While the camera moves it shows a readout (latitude, longitude, height above the ground, ground elevation above the ellipsoid, heading; click to copy), a compass (click for north up) with a straight down button, and writes the place back into the address bar. A click on the view reports the latitude, longitude, and elevation it hit. The Settings button turns the renderer's HUD and the debug panel on; `?debug=1` opens the debug panel too: a Google top-down map (road, satellite, terrain; click to go there) and Google's photorealistic 3D map following the renderer's camera, which need `GX_MAPS_KEY`. The hub address and keys never reach the repository: the dev server reads them from the environment.

Design: `docs/design.md`. Build plan: `docs/plan.md`.

## Environment

| Variable | Use |
|---|---|
| `GX_HUB_URL` | Where the dev server forwards `/hub/*` (prefix removed, WebSockets included). Server side only. |
| `GX_API_KEY`, `GX_SPACE_ID` | The hub connection the page uses. Required: the view names a missing one. |
| `GX_BUILD_ID` | Optional build to draw; empty for the space's current one. |
| `GX_MAPS_KEY` | Google Maps Platform browser key: the debug panel's Maps JavaScript API and 3D map (Map Tiles API). |
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
- `src/DebugPanel.tsx`: the debug panel's two Google maps.
