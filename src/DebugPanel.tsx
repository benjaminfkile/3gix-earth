/// <reference types="google.maps" />
// The debug panel (design section 7): a top-down map and Google's
// photorealistic 3D map following the renderer.
//
// The Maps JavaScript API is loaded once, by the one `APIProvider` in
// `EarthApp` (the search box uses it too).
// `Map3D` (from `@vis.gl/react-google-maps/3d`) gets `Map3DElement` through
// `google.maps.importLibrary("maps3d")` on that same loader, as Google's
// current documentation for the 3D map describes.

import { useState } from "react";
import { AdvancedMarker, Map, Pin, Polyline, type MapMouseEvent } from "@vis.gl/react-google-maps";
import { Map3D, MapMode } from "@vis.gl/react-google-maps/3d";
import { Box, Paper, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { DebugView, LatLng } from "./view";

type MapType = "roadmap" | "satellite" | "terrain";

/** Advanced markers need a map id; Google's demo id serves for development. */
const MAP_ID = "DEMO_MAP_ID";

/** The camera marker: an arrow pointing along the heading (compass degrees). */
function HeadingArrow({ heading }: { heading: number }) {
  return (
    <svg width={28} height={28} viewBox="-10 -10 20 20" style={{ transform: `rotate(${heading}deg)`, display: "block" }} data-testid="heading-arrow">
      <polygon points="0,-9 6,7 0,3 -6,7" fill="#e53935" stroke="#fff" strokeWidth={1.2} />
    </svg>
  );
}

export function DebugPanel({ mapsKey, view, onGo }: { mapsKey: string; view: DebugView | null; onGo: (at: LatLng) => void }) {
  const [mapType, setMapType] = useState<MapType>("satellite");
  if (mapsKey === "") {
    return (
      <Paper sx={panelSx}>
        <Typography sx={{ p: 2 }}>Missing setting: GX_MAPS_KEY. The debug maps need it.</Typography>
      </Paper>
    );
  }
  const camera = view?.camera ?? { lat: 0, lng: 0 };
  return (
    <Paper sx={panelSx} data-testid="debug-panel">
        <ToggleButtonGroup size="small" exclusive value={mapType} onChange={(_, v: MapType | null) => v && setMapType(v)} sx={{ m: 1 }}>
          <ToggleButton value="roadmap">Road</ToggleButton>
          <ToggleButton value="satellite">Satellite</ToggleButton>
          <ToggleButton value="terrain">Terrain</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Map
            mapId={MAP_ID}
            mapTypeId={mapType}
            center={view?.center ?? camera}
            defaultZoom={10}
            disableDefaultUI
            gestureHandling="greedy"
            onClick={(e: MapMouseEvent) => e.detail.latLng && onGo(e.detail.latLng)}
          >
            {view && (
              <AdvancedMarker position={view.camera} title="camera" anchorPoint={["50%", "50%"]}>
                <HeadingArrow heading={view.heading} />
              </AdvancedMarker>
            )}
            {view?.center && (
              <AdvancedMarker position={view.center} title="view center">
                <Pin background="#ffeb3b" borderColor="#000" glyphColor="#000" />
              </AdvancedMarker>
            )}
            {view?.center && <Polyline path={[view.camera, view.center]} strokeColor="#ffeb3b" strokeWeight={2} />}
          </Map>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {view?.map3d ? (
            <Map3D
              mode={MapMode.SATELLITE}
              center={view.map3d.center}
              range={view.map3d.range}
              tilt={view.map3d.tilt}
              heading={view.map3d.heading}
              fov={view.map3d.fov}
              defaultUIHidden
            />
          ) : (
            <Typography sx={{ p: 2 }}>The view center meets no ground.</Typography>
          )}
        </Box>
    </Paper>
  );
}

const panelSx = {
  position: "absolute",
  // Below the toolbar (Settings at the top right) so every control stays reachable.
  top: 56,
  bottom: 8,
  right: 72,
  width: "min(40%, 480px)",
  display: "flex",
  flexDirection: "column",
  gap: 1,
  overflow: "hidden",
} as const;
