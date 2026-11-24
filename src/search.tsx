/// <reference types="google.maps" />
// The search box (design section 5 item 4): Google Places autocomplete
// (Places API, New) through the Maps JavaScript API `places` library.
// Suggestions come from `AutocompleteSuggestion` with a session token; a
// choice is resolved with `Place.fetchFields` for its location and
// viewport. The box talks to Google through the small `PlacesApi` below so
// tests can stand in for the library.

import { useEffect, useMemo, useRef, useState } from "react";
import { Autocomplete, Box, Paper, TextField, Typography } from "@mui/material";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { rad } from "./geo/wgs84";
import type { GeoPoint, Viewport } from "./flight";

export interface Suggestion {
  id: string;
  primary: string;
  secondary: string;
}

/** A chosen place: where it is and, when Google gives one, its viewport. Radians. */
export interface FoundPlace {
  name: string;
  location: GeoPoint;
  viewport: Viewport | null;
}

export interface PlacesApi {
  /** Starts a new session (a new token); suggestions and the next `fetch` belong to it. */
  newSession(): void;
  suggest(input: string): Promise<Suggestion[]>;
  /** The fields of a suggestion from the latest `suggest`; ends the session. */
  fetch(id: string): Promise<FoundPlace | null>;
}

/** Wait after the last keystroke before asking for suggestions, milliseconds. */
export const DEBOUNCE_MS = 250;

/** The `PlacesApi` over the `places` library of the Maps JavaScript API. */
export function googlePlaces(lib: google.maps.PlacesLibrary): PlacesApi {
  let token = new lib.AutocompleteSessionToken();
  let predictions = new Map<string, google.maps.places.PlacePrediction>();
  return {
    newSession() {
      token = new lib.AutocompleteSessionToken();
      predictions = new Map();
    },
    async suggest(input) {
      const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken: token });
      const out: Suggestion[] = [];
      predictions = new Map();
      for (const s of suggestions) {
        const p = s.placePrediction;
        if (!p) continue;
        predictions.set(p.placeId, p);
        out.push({ id: p.placeId, primary: p.mainText?.text ?? p.text.text, secondary: p.secondaryText?.text ?? "" });
      }
      return out;
    },
    async fetch(id) {
      const p = predictions.get(id);
      if (!p) return null;
      // `toPlace` carries the session token into this first `fetchFields`.
      const place = p.toPlace();
      await place.fetchFields({ fields: ["displayName", "location", "viewport"] });
      token = new lib.AutocompleteSessionToken();
      if (!place.location) return null;
      const v = place.viewport;
      const ne = v?.getNorthEast();
      const sw = v?.getSouthWest();
      return {
        name: place.displayName ?? p.text.text,
        location: { lat: rad(place.location.lat()), lon: rad(place.location.lng()) },
        viewport: ne && sw ? { north: rad(ne.lat()), south: rad(sw.lat()), east: rad(ne.lng()), west: rad(sw.lng()) } : null,
      };
    },
  };
}

/** The search box with the Google library, once the `APIProvider` above has loaded it. */
export function PlaceSearch({ onPlace }: { onPlace: (p: FoundPlace) => void }) {
  const lib = useMapsLibrary("places");
  const api = useMemo(() => (lib ? googlePlaces(lib) : null), [lib]);
  return <SearchBox api={api} onPlace={onPlace} />;
}

/**
 * The box itself: debounced suggestions while typing, arrow keys and Enter
 * (or a tap) to choose. Typing never moves the camera: the box only reports
 * a chosen place.
 */
export function SearchBox({ api, onPlace, debounceMs = DEBOUNCE_MS }: { api: PlacesApi | null; onPlace: (p: FoundPlace) => void; debounceMs?: number }) {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);

  useEffect(() => {
    if (!api || input.trim() === "") {
      setOptions([]);
      return;
    }
    const n = ++asked.current;
    const t = setTimeout(() => {
      api.suggest(input).then(
        (s) => n === asked.current && (setOptions(s), setError(null)),
        (e: unknown) => n === asked.current && setError(e instanceof Error ? e.message : String(e)),
      );
    }, debounceMs);
    return () => clearTimeout(t);
  }, [api, input, debounceMs]);

  const choose = (s: Suggestion | null) => {
    if (!s || !api) return;
    api.fetch(s.id).then(
      (p) => {
        api.newSession();
        if (p) onPlace(p);
        else setError("That place has no location");
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  };

  return (
    <Paper sx={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: "min(420px, calc(100% - 240px))", minWidth: 160 }}>
      <Autocomplete<Suggestion, false, false, false>
        size="small"
        options={options}
        filterOptions={(o) => o}
        getOptionLabel={(o) => o.primary}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        value={null}
        inputValue={input}
        onInputChange={(_, v, reason) => reason !== "reset" && setInput(v)}
        onChange={(_, v) => choose(v)}
        disabled={!api}
        noOptionsText={input.trim() === "" ? "Type a place" : "No places"}
        renderOption={(props, o) => {
          const { key, ...rest } = props as typeof props & { key: string };
          return (
            <Box component="li" key={key} {...rest}>
              <Box>
                <Typography variant="body2">{o.primary}</Typography>
                {o.secondary && (
                  <Typography variant="caption" color="text.secondary">
                    {o.secondary}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        }}
        renderInput={(params) => (
          <TextField {...params} placeholder={api ? "Search places" : "Search needs GX_MAPS_KEY"} error={error !== null} helperText={error ?? undefined} slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "aria-label": "search places", enterKeyHint: "search" } }} />
        )}
      />
    </Paper>
  );
}
