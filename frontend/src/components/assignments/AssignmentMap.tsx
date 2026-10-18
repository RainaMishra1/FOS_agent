"use client";

import React, { useState } from "react";
import { Customer, Agent } from "@/types";
import { LeadRankingResult, AgentEligibilityResult } from "@/lib/geoUtils";
import {
  MapPin,
  Compass,
  Star,
  Users,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Coffee,
  UserX,
  Shield,
  Layers,
} from "lucide-react";

interface AssignmentMapProps {
  customer: Customer | null;
  rankingResult: LeadRankingResult | null;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  height?: string;
}

export default function AssignmentMap({
  customer,
  rankingResult,
  selectedAgentId,
  onSelectAgent,
  height = "h-[420px]",
}: AssignmentMapProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  // Center coordinate around customer or Bangalore Central
  const mapCenter = customer
    ? { lat: customer.coordinates.lat, lng: customer.coordinates.lng }
    : { lat: 12.9716, lng: 77.5946 };

  const latSpan = 0.22 / zoomLevel;
  const lngSpan = 0.22 / zoomLevel;

  const project = (lat: number, lng: number) => {
    const x = ((lng - (mapCenter.lng - lngSpan / 2)) / lngSpan) * 100;
    const y = (((mapCenter.lat + latSpan / 2) - lat) / latSpan) * 100;
    return {
      x: Math.max(8, Math.min(92, x)),
      y: Math.max(10, Math.min(90, y)),
    };
  };

  const customerPos = customer ? project(customer.coordinates.lat, customer.coordinates.lng) : null;

  // Active target agent for straight-line vector (either user-selected or recommended)
  const targetAgentResult: AgentEligibilityResult | null =
    rankingResult?.eligibleAgents.find((a) => a.agent.id === selectedAgentId) ||
    rankingResult?.recommendedAgent ||
    null;

  const targetAgentPos = targetAgentResult
    ? project(targetAgentResult.agent.coordinates.lat, targetAgentResult.agent.coordinates.lng)
    : null;

  return (
    <div
      className={`relative w-full ${height} rounded-2xl bg-[#EBE4D5] border border-beige-border overflow-hidden select-none shadow-xs flex flex-col`}
    >
      {/* Top Map HUD Overlay */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="px-3 py-1 rounded-xl bg-beige-card/95 backdrop-blur-md border border-beige-border text-xs font-bold text-beige-text shadow-xs flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-beige-terracotta animate-pulse" />
            <span>Nearest-Agent Geodetic Dispatch</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-beige-card/85 backdrop-blur-xs text-beige-muted border border-beige-border">
            Haversine Vectors
          </span>
        </div>

        {/* Map Controls */}
        <div className="flex items-center gap-1 pointer-events-auto bg-beige-card/95 backdrop-blur-md p-1 rounded-xl border border-beige-border shadow-xs">
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.min(1.8, z + 0.2))}
            className="p-1 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.2))}
            className="p-1 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel(1)}
            className="p-1 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            title="Reset Map View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SVG Canvas for Grid & Vectors */}
      <div className="relative w-full h-full">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          {/* Subtle Sector Zones */}
          <circle cx="50" cy="50" r="38" fill="#E4DCCF" fillOpacity="0.3" />
          <circle cx="65" cy="40" r="24" fill="#E0D7C6" fillOpacity="0.35" />
          <circle cx="35" cy="65" r="28" fill="#E0D7C6" fillOpacity="0.35" />

          {/* Grid lines */}
          <line x1="0" y1="25" x2="100" y2="25" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />
          <line x1="25" y1="0" x2="25" y2="100" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />
          <line x1="75" y1="0" x2="75" y2="100" stroke="#DFD5C4" strokeWidth="0.3" strokeDasharray="1,2" />

          {/* Straight-line distance vector from customer to target agent */}
          {customerPos && targetAgentPos && (
            <>
              {/* Outer Glow */}
              <line
                x1={customerPos.x}
                y1={customerPos.y}
                x2={targetAgentPos.x}
                y2={targetAgentPos.y}
                stroke="#B76E52"
                strokeWidth="2"
                strokeOpacity="0.4"
                strokeLinecap="round"
              />
              {/* Core dashed line */}
              <line
                x1={customerPos.x}
                y1={customerPos.y}
                x2={targetAgentPos.x}
                y2={targetAgentPos.y}
                stroke="#B76E52"
                strokeWidth="0.9"
                strokeDasharray="2,2"
                strokeLinecap="round"
              />
            </>
          )}

          {/* Geofence radar radius around customer */}
          {customerPos && (
            <circle
              cx={customerPos.x}
              cy={customerPos.y}
              r="6"
              fill="#B76E52"
              fillOpacity="0.12"
              stroke="#B76E52"
              strokeWidth="0.5"
              strokeDasharray="1,1"
            />
          )}
        </svg>

        {/* Straight-line Distance Pill along the vector line */}
        {customerPos && targetAgentPos && targetAgentResult && (
          <div
            className="absolute z-30 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: `${(customerPos.x + targetAgentPos.x) / 2}%`,
              top: `${(customerPos.y + targetAgentPos.y) / 2}%`,
            }}
          >
            <div className="px-2 py-0.5 rounded-full bg-beige-card/95 text-beige-text border border-beige-border shadow-md text-[10px] font-bold whitespace-nowrap flex items-center gap-1">
              <span>{targetAgentResult.formattedDistance}</span>
              <span className="text-[9px] font-normal text-beige-muted">straight-line</span>
            </div>
          </div>
        )}

        {/* Customer Destination Marker */}
        {customer && customerPos && (
          <div
            className="absolute z-30 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 pointer-events-auto"
            style={{ left: `${customerPos.x}%`, top: `${customerPos.y}%` }}
          >
            <div className="relative group flex flex-col items-center">
              <span className="absolute -inset-2.5 rounded-full bg-beige-terracotta/25 animate-ping opacity-75" />
              <div className="w-8 h-8 rounded-full bg-beige-terracotta text-white border-2 border-white flex items-center justify-center shadow-lg">
                <MapPin className="w-4 h-4 fill-white text-beige-terracotta" />
              </div>
              <div className="absolute -bottom-6 whitespace-nowrap px-2 py-0.5 rounded-md bg-beige-card text-[10px] font-bold text-beige-text border border-beige-border shadow-xs">
                📍 {customer.name.split(" ")[0]} (Lead)
              </div>
            </div>
          </div>
        )}

        {/* Eligible Agents Markers */}
        {rankingResult?.eligibleAgents.map((res) => {
          const pos = project(res.agent.coordinates.lat, res.agent.coordinates.lng);
          const isRecommended = res.rank === 1;
          const isSelected = res.agent.id === selectedAgentId;

          return (
            <button
              key={res.agent.id}
              type="button"
              onClick={() => onSelectAgent(res.agent.id)}
              onMouseEnter={() => setHoveredAgentId(res.agent.id)}
              onMouseLeave={() => setHoveredAgentId(null)}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 hover:scale-110 focus:outline-hidden"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              title={`${res.agent.name} - Rank #${res.rank} (${res.formattedDistance})`}
            >
              <div className="relative flex flex-col items-center">
                {/* Pulse ring for recommended or selected */}
                {(isRecommended || isSelected) && (
                  <span
                    className={`absolute -inset-2 rounded-full ${
                      isRecommended
                        ? "bg-beige-terracotta/30 animate-pulse"
                        : "bg-beige-olive/30"
                    }`}
                  />
                )}

                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-md border-2 border-white transition-colors ${
                    isRecommended
                      ? "bg-beige-terracotta ring-2 ring-beige-terracotta/50"
                      : isSelected
                      ? "bg-beige-olive ring-2 ring-beige-olive/50"
                      : "bg-[#785E38]"
                  }`}
                >
                  {isRecommended ? (
                    <Star className="w-3.5 h-3.5 fill-white text-white" />
                  ) : (
                    <span>#{res.rank}</span>
                  )}
                </div>

                <div
                  className={`absolute -bottom-5 whitespace-nowrap px-1.5 py-0.5 rounded text-[9px] font-bold border shadow-xs transition-colors ${
                    isRecommended
                      ? "bg-beige-terracotta text-white border-beige-terracotta"
                      : isSelected
                      ? "bg-beige-card text-beige-text border-beige-olive"
                      : "bg-beige-card/90 text-beige-text border-beige-border"
                  }`}
                >
                  {res.agent.name.split(" ")[0]} ({res.formattedDistance})
                </div>
              </div>
            </button>
          );
        })}

        {/* Ineligible Agents Markers (Muted) */}
        {rankingResult?.ineligibleAgents.map((res) => {
          const pos = project(res.agent.coordinates.lat, res.agent.coordinates.lng);

          return (
            <div
              key={res.agent.id}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity cursor-not-allowed"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              title={`${res.agent.name}: ${res.ineligibilityReason}`}
            >
              <div className="relative flex flex-col items-center">
                <div className="w-5 h-5 rounded-full bg-beige-muted text-white flex items-center justify-center text-[9px] shadow-xs border border-white">
                  {res.agent.status === "break" ? (
                    <Coffee className="w-2.5 h-2.5" />
                  ) : res.agent.status === "inactive" ? (
                    <UserX className="w-2.5 h-2.5" />
                  ) : (
                    <span>!</span>
                  )}
                </div>
                <div className="absolute -bottom-4 whitespace-nowrap px-1 py-0.2 rounded text-[8px] bg-beige-sand/90 text-beige-muted border border-beige-border">
                  {res.agent.name.split(" ")[0]} (Unavailable)
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Map Legend */}
      <div className="px-3 py-2 bg-beige-card/95 border-t border-beige-border flex flex-wrap items-center justify-between gap-2 text-[10px] text-beige-muted">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-beige-terracotta" />
            <span className="font-semibold text-beige-text">Customer Site</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-beige-terracotta flex items-center justify-center text-white text-[7px] font-bold">
              ★
            </span>
            <span className="font-semibold text-beige-text">#1 Recommended Match</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#785E38]" />
            <span>Eligible Alternatives</span>
          </div>
          <div className="flex items-center gap-1.5 opacity-60">
            <span className="w-2.5 h-2.5 rounded-full bg-beige-muted" />
            <span>Ineligible (Break / Inactive / Max Load)</span>
          </div>
        </div>

        <span className="text-[10px] italic text-beige-muted">
          Note: Straight-line estimate, not road travel distance
        </span>
      </div>
    </div>
  );
}
