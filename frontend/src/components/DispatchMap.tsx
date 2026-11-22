"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadLeaflet } from "@/lib/leaflet";
import { HexCell } from "@/lib/hexbin";

export interface DispatchMapPoint {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  label: string;
  faded?: boolean;
  selected?: boolean;
  dashed?: boolean; // example data
}

export interface DispatchMapRegion {
  id: string;
  name: string;
  color: string;
  points: number[][];
  highlighted?: boolean;
  faded?: boolean;
}

export interface DispatchMapAgent {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  initials: string;
  color: string;
  /** "live" ≤ 5 min old, "recent" ≤ 1 h, "stale" older or unknown. */
  freshness: "live" | "recent" | "stale";
  ageLabel: string;
  highlighted?: boolean;
  faded?: boolean;
}

export interface DispatchMapLink {
  id: string;
  from: [number, number];
  to: [number, number];
  color: string;
  label?: string;
}

interface DispatchMapProps {
  points: DispatchMapPoint[];
  showPoints: boolean;
  hexes: HexCell[];
  showHexes: boolean;
  regions: DispatchMapRegion[];
  showRegions: boolean;
  agents?: DispatchMapAgent[];
  showAgents?: boolean;
  links?: DispatchMapLink[];
  onPointClick?: (id: string) => void;
  onAgentClick?: (id: string) => void;
  onHexClick?: (cell: HexCell) => void;
  fitKey?: string | number;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** Density colour: pale sand for few leads → deep terracotta for the busiest cell. */
function hexColor(count: number, max: number): string {
  const ramp = ["#F6EBDD", "#EFCFB3", "#E3A887", "#CF7B5C", "#B04A3A", "#7E2E22"];
  if (max <= 1) return ramp[2];
  const index = Math.min(ramp.length - 1, Math.floor(((count - 1) / (max - 1)) * (ramp.length - 1) + 0.0001));
  return ramp[index];
}

export default function DispatchMap({
  points,
  showPoints,
  hexes,
  showHexes,
  regions,
  showRegions,
  agents = [],
  showAgents = true,
  links = [],
  onPointClick,
  onAgentClick,
  onHexClick,
  fitKey,
}: DispatchMapProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const pointClickRef = useRef(onPointClick);
  const hexClickRef = useRef(onHexClick);
  const agentClickRef = useRef(onAgentClick);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  pointClickRef.current = onPointClick;
  hexClickRef.current = onHexClick;
  agentClickRef.current = onAgentClick;

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !elementRef.current || mapRef.current) return;
        const map = L.map(elementRef.current, { preferCanvas: true }).setView([19.076, 72.8777], 10);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
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

  useEffect(() => {
    const L = (window as any).L;
    const layer = layerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();

    if (showRegions) {
      for (const r of regions) {
        if (r.points.length < 3) continue;
        L.polygon(r.points, {
          color: r.color,
          weight: r.highlighted ? 4 : 2,
          dashArray: r.highlighted ? undefined : "5 5",
          fillColor: r.color,
          fillOpacity: r.faded ? 0.03 : r.highlighted ? 0.18 : 0.07,
          opacity: r.faded ? 0.35 : 1,
          interactive: false,
        }).addTo(layer);
      }
    }

    if (showHexes) {
      const max = hexes.reduce((m, h) => Math.max(m, h.count), 0);
      for (const cell of hexes) {
        const polygon = L.polygon(cell.corners, {
          color: "#ffffff",
          weight: 1,
          fillColor: hexColor(cell.count, max),
          fillOpacity: 0.75,
        });
        polygon.bindTooltip(`<strong>${cell.count}</strong> lead${cell.count === 1 ? "" : "s"} in this area`, { sticky: true });
        polygon.on("click", () => hexClickRef.current?.(cell));
        polygon.addTo(layer);
      }
    }

    // Agent -> lead connection lines (drawn under the dots)
    for (const link of links) {
      const line = L.polyline([link.from, link.to], { color: link.color, weight: 2, opacity: 0.75, dashArray: "6 6", interactive: !!link.label });
      if (link.label) line.bindTooltip(escapeHtml(link.label), { sticky: true });
      line.addTo(layer);
    }

    if (showPoints) {
      // faded first so highlighted leads draw on top
      const ordered = [...points].sort((a, b) => Number(!a.faded) - Number(!b.faded) || Number(!!a.selected) - Number(!!b.selected));
      for (const p of ordered) {
        const marker = L.circleMarker([p.latitude, p.longitude], {
          radius: p.selected ? 9 : 6,
          color: p.selected ? "#1A201C" : "#ffffff",
          weight: p.selected ? 3 : 1.5,
          dashArray: p.dashed ? "3 3" : undefined,
          fillColor: p.color,
          fillOpacity: p.faded ? 0.18 : 0.95,
          opacity: p.faded ? 0.3 : 1,
        });
        marker.bindTooltip(escapeHtml(p.label), { direction: "top" });
        marker.on("click", () => pointClickRef.current?.(p.id));
        marker.addTo(layer);
      }
    }

    // Agents on top: avatar pin with initials, name label and location freshness
    if (showAgents) {
      for (const a of agents) {
        const dot = a.freshness === "live" ? "#22c55e" : a.freshness === "recent" ? "#f59e0b" : "#9ca3af";
        const size = a.highlighted ? 40 : 34;
        const html = `
          <div style="display:flex;flex-direction:column;align-items:center;opacity:${a.faded ? 0.35 : 1};">
            <div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:${a.color};
                        border:3px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;
                        justify-content:center;color:#ffffff;font-weight:700;font-size:${a.highlighted ? 14 : 12}px;">
              ${escapeHtml(a.initials)}
              <span style="position:absolute;right:-2px;bottom:-2px;width:11px;height:11px;border-radius:9999px;
                           background:${dot};border:2px solid #ffffff;"></span>
            </div>
            <div style="margin-top:3px;white-space:nowrap;background:#ffffff;border:1px solid #E6DFD3;border-radius:9999px;
                        padding:1px 8px;font-size:10px;font-weight:700;color:#1A201C;box-shadow:0 1px 3px rgba(0,0,0,0.12);">
              ${escapeHtml(a.name)}
            </div>
          </div>`;
        const icon = L.divIcon({ className: "dispatch-agent-pin", html, iconSize: [size, size + 22], iconAnchor: [size / 2, size / 2] });
        L.marker([a.latitude, a.longitude], { icon, zIndexOffset: a.highlighted ? 2000 : 1000 })
          .bindTooltip(`${escapeHtml(a.name)}<br/>${escapeHtml(a.ageLabel)}`, { direction: "top", offset: [0, -size / 2] })
          .on("click", () => agentClickRef.current?.(a.id))
          .addTo(layer);
      }
    }
  }, [ready, points, showPoints, hexes, showHexes, regions, showRegions, agents, showAgents, links]);

  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const all: number[][] = [
      ...points.map((p) => [p.latitude, p.longitude]),
      ...regions.flatMap((r) => r.points),
      ...agents.map((a) => [a.latitude, a.longitude]),
    ];
    map.invalidateSize();
    if (all.length === 1) map.setView(all[0], 14);
    else if (all.length > 1) map.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  return (
    <div className="relative h-full min-h-[460px] overflow-hidden rounded-2xl border border-[#E6DFD3] bg-[#F3EFE7]">
      {!ready && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center gap-2 text-xs font-medium text-[#756F66]">
          {loadError ? loadError : (<><Loader2 className="h-4 w-4 animate-spin" /> Loading map…</>)}
        </div>
      )}
      <div ref={elementRef} className="h-full w-full min-h-[460px]" />
    </div>
  );
}
