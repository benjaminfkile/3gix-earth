// The navigation mode (design section 4), remembered in local storage.

export type NavMode = "earth" | "fly";

export const MODE_KEY = "gx-earth.mode";

export function loadMode(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): NavMode {
  try {
    return storage?.getItem(MODE_KEY) === "fly" ? "fly" : "earth";
  } catch {
    return "earth";
  }
}

export function saveMode(mode: NavMode, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(MODE_KEY, mode);
  } catch {
    // Storage refused (private mode, quota): the mode just is not remembered.
  }
}
