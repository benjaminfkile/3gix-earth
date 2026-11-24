import { describe, expect, it } from "vitest";
import { BOOKMARKS_KEY, addBookmark, loadBookmarks, removeBookmark, renameBookmark, saveBookmarks } from "./bookmarks";
import { rad } from "./geo/wgs84";

const place = { lat: rad(46.8721), lon: rad(-113.994), height: 1234.5, heading: rad(30), tilt: rad(45) };

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("bookmarks", () => {
  it("round trips through storage", () => {
    const s = memory();
    const list = addBookmark(addBookmark([], "Home", place, "a"), "  ", { ...place, height: 10 }, "b");
    saveBookmarks(list, s);
    expect(loadBookmarks(s)).toEqual(list);
    expect(list[1].name).toBe("Untitled");
  });

  it("renames and deletes", () => {
    const list = addBookmark(addBookmark([], "Home", place, "a"), "Work", place, "b");
    expect(renameBookmark(list, "b", " Office ")[1].name).toBe("Office");
    expect(renameBookmark(list, "b", " ")[1].name).toBe("Work");
    expect(removeBookmark(list, "a").map((b) => b.id)).toEqual(["b"]);
  });

  it("drops what it cannot read", () => {
    const s = memory();
    expect(loadBookmarks(s)).toEqual([]);
    s.m.set(BOOKMARKS_KEY, "not json");
    expect(loadBookmarks(s)).toEqual([]);
    s.m.set(BOOKMARKS_KEY, JSON.stringify([{ id: "x", name: "bad", place: { lat: "1" } }, { id: "y", name: "ok", place }]));
    expect(loadBookmarks(s).map((b) => b.id)).toEqual(["y"]);
  });
});
