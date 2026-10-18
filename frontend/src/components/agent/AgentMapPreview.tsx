"use client";

import React, { useState } from "react";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import {
  MapPin,
  Navigation,
  Compass,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";

interface AgentMapPreviewProps {
  height?: string;
  onSelectVisit?: (visit: AgentVisit) => void;
  showRouteLine?: boolean;
  highlightVisitId?: string;
}

export default function AgentMapPreview({
  height = "h-64 sm:h-80",
  onSelectVisit,
  showRouteLine = true,
  highlightVisitId,
}: AgentMapPreviewProps) {
  const { currentAgent, visits, selectedVisit, setSelectedVisit } = useAgent();
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredStop, setHoveredStop] = useState<AgentVisit | null>(null);

  // Today's stops
  const todayVisits = visits.filter(
    (v) => v.scheduledDate === "2026-10-18" || v.status === "completed" || v.status === "in_progress"
  );

  // Map center coordinates around Bangalore Central (12.97, 77.60)
  const mapCenter = { lat: 12.9716, lng: 77.5946 };
  const latSpan = 0.14 / zoomLevel;
  const lngSpan = 0.14 / zoomLevel;

  const project = (lat: number, lng: number) => {
    const x = ((lng - (mapCenter.lng - lngSpan / 2)) / lngSpan) * 100;
    const y = (((mapCenter.lat + latSpan / 2) - lat) / latSpan) * 100;
    return {
      x: Math.max(8, Math.min(92, x)),
      y: Math.max(10, Math.min(90, y)),
    };
  };

  const agentPos = project(currentAgent.currentCoordinates.lat, currentAgent.currentCoordinates.lng);

  // Sort stops by orderIndex
  const sortedStops = [...todayVisits].sort((a, b) => a.orderIndex - b.orderIndex);

  // Build SVG path data for route line
  const routePoints = [
    agentPos,
    ...sortedStops.map((s) => project(s.coordinates.lat, s.coordinates.lng)),
  ];

  const polylinePoints = routePoints.map((p) => `${p.x},${p.y}`).join(" ");

  const handleStopClick = (visit: AgentVisit) => {
    setSelectedVisit(visit);
    if (onSelectVisit) {
      onSelectVisit(visit);
    }
  };

  return (
    <div
      className={`relative w-full ${height} rounded-2xl bg-[#EBE4D5] border border-beige-border overflow-hidden select-none shadow-xs flex flex-col`}
    >
      {/* Top Map HUD Overlay */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="px-2.5 py-1 rounded-xl bg-beige-card/90 backdrop-blur-md border border-beige-border text-[11px] font-bold text-beige-text shadow-xs flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-beige-olive animate-pulse" />
            <span>{currentAgent.territory.split("(")[0].trim()}</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-beige-card/80 backdrop-blur-xs text-beige-muted border border-beige-border">
            Demo Map Preview
          </span>
        </div>

        {/* Map Controls */}
        <div className="flex items-center gap-1 pointer-events-auto bg-beige-card/90 backdrop-blur-md p-1 rounded-xl border border-beige-border shadow-xs">
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.min(1.6, z + 0.2))}
            className="p-1 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.max(0.8, z - 0.2))}
            className="p-1 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel(1)}
            className="p-1 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            title="Reset View"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main SVG Vector Canvas */}
      <div className="relative w-full h-full">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          {/* Subtle Sector Zones */}
          <circle cx="50" cy="50" r="35" fill="#E4DCCF" fillOpacity="0.35" />
          <circle cx="68" cy="40" r="22" fill="#E0D7C6" fillOpacity="0.4" />
          <circle cx="32" cy="65" r="25" fill="#E0D7C6" fillOpacity="0.4" />

          {/* Grid lines */}
          <line x1="0" y1="25" x2="100" y2="25" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />
          <line x1="25" y1="0" x2="25" y2="100" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />
          <line x1="75" y1="0" x2="75" y2="100" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />

          {/* Road Network Lines (Illustrative) */}
          <path
            d="M 10 30 Q 40 45 60 25 T 90 40"
            fill="none"
            stroke="#D6CBBA"
            strokeWidth="1.2"
          />
          <path
            d="M 20 85 Q 50 60 70 80 T 95 65"
            fill="none"
            stroke="#D6CBBA"
            strokeWidth="1.2"
          />
          <path
            d="M 30 10 Q 55 45 45 90"
            fill="none"
            stroke="#D6CBBA"
            strokeWidth="1.2"
          />
          <path
            d="M 75 10 Q 65 50 80 90"
            fill="none"
            stroke="#D6CBBA"
            strokeWidth="1.2"
          />

          {/* Route Polyline (Dashed animated route line) */}
          {showRouteLine && (
            <>
              {/* Outer Glow */}
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="#B76E52"
                strokeWidth="1.6"
                strokeOpacity="0.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Core Dashed Route */}
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="#B76E52"
                strokeWidth="0.9"
                strokeDasharray="2,2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Agent Geofence Radar Circle */}
          <circle
            cx={agentPos.x}
            cy={agentPos.y}
            r="8"
            fill="#687653"
            fillOpacity="0.12"
            stroke="#687653"
            strokeWidth="0.4"
            strokeDasharray="1,1"
          />
        </svg>

        {/* Agent Location Marker HTML Overlay */}
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 pointer-events-auto"
          style={{ left: `${agentPos.x}%`, top: `${agentPos.y}%` }}
        >
          <div className="relative group flex flex-col items-center">
            {/* Animated Ring */}
            <span className="absolute -inset-1.5 rounded-full bg-beige-olive/30 animate-ping opacity-60" />
            <div className="w-6 h-6 rounded-full bg-beige-olive text-white border-2 border-white flex items-center justify-center shadow-md">
              <Compass className="w-3 h-3" />
            </div>
            <div className="absolute -bottom-5 whitespace-nowrap px-1.5 py-0.5 rounded bg-beige-card text-[9px] font-bold text-beige-text border border-beige-border shadow-xs">
              You ({currentAgent.initials})
            </div>
          </div>
        </div>

        {/* Customer Stop Pins HTML Overlay */}
        {sortedStops.map((stop) => {
          const pos = project(stop.coordinates.lat, stop.coordinates.lng);
          const isCompleted = stop.status === "completed";
          const isCurrent = stop.status === "in_progress" || stop.id === highlightVisitId;
          const isSelected = selectedVisit?.id === stop.id;

          return (
            <button
              key={stop.id}
              type="button"
              onClick={() => handleStopClick(stop)}
              onMouseEnter={() => setHoveredStop(stop)}
              onMouseLeave={() => setHoveredStop(null)}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-transform duration-200 hover:scale-110 focus:outline-hidden"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              title={`${stop.customerName} (${stop.scheduledTime})`}
            >
              <div className="relative flex flex-col items-center">
                {/* Geofence 100m wave for in_progress/selected stop */}
                {(isCurrent || isSelected) && (
                  <span className="absolute -inset-3 rounded-full bg-beige-terracotta/20 animate-pulse" />
                )}

                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md border-2 border-white transition-colors ${
                    isCompleted
                      ? "bg-beige-olive text-white"
                      : isCurrent
                      ? "bg-beige-terracotta text-white"
                      : "bg-[#785E38] text-white"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <span>{stop.orderIndex}</span>
                  )}
                </div>

                <div
                  className={`absolute -bottom-5 whitespace-nowrap px-1.5 py-0.5 rounded text-[9px] font-bold border shadow-xs transition-opacity ${
                    isCurrent || isSelected
                      ? "bg-beige-card text-beige-text border-beige-terracotta"
                      : "bg-beige-card/90 text-beige-muted border-beige-border"
                  }`}
                >
                  {stop.customerName.split(" ")[0]}
                </div>
              </div>
            </button>
          );
        })}

        {/* Hovered or Selected Stop Quick Card */}
        {(hoveredStop || selectedVisit) && (
          <div className="absolute bottom-2 left-2 right-2 z-30 p-2.5 rounded-xl bg-beige-card/95 backdrop-blur-md border border-beige-border shadow-lg flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold px-1.5 rounded bg-beige-sand text-beige-text">
                  Stop #{(hoveredStop || selectedVisit)?.orderIndex}
                </span>
                <span className="font-bold text-beige-text truncate">
                  {(hoveredStop || selectedVisit)?.customerName}
                </span>
              </div>
              <p className="text-[11px] text-beige-muted truncate">
                {(hoveredStop || selectedVisit)?.address} • {(hoveredStop || selectedVisit)?.scheduledTime}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                const target = hoveredStop || selectedVisit;
                if (target && onSelectVisit) onSelectVisit(target);
              }}
              className="shrink-0 px-2.5 py-1.5 rounded-lg bg-beige-terracotta text-white font-semibold text-[11px] shadow-xs hover:bg-beige-terracotta-light transition flex items-center gap-1"
            >
              <span>Details</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Bottom Map Legend */}
      <div className="px-3 py-1.5 bg-beige-card/90 border-t border-beige-border flex items-center justify-between text-[10px] text-beige-muted">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-beige-olive" />
            <span>Agent / Completed</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-beige-terracotta" />
            <span>Next / In Progress</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#785E38]" />
            <span>Pending</span>
          </div>
        </div>
        <span className="font-mono">{todayVisits.length} Stops Today</span>
      </div>
    </div>
  );
}
