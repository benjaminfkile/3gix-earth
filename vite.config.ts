/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";

const env = process.env;

// Design section 2: HTTPS only when both paths are set.
function tls(): { cert: Buffer; key: Buffer } | undefined {
  const cert = env.GX_TLS_CERT;
  const key = env.GX_TLS_KEY;
  if (!cert || !key) return undefined;
  return { cert: readFileSync(cert), key: readFileSync(key) };
}

const host = env.GX_HOST || "localhost";
const port = Number(env.GX_EARTH_PORT || 5181);
const https = tls();

// Section 2 item 1: /hub/* goes to GX_HUB_URL with the prefix removed, WebSocket upgrades included.
const proxy: Record<string, ProxyOptions> = env.GX_HUB_URL
  ? {
      "/hub": {
        target: env.GX_HUB_URL,
        changeOrigin: true,
        ws: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/hub/, "") || "/",
      },
    }
  : {};

// Section 2 item 2: the page config from the environment. Empty values are reported by the page.
function earthConfig(): Plugin {
  const send = (res: ServerResponse) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(
      JSON.stringify({
        apiKey: env.GX_API_KEY ?? "",
        spaceId: env.GX_SPACE_ID ?? "",
        buildId: env.GX_BUILD_ID ?? "",
        mapsKey: env.GX_MAPS_KEY ?? "",
      }),
    );
  };
  return {
    name: "gx-earth-config",
    configureServer(server) {
      server.middlewares.use("/earth-config.json", (_req, res) => send(res));
    },
    configurePreviewServer(server) {
      server.middlewares.use("/earth-config.json", (_req, res) => send(res));
    },
  };
}

// Section 1: the same singletons and majors as 3gix-shell.
const shared = {
  react: { singleton: true, requiredVersion: "^19.0.0" },
  "react-dom": { singleton: true, requiredVersion: "^19.0.0" },
  "@mui/material": { singleton: true, requiredVersion: "^9.0.0" },
  "@emotion/react": { singleton: true, requiredVersion: "^11.0.0" },
  "@emotion/styled": { singleton: true, requiredVersion: "^11.0.0" },
};

const cors = { origin: "*" };

export default defineConfig({
  plugins: [
    react(),
    earthConfig(),
    federation({
      name: "gx_earth",
      filename: "remoteEntry.js",
      exposes: { "./EarthApp": "./src/EarthApp.tsx" },
      shared,
      dts: false,
    }),
  ],
  // The package finds its wasm and workers with new URL(..., import.meta.url); prebundling would move it.
  optimizeDeps: { exclude: ["3gix-renderer"] },
  server: { host, port, strictPort: true, https, cors, proxy },
  preview: { host, port, strictPort: true, https, cors, proxy },
  build: { target: "esnext" },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
