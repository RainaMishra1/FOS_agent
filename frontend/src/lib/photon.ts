/**
 * Photon Geocoding API client and types.
 * Open-source search-as-you-type geocoder based on OpenStreetMap data by Komoot.
 * Endpoint: https://photon.komoot.io/api/
 */

export interface PhotonFeatureProperties {
  osm_type?: "N" | "W" | "R" | string;
  osm_id?: number;
  osm_key?: string;
  osm_value?: string;
  type?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countrycode?: string;
  extent?: [number, number, number, number];
}

export interface PhotonFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude] in GeoJSON
  };
  properties: PhotonFeatureProperties;
}

export interface PhotonResponse {
  type: "FeatureCollection";
  features: PhotonFeature[];
}

export interface ParsedPhotonPlace {
  name: string;
  formattedAddress: string;
  street: string;
  housenumber: string;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  osmType?: string;
  osmId?: number;
  placeType?: string;
  label: string;
}

/**
 * Builds a clean, human-readable address and label from Photon feature properties.
 */
export function parsePhotonFeature(feature: PhotonFeature): ParsedPhotonPlace | null {
  if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) {
    return null;
  }

  const [lon, lat] = feature.geometry.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const props = feature.properties || {};

  const name = (props.name || "").trim();
  const housenumber = (props.housenumber || "").trim();
  const street = (props.street || "").trim();
  const locality = (props.locality || props.district || "").trim();
  const city = (props.city || props.county || "").trim();
  const state = (props.state || "").trim();
  const postalCode = (props.postcode || "").trim();
  const country = (props.country || "India").trim();
  const countryCode = (props.countrycode || "IN").toUpperCase();

  // Build street line
  const streetLine = [housenumber, street].filter(Boolean).join(" ");

  // Build full descriptive formatted address
  const addressParts: string[] = [];
  if (name && name !== street && name !== locality && name !== city) {
    addressParts.push(name);
  }
  if (streetLine) {
    addressParts.push(streetLine);
  }
  if (locality && locality !== city) {
    addressParts.push(locality);
  }
  if (city) {
    addressParts.push(city);
  }
  if (state) {
    addressParts.push(state);
  }
  if (postalCode) {
    addressParts.push(postalCode);
  }
  if (country) {
    addressParts.push(country);
  }

  const formattedAddress = addressParts.join(", ") || name || `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

  // Secondary descriptive label for suggestion lists
  const secondaryParts = [locality, city, state, postalCode, country].filter(
    (part) => Boolean(part) && part !== name
  );
  const label = secondaryParts.join(", ") || country;

  return {
    name: name || streetLine || city || "Selected Place",
    formattedAddress,
    street: streetLine || name,
    housenumber,
    locality: locality || city,
    city: city || locality,
    state,
    postalCode,
    country,
    countryCode,
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lon.toFixed(6)),
    osmType: props.osm_type,
    osmId: props.osm_id,
    placeType: props.type || props.osm_value,
    label,
  };
}

/**
 * Searches Photon API for address autocomplete suggestions.
 * Prioritizes India (countrycode=IN or lon/lat bias around India: lat=20.5937, lon=78.9629).
 * Respects public demo endpoint fair use.
 */
export async function searchPhotonAddress(
  query: string,
  options?: {
    limit?: number;
    lang?: string;
    biasLat?: number;
    biasLon?: number;
    signal?: AbortSignal;
  }
): Promise<ParsedPhotonPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const limit = options?.limit ?? 8;
  const lang = options?.lang ?? "en";
  // India geographic center bias (approx 20.5937, 78.9629) or provided bias
  const lat = options?.biasLat ?? 20.5937;
  const lon = options?.biasLon ?? 78.9629;

  const params = new URLSearchParams();
  params.set("q", trimmed);
  params.set("limit", String(limit));
  params.set("lang", lang);
  params.set("lat", String(lat));
  params.set("lon", String(lon));

  const url = `https://photon.komoot.io/api/?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: options?.signal,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Photon API returned status ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  let data: PhotonResponse | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!data || !Array.isArray(data.features)) {
    return [];
  }

  // Parse and sort features: prioritize Indian locations (countrycode === "IN" or country === "India")
  const parsed = data.features
    .map(parsePhotonFeature)
    .filter((item): item is ParsedPhotonPlace => item !== null);

  parsed.sort((a, b) => {
    const aIsIndia = a.countryCode === "IN" || a.country.toLowerCase() === "india";
    const bIsIndia = b.countryCode === "IN" || b.country.toLowerCase() === "india";
    if (aIsIndia && !bIsIndia) return -1;
    if (!aIsIndia && bIsIndia) return 1;
    return 0;
  });

  return parsed;
}
