"use client";

import React, { useState } from "react";
import { mockAgents, mockCustomers, mockTerritories } from "@/lib/mockData";
import { Agent, Customer } from "@/types";
import StatusBadge from "./StatusBadge";
import {
  Compass,
  Plus,
  Minus,
  RotateCcw,
  Navigation,
  Layers,
  MapPin,
  Users,
  Shield,
  Search,
  ExternalLink,
  X,
  Phone,
  Mail,
  Clock,
  Battery,
} from "lucide-react";

interface MapViewProps {
  height?: string;
  isFullPage?: boolean;
  onSelectAgent?: (agent: Agent) => void;
  onSelectCustomer?: (customer: Customer) => void;
}

export default function MapView({
  height = "h-[450px]",
  isFullPage = false,
  onSelectAgent,
  onSelectCustomer,
}: MapViewProps) {
  const [zoom, setZoom] = useState(1);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(mockAgents[0]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [filterType, setFilterType] = useState<"all" | "agents" | "customers">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showTerritories, setShowTerritories] = useState(true);

  // Normalize coordinates for SVG canvas display (Bangalore central coordinates: ~12.97, ~77.60)
  const mapCenter = { lat: 12.9716, lng: 77.5946 };
  const latSpan = 0.22;
  const lngSpan = 0.22;

  const projectToCanvas = (lat: number, lng: number) => {
    // Map to 0-100% canvas coordinates
    const x = ((lng - (mapCenter.lng - lngSpan / 2)) / lngSpan) * 100;
    const y = (((mapCenter.lat + latSpan / 2) - lat) / latSpan) * 100;
    return {
      x: Math.max(5, Math.min(95, x)),
      y: Math.max(5, Math.min(95, y)),
    };
  };

  const filteredAgents = mockAgents.filter((a) => {
    if (filterType === "customers") return false;
    if (!searchQuery) return true;
    return (
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.territory.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const filteredCustomers = mockCustomers.filter((c) => {
    if (filterType === "agents") return false;
    if (!searchQuery) return true;
    return (
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.address.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setSelectedCustomer(null);
    if (onSelectAgent) onSelectAgent(agent);
  };

  const handleCustomerClick = (cust: Customer) => {
    setSelectedCustomer(cust);
    setSelectedAgent(null);
    if (onSelectCustomer) onSelectCustomer(cust);
  };

  return (
    <div
      className={`relative w-full ${height} rounded-2xl bg-[#EBE4D5] border border-beige-border overflow-hidden flex flex-col select-none`}
    >
      {/* Top Map Control Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Search & Filter Group */}
        <div className="flex items-center gap-2 pointer-events-auto bg-beige-card/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-beige-border shadow-sm">
          <Search className="w-4 h-4 text-beige-muted" />
          <input
            type="text"
            placeholder="Search agents or customer stops..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-beige-text placeholder-beige-muted focus:outline-none w-44 sm:w-56"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-beige-muted hover:text-beige-text">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Demo Status & Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-beige-card/95 backdrop-blur-md border border-beige-border text-xs text-beige-muted shadow-sm">
            <span className="w-2 h-2 rounded-full bg-beige-olive animate-pulse" />
            <span className="font-semibold text-beige-text">Demo Data</span>
            <span className="text-[11px] text-beige-muted hidden md:inline">• 100m Geofence Active</span>
          </div>

          {/* Filter Pill */}
          <div className="flex rounded-xl bg-beige-card/95 backdrop-blur-md border border-beige-border p-0.5 text-xs shadow-sm">
            <button
              onClick={() => setFilterType("all")}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                filterType === "all" ? "bg-beige-sidebar text-beige-text" : "text-beige-muted hover:text-beige-text"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType("agents")}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                filterType === "agents" ? "bg-beige-sidebar text-beige-text" : "text-beige-muted hover:text-beige-text"
              }`}
            >
              Agents ({filteredAgents.length})
            </button>
            <button
              onClick={() => setFilterType("customers")}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                filterType === "customers" ? "bg-beige-sidebar text-beige-text" : "text-beige-muted hover:text-beige-text"
              }`}
            >
              Stops ({filteredCustomers.length})
            </button>
          </div>

          {/* Territory Toggle */}
          <button
            onClick={() => setShowTerritories(!showTerritories)}
            className={`p-2 rounded-xl bg-beige-card/95 backdrop-blur-md border border-beige-border shadow-sm text-xs font-medium flex items-center gap-1.5 transition ${
              showTerritories ? "text-beige-terracotta border-beige-terracotta/40" : "text-beige-muted"
            }`}
            title="Toggle Territory Boundaries"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Map Interactive Canvas */}
      <div className="relative w-full h-full overflow-hidden bg-[#F2EDE1]">
        {/* Subtle Map Grid & Vector Road Network Background */}
        <svg
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform 0.3s ease" }}
        >
          <defs>
            <pattern id="mapGrid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#E3DAC9" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mapGrid)" />

          {/* Road Network Lines (Metro Roads) */}
          <g stroke="#D8CEBE" strokeWidth="2.5" fill="none" opacity="0.85">
            <path d="M -50,150 Q 200,120 450,220 T 950,280 T 1400,240" />
            <path d="M 120,-50 Q 220,250 320,500 T 500,900" />
            <path d="M 650,-50 Q 580,300 620,600 T 750,900" />
            <path d="M -50,420 Q 300,380 600,410 T 1200,460" stroke="#CFC3AF" strokeWidth="3.5" />
            <path d="M 350,50 Q 520,380 850,550" strokeDasharray="6,4" stroke="#C0B29D" strokeWidth="1.8" />
          </g>

          {/* Territory Boundaries (Illustrative Zones) */}
          {showTerritories &&
            mockTerritories.map((t, idx) => {
              const center = projectToCanvas(t.center.lat, t.center.lng);
              const r = 18;
              return (
                <g key={t.id} opacity="0.6">
                  <circle
                    cx={`${center.x}%`}
                    cy={`${center.y}%`}
                    r={`${r}%`}
                    fill={t.color}
                    fillOpacity="0.12"
                    stroke={t.color}
                    strokeWidth="1.5"
                    strokeDasharray="5,3"
                  />
                  <text
                    x={`${center.x}%`}
                    y={`${center.y - r + 3}%`}
                    textAnchor="middle"
                    fill={t.color}
                    fontSize="11"
                    fontWeight="600"
                    opacity="0.9"
                  >
                    {t.name.split(" ")[0]} Zone
                  </text>
                </g>
              );
            })}

          {/* Active Route Simulation Path */}
          {selectedAgent && (
            <g stroke="#B76E52" strokeWidth="2.5" strokeDasharray="6,4" fill="none">
              <path
                d={`M ${projectToCanvas(selectedAgent.coordinates.lat, selectedAgent.coordinates.lng).x}% ${
                  projectToCanvas(selectedAgent.coordinates.lat, selectedAgent.coordinates.lng).y
                }% Q ${
                  projectToCanvas(selectedAgent.coordinates.lat, selectedAgent.coordinates.lng).x + 10
                }% ${
                  projectToCanvas(selectedAgent.coordinates.lat, selectedAgent.coordinates.lng).y - 12
                }% 54% 48%`}
              />
            </g>
          )}
        </svg>

        {/* Dynamic Markers Overlay (Agents & Customers) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform 0.3s ease" }}
        >
          {/* Customer / Visit Markers */}
          {filteredCustomers.map((c) => {
            const pos = projectToCanvas(c.coordinates.lat, c.coordinates.lng);
            const isSelected = selectedCustomer?.id === c.id;
            return (
              <div
                key={c.id}
                onClick={() => handleCustomerClick(c)}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer group z-10"
              >
                <div
                  className={`relative flex items-center justify-center w-7 h-7 rounded-lg transition-transform duration-200 shadow-md ${
                    isSelected
                      ? "bg-beige-terracotta text-white scale-125 ring-4 ring-beige-terracotta/20"
                      : "bg-beige-card text-beige-terracotta hover:scale-115 border border-beige-border"
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  {c.priority === "high" && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
                  )}
                </div>

                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-beige-card text-beige-text text-[11px] font-medium py-1 px-2.5 rounded-lg border border-beige-border shadow-lg whitespace-nowrap z-30">
                  <span className="font-bold text-beige-terracotta">{c.name}</span>
                  <div className="text-[10px] text-beige-muted">{c.address.split(",")[0]}</div>
                </div>
              </div>
            );
          })}

          {/* Field Agent Markers */}
          {filteredAgents.map((a) => {
            const pos = projectToCanvas(a.coordinates.lat, a.coordinates.lng);
            const isSelected = selectedAgent?.id === a.id;
            const isActive = a.status === "active";

            return (
              <div
                key={a.id}
                onClick={() => handleAgentClick(a)}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer group z-20"
              >
                {/* Active Pulse Ring */}
                {isActive && (
                  <span className="absolute -inset-2 rounded-full bg-beige-olive/25 animate-ping opacity-75" />
                )}

                <div
                  className={`relative flex items-center justify-center w-9 h-9 rounded-full font-bold text-xs shadow-lg transition-all duration-200 ${
                    isSelected
                      ? "bg-beige-olive text-white scale-125 ring-4 ring-beige-olive/30 shadow-beige-olive/40"
                      : "bg-beige-card text-beige-text border-2 border-beige-olive hover:scale-110"
                  }`}
                >
                  {a.initials}
                  <span
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                      a.status === "active"
                        ? "bg-emerald-500"
                        : a.status === "busy"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                    }`}
                  />
                </div>

                {/* Tooltip on hover */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover:block bg-beige-card text-beige-text text-[11px] font-medium py-1.5 px-3 rounded-lg border border-beige-border shadow-lg whitespace-nowrap z-30">
                  <div className="font-semibold text-beige-olive flex items-center gap-1.5">
                    <span>{a.name}</span>
                    <span className="text-[10px] font-normal text-beige-muted">({a.id})</span>
                  </div>
                  <div className="text-[10px] text-beige-muted mt-0.5">{a.currentTask}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Bottom Zoom & Map Tools */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1.5 bg-beige-card/95 backdrop-blur-md rounded-xl border border-beige-border p-1 shadow-md">
        <button
          onClick={() => setZoom((z) => Math.min(2.0, z + 0.2))}
          className="p-2 rounded-lg hover:bg-beige-sidebar text-beige-text transition"
          title="Zoom In"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.7, z - 0.2))}
          className="p-2 rounded-lg hover:bg-beige-sidebar text-beige-text transition"
          title="Zoom Out"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(1.0)}
          className="p-2 rounded-lg hover:bg-beige-sidebar text-beige-text transition"
          title="Reset View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Selected Item Drawer / Detail Overlay */}
      {(selectedAgent || selectedCustomer) && (
        <div className="absolute bottom-4 left-4 z-20 max-w-sm w-full bg-beige-card/95 backdrop-blur-md rounded-2xl border border-beige-border shadow-lg p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {selectedAgent && (
            <div>
              <div className="flex items-start justify-between pb-3 border-b border-beige-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-beige-olive text-white flex items-center justify-center font-bold text-sm shadow-sm">
                    {selectedAgent.initials}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-beige-text">{selectedAgent.name}</h4>
                    <p className="text-xs text-beige-muted">{selectedAgent.id} • {selectedAgent.territory}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={selectedAgent.status} size="sm" />
                  <button
                    onClick={() => setSelectedAgent(null)}
                    className="p-1 text-beige-muted hover:text-beige-text rounded-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="py-2.5 space-y-1.5 text-xs text-beige-text">
                <div className="text-[11px] font-medium text-beige-olive bg-beige-olive-subtle/80 px-2 py-1 rounded-md">
                  Task: {selectedAgent.currentTask}
                </div>
                <div className="flex items-center justify-between text-beige-muted pt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Updated: {selectedAgent.lastLocationUpdate}
                  </span>
                  <span className="flex items-center gap-1">
                    <Battery className="w-3.5 h-3.5 text-emerald-600" /> {selectedAgent.batteryLevel}%
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-beige-border/60 flex items-center justify-between text-xs">
                <span className="text-beige-muted">
                  Visits: <strong className="text-beige-text">{selectedAgent.completedVisits} / {selectedAgent.assignedTasks}</strong>
                </span>
                <span className="text-beige-terracotta font-semibold text-[11px]">
                  Geofence: 14m (Verified)
                </span>
              </div>
            </div>
          )}

          {selectedCustomer && (
            <div>
              <div className="flex items-start justify-between pb-3 border-b border-beige-border/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-beige-terracotta text-white flex items-center justify-center shadow-sm">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-beige-text truncate max-w-[180px]">{selectedCustomer.name}</h4>
                    <p className="text-xs text-beige-muted">{selectedCustomer.leadId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={selectedCustomer.assignmentStatus} size="sm" />
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="p-1 text-beige-muted hover:text-beige-text rounded-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="py-2.5 space-y-1 text-xs text-beige-muted">
                <p className="text-beige-text font-medium">{selectedCustomer.address}</p>
                <p>Assigned Agent: <strong className="text-beige-text">{selectedCustomer.assignedAgentName || "Unassigned"}</strong></p>
                <div className="flex items-center gap-3 pt-1">
                  <span className="flex items-center gap-1">
                    Priority: <StatusBadge status={selectedCustomer.priority} size="sm" />
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Map Legend */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 hidden md:flex items-center gap-4 px-4 py-2 rounded-xl bg-beige-card/90 backdrop-blur-md border border-beige-border text-xs text-beige-muted shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-beige-olive border border-white" />
          <span>Active Agent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-beige-terracotta border border-white" />
          <span>Customer Stop</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 border-t-2 border-dashed border-beige-terracotta" />
          <span>Scheduled Route</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border border-dashed border-[#B76E52] bg-[#B76E52]/20" />
          <span>Territory Boundary</span>
        </div>
      </div>
    </div>
  );
}
