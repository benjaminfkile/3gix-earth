// The readout, the compass, the settings switches (design section 5 items 1,
// 2, and 8), and the floating panel button used on wide screens.

import { useState, type ReactNode } from "react";
import { Box, Button, ButtonBase, FormControlLabel, IconButton, Paper, Popover, Stack, Switch, ToggleButton, ToggleButtonGroup, Tooltip, Typography, type SxProps, type Theme } from "@mui/material";
import type { NavMode } from "./mode";
import { formatAngle, formatLength, latLonText, type Readout } from "./view";
import { deg } from "./geo/wgs84";

/** Insets from the view's edges that keep clear of a phone's notch and home bar. */
export const inset = {
  top: (px: number) => `calc(${px}px + env(safe-area-inset-top, 0px))`,
  bottom: (px: number) => `calc(${px}px + env(safe-area-inset-bottom, 0px))`,
  left: (px: number) => `calc(${px}px + env(safe-area-inset-left, 0px))`,
  right: (px: number) => `calc(${px}px + env(safe-area-inset-right, 0px))`,
};

/** A button over the view that opens a panel in a popover (wide screens). */
export function PanelButton({ label, sx, children }: { label: string; sx: SxProps<Theme>; children: ReactNode }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button variant="contained" color="inherit" size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={{ position: "absolute", ...sx }}>
        {label}
      </Button>
      <Popover open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
        <Box sx={{ p: 1.5, width: "min(360px, 90vw)" }} onClick={(e) => (e.target as HTMLElement).closest("[data-closes]") && setAnchor(null)}>
          {children}
        </Box>
      </Popover>
    </>
  );
}

export function ReadoutPanel({ readout, onCopy }: { readout: Readout; onCopy: (text: string) => void }) {
  return (
    <Paper sx={{ position: "absolute", left: inset.left(8), bottom: inset.bottom(8), opacity: 0.9 }}>
      <ReadoutBody readout={readout} onCopy={onCopy} />
    </Paper>
  );
}

export function ReadoutBody({ readout, onCopy }: { readout: Readout; onCopy: (text: string) => void }) {
  return (
    <>
      <Tooltip title="Copy lat, lon">
        <ButtonBase
          aria-label="readout"
          onClick={() => onCopy(latLonText(readout.lat, readout.lon))}
          sx={{ display: "block", textAlign: "left", px: 1.5, py: 1 }}
        >
          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
            {formatAngle(readout.lat, "N", "S")} {formatAngle(readout.lon, "E", "W")}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
            Height above ground {formatLength(readout.height)}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
            Ground elevation (above ellipsoid) {formatLength(readout.elevation)}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
            Heading {deg(readout.heading).toFixed(1)}&deg;
          </Typography>
        </ButtonBase>
      </Tooltip>
    </>
  );
}

export function Compass({ heading, onNorthUp, onStraightDown }: { heading: number; onNorthUp: () => void; onStraightDown: () => void }) {
  return (
    <Stack spacing={1} sx={{ position: "absolute", right: inset.right(8), top: inset.top(56), alignItems: "center" }}>
      <Tooltip title="North up">
        <IconButton aria-label="north up" onClick={onNorthUp} sx={{ bgcolor: "background.paper", width: 48, height: 48 }}>
          <Box
            component="svg"
            viewBox="-10 -10 20 20"
            width={32}
            height={32}
            data-testid="compass-needle"
            style={{ transform: `rotate(${-deg(heading)}deg)` }}
          >
            <polygon points="0,-9 3,0 -3,0" fill="#e53935" />
            <polygon points="0,9 3,0 -3,0" fill="#bdbdbd" />
            <text x="0" y="-3" fontSize="5" textAnchor="middle" fill="white" dy="-7">
              N
            </text>
          </Box>
        </IconButton>
      </Tooltip>
      <Button size="small" variant="contained" color="inherit" onClick={onStraightDown} sx={{ minWidth: 48 }}>
        Down
      </Button>
    </Stack>
  );
}

export interface SettingsState {
  hud: boolean;
  debug: boolean;
}

export interface SettingsProps {
  value: SettingsState;
  onChange: (v: SettingsState) => void;
  mode: NavMode;
  onMode: (m: NavMode) => void;
}

export function SettingsBody({ value, onChange, mode, onMode }: SettingsProps) {
  return (
    <Stack spacing={1}>
      <FormControlLabel control={<Switch checked={value.hud} onChange={(_, hud) => onChange({ ...value, hud })} />} label="HUD" />
      <FormControlLabel control={<Switch checked={value.debug} onChange={(_, debug) => onChange({ ...value, debug })} />} label="Debug panel" />
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography variant="body2">Mode</Typography>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, m: NavMode | null) => m && onMode(m)} aria-label="settings mode">
          <ToggleButton value="earth">Earth mode</ToggleButton>
          <ToggleButton value="fly">Fly mode</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
    </Stack>
  );
}

export function Settings(props: SettingsProps) {
  return (
    <PanelButton label="Settings" sx={{ right: inset.right(8), top: inset.top(8) }}>
      <SettingsBody {...props} />
    </PanelButton>
  );
}
