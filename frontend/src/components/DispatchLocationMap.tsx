"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Crosshair, CheckCircle2, AlertCircle } from "lucide-react";

interface DispatchLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  isEntranceVerified?: boolean;
  placeLabel?: string | null;
  onSelect: (latitude: number, longitude: number, isEntranceAdjusted: boolean) => void;
}

export default function DispatchLocationMap({
  latitude,
  longitude,
  isEntranceVerified = false,
  placeLabel = null,
  onSelect,
}: DispatchLocationMapProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [hasMovedPin, setHasMovedPin] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Load Leaflet CSS and JS if not already on page
  useEffect(() => {
    if ((window as any).L) {
      setReady(true);
      return;
    }
    if (!document.getElementById("dispatch-leaflet-css")) {
      const css = document.createElement("link");
      css.id = "dispatch-leaflet-css";
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    let script = document.getElementById("dispatch-leaflet-js") as HTMLScriptElement | null;
    const loaded = () => setReady(Boolean((window as any).L));
    if (!script) {
      script = document.createElement("script");
      script.id = "dispatch-leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = loaded;
      document.body.appendChild(script);
    } else if ((window as any).L) {
      loaded();
    } else {
      script.addEventListener("load", loaded);
    }
    return () => script?.removeEventListener("load", loaded);
  }, []);

  // Initialize and update Map & Draggable Marker
  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !elementRef.current) return;

    if (!mapRef.current) {
      const initialZoom = latitude != null && longitude != null ? 17 : 12;
      const map = L.map(elementRef.current).setView(
        [latitude ?? 12.9716, longitude ?? 77.5946],
        initialZoom
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Allow clicking directly on the map to set entrance pin
      map.on("click", (event: any) => {
        const lat = Number(event.latlng.lat.toFixed(6));
        const lng = Number(event.latlng.lng.toFixed(6));
        setHasMovedPin(true);
        onSelectRef.current(lat, lng, true);
      });

      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 150);
    }

    if (latitude != null && longitude != null) {
      const point: [number, number] = [latitude, longitude];

      if (markerRef.current) {
        markerRef.current.setLatLng(point);
      } else {
        const customIcon = L.icon({
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        });

        const marker = L.marker(point, {
          draggable: true,
          icon: customIcon,
          title: "Drag to exact building entrance",
        }).addTo(mapRef.current);

        marker.on("dragend", (event: any) => {
          const pt = event.target.getLatLng();
          const lat = Number(pt.lat.toFixed(6));
          const lng = Number(pt.lng.toFixed(6));
          setHasMovedPin(true);
          onSelectRef.current(lat, lng, true);
        });

        marker.bindPopup(
          "<div style='font-family: inherit; font-size: 12px; line-height: 1.4;'>" +
            "<strong style='color: #B86F52; display: block;'>📍 Building Entrance Pin</strong>" +
            "<span>Drag directly to the building gate or main entrance for precise 750m agent geofencing.</span>" +
          "</div>"
        );

        markerRef.current = marker;
      }

      // Pan to the point at high building-entrance zoom level (17)
      mapRef.current.setView(point, Math.max(mapRef.current.getZoom(), 17));
    } else if (markerRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  }, [ready, latitude, longitude]);

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
    }
  }, []);

  const handleRecenter = () => {
    if (mapRef.current && latitude != null && longitude != null) {
      mapRef.current.setView([latitude, longitude], 18);
      if (markerRef.current) {
        markerRef.current.openPopup();
      }
    }
  };

  return (
    <div className="space-y-2">
      {/* Map Control Bar & Entrance Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-beige-text">
          <MapPin className="h-4 w-4 shrink-0 text-beige-terracotta" />
          <span>Interactive Leaflet + OpenStreetMap Entrance Locator</span>
        </div>

        {latitude != null && longitude != null && (
          <button
            type="button"
            onClick={handleRecenter}
            className="inline-flex items-center gap-1 rounded-lg border border-beige-border bg-beige-sand/60 px-2 py-1 text-[11px] font-semibold text-beige-text transition hover:bg-beige-sand"
          >
            <Crosshair className="h-3 w-3 text-beige-terracotta" />
            Recenter on Pin
          </button>
        )}
      </div>

      {/* Map Canvas */}
      <div className="relative h-80 overflow-hidden rounded-2xl border border-beige-border bg-beige-sand shadow-inner">
        {!ready && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-beige-card/80 text-xs text-beige-muted">
            <Loader2 className="h-4 w-4 animate-spin text-beige-terracotta" />
            Loading Leaflet OpenStreetMap tiles…
          </div>
        )}
        <div ref={elementRef} className="h-full w-full" />
      </div>

      {/* Entrance Pin Status Box */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-beige-border/80 bg-beige-sand/40 p-2.5 text-[11px] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {isEntranceVerified || hasMovedPin ? (
            <span className="flex items-center gap-1 font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Entrance pin adjusted ({latitude?.toFixed(6)}, {longitude?.toFixed(6)})
            </span>
          ) : latitude != null && longitude != null ? (
            <span className="flex items-center gap-1 font-medium text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
              Placed at place centroid. Drag to building gate/entrance.
            </span>
          ) : (
            <span className="text-beige-muted">Click map or search address to place pin.</span>
          )}
        </div>

        {placeLabel && (
          <span className="truncate text-beige-muted" title={placeLabel}>
            Target: <strong>{placeLabel}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
