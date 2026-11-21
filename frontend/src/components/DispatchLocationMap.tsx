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
      // Without a pin yet, show the Mumbai metropolitan region where operations run.
      const initialZoom = latitude != null && longitude != null ? 17 : 10;
      const map = L.map(elementRef.current).setView(
        [latitude ?? 19.076, longitude ?? 72.8777],
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
            "<strong style='color: #2E5A44; display: block;'>Customer location</strong>" +
            "<span>Drag the pin to the exact entrance if it is slightly off.</span>" +
          "</div>"
        );

        markerRef.current = marker;
      }

      // The container may have changed size since the map was created.
      mapRef.current.invalidateSize();
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

  const hasPin = latitude != null && longitude != null;

  return (
    <div className="space-y-2">
      <div className="relative h-72 sm:h-80 overflow-hidden rounded-2xl border border-[#E6DFD3] bg-[#F3EFE7]">
        {!ready && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center gap-2 bg-[#F3EFE7] text-xs font-medium text-[#756F66]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading map…
          </div>
        )}
        {ready && !hasPin && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-[#1A201C] shadow-sm">
            Search the address above, or click the map to drop the pin
          </div>
        )}
        {hasPin && (
          <button
            type="button"
            onClick={handleRecenter}
            className="absolute right-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-lg border border-[#E6DFD3] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1A201C] shadow-sm hover:bg-[#FAF7F0]"
          >
            <Crosshair className="h-3 w-3" />
            Recenter
          </button>
        )}
        <div ref={elementRef} className="h-full w-full" />
      </div>

      <div className="flex flex-col gap-1 text-[11px] sm:flex-row sm:items-center sm:justify-between">
        {hasPin ? (
          isEntranceVerified || hasMovedPin ? (
            <span className="flex items-center gap-1.5 font-semibold text-[#2E5A44]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Pin set on the map. Drag it again to fine-tune.
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[#756F66]">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              Pin placed from the address. Drag it to the exact entrance if needed.
            </span>
          )
        ) : (
          <span className="flex items-center gap-1.5 text-[#756F66]">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            No pin yet.
          </span>
        )}
        {placeLabel && hasPin && (
          <span className="truncate text-[#756F66] sm:max-w-[55%]" title={placeLabel}>
            {placeLabel}
          </span>
        )}
      </div>
    </div>
  );
}
