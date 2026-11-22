import { TerritoryApiItem } from "@/lib/api";
import { distanceOutsideArea } from "@/lib/geoUtils";

const km = (metres?: number | null) => (metres ? `${+(metres / 1000).toFixed(2)} km` : "");

/** "Kalyan → Thane (+2 km margin)" / "3 km around X", or null for drawn regions. */
export function describeTerritory(t: TerritoryApiItem): string | null {
  if (t.definition_type === "box" && t.start_label && t.end_label) {
    return `${t.start_label} → ${t.end_label} (+${km(t.radius_meters)} margin)`;
  }
  if (t.definition_type === "radius" && t.start_label) return `${km(t.radius_meters)} around ${t.start_label}`;
  return null;
}

/** Metres outside a radius/box region (0 inside), or null for drawn ones. */
export function metresOutsideTerritory(t: TerritoryApiItem, latitude: number, longitude: number): number | null {
  if (!t.radius_meters || t.start_latitude == null || t.start_longitude == null) return null;
  if (t.definition_type === "radius") {
    return distanceOutsideArea([latitude, longitude], [t.start_latitude, t.start_longitude], null, t.radius_meters);
  }
  if (t.definition_type === "box" && t.end_latitude != null && t.end_longitude != null) {
    return distanceOutsideArea(
      [latitude, longitude],
      [t.start_latitude, t.start_longitude],
      [t.end_latitude, t.end_longitude],
      t.radius_meters
    );
  }
  return null;
}
