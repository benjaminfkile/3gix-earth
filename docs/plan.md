# Build plan

The shell (`3gix-shell`) and this MFE, built by grunt in waves (approved by Ben 2026-11-23). Each task is posted held and released one at a time; each is verified before the next is released: `npm run ci`, a real browser with WebGPU against a real hub at desktop size and at phone size with touch, alone and inside the shell, on the Mac and the PC.

Contract: `docs/design.md` here and `3gix-shell/docs/design.md`. Rules for every task: `docs/briefs/_rules.md`.

| Task | Repo | Brief | Depends on |
|---|---|---|---|
| S1 the shell (856) | 3gix-shell | `briefs/S1.md` | |
| E1 scaffold and view (857) | 3gix-earth | `briefs/E1.md` | |
| E2 where am I, debug map (858) | 3gix-earth | `briefs/E2.md` | E1 |
| E3 Earth mode (859) | 3gix-earth | `briefs/E3.md` | E2 |
| E4 Fly mode, toggle (860) | 3gix-earth | `briefs/E4.md` | E3 |
| E5 search, bookmarks (861) | 3gix-earth | `briefs/E5.md` | E4 |
| E6 time, layers, phones (862) | 3gix-earth | `briefs/E6.md` | E5 |

The renderer package comes from the `3gix-renderer` GitHub release v0.1.2.

## Log

- 2026-11-23: design, rules, and briefs written; renderer release v0.1.0 published.
- 2026-11-23: tasks posted held: S1 856, E1 857, E2 858, E3 859, E4 860, E5 861, E6 862. S1 and E1 released together.
- 2026-11-23: S1 (856) verified: `npm run ci` ok on the Mac (7 tests), no infrastructure ids. Needs Node 22.12 or later (Vite 8); the 3GIX toolchain's 22.11 skips the native bundler builds.
- 2026-11-23: E1 (857) verified in headless Chrome with WebGPU against the local hub, alone and inside the shell (Module Federation works, the view starts over Missoula at local noon). Two renderer bugs found and fixed in the renderer (2ee85ef, release v0.1.1): the web build could not create a renderer after another was destroyed (one winit event loop per page, so strict mode and remounts failed), and a pending `placeOver` was left in space by `setTime`. This repo now depends on v0.1.1.
- 2026-11-23: E2 (858) done: `npm run ci` ok on the Mac (71 tests). Fixed in session: the start set the camera before the clock, so the later time change left the free camera in space (now clock first, with a test). Open: `setCamera` always frees the camera, so it does not ride with Earth (it drifts with Earth's spin and orbit); the API has no item for a camera that moves with its frame. Waiting on Ben before E3.
- 2026-11-23: Ben approved a renderer API item: `setCamera(pose, { ride })` (renderer 4a8f9f2, release v0.1.2). Every placement here now rides with Earth. Verified in headless Chrome inside the shell: the camera stays over Missoula at 20.0 km facing north; the debug panel shows Google's top-down satellite map with the markers and line, and the 3D view matches the renderer's terrain. E2 follow-ups (readout refresh, panel over Settings, deprecated markers, heading arrow) added to E3 as item 0.
- 2026-11-23: E3 (859) verified: `npm run ci` ok on the Mac (92 tests); gestures driven in headless Chrome inside the shell against the local hub: pan, zoom toward the pointer, right drag turn and tilt all move the camera as expected, never below the ground; the readout now refreshes (ground 979 m over Missoula). Zoom out keeps the tilt, so far out the camera ends over the other side of Earth: added to E4 as item 0 with wheel normalization.
- 2026-11-23: E4 (860) verified: `npm run ci` ok on the Mac (105 tests); Fly mode driven with keys in headless Chrome inside the shell: W flies forward along the view (north and down), the left arrow turns left, E climbs, the toggle switches without moving the camera. Found: look turns about the camera's own axes, so the horizon rolls; added to E5 as item 0.
