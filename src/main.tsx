// The stand-alone page: EarthApp full screen.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EarthApp from "./EarthApp";

const root = document.getElementById("root") as HTMLElement;
Object.assign(document.documentElement.style, { height: "100%" });
Object.assign(document.body.style, { height: "100%", margin: "0" });
Object.assign(root.style, { height: "100%" });

createRoot(root).render(
  <StrictMode>
    <EarthApp />
  </StrictMode>,
);
