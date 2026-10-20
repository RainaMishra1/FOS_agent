"use client";

import React, { useState, useMemo } from "react";
import { Coordinates, BaseRouteStop, RouteLeg } from "@/lib/routeOptimizer";
import {
  Compass,
  MapPin,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Navigation,
  Clock,
  Layers,
  Info,
  Shield,
  CheckCircle2,
} from "lucide-react";

interface RouteMapProps {
  startCoords: Coordinates;
  startLabel?: string;
  stops: BaseRouteStop[];
  legs?: RouteLeg[];
  activeStopId?: string | null;
  onSelectStop?: (stop: BaseRouteStop) => void;
  height?: string;
  isOptimized?: boolean;
}

export default function RouteMap({
  startCoords,
  startLabel = "Agent Starting Location",
  stops,
  legs = [],
  activeStopId,
  onSelectStop,
  height = "h-[450px]",
  isOptimized = false,
}: RouteMapProps) {
  const [zoom, setZoom] = useState(1);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [showRoadGrid, setShowRoadGrid] = useState(true);

  // Compute dynamic bounding box across start location and all stops
  const bounds = useMemo(() => {
    const allPoints = [startCoords, ...stops.map((s) => s.coordinates)];
    if (allPoints.length === 0) {
      return { centerLat: 12.9716, centerLng: 77.5946, latSpan: 0.15, lngSpan: 0.15 };
    }

    let minLat = allPoints[0].lat;
    let maxLat = allPoints[0].lat;
    let minLng = allPoints[0].lng;
    let maxLng = allPoints[0].lng;

    allPoints.forEach((p) => {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    });

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    // Add padding to ensure markers don't clip edges
    const latSpan = Math.max(0.045, (maxLat - minLat) * 1.5) / zoom;
    const lngSpan = Math.max(0.045, (maxLng - minLng) * 1.5) / zoom;

    return { centerLat, centerLng, latSpan, lngSpan };
  }, [startCoords, stops, zoom]);

  // Project geographic coordinate to canvas percentage coordinates [5%, 95%]
  const project = (lat: number, lng: number) => {
    const x = ((lng - (bounds.centerLng - bounds.lngSpan / 2)) / bounds.lngSpan) * 100;
    const y = (((bounds.centerLat + bounds.latSpan / 2) - lat) / bounds.latSpan) * 100;
    return {
      x: Math.max(6, Math.min(94, x)),
      y: Math.max(8, Math.min(92, y)),
    };
  };

  const startPoint = project(startCoords.lat, startCoords.lng);
  const projectedStops = stops.map((stop, idx) => ({
    ...stop,
    stopNumber: idx + 1,
    pos: project(stop.coordinates.lat, stop.coordinates.lng),
  }));

  // Build SVG polyline points (Start -> Stop 1 -> Stop 2 -> ...)
  const allRoutePoints = [startPoint, ...projectedStops.map((s) => s.pos)];
  const polylinePointsString = allRoutePoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div
      className={`relative w-full ${height} rounded-2xl bg-[#EBE4D5] border border-beige-border overflow-hidden select-none shadow-xs flex flex-col`}
    >
      {/* Top Map Status & Legend Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="px-3 py-1.5 rounded-xl bg-beige-card/95 backdrop-blur-md border border-beige-border text-xs font-bold text-beige-text shadow-xs flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isOptimized ? "bg-beige-olive animate-pulse" : "bg-beige-terracotta"
              }`}
            />
            <span>
              {isOptimized ? "Optimized Route (Nearest-Neighbour)" : "Assigned Sequence"}
            </span>
            <span className="text-[10px] text-beige-muted font-normal">• {stops.length} Stops</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-beige-card/90 backdrop-blur-xs border border-beige-border text-[11px] text-beige-muted">
            <Info className="w-3 h-3 text-beige-amber" />
            <span>Illustrative straight-line demo</span>
          </div>
        </div>

        {/* Map Controls */}
        <div className="flex items-center gap-1 pointer-events-auto bg-beige-card/95 backdrop-blur-md p-1 rounded-xl border border-beige-border shadow-xs">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.0, z + 0.25))}
            className="p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.65, z - 0.25))}
            className="p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            title="Reset View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowRoadGrid((prev) => !prev)}
            className={`p-1.5 rounded-lg transition ${
              showRoadGrid
                ? "text-beige-terracotta bg-beige-sand"
                : "text-beige-muted hover:text-beige-text"
            }`}
            title="Toggle Background Map Grid"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SVG Canvas for Vector Grid, Background Roads, and Route Polyline */}
      <div className="relative w-full h-full overflow-hidden bg-[#F2EDE1]">
        <svg
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id="routeMapGrid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#E3DAC9" strokeWidth="0.2" />
            </pattern>
            {/* Arrow Marker for route direction */}
            <marker
              id="routeArrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#B76E52" />
            </marker>
          </defs>

          {showRoadGrid && (
            <>
              <rect width="100%" height="100%" fill="url(#routeMapGrid)" />
              {/* Decorative Metro Road Arteries */}
              <g stroke="#D8CEBE" strokeWidth="0.5" fill="none" opacity="0.6">
                <path d="M 0,25 Q 35,20 65,40 T 100,50" />
                <path d="M 25,0 Q 40,45 55,80 T 80,100" />
                <path d="M 0,70 Q 50,65 80,75 T 100,85" />
                <path d="M 75,0 Q 70,50 85,100" />
              </g>
            </>
          )}

          {/* Illustrative Route Line Connecting Start & Stops */}
          {allRoutePoints.length > 1 && (
            <g>
              {/* Outer halo line */}
              <polyline
                points={polylinePointsString}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
              />
              {/* Main terracotta route line */}
              <polyline
                points={polylinePointsString}
                fill="none"
                stroke="#B76E52"
                strokeWidth="0.75"
                strokeDasharray="1.5,1"
                strokeLinecap="round"
                strokeLinejoin="round"
                markerMid="url(#routeArrow)"
              />
            </g>
          )}
        </svg>

        {/* Start Point Marker (Agent Depot / Live Position) */}
        <div
          style={{ left: `${startPoint.x}%`, top: `${startPoint.y}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-20 group cursor-pointer"
        >
          <div className="relative flex flex-col items-center">
            {/* Pulsing halo */}
            <span className="absolute -inset-1.5 rounded-full bg-beige-olive/30 animate-ping" />
            <div className="w-7 h-7 rounded-full bg-beige-olive text-white flex items-center justify-center font-bold text-xs shadow-md border-2 border-white ring-2 ring-beige-olive/40 transition group-hover:scale-115">
              <Compass className="w-4 h-4" />
            </div>
            {/* Label */}
            <div className="mt-1 px-2 py-0.5 rounded-md bg-beige-card/95 border border-beige-border text-[9px] font-bold text-beige-text shadow-xs whitespace-nowrap">
              DEPOT
            </div>

            {/* Hover Tooltip */}
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col p-2.5 rounded-xl bg-beige-card border border-beige-border shadow-lg text-xs w-48 z-30 pointer-events-none">
              <strong className="text-[11px] text-beige-text block">{startLabel}</strong>
              <span className="text-[10px] text-beige-muted mt-0.5 block">
                Coordinates: {startCoords.lat.toFixed(4)}, {startCoords.lng.toFixed(4)}
              </span>
              <span className="text-[10px] text-beige-olive font-semibold mt-1 block">
                Route Origin / Departure
              </span>
            </div>
          </div>
        </div>

        {/* Numbered Customer Stop Markers */}
        {projectedStops.map((stop, index) => {
          const isSelected = activeStopId === stop.id;
          const isHovered = hoveredStopId === stop.id;
          const leg = legs[index];
          const displayName = stop.name?.trim() || "Unnamed stop";

          return (
            <div
              key={stop.id}
              onClick={() => onSelectStop && onSelectStop(stop)}
              onMouseEnter={() => setHoveredStopId(stop.id)}
              onMouseLeave={() => setHoveredStopId(null)}
              style={{ left: `${stop.pos.x}%`, top: `${stop.pos.y}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer transition-all duration-200 z-10 ${
                isSelected ? "z-30 scale-120" : isHovered ? "z-25 scale-110" : ""
              }`}
            >
              <div className="relative flex flex-col items-center group">
                {/* Numbered badge */}
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shadow-md transition-all border-2 ${
                    isSelected
                      ? "bg-beige-terracotta text-white border-white ring-4 ring-beige-terracotta/30"
                      : stop.status === "completed"
                      ? "bg-beige-olive text-white border-white"
                      : "bg-beige-card text-beige-terracotta border-beige-border hover:border-beige-terracotta"
                  }`}
                >
                  {stop.stopNumber}
                </div>

                {/* Name Label */}
                <div className="mt-1 px-1.5 py-0.5 rounded bg-beige-card/90 backdrop-blur-xs border border-beige-border text-[9px] font-semibold text-beige-text shadow-2xs whitespace-nowrap max-w-[90px] truncate">
                  {displayName}
                </div>

                {/* Interactive Tooltip Card on Hover */}
                {isHovered && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex flex-col p-2.5 rounded-xl bg-beige-card border border-beige-border shadow-xl text-xs w-52 z-40 pointer-events-none">
                    <div className="flex items-center justify-between text-[10px] text-beige-muted pb-1 border-b border-beige-border/80">
                      <span className="font-bold text-beige-terracotta">
                        Stop #{stop.stopNumber}
                      </span>
                      {stop.scheduledTime && (
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-beige-muted" />
                          {stop.scheduledTime}
                        </span>
                      )}
                    </div>
                    <strong className="text-xs font-bold text-beige-text mt-1 block truncate">
                      {displayName}
                    </strong>
                    <span className="text-[10px] text-beige-muted block truncate mt-0.5">
                      {stop.address}
                    </span>
                    {leg && (
                      <div className="mt-2 pt-1.5 border-t border-beige-border/60 flex items-center justify-between text-[10px]">
                        <span className="text-beige-muted">From previous:</span>
                        <span className="font-mono font-semibold text-beige-text">
                          {leg.formattedDistance} (~{leg.formattedTransitTime})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Map Disclaimer Banner */}
      <div className="absolute bottom-2.5 left-3 right-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
        <div className="px-2.5 py-1 rounded-xl bg-beige-card/95 backdrop-blur-md border border-beige-border text-[10px] text-beige-muted shadow-2xs pointer-events-auto flex items-center gap-1.5">
          <Navigation className="w-3 h-3 text-beige-terracotta shrink-0" />
          <span>
            Straight-line vectors shown. Road-network navigation connects via OSRM in Phase 6.
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-2 pointer-events-auto px-2 py-1 rounded-xl bg-beige-card/90 backdrop-blur-md border border-beige-border text-[10px] text-beige-muted">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-beige-olive" />
            <span>Depot</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-md bg-beige-terracotta text-white text-[8px] flex items-center justify-center font-bold">
              #
            </span>
            <span>Stop</span>
          </span>
        </div>
      </div>
    </div>
  );
}
