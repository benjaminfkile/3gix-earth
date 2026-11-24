// The bottom sheet for narrow screens (design section 5): the panels as tabs
// in a `SwipeableDrawer`. Closed, only its handle shows, at the bottom edge.

import { useState, type ReactNode } from "react";
import { Box, Button, SwipeableDrawer, Tab, Tabs } from "@mui/material";
import { inset } from "./controls";

export interface SheetTab {
  label: string;
  body: ReactNode;
}

export function BottomSheet({ tabs }: { tabs: readonly SheetTab[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const current = Math.min(tab, tabs.length - 1);
  return (
    <>
      <Button
        variant="contained"
        color="inherit"
        aria-label="open panels"
        onClick={() => setOpen(true)}
        sx={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: inset.bottom(8), minWidth: 120 }}
      >
        Panels
      </Button>
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        swipeAreaWidth={24}
        slotProps={{ paper: { sx: { maxHeight: "75%", pb: "env(safe-area-inset-bottom, 0px)", pl: "env(safe-area-inset-left, 0px)", pr: "env(safe-area-inset-right, 0px)" } } }}
      >
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Tabs value={current} onChange={(_, v: number) => setTab(v)} variant="scrollable" scrollButtons="auto" aria-label="panels" sx={{ flex: 1 }}>
            {tabs.map((t) => (
              <Tab key={t.label} label={t.label} />
            ))}
          </Tabs>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </Box>
        <Box role="tabpanel" sx={{ p: 1.5, overflow: "auto" }} onClick={(e) => (e.target as HTMLElement).closest("[data-closes]") && setOpen(false)}>
          {tabs[current]?.body}
        </Box>
      </SwipeableDrawer>
    </>
  );
}
