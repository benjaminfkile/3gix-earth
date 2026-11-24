# Possible issues

Things noticed while testing that are not bugs yet and have no task. Each says what was seen, why it happens, and what could be done. Nothing here is approved work.

## 1. Every hub request is preceded by a CORS preflight

Found 2026-11-24, while measuring the renderer's memory (headless Chrome over the DevTools protocol, a fresh profile, 150 s of panning from the start view through the shell at `https://localhost:5180`).

### What was seen

Every request to the hub was preceded by an `OPTIONS` preflight:

| Request | Count | Preflights |
|---|---|---|
| `GET /hub/section/{address}` | 6,845 | 6,845 |
| `POST .../section/{address}/check` | 540 | 616 (with the uploads) |
| `PUT .../section/{address}` | 74 | |
| `POST .../directions` | 313 | 90 |
| `GET /hub/source/{id}` | 146 | 146 |

About half of all hub requests were preflights. Each costs a round trip before the real request can start, which matters most on phone networks.

### Why

- The shell page is on `:5180`, and the renderer talks to the hub through the MFE's dev server proxy at `https://localhost:5181/hub` (`hubBase` in `src/config.ts`, design section 2). That is another origin, so every hub request is cross-origin.
- The renderer sends `X-API-Key` on every hub request, including the content-addressed `GET /section/{address}?sha256=...` reads (`3gix-renderer`, `crates/renderer/src/web/hub.rs`). A custom header makes a request non-simple, so the browser preflights it.
- Browsers cache a preflight per URL, and every section has its own URL, so a cached preflight never helps the next section. An `Access-Control-Max-Age` on the hub's CORS policy (`3GIXHub/3GIXHub/Program.cs`, `RendererCorsPolicy`, which sets none, so Chrome keeps each for 5 s) would only help the few repeated URLs such as `directions`.

### What could be done

Two options, not mutually exclusive:

1. **Same origin.** Serve the hub at `/hub` on the page's own origin, so the shell proxies it too and the MFE uses the page's origin instead of its own. Same-origin requests are never preflighted. This only helps locally and wherever the hub sits behind the page's origin. An edge or CDN on another domain brings the preflights back.
2. **No custom header on public reads.** If immutable, content-addressed section, source, module, and manifest reads can be served without `X-API-Key`, they become simple requests and are never preflighted, from any origin and through any edge. This is a change to the hub's access rules and the renderer's client, and needs Ben's approval.

Option 2 is the one that holds in production. Option 1 is a cheap local improvement.
