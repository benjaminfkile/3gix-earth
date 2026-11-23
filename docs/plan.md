# Build plan

The shell (`3gix-shell`) and this MFE, built by grunt in waves (approved by Ben 2026-11-23). Each task is posted held and released one at a time; each is verified before the next is released: `npm run ci`, a real browser with WebGPU against a real hub at desktop size and at phone size with touch, alone and inside the shell, on the Mac and the PC.

Contract: `docs/design.md` here and `3gix-shell/docs/design.md`. Rules for every task: `docs/briefs/_rules.md`.

| Task | Repo | Brief | Depends on |
|---|---|---|---|
| S1 the shell | 3gix-shell | `briefs/S1.md` | |
| E1 scaffold and view | 3gix-earth | `briefs/E1.md` | |
| E2 where am I, debug map | 3gix-earth | `briefs/E2.md` | E1 |
| E3 Earth mode | 3gix-earth | `briefs/E3.md` | E2 |
| E4 Fly mode, toggle | 3gix-earth | `briefs/E4.md` | E3 |
| E5 search, bookmarks | 3gix-earth | `briefs/E5.md` | E4 |
| E6 time, layers, phones | 3gix-earth | `briefs/E6.md` | E5 |

The renderer package comes from the `3gix-renderer` GitHub release v0.1.0.

## Log

- 2026-11-23: design, rules, and briefs written; renderer release v0.1.0 published.
