// TEMPORARY Ola Maps key check — delete the zz-nav-preview folder.
import { readFileSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

function olaKey(): string {
  const env = readFileSync(path.join(process.cwd(), "..", "backend", ".env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("OLA_MAPS_API_KEY="));
  return (line || "").slice("OLA_MAPS_API_KEY=".length).trim();
}

async function probe(label: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();
  return { label, status: res.status, body: text.slice(0, 160) };
}

export async function GET() {
  const key = encodeURIComponent(olaKey());
  const id = { "X-Request-Id": crypto.randomUUID() };
  const results = await Promise.all([
    probe("autocomplete", `https://api.olamaps.io/places/v1/autocomplete?input=Kalyan&api_key=${key}`, { headers: id }),
    probe("autocomplete+referer", `https://api.olamaps.io/places/v1/autocomplete?input=Kalyan&api_key=${key}`, {
      headers: { ...id, Referer: "http://localhost:3000/", Origin: "http://localhost:3000" },
    }),
    probe("reverse-geocode", `https://api.olamaps.io/places/v1/reverse-geocode?latlng=19.219,73.1401&api_key=${key}`, { headers: id }),
    probe("directions-basic", `https://api.olamaps.io/routing/v1/directions/basic?origin=19.219,73.1401&destination=19.2262,73.1452&api_key=${key}`, {
      method: "POST",
      headers: id,
    }),
    probe("styles", `https://api.olamaps.io/tiles/vector/v1/styles.json?api_key=${key}`),
  ]);
  return Response.json(results);
}
