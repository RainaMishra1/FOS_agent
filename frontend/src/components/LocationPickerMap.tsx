"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ApiError, GeocodeCandidate, geocodeDispatchAddress } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  MapPin,
  Search,
  X,
  Navigation,
  Info,
  Loader2,
  Check,
  Compass,
} from "lucide-react";

interface LocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  address?: string;
  onChange: (lat: number | null, lng: number | null, suggestedAddress?: string) => void;
  height?: string;
}

export default function LocationPickerMap({
  latitude,
  longitude,
  address,
  onChange,
  height = "h-56",
}: LocationPickerMapProps) {
  const { session } = useAuth();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [isLeafletReady, setIsLeafletReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodeCandidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Dynamic Leaflet CDN Loader (client-only, SSR safe)
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ((window as any).L) {
      setIsLeafletReady(true);
      return;
    }

    // Inject CSS
    const existingLink = document.getElementById("leaflet-cdn-css");
    if (!existingLink) {
      const link = document.createElement("link");
      link.id = "leaflet-cdn-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    // Inject JS
    const existingScript = document.getElementById("leaflet-cdn-js");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "leaflet-cdn-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.crossOrigin = "";
      script.onload = () => {
        setIsLeafletReady(true);
      };
      document.body.appendChild(script);
    } else {
      existingScript.addEventListener("load", () => setIsLeafletReady(true));
    }
  }, []);

  // Helper to create custom marker icon
  const createMarkerIcon = useCallback((L: any) => {
    return L.divIcon({
      className: "custom-leaflet-marker",
      html: `
        <div style="
          position: relative;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            width: 28px;
            height: 28px;
            background: #C86D51;
            border: 2.5px solid #FFFFFF;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="
              width: 8px;
              height: 8px;
              background: #FFFFFF;
              border-radius: 50%;
              transform: rotate(45deg);
            "></div>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    });
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!isLeafletReady || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (!mapInstanceRef.current) {
      const defaultCenter = [
        latitude ?? 12.9716, // Default Bangalore
        longitude ?? 77.5946,
      ];
      const defaultZoom = latitude && longitude ? 14 : 11;

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Handle Map Click to place or move marker
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        const roundedLat = parseFloat(lat.toFixed(6));
        const roundedLng = parseFloat(lng.toFixed(6));
        onChange(roundedLat, roundedLng);
      });

      mapInstanceRef.current = map;
    }

    return () => {
      // Map cleanup on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [isLeafletReady]);

  // Synchronize Marker with latitude/longitude props
  useEffect(() => {
    if (!isLeafletReady || !mapInstanceRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const map = mapInstanceRef.current;

    if (latitude !== null && longitude !== null) {
      const pos = [latitude, longitude];

      if (markerRef.current) {
        markerRef.current.setLatLng(pos);
      } else {
        const icon = createMarkerIcon(L);
        const marker = L.marker(pos, {
          draggable: true,
          icon,
        }).addTo(map);

        marker.on("dragend", () => {
          const newPos = marker.getLatLng();
          const rLat = parseFloat(newPos.lat.toFixed(6));
          const rLng = parseFloat(newPos.lng.toFixed(6));
          onChange(rLat, rLng);
        });

        markerRef.current = marker;
      }
    } else {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
    }
  }, [latitude, longitude, isLeafletReady, createMarkerIcon, onChange]);

  // Pan to selected position
  const panToCoords = (lat: number, lng: number, zoomLevel = 15) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], zoomLevel, { animate: true });
    }
  };

  // OpenStreetMap Nominatim Geocoding Search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const response = await geocodeDispatchAddress({ address: searchQuery.trim(), country: "India" }, session?.access_token);
      if (!response.candidates.length) {
        setSearchError("No locations found for this query. Try clicking directly on the map.");
      } else {
        setSearchResults(response.candidates);
      }
    } catch (err: any) {
      setSearchError(err instanceof ApiError ? err.detail || err.message : "Address lookup unavailable. Click the map or try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (item: GeocodeCandidate) => {
    const lat = parseFloat(item.latitude.toFixed(6));
    const lng = parseFloat(item.longitude.toFixed(6));
    panToCoords(lat, lng, 15);
    onChange(lat, lng, item.display_name);
    setSearchResults([]);
    setSearchQuery("");
  };

  const handleClear = () => {
    onChange(null, null);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
  };

  return (
    <div className="space-y-2">
      {/* Geocoding Search Bar & Location Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-beige-muted absolute left-2.5 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search address / landmark (OpenStreetMap)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-16 py-1.5 rounded-xl bg-beige-bg text-xs text-beige-text placeholder-beige-muted border border-beige-border focus:outline-none focus:border-beige-terracotta"
          />
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="absolute right-1 top-1 px-2.5 py-1 rounded-lg bg-beige-sand hover:bg-beige-border text-beige-text text-[11px] font-semibold transition disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : "Search"}
          </button>
        </form>

        {latitude !== null && longitude !== null && (
          <button
            type="button"
            onClick={handleClear}
            className="px-2.5 py-1.5 rounded-xl bg-beige-sand/60 hover:bg-beige-sand text-beige-text text-xs border border-beige-border flex items-center justify-center gap-1 transition"
            title="Clear selected coordinates"
          >
            <X className="w-3.5 h-3.5 text-beige-muted" />
            <span>Clear Pin</span>
          </button>
        )}
      </div>

      {/* Geocoding Results Dropdown */}
      {searchResults.length > 0 && (
        <div className="rounded-xl bg-beige-card border border-beige-border shadow-md overflow-hidden text-xs divide-y divide-beige-border/60 z-30">
          {searchResults.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => selectSearchResult(item)}
              className="w-full text-left px-3 py-2 hover:bg-beige-sand/60 transition flex items-start gap-2 text-beige-text"
            >
              <MapPin className="w-3.5 h-3.5 text-beige-terracotta shrink-0 mt-0.5" />
            <span className="truncate">{item.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {searchError && (
        <p className="text-[11px] text-beige-muted bg-beige-sand/40 px-2.5 py-1 rounded-lg border border-beige-border">
          {searchError}
        </p>
      )}

      {/* Interactive Map Canvas */}
      <div className={`relative w-full ${height} rounded-xl overflow-hidden border border-beige-border bg-[#EBE4D5]`}>
        {!isLeafletReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-beige-card/80 text-beige-muted text-xs gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-beige-terracotta" />
            <span>Loading OpenStreetMap...</span>
          </div>
        )}

        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Map Overlay Badge */}
        <div className="absolute top-2 left-2 z-[400] pointer-events-none flex items-center gap-1.5 px-2 py-1 rounded-lg bg-beige-card/90 backdrop-blur-xs border border-beige-border text-[10px] font-medium text-beige-text shadow-xs">
          <MapPin className="w-3 h-3 text-beige-terracotta" />
          <span>Click map or drag marker to set coordinates</span>
        </div>

        {/* Admin-Provided Location Provenance Badge */}
        {latitude !== null && longitude !== null && (
          <div className="absolute bottom-2 left-2 z-[400] pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-beige-sand/95 border border-beige-border text-[10px] font-mono text-beige-text shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-beige-terracotta animate-pulse"></span>
            <span>Admin-Provided Location (Static Hub)</span>
          </div>
        )}
      </div>

      {/* Coordinate & Status Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-beige-muted pt-0.5">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-beige-muted shrink-0" />
          <span>
            {latitude !== null && longitude !== null ? (
              <span className="text-beige-text font-mono font-medium">
                Lat: {latitude.toFixed(6)}, Lng: {longitude.toFixed(6)}
              </span>
            ) : (
              <span>Coordinates are optional. You can create an agent without initial location.</span>
            )}
          </span>
        </div>
        {latitude !== null && longitude !== null && (
          <span className="px-2 py-0.5 rounded-md bg-beige-olive-subtle text-beige-olive font-semibold text-[10px]">
            Coords Ready
          </span>
        )}
      </div>
    </div>
  );
}
