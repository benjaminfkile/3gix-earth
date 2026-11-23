// The page config and the hub base (design section 2). Both are resolved
// against this module's own URL, never the page, so inside the shell they
// still point at the MFE's dev server.

/** What `/earth-config.json` holds. */
export interface EarthConfig {
  apiKey: string;
  spaceId: string;
  buildId: string;
  mapsKey: string;
}

/** The environment variable behind each config field, for the missing-setting message. */
export const CONFIG_VARIABLES: Record<keyof EarthConfig, string> = {
  apiKey: "GX_API_KEY",
  spaceId: "GX_SPACE_ID",
  buildId: "GX_BUILD_ID",
  mapsKey: "GX_MAPS_KEY",
};

/** Fields that must be set for the view to run. `buildId` is optional; `mapsKey` is needed from E2 on. */
const REQUIRED: Array<keyof EarthConfig> = ["apiKey", "spaceId"];

/** The URL of `/earth-config.json` beside the module at `base`. */
export function configUrl(base: string = import.meta.url): string {
  return new URL("/earth-config.json", base).href;
}

/** The hub base the renderer talks to: the dev server's `/hub` proxy beside the module at `base`. */
export function hubBase(base: string = import.meta.url): string {
  return new URL("/hub", base).href;
}

/** Loads the page config. Throws with a message when it cannot be read. */
export async function loadConfig(base: string = import.meta.url, fetcher: typeof fetch = fetch): Promise<EarthConfig> {
  const url = configUrl(base);
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`could not load ${url}: HTTP ${res.status}`);
  const raw = (await res.json()) as Partial<Record<keyof EarthConfig, unknown>>;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    apiKey: text(raw.apiKey),
    spaceId: text(raw.spaceId),
    buildId: text(raw.buildId),
    mapsKey: text(raw.mapsKey),
  };
}

/** The environment variables of required fields that are empty. */
export function missingVariables(config: EarthConfig): string[] {
  return REQUIRED.filter((k) => config[k] === "").map((k) => CONFIG_VARIABLES[k]);
}
