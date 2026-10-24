"use client";

/**
 * Google Maps / Places API client loader and helper utilities.
 * Handles graceful loading, environment-variable based API key retrieval,
 * and structured extraction of place details (coordinates, placeId, address components).
 */

export interface ParsedPlaceDetails {
  name: string;
  formattedAddress: string;
  placeId: string;
  latitude: number;
  longitude: number;
  streetAddress: string;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

let googleMapsScriptPromise: Promise<boolean> | null = null;

export function getGoogleMapsApiKey(): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  return key.trim();
}

export function isGooglePlacesLoaded(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).google?.maps?.places);
}

/**
 * Dynamically loads the Google Maps JavaScript API with the Places library.
 * Reuses existing script if present; resolves false if no API key is configured.
 */
export function loadGooglePlacesScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (isGooglePlacesLoaded()) return Promise.resolve(true);

  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.resolve(false);
  }

  googleMapsScriptPromise = new Promise<boolean>((resolve) => {
    // Check if script element already exists
    const existing = document.getElementById("google-maps-places-script") as HTMLScriptElement | null;
    if (existing) {
      if (isGooglePlacesLoaded()) {
        resolve(true);
        return;
      }
      existing.addEventListener("load", () => resolve(isGooglePlacesLoaded()));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-places-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      resolve(isGooglePlacesLoaded());
    };

    script.onerror = (err) => {
      console.warn("Failed to load Google Maps Places API script:", err);
      resolve(false);
    };

    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
}

/**
 * Parses a Google PlaceResult object into clean address components and coordinates.
 */
export function parseGooglePlaceDetails(place: any): ParsedPlaceDetails | null {
  if (!place || !place.geometry || !place.geometry.location) {
    return null;
  }

  const lat = typeof place.geometry.location.lat === "function"
    ? place.geometry.location.lat()
    : place.geometry.location.lat;
  const lng = typeof place.geometry.location.lng === "function"
    ? place.geometry.location.lng()
    : place.geometry.location.lng;

  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const name = place.name || "";
  const formattedAddress = place.formatted_address || name;
  const placeId = place.place_id || "";

  let streetNumber = "";
  let route = "";
  let sublocality = "";
  let locality = "";
  let state = "";
  let postalCode = "";
  let country = "India";

  if (Array.isArray(place.address_components)) {
    for (const comp of place.address_components) {
      const types: string[] = comp.types || [];
      if (types.includes("street_number")) {
        streetNumber = comp.long_name;
      } else if (types.includes("route")) {
        route = comp.long_name;
      } else if (types.includes("sublocality_level_1") || types.includes("sublocality")) {
        sublocality = comp.long_name;
      } else if (types.includes("locality")) {
        locality = comp.long_name;
      } else if (!locality && (types.includes("postal_town") || types.includes("administrative_area_level_2"))) {
        locality = comp.long_name;
      } else if (types.includes("administrative_area_level_1")) {
        state = comp.long_name;
      } else if (types.includes("postal_code")) {
        postalCode = comp.long_name;
      } else if (types.includes("country")) {
        country = comp.long_name;
      }
    }
  }

  const streetParts = [streetNumber, route].filter(Boolean).join(" ");
  const streetAddress = streetParts || (name !== formattedAddress ? name : "");

  return {
    name,
    formattedAddress,
    placeId,
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    streetAddress: streetAddress || formattedAddress.split(",")[0] || "",
    locality: sublocality || locality || "",
    city: locality || sublocality || "",
    state,
    postalCode,
    country: country || "India",
  };
}
