// TEMPORARY Ola Maps probe — delete the zz-nav-preview folder. Reads the key server-side; never returns it.
import { readFileSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

function olaKey(): string {
  const env = readFileSync(path.join(process.cwd(), "..", "backend", ".env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("OLA_MAPS_API_KEY="));
  return (line || "").slice("OLA_MAPS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

function shape(value: any, depth = 0): any {
  if (depth > 3) return typeof value;
  if (Array.isArray(value)) return value.length ? [shape(value[0], depth + 1), `…${value.length} items`] : [];
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = shape(v, depth + 1);
    return out;
  }
  if (typeof value === "string" && value.length > 60) return value.slice(0, 60) + "…";
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "driving";
  const extra = url.searchParams.get("extra") || "";
  const key = olaKey();
  const params = new URLSearchParams({
    origin: "19.219,73.1401",
    destination: "19.2262,73.1452",
    mode,
    steps: "true",
    overview: "full",
    traffic_metadata: "true",
    language: "en",
    api_key: key,
  });
  const wp = url.searchParams.get("wp");
  if (wp) params.set("waypoints", wp);
  for (const pair of extra.split(",").filter(Boolean)) {
    const [k, v] = pair.split("=");
    params.set(k, v);
  }
  const started = Date.now();
  const res = await fetch(`https://api.olamaps.io/routing/v1/directions?${params}`, {
    method: "POST",
    headers: { "X-Request-Id": crypto.randomUUID() },
    cache: "no-store",
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  if (url.searchParams.get("save") && body?.status === "SUCCESS") {
    const { writeFileSync, mkdirSync } = await import("fs");
    const dir = path.join(process.cwd(), "..", "backend", "tests", "fixtures");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `ola_directions_${mode}.json`), JSON.stringify(body, null, 1));
  }
  const route = body?.routes?.[0];
  const leg = route?.legs?.[0];
  return Response.json({
    keyLength: key.length,
    httpStatus: res.status,
    ms: Date.now() - started,
    mode,
    topLevel: body && typeof body === "object" ? Object.keys(body) : body,
    status: body?.status,
    error: body?.error_message || body?.message || body?.reason || null,
    routeCount: body?.routes?.length,
    routeShape: shape(route ? { ...route, legs: undefined } : null),
    legShape: shape(leg ? { ...leg, steps: undefined } : null),
    firstSteps: (leg?.steps || []).slice(0, 4),
    stepCount: leg?.steps?.length,
    advisory: route?.travel_advisory,
    polyline: route?.overview_polyline,
    maneuvers: Array.from(new Set((route?.legs || []).flatMap((l: any) => (l.steps || []).map((st: any) => st.maneuver)))),
    legSummaries: (route?.legs || []).map((l: any) => ({ distance: l.distance, duration: l.duration, steps: (l.steps || []).length })),
    polylineSample: typeof route?.overview_polyline === "string" ? route.overview_polyline.slice(0, 40) : shape(route?.overview_polyline),
  });
}
