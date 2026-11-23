/// <reference types="google.maps" />
// The debug panel (design section 7): a top-down map and Google's
// photorealistic 3D map following the renderer.
//
// The Maps JavaScript API is loaded once, by the one `APIProvider` here.
// `Map3D` (from `@vis.gl/react-google-maps/3d`) gets `Map3DElement` through
// `google.maps.importLibrary("maps3d")` on that same loader, as Google's
// current documentation for the 3D map describes.

import { useState } from "react";
import { APIProvider, Map, Marker, Polyline, type MapMouseEvent } from "@vis.gl/react-google-maps";
import { Map3D, MapMode } from "@vis.gl/react-google-maps/3d";
import { Box, Paper, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { DebugView, LatLng } from "./view";

type MapType = "roadmap" | "satellite" | "terrain";

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
  const arrow =
    typeof google !== "undefined" && google.maps?.SymbolPath
      ? { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 5, rotation: view?.heading ?? 0, strokeColor: "#e53935", fillColor: "#e53935", fillOpacity: 1 }
      : undefined;
  return (
    <APIProvider apiKey={mapsKey}>
      <Paper sx={panelSx} data-testid="debug-panel">
        <ToggleButtonGroup size="small" exclusive value={mapType} onChange={(_, v: MapType | null) => v && setMapType(v)} sx={{ m: 1 }}>
          <ToggleButton value="roadmap">Road</ToggleButton>
          <ToggleButton value="satellite">Satellite</ToggleButton>
          <ToggleButton value="terrain">Terrain</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Map
            mapTypeId={mapType}
            center={view?.center ?? camera}
            defaultZoom={10}
            disableDefaultUI
            gestureHandling="greedy"
            onClick={(e: MapMouseEvent) => e.detail.latLng && onGo(e.detail.latLng)}
          >
            {view && <Marker position={view.camera} icon={arrow} title="camera" />}
            {view?.center && <Marker position={view.center} title="view center" />}
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
    </APIProvider>
  );
}

const panelSx = {
  position: "absolute",
  top: 8,
  bottom: 8,
  right: 72,
  width: "min(40%, 480px)",
  display: "flex",
  flexDirection: "column",
  gap: 1,
  overflow: "hidden",
} as const;
