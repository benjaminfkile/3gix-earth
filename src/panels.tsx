// The time of day and layers controls (design section 5 items 5 and 6).
// Each is a plain panel body: a floating panel on wide screens, a tab of the
// bottom sheet on narrow ones.

import { Box, Button, FormControlLabel, Slider, Stack, Switch, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { LayerInfo, TimeState } from "3gix-renderer";
import { PLAY_SPEEDS, clockText, instantAt, secondsOfDay } from "./time";

export interface TimeProps {
  time: TimeState;
  /** The camera's longitude, radians east. */
  lon: number;
  /** The play speed chosen, used when playing. */
  speed: number;
  onTime: (utcMs: number) => void;
  onScale: (scale: number) => void;
  onSpeed: (speed: number) => void;
  onNow: () => void;
}

export function TimeBody({ time, lon, speed, onTime, onScale, onSpeed, onNow }: TimeProps) {
  const seconds = secondsOfDay(lon, time.utcMs);
  const playing = time.timeScale !== 0;
  return (
    <Stack spacing={1}>
      <Typography variant="body2">
        Local solar time {clockText(seconds)}, {new Date(time.utcMs).toISOString().slice(0, 16).replace("T", " ")} UTC
      </Typography>
      <Box sx={{ px: 1.5 }}>
        <Slider
          aria-label="time of day"
          min={0}
          max={86_399}
          step={60}
          value={seconds}
          valueLabelDisplay="auto"
          valueLabelFormat={clockText}
          onChange={(_, v) => onTime(instantAt(lon, time.utcMs, v as number))}
        />
      </Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
        <Button variant="contained" onClick={() => onScale(playing ? 0 : speed)}>
          {playing ? "Pause" : "Play"}
        </Button>
        <Button variant="outlined" onClick={onNow}>
          Now
        </Button>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={speed}
          aria-label="play speed"
          onChange={(_, s: number | null) => {
            if (s === null) return;
            onSpeed(s);
            if (playing) onScale(s);
          }}
        >
          {PLAY_SPEEDS.map((s) => (
            <ToggleButton key={s} value={s}>
              {s}x
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>
    </Stack>
  );
}

export interface LayersProps {
  layers: readonly LayerInfo[];
  onShown: (id: string, shown: boolean) => void;
  budget: number;
  maxBudget: number;
  onBudget: (workers: number) => void;
}

export function LayersBody({ layers, onShown, budget, maxBudget, onBudget }: LayersProps) {
  return (
    <Stack spacing={1}>
      {layers.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No layers in this build.
        </Typography>
      )}
      {layers.map((l) => (
        <FormControlLabel
          key={l.id}
          control={<Switch checked={l.shown} onChange={(_, on) => onShown(l.id, on)} />}
          label={l.overlay ? `${l.id} (overlay)` : l.id}
        />
      ))}
      <Typography variant="body2" id="budget-label">
        Compute budget: {budget} of {maxBudget} workers{budget === 0 ? " (computing off)" : ""}
      </Typography>
      <Box sx={{ px: 1.5 }}>
        <Slider
          aria-labelledby="budget-label"
          min={0}
          max={maxBudget}
          step={1}
          marks
          value={budget}
          disabled={maxBudget === 0}
          onChange={(_, v) => onBudget(v as number)}
        />
      </Box>
    </Stack>
  );
}
