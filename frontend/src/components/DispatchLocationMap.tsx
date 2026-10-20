"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

export default function DispatchLocationMap({
  latitude,
  longitude,
  onSelect,
}: {
  latitude: number | null;
  longitude: number | null;
  onSelect: (latitude: number, longitude: number) => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if ((window as any).L) { setReady(true); return; }
    if (!document.getElementById("dispatch-leaflet-css")) {
      const css = document.createElement("link");
      css.id = "dispatch-leaflet-css"; css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    let script = document.getElementById("dispatch-leaflet-js") as HTMLScriptElement | null;
    const loaded = () => setReady(Boolean((window as any).L));
    if (!script) {
      script = document.createElement("script"); script.id = "dispatch-leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = loaded; document.body.appendChild(script);
    } else if ((window as any).L) loaded();
    else script.addEventListener("load", loaded);
    return () => script?.removeEventListener("load", loaded);
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !elementRef.current) return;
    if (!mapRef.current) {
      const map = L.map(elementRef.current).setView([latitude ?? 19.2403, longitude ?? 73.1305], latitude != null && longitude != null ? 16 : 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      map.on("click", (event: any) => {
        const lat = Number(event.latlng.lat.toFixed(6));
        const lng = Number(event.latlng.lng.toFixed(6));
        onSelectRef.current(lat, lng);
      });
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 150);
    }
    if (latitude != null && longitude != null) {
      const point: [number, number] = [latitude, longitude];
      if (markerRef.current) markerRef.current.setLatLng(point);
      else markerRef.current = L.marker(point, { draggable: true }).addTo(mapRef.current);
      markerRef.current.off("dragend");
      markerRef.current.on("dragend", (event: any) => {
        const point = event.target.getLatLng();
        onSelectRef.current(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)));
      });
      mapRef.current.setView(point, Math.max(mapRef.current.getZoom(), 15));
    } else if (markerRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  }, [ready, latitude, longitude]);

  useEffect(() => () => {
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
  }, []);

  return <div className="space-y-2">
    <div className="flex items-center gap-2 text-xs text-beige-muted"><MapPin className="h-4 w-4 text-beige-terracotta" />Click the correct site point or drag the marker, then confirm it below.</div>
    <div className="relative h-72 overflow-hidden rounded-xl border border-beige-border bg-beige-sand">
      {!ready && <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-beige-card/70 text-xs text-beige-muted"><Loader2 className="h-4 w-4 animate-spin" />Loading map…</div>}
      <div ref={elementRef} className="h-full w-full" />
    </div>
  </div>;
}
