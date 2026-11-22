// Pure helpers for turn-by-turn navigation: progress along the route, instructions, voice phrasing.

export type ManeuverKind =
  | "straight"
  | "left"
  | "right"
  | "slight-left"
  | "slight-right"
  | "sharp-left"
  | "sharp-right"
  | "uturn"
  | "roundabout"
  | "depart"
  | "arrive";

export type LatLng = [number, number];

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface RouteProgress {
  /** Index of the route segment [i, i+1] the agent is on. */
  segmentIndex: number;
  /** Agent position snapped onto the route. */
  snapped: LatLng;
  /** How far the agent is from the route line. */
  offRouteMeters: number;
  traveledMeters: number;
  remainingMeters: number;
  totalMeters: number;
  /** Direction of travel along the route at the snapped point. */
  bearing: number;
}

/** Project a position onto a polyline (flat-earth approximation, fine at city scale). */
export function routeProgress(route: LatLng[], pos: LatLng): RouteProgress | null {
  if (route.length < 2) return null;
  const cosLat = Math.cos((pos[0] * Math.PI) / 180);
  const toXY = (p: LatLng) => [p[1] * 111320 * cosLat, p[0] * 110540] as const;
  const [px, py] = toXY(pos);

  const segLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const d = distanceMeters(route[i][0], route[i][1], route[i + 1][0], route[i + 1][1]);
    segLengths.push(d);
    total += d;
  }

  let best = { index: 0, t: 0, dist: Infinity };
  for (let i = 0; i < route.length - 1; i++) {
    const [ax, ay] = toXY(route[i]);
    const [bx, by] = toXY(route[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const dist = Math.hypot(px - cx, py - cy);
    if (dist < best.dist) best = { index: i, t, dist };
  }

  const a = route[best.index];
  const b = route[best.index + 1];
  const snapped: LatLng = [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t];
  let traveled = 0;
  for (let i = 0; i < best.index; i++) traveled += segLengths[i];
  traveled += segLengths[best.index] * best.t;

  return {
    segmentIndex: best.index,
    snapped,
    offRouteMeters: best.dist,
    traveledMeters: traveled,
    remainingMeters: Math.max(0, total - traveled),
    totalMeters: total,
    bearing: bearingDegrees(a[0], a[1], b[0], b[1]),
  };
}

/** The part of the route still ahead of the agent, starting at the snapped point. */
export function remainingRoute(route: LatLng[], progress: RouteProgress): LatLng[] {
  return [progress.snapped, ...route.slice(progress.segmentIndex + 1)];
}

export function maneuverKind(type?: string, modifier?: string): ManeuverKind {
  const t = (type || "").toLowerCase();
  const m = (modifier || "").toLowerCase();
  if (t === "arrive") return "arrive";
  if (t === "depart") return "depart";
  if (t.includes("roundabout") || t === "rotary") return "roundabout";
  if (m === "uturn") return "uturn";
  if (m === "sharp left") return "sharp-left";
  if (m === "sharp right") return "sharp-right";
  if (m === "slight left") return "slight-left";
  if (m === "slight right") return "slight-right";
  if (m === "left") return "left";
  if (m === "right") return "right";
  return "straight";
}

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth"];

/** Short, speakable instruction ("Turn left onto Station Road"). Unnamed roads get no "onto". */
export function buildInstruction(opts: {
  type?: string;
  modifier?: string;
  name?: string;
  exit?: number;
  provided?: string;
  destinationName?: string;
}): string {
  const kind = maneuverKind(opts.type, opts.modifier);
  // Ola / Google give ready-made instructions; arrival uses our own wording with the customer's name.
  if (opts.provided && kind !== "arrive") return opts.provided;
  const name = (opts.name || "").trim();
  const onto = name ? ` onto ${name}` : "";
  switch (kind) {
    case "arrive":
      return `Arrive at ${opts.destinationName || "your destination"}`;
    case "depart":
      return name ? `Head along ${name}` : "Head along the route";
    case "roundabout": {
      const exit = opts.exit && opts.exit < ORDINALS.length ? ORDINALS[opts.exit] : opts.exit ? `exit ${opts.exit}` : "";
      return exit ? `At the roundabout, take the ${exit} exit${onto}` : `Go through the roundabout${onto}`;
    }
    case "uturn":
      return `Make a U-turn${onto}`;
    case "sharp-left":
      return `Turn sharp left${onto}`;
    case "sharp-right":
      return `Turn sharp right${onto}`;
    case "slight-left":
      return `Keep left${onto}`;
    case "slight-right":
      return `Keep right${onto}`;
    case "left":
      return `Turn left${onto}`;
    case "right":
      return `Turn right${onto}`;
    default:
      return name ? `Continue on ${name}` : "Continue straight";
  }
}

/** Distances (m) at which an upcoming maneuver is announced, by travel mode. */
export function announceThresholds(mode: "car" | "bike" | "walk", speedMps?: number | null): number[] {
  if (mode === "walk") return [150, 40];
  // The final "Turn right" must fire before the turn even at speed: at least ~6 s of travel ahead.
  const final = Math.max(60, Math.min(200, (speedMps ?? 0) * 6));
  return [600, 250, Math.round(final)];
}

/** Only real decisions are spoken; "continue straight" and the departure step stay silent. */
export function isAnnounced(kind: ManeuverKind): boolean {
  return kind !== "straight" && kind !== "depart";
}

/** "500 metres" / "1.2 kilometres", rounded the way navigation apps speak distances. */
export function spokenDistance(meters: number): string {
  if (meters >= 1000) {
    const km = Math.round(meters / 100) / 10;
    return `${km} kilometre${km === 1 ? "" : "s"}`;
  }
  const step = meters > 300 ? 100 : meters > 100 ? 50 : 10;
  const rounded = Math.max(step, Math.round(meters / step) * step);
  return `${rounded} metres`;
}

/**
 * Decide what (if anything) to announce for the upcoming maneuver.
 * `spoken` holds thresholds already used for this maneuver; it is updated in place.
 */
export function nextAnnouncement(
  distanceToManeuver: number,
  instruction: string,
  thresholds: number[],
  spoken: Set<number>
): string | null {
  const due = thresholds.filter((t) => distanceToManeuver <= t && !spoken.has(t));
  if (!due.length) return null;
  due.forEach((t) => spoken.add(t));
  // A threshold only a little closer than now would repeat almost at once ("In 300 m" then "In 250 m"): skip it.
  // The final "turn now" prompt is never skipped this way.
  const finalThreshold = Math.min(...thresholds);
  thresholds.forEach((t) => {
    if (t !== finalThreshold && t >= distanceToManeuver * 0.75) spoken.add(t);
  });
  const smallest = Math.min(...thresholds);
  if (distanceToManeuver <= smallest) return instruction;
  return `In ${spokenDistance(distanceToManeuver)}, ${lowerFirst(instruction)}`;
}

function lowerFirst(text: string) {
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}

export function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 10) * 10} m`;
}

export function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
