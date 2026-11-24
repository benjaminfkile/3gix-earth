// The mode toggle in the toolbar and Fly mode's touch controls: the virtual
// joystick at the lower left and the boost button (design section 4).

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Box, Button, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { styled } from "@mui/material/styles";
import type { NavMode } from "./mode";
import { stickVector, type Stick } from "./nav/fly";
import { inset } from "./controls";

export function ModeToggle({ mode, onChange }: { mode: NavMode; onChange: (m: NavMode) => void }) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={mode}
      onChange={(_, m: NavMode | null) => m && onChange(m)}
      aria-label="navigation mode"
      sx={{ position: "absolute", left: inset.left(8), top: inset.top(8), bgcolor: "background.paper" }}
    >
      <ToggleButton value="earth">Earth</ToggleButton>
      <ToggleButton value="fly">Fly</ToggleButton>
    </ToggleButtonGroup>
  );
}

/** The joystick's radius, CSS pixels. */
const RADIUS = 56;
const KNOB = 44;

const Base = styled(Box)(({ theme }) => ({
  position: "absolute",
  left: inset.left(24),
  // Above the readout (wide) or the closed bottom sheet (narrow).
  bottom: inset.bottom(132),
  width: RADIUS * 2,
  height: RADIUS * 2,
  borderRadius: "50%",
  background: theme.palette.action.selected,
  border: `2px solid ${theme.palette.divider}`,
  touchAction: "none",
  userSelect: "none",
}));

const Knob = styled(Box)(({ theme }) => ({
  position: "absolute",
  left: RADIUS - KNOB / 2 - 2,
  top: RADIUS - KNOB / 2 - 2,
  width: KNOB,
  height: KNOB,
  borderRadius: "50%",
  background: theme.palette.grey[300],
  opacity: 0.85,
  pointerEvents: "none",
}));

/** The virtual joystick: reports the deflection (`stickVector`) while held, zero on release. */
export function Joystick({ onStick }: { onStick: (s: Stick) => void }) {
  const [knob, setKnob] = useState<Stick>({ x: 0, y: 0 });
  const held = useRef<number | null>(null);
  const at = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = stickVector({ x: (e.clientX - r.left - RADIUS) / RADIUS, y: (e.clientY - r.top - RADIUS) / RADIUS });
    setKnob(s);
    onStick(s);
  };
  const release = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (held.current !== e.pointerId) return;
    held.current = null;
    setKnob({ x: 0, y: 0 });
    onStick({ x: 0, y: 0 });
  };
  return (
    <Base
      data-testid="joystick"
      aria-label="move"
      onPointerDown={(e) => {
        if (held.current !== null) return;
        held.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        at(e);
      }}
      onPointerMove={(e) => held.current === e.pointerId && at(e)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <Knob style={{ transform: `translate(${knob.x * RADIUS}px, ${knob.y * RADIUS}px)` }} />
    </Base>
  );
}

/** Boost while held. */
export function BoostButton({ onBoost }: { onBoost: (on: boolean) => void }) {
  return (
    <Button
      variant="contained"
      color="inherit"
      aria-label="boost"
      onPointerDown={() => onBoost(true)}
      onPointerUp={() => onBoost(false)}
      onPointerCancel={() => onBoost(false)}
      onPointerLeave={() => onBoost(false)}
      sx={{ position: "absolute", right: inset.right(24), bottom: inset.bottom(80), borderRadius: "50%", width: 72, height: 72, minWidth: 0, touchAction: "none" }}
    >
      Boost
    </Button>
  );
}
