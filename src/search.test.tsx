import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SearchBox, googlePlaces, type FoundPlace, type PlacesApi } from "./search";
import { rad } from "./geo/wgs84";

const MISSOULA: FoundPlace = {
  name: "Missoula",
  location: { lat: rad(46.8721), lon: rad(-113.994) },
  viewport: { north: rad(46.95), south: rad(46.8), east: rad(-113.9), west: rad(-114.1) },
};

function fakeApi() {
  return {
    newSession: vi.fn(),
    suggest: vi.fn(async (input: string) => [
      { id: "p1", primary: `${input} One`, secondary: "Montana, USA" },
      { id: "p2", primary: `${input} Two`, secondary: "" },
    ]),
    fetch: vi.fn(async (_id: string) => MISSOULA),
  } satisfies PlacesApi;
}

describe("SearchBox", () => {
  it("asks once after typing stops and shows the suggestions", async () => {
    const api = fakeApi();
    render(<SearchBox api={api} onPlace={() => {}} debounceMs={30} />);
    const box = screen.getByLabelText("search places");
    fireEvent.change(box, { target: { value: "M" } });
    fireEvent.change(box, { target: { value: "Mi" } });
    fireEvent.change(box, { target: { value: "Mis" } });
    expect(await screen.findByText("Mis One")).toBeTruthy();
    expect(screen.getByText("Montana, USA")).toBeTruthy();
    expect(api.suggest).toHaveBeenCalledTimes(1);
    expect(api.suggest).toHaveBeenCalledWith("Mis");
  });

  it("chooses with the keyboard, fetches the fields, and reports the place", async () => {
    const api = fakeApi();
    const onPlace = vi.fn();
    render(<SearchBox api={api} onPlace={onPlace} debounceMs={0} />);
    const box = screen.getByLabelText("search places");
    box.focus();
    fireEvent.change(box, { target: { value: "Mis" } });
    await screen.findByText("Mis Two");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(onPlace).toHaveBeenCalledWith(MISSOULA));
    expect(api.fetch).toHaveBeenCalledWith("p2");
    expect(api.newSession).toHaveBeenCalled();
  });
});

describe("googlePlaces", () => {
  it("uses one session token for suggestions and the place fetch, then reads location and viewport", async () => {
    const tokens: object[] = [];
    const fetchFields = vi.fn(async () => {});
    const placeObj = {
      fetchFields,
      displayName: "Missoula",
      location: { lat: () => 46.8721, lng: () => -113.994 },
      viewport: { getNorthEast: () => ({ lat: () => 46.95, lng: () => -113.9 }), getSouthWest: () => ({ lat: () => 46.8, lng: () => -114.1 }) },
    };
    const fetchAutocompleteSuggestions = vi.fn(async (_req: { input: string; sessionToken: object }) => ({
      suggestions: [{ placePrediction: { placeId: "p1", text: { text: "Missoula, MT" }, mainText: { text: "Missoula" }, secondaryText: { text: "MT" }, toPlace: () => placeObj } }],
    }));
    const lib = {
      AutocompleteSessionToken: class {
        constructor() {
          tokens.push(this);
        }
      },
      AutocompleteSuggestion: { fetchAutocompleteSuggestions },
    } as unknown as google.maps.PlacesLibrary;
    const api = googlePlaces(lib);
    expect(await api.suggest("Miss")).toEqual([{ id: "p1", primary: "Missoula", secondary: "MT" }]);
    await api.suggest("Misso");
    expect(fetchAutocompleteSuggestions.mock.calls[0][0].sessionToken).toBe(tokens[0]);
    expect(fetchAutocompleteSuggestions.mock.calls[1][0].sessionToken).toBe(tokens[0]);
    const found = await api.fetch("p1");
    expect(fetchFields).toHaveBeenCalledWith({ fields: ["displayName", "location", "viewport"] });
    expect(found?.location.lat).toBeCloseTo(MISSOULA.location.lat, 12);
    expect(found?.viewport?.west).toBeCloseTo(MISSOULA.viewport!.west, 12);
    // A new session after the fetch.
    await api.suggest("Paris");
    expect(fetchAutocompleteSuggestions.mock.calls[2][0].sessionToken).not.toBe(tokens[0]);
  });
});
