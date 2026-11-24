// Bookmarks (design section 5 item 7): named views kept in local storage.

import type { Place } from "./view";

export interface Bookmark {
  id: string;
  name: string;
  place: Place;
}

export const BOOKMARKS_KEY = "gx-earth.bookmarks";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function valid(b: unknown): b is Bookmark {
  if (typeof b !== "object" || b === null) return false;
  const { id, name, place } = b as Record<string, unknown>;
  if (typeof id !== "string" || typeof name !== "string" || typeof place !== "object" || place === null) return false;
  const p = place as Record<string, unknown>;
  return isNum(p.lat) && isNum(p.lon) && isNum(p.height) && isNum(p.heading) && isNum(p.tilt);
}

/** The stored bookmarks; anything unreadable is dropped. */
export function loadBookmarks(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): Bookmark[] {
  try {
    const raw = storage?.getItem(BOOKMARKS_KEY);
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(valid) : [];
  } catch {
    return [];
  }
}

export function saveBookmarks(list: readonly Bookmark[], storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(BOOKMARKS_KEY, JSON.stringify(list));
  } catch {
    // Storage refused (private mode, quota): the list lives until the page closes.
  }
}

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function addBookmark(list: readonly Bookmark[], name: string, place: Place, id: string = newId()): Bookmark[] {
  return [...list, { id, name: name.trim() || "Untitled", place }];
}

export function renameBookmark(list: readonly Bookmark[], id: string, name: string): Bookmark[] {
  const n = name.trim();
  return n === "" ? [...list] : list.map((b) => (b.id === id ? { ...b, name: n } : b));
}

export function removeBookmark(list: readonly Bookmark[], id: string): Bookmark[] {
  return list.filter((b) => b.id !== id);
}
