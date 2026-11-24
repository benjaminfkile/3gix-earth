// The bookmarks control (design section 5 item 7): save the current view
// with a name, list, go to, rename, delete. Storage is in `bookmarks.ts`.

import { useState } from "react";
import { Box, Button, IconButton, List, ListItem, ListItemButton, ListItemText, Popover, Stack, TextField, Typography } from "@mui/material";
import type { Bookmark } from "./bookmarks";

export interface BookmarksProps {
  list: readonly Bookmark[];
  onSave: (name: string) => void;
  onGo: (b: Bookmark) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function BookmarksPanel({ list, onSave, onGo, onRename, onDelete }: BookmarksProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const save = () => {
    onSave(name);
    setName("");
  };
  return (
    <>
      <Button variant="contained" color="inherit" size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={{ position: "absolute", left: 8, top: 56 }}>
        Bookmarks
      </Button>
      <Popover open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
        <Box sx={{ p: 1.5, width: "min(320px, 90vw)" }}>
          <Stack direction="row" spacing={1} component="form" onSubmit={(e) => (e.preventDefault(), save())}>
            <TextField size="small" fullWidth placeholder="Name this view" value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { "aria-label": "bookmark name" } }} />
            <Button type="submit" variant="contained">
              Save
            </Button>
          </Stack>
          {list.length === 0 ? (
            <Typography variant="body2" sx={{ mt: 1.5 }} color="text.secondary">
              No bookmarks yet.
            </Typography>
          ) : (
            <List dense aria-label="bookmarks">
              {list.map((b) =>
                editing?.id === b.id ? (
                  <ListItem key={b.id} disableGutters>
                    <Stack direction="row" spacing={1} component="form" sx={{ width: "100%" }} onSubmit={(e) => (e.preventDefault(), onRename(b.id, editing.name), setEditing(null))}>
                      <TextField size="small" fullWidth autoFocus value={editing.name} onChange={(e) => setEditing({ id: b.id, name: e.target.value })} slotProps={{ htmlInput: { "aria-label": "new name" } }} />
                      <Button type="submit">OK</Button>
                    </Stack>
                  </ListItem>
                ) : (
                  <ListItem
                    key={b.id}
                    disableGutters
                    secondaryAction={
                      <>
                        <IconButton size="small" aria-label={`rename ${b.name}`} onClick={() => setEditing({ id: b.id, name: b.name })}>
                          ✎
                        </IconButton>
                        <IconButton size="small" aria-label={`delete ${b.name}`} onClick={() => onDelete(b.id)}>
                          ✕
                        </IconButton>
                      </>
                    }
                  >
                    <ListItemButton onClick={() => (onGo(b), setAnchor(null))} sx={{ pr: 10 }}>
                      <ListItemText primary={b.name} />
                    </ListItemButton>
                  </ListItem>
                ),
              )}
            </List>
          )}
        </Box>
      </Popover>
    </>
  );
}
