// The readout, the compass, and the settings switches (design section 5
// items 1, 2, and 8).

import { useState } from "react";
import { Box, Button, ButtonBase, FormControlLabel, IconButton, Paper, Popover, Stack, Switch, Tooltip, Typography } from "@mui/material";
import { formatAngle, formatLength, latLonText, type Readout } from "./view";
import { deg } from "./geo/wgs84";

export function ReadoutPanel({ readout, onCopy }: { readout: Readout; onCopy: (text: string) => void }) {
  return (
    <Paper sx={{ position: "absolute", left: 8, bottom: 8, opacity: 0.9 }}>
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
    </Paper>
  );
}

export function Compass({ heading, onNorthUp, onStraightDown }: { heading: number; onNorthUp: () => void; onStraightDown: () => void }) {
  return (
    <Stack spacing={1} sx={{ position: "absolute", right: 8, top: 56, alignItems: "center" }}>
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
      <Button size="small" variant="contained" color="inherit" onClick={onStraightDown} sx={{ minWidth: 0 }}>
        Down
      </Button>
    </Stack>
  );
}

export interface SettingsState {
  hud: boolean;
  debug: boolean;
}

export function Settings({ value, onChange }: { value: SettingsState; onChange: (v: SettingsState) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        size="small"
        variant="contained"
        color="inherit"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ position: "absolute", right: 8, top: 8 }}
      >
        Settings
      </Button>
      <Popover open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        <Stack sx={{ p: 2 }}>
          <FormControlLabel control={<Switch checked={value.hud} onChange={(_, hud) => onChange({ ...value, hud })} />} label="HUD" />
          <FormControlLabel control={<Switch checked={value.debug} onChange={(_, debug) => onChange({ ...value, debug })} />} label="Debug panel" />
        </Stack>
      </Popover>
    </>
  );
}
