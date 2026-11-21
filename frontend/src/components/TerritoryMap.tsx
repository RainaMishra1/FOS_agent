"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadLeaflet } from "@/lib/leaflet";

export interface MapTerritory {
  id: string;
  name: string;
  color: string;
  subtitle?: string | null;
  points: number[][]; // [lat, lng]
}

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  kind: "lead" | "agent" | "gps";
  accuracyMeters?: number | null;
}

interface TerritoryMapProps {
  territories: MapTerritory[];
  /** Outline being drawn or edited, [lat, lng]. */
  draftPoints?: number[][];
  draftColor?: string;
  /** When set, clicking the map adds a corner to the draft. */
  onMapClick?: (latitude: number, longitude: number) => void;
  highlightId?: string | null;
  onTerritoryClick?: (id: string) => void;
  markers?: MapMarker[];
  /** Changing this value re-fits the view to territories, draft and markers. */
  fitKey?: string | number;
  heightClass?: string;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const MARKER_STYLE: Record<MapMarker["kind"], { fill: string; ring: string }> = {
  lead: { fill: "#B86F52", ring: "#ffffff" },
  agent: { fill: "#1E3F35", ring: "#ffffff" },
  gps: { fill: "#0284c7", ring: "#ffffff" },
};

export default function TerritoryMap({
  territories,
  draftPoints = [],
  draftColor = "#B86F52",
  onMapClick,
  highlightId = null,
  onTerritoryClick,
  markers = [],
  fitKey,
  heightClass = "h-[420px]",
}: TerritoryMapProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const clickRef = useRef(onMapClick);
  const territoryClickRef = useRef(onTerritoryClick);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const drawing = Boolean(onMapClick);
  clickRef.current = onMapClick;
  territoryClickRef.current = onTerritoryClick;

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !elementRef.current || mapRef.current) return;
        const map = L.map(elementRef.current).setView([19.076, 72.8777], 10);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        map.on("click", (e: any) => clickRef.current?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))));
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setTimeout(() => map.invalidateSize(), 150);
        setReady(true);
      })
      .catch(() => !cancelled && setLoadError("The map could not be loaded. Check your internet connection."));
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Draw territories, draft outline and markers
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();

    for (const t of territories) {
      if (t.points.length < 3) continue;
      const highlighted = highlightId === t.id;
      const polygon = L.polygon(t.points, {
        color: t.color,
        weight: highlighted ? 4 : 2,
        fillColor: t.color,
        fillOpacity: highlighted ? 0.3 : 0.15,
        interactive: !drawing,
      });
      polygon.bindTooltip(
        `<strong>${escapeHtml(t.name)}</strong>${t.subtitle ? `<br/>${escapeHtml(t.subtitle)}` : ""}`,
        { sticky: true }
      );
      if (territoryClickRef.current && !drawing) polygon.on("click", () => territoryClickRef.current?.(t.id));
      polygon.addTo(layer);
    }

    if (draftPoints.length > 0) {
      const style = { color: draftColor, weight: 3, dashArray: "6 6" };
      if (draftPoints.length >= 3) {
        L.polygon(draftPoints, { ...style, fillColor: draftColor, fillOpacity: 0.2, interactive: false }).addTo(layer);
      } else {
        L.polyline(draftPoints, { ...style, interactive: false }).addTo(layer);
      }
      draftPoints.forEach((p, i) =>
        L.circleMarker(p, {
          radius: i === 0 ? 7 : 5,
          color: "#ffffff",
          weight: 2,
          fillColor: draftColor,
          fillOpacity: 1,
          interactive: false,
        }).addTo(layer)
      );
    }

    for (const m of markers) {
      const style = MARKER_STYLE[m.kind];
      if (m.accuracyMeters && m.accuracyMeters > 0) {
        L.circle([m.latitude, m.longitude], {
          radius: m.accuracyMeters,
          color: style.fill,
          weight: 1,
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(layer);
      }
      L.circleMarker([m.latitude, m.longitude], {
        radius: 8,
        color: style.ring,
        weight: 3,
        fillColor: style.fill,
        fillOpacity: 1,
      })
        .bindTooltip(escapeHtml(m.label), { direction: "top" })
        .addTo(layer);
    }
  }, [ready, territories, draftPoints, draftColor, markers, highlightId, drawing]);

  // Fit the view when asked
  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const all: number[][] = [
      ...territories.flatMap((t) => t.points),
      ...draftPoints,
      ...markers.map((m) => [m.latitude, m.longitude]),
    ];
    map.invalidateSize();
    if (all.length === 1) map.setView(all[0], 16);
    else if (all.length > 1) map.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  return (
    <div className={`relative ${heightClass} overflow-hidden rounded-2xl border border-[#E6DFD3] bg-[#F3EFE7]`}>
      {!ready && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center gap-2 text-xs font-medium text-[#756F66]">
          {loadError ? loadError : (<><Loader2 className="h-4 w-4 animate-spin" /> Loading map…</>)}
        </div>
      )}
      <div ref={elementRef} className={`h-full w-full ${onMapClick ? "cursor-crosshair" : ""}`} />
    </div>
  );
}
