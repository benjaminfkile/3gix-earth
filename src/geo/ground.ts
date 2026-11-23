// The ground under a point (design section 4).
//
// `surfaceHeight(frame, direction)` (renderer `api.md` section 6, from
// `gx_core::surface`): the reference point is where `direction` from the
// frame origin meets the reference ellipsoid, and the drawn surface lies
// `height` meters from it along the ellipsoid's outward normal there. So for
// the geodetic latitude and longitude under a point, the direction to ask
// along is the one through the ellipsoid point at that latitude and
// longitude (`toDirection`), and the ground point is that ellipsoid point
// moved `height` along the geodetic up: on the same normal as the point.

import type { SurfaceHeight, Vec3 } from "3gix-renderer";
import { EARTH_FRAME } from "../earth";
import { fromPosition, toDirection, toPosition } from "./wgs84";

/** What `groundUnder` needs from the renderer. */
export interface SurfaceSource {
  surfaceHeight(frameId: number, direction: Vec3): SurfaceHeight | null;
}

export interface Ground {
  /** The ground point in frame 4's axes. */
  point: Vec3;
  /** The drawn surface height above the reference ellipsoid, meters; 0 when nothing is loaded. */
  elevation: number;
  /** Whether a surface tile gave it, or the reference ellipsoid stood in. */
  loaded: boolean;
}

/** The ground on the geodetic normal through a position, the reference ellipsoid when no tile is loaded there. */
export function groundUnder(source: SurfaceSource, position: Vec3): Ground {
  const { lat, lon } = fromPosition(position);
  const s = source.surfaceHeight(EARTH_FRAME, toDirection(lat, lon));
  const elevation = s && Number.isFinite(s.height) ? s.height : 0;
  return { point: toPosition({ lat, lon, height: elevation }), elevation, loaded: s !== null };
}
