import { describe, expect, it, vi } from "vitest";
import { configUrl, hubBase, loadConfig, missingVariables } from "./config";

describe("config URLs", () => {
  it("resolve against this module's own URL by default", () => {
    // Under vitest the module URL is a file URL while the page is jsdom's http page.
    expect(configUrl()).toMatch(/\/earth-config\.json$/);
    expect(configUrl()).not.toBe(new URL("/earth-config.json", window.location.href).href);
    expect(hubBase()).not.toBe(new URL("/hub", window.location.href).href);
  });

  it("resolve against the MFE's origin when the page is on another origin", () => {
    // The shell page is on port 5180; the MFE's module comes from port 5181.
    window.history.replaceState(null, "", "/shell/page");
    const module = "https://mfe.example:5181/assets/EarthApp-abc.js";
    expect(configUrl(module)).toBe("https://mfe.example:5181/earth-config.json");
    expect(hubBase(module)).toBe("https://mfe.example:5181/hub");
    expect(hubBase(module)).not.toContain(window.location.host);
  });

  it("ignore the module's path depth", () => {
    expect(hubBase("http://localhost:5181/src/deep/x/config.ts?t=1")).toBe("http://localhost:5181/hub");
  });
});

describe("loadConfig", () => {
  it("reads the fields from the MFE's config URL", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ apiKey: "k", spaceId: "s", buildId: "", mapsKey: "m" })),
    );
    const config = await loadConfig("https://mfe.example:5181/remoteEntry.js", fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledWith("https://mfe.example:5181/earth-config.json");
    expect(config).toEqual({ apiKey: "k", spaceId: "s", buildId: "", mapsKey: "m" });
    expect(missingVariables(config)).toEqual([]);
  });

  it("names missing variables", async () => {
    const fetcher = async () => new Response(JSON.stringify({ apiKey: "", spaceId: 3 }));
    const config = await loadConfig("http://localhost:5181/", fetcher as unknown as typeof fetch);
    expect(missingVariables(config)).toEqual(["GX_API_KEY", "GX_SPACE_ID"]);
  });

  it("throws when the config cannot be read", async () => {
    const fetcher = async () => new Response("nope", { status: 404 });
    await expect(loadConfig("http://localhost:5181/", fetcher as unknown as typeof fetch)).rejects.toThrow(/HTTP 404/);
  });
});
