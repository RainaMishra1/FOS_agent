"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";

type Point = { latitude: number; longitude: number };
type Stop = { id: string; customer_name?: string | null; customer_latitude?: number | null; customer_longitude?: number | null; status: string };

export default function AgentRoadRouteMap({ origin, stops, geometry }: {
  origin: Point | null; stops: Stop[]; geometry: [number, number][];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = window as any;
    if (w.L) { setReady(true); return; }
    let link = document.getElementById("fos-agent-leaflet-css") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link"); link.id = "fos-agent-leaflet-css";
      link.rel = "stylesheet"; link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    let script = document.getElementById("fos-agent-leaflet-js") as HTMLScriptElement | null;
    const onLoad = () => setReady(Boolean((window as any).L));
    if (!script) { script = document.createElement("script"); script.id = "fos-agent-leaflet-js"; script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; script.onload = onLoad; document.body.appendChild(script); }
    else if ((window as any).L) onLoad(); else script.addEventListener("load", onLoad);
    return () => script?.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !mapRef.current) return;
    if (!instanceRef.current) {
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      instanceRef.current = map;
      layerRef.current = L.featureGroup().addTo(map);
    }
    const map = instanceRef.current;
    const layer = layerRef.current;
    layer.clearLayers();
    const bounds: [number, number][] = [];
    const originLatLng: [number, number] | null = origin ? [origin.latitude, origin.longitude] : null;
    if (originLatLng) {
      L.circleMarker(originLatLng, { radius: 9, color: "#fff", weight: 3, fillColor: "#64754f", fillOpacity: 1 })
        .bindTooltip("Your location").addTo(layer);
      bounds.push(originLatLng);
    }
    stops.forEach((stop, index) => {
      if (stop.customer_latitude == null || stop.customer_longitude == null) return;
      const pos: [number, number] = [stop.customer_latitude, stop.customer_longitude];
      L.marker(pos, { title: stop.customer_name || `Stop ${index + 1}` })
        .bindTooltip(`${index + 1}. ${stop.customer_name || "Customer stop"}`)
        .addTo(layer);
      bounds.push(pos);
    });
    if (geometry.length > 1) {
      L.polyline(geometry.map(([lon, lat]) => [lat, lon]), { color: "#bd6c4c", weight: 5, opacity: 0.85 }).addTo(layer);
    }
    if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 14 });
    else if (bounds.length === 1) map.setView(bounds[0], 14);
    else if (originLatLng) map.setView(originLatLng, 14);
    else map.setView([20, 0], 2);
    const resize = () => map.invalidateSize();
    setTimeout(resize, 100);
  }, [ready, origin?.latitude, origin?.longitude, stops, geometry]);

  return <div className="relative h-[420px] overflow-hidden rounded-2xl border border-beige-border bg-beige-sand">
    <div ref={mapRef} className="absolute inset-0" />
    {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm text-beige-muted">Loading OpenStreetMap…</div>}
    <div className="absolute left-3 top-3 z-[500] flex items-center gap-2 rounded-lg border border-beige-border bg-beige-card/95 px-3 py-2 text-xs font-semibold shadow-sm">
      <Navigation className="h-4 w-4 text-beige-terracotta" /> Road route <span className="text-beige-muted">·</span> <MapPin className="h-4 w-4 text-beige-olive" /> {origin ? "Your GPS start" : "GPS start unavailable"}
    </div>
  </div>;
}
