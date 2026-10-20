"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchAgents, AgentApiItem, ApiError } from "@/lib/api";
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
  X,
  Phone,
  Mail,
  Clock,
  Battery,
  RefreshCw,
  AlertTriangle,
  Radio,
  CheckCircle2,
  ChevronRight,
  Filter,
  Maximize2,
  Loader2,
} from "lucide-react";

interface MapViewProps {
  height?: string;
  isFullPage?: boolean;
  onSelectAgent?: (agent: AgentApiItem) => void;
}

const GPS_FRESHNESS_MS = 5 * 60 * 1000;
const isRecentGps = (agent: AgentApiItem) => {
  if (agent.location_source !== "gps" || !agent.last_location_update) return false;
  const age = Date.now() - new Date(agent.last_location_update).getTime();
  return Number.isFinite(age) && age >= 0 && age <= GPS_FRESHNESS_MS;
};
const locationLabel = (agent: AgentApiItem) => {
  if (agent.location_source === "gps") return isRecentGps(agent) ? "Live GPS" : "Last recorded GPS";
  if (agent.location_source === "admin_provided") return "Admin-entered location";
  return "Location source unspecified";
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] || char));

export default function MapView({
  height = "h-[450px]",
  isFullPage = false,
  onSelectAgent,
}: MapViewProps) {
  const { session, isAuthenticated } = useAuth();

  const [agents, setAgents] = useState<AgentApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAgent, setSelectedAgent] = useState<AgentApiItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnlocatedList, setShowUnlocatedList] = useState(false);
  const [isLeafletReady, setIsLeafletReady] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

  // Dynamic Leaflet Loader (client-only, SSR safe)
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ((window as any).L) {
      setIsLeafletReady(true);
      return;
    }

    const existingLink = document.getElementById("leaflet-cdn-css");
    if (!existingLink) {
      const link = document.createElement("link");
      link.id = "leaflet-cdn-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById("leaflet-cdn-js");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "leaflet-cdn-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.crossOrigin = "";
      script.onload = () => setIsLeafletReady(true);
      document.body.appendChild(script);
    } else {
      existingScript.addEventListener("load", () => setIsLeafletReady(true));
    }
  }, []);

  // Fetch real agents from database
  const loadAgentsData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchAgents(session?.access_token, { limit: 100 });
      setAgents(res.items);
      if (res.items.length > 0 && !selectedAgent) {
        // Select first located agent if available
        const firstLocated = res.items.find(
          (a) => a.current_latitude !== null && a.current_longitude !== null
        );
        if (firstLocated) {
          setSelectedAgent(firstLocated);
          if (onSelectAgent) onSelectAgent(firstLocated);
        }
      }
    } catch (err: any) {
      console.error("Failed to load map agents:", err);
      setError(err?.message || "Failed to load field agent positions from PostgreSQL database.");
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token, onSelectAgent, selectedAgent]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAgentsData();
    }
  }, [isAuthenticated, loadAgentsData]);

  // Filter agents
  const filteredAgents = agents.filter((agent) => {
    // Status filter
    if (statusFilter !== "all" && agent.status !== statusFilter) return false;

    // Location source filter
    if (sourceFilter !== "all") {
      const src = agent.location_source || "unknown";
      if (sourceFilter === "gps" && src !== "gps") return false;
      if (sourceFilter === "admin_provided" && src !== "admin_provided") return false;
      if (sourceFilter === "unlocated" && (agent.current_latitude !== null && agent.current_longitude !== null)) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (agent.name || "").toLowerCase().includes(q);
      const matchCode = (agent.agent_code || "").toLowerCase().includes(q);
      const matchTerritory = (agent.territory || "").toLowerCase().includes(q);
      const matchAddress = (agent.address || "").toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchTerritory && !matchAddress) return false;
    }

    return true;
  });

  const locatedAgents = filteredAgents.filter(
    (a) => a.current_latitude !== null && a.current_longitude !== null
  );
  const unlocatedAgents = agents.filter(
    (a) => a.current_latitude === null || a.current_longitude === null
  );

  // Initialize Map
  useEffect(() => {
    if (!isLeafletReady || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (!mapInstanceRef.current) {
      const defaultCenter = [12.9716, 77.5946];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 12,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      const markersGroup = L.featureGroup().addTo(map);
      markersLayerRef.current = markersGroup;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
      }
    };
  }, [isLeafletReady]);

  // Helper to build distinct markers based on status & source
  const createAgentIcon = useCallback((L: any, agent: AgentApiItem, isSelected: boolean) => {
    let pinColor = "#4A7C59"; // active (green)
    if (agent.status === "busy") pinColor = "#C86D51"; // busy (terracotta)
    if (agent.status === "break") pinColor = "#3B82F6"; // break (blue)
    if (agent.status === "inactive") pinColor = "#6B7280"; // inactive (gray)

    const isGps = isRecentGps(agent);
    const isAdminEntered = agent.location_source === "admin_provided";
    const size = isSelected ? 38 : 32;
    const anchor = isSelected ? 19 : 16;

    return L.divIcon({
      className: "agent-map-marker",
      html: `
        <div style="
          position: relative;
          width: ${size}px;
          height: ${size}px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s ease;
        ">
          ${isSelected ? `
            <div style="
              position: absolute;
              inset: -6px;
              border-radius: 50%;
              background: ${pinColor}33;
              animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
            "></div>
          ` : ""}
          <div style="
            width: ${size - 4}px;
            height: ${size - 4}px;
            background: ${pinColor};
            border: ${isSelected ? "3px" : "2px"} solid #FFFFFF;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <span style="
              transform: rotate(45deg);
              font-size: ${isSelected ? "11px" : "9px"};
              font-weight: 800;
              color: #FFFFFF;
              font-family: monospace;
            ">
              ${(agent.name || "A").slice(0, 1).toUpperCase()}
            </span>
          </div>
          <!-- Provenance Indicator Dot -->
          <div style="
            position: absolute;
            top: -2px;
            right: -2px;
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: ${isGps ? "#10B981" : isAdminEntered ? "#F59E0B" : "#6B7280"};
            border: 1.5px solid #FFFFFF;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          " title="${locationLabel(agent)}"></div>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [anchor, size],
      popupAnchor: [0, -size],
    });
  }, []);

  // Update Markers on Map
  useEffect(() => {
    if (!isLeafletReady || !mapInstanceRef.current || !markersLayerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const markersGroup = markersLayerRef.current;
    markersGroup.clearLayers();

    if (locatedAgents.length === 0) return;

    locatedAgents.forEach((agent) => {
      const lat = agent.current_latitude!;
      const lng = agent.current_longitude!;
      const isSelected = selectedAgent?.id === agent.id;

      const icon = createAgentIcon(L, agent, isSelected);
      const marker = L.marker([lat, lng], { icon });

      marker.on("click", () => {
        setSelectedAgent(agent);
        if (onSelectAgent) onSelectAgent(agent);
      });

      // Simple popup
      const isGps = isRecentGps(agent);
      const sourceLabel = escapeHtml(locationLabel(agent));
      const updatedAt = agent.last_location_update
        ? escapeHtml(new Date(agent.last_location_update).toLocaleString())
        : "Not recorded";
      const popupHtml = `
        <div style="font-family: inherit; font-size: 12px; padding: 2px;">
          <strong style="color: #2D2A26; font-size: 13px;">${escapeHtml(agent.name || "Field Agent")}</strong>
          <span style="font-family: monospace; color: #7D7566; font-size: 10px; display: block;">${escapeHtml(agent.agent_code || "")}</span>
          <div style="margin-top: 4px; display: flex; align-items: center; gap: 4px;">
            <span style="
              font-size: 9px;
              padding: 2px 6px;
              border-radius: 4px;
              background: ${isGps ? "#E8F5E9" : "#FFF3E0"};
              color: ${isGps ? "#2E7D32" : "#6B5B45"};
              font-weight: 700;
              text-transform: uppercase;
            ">
              ${sourceLabel}
            </span>
            <span style="color: #7D7566; font-size: 10px;">${escapeHtml(agent.status)}</span>
          </div>
          <span style="color: #7D7566; font-size: 10px; display:block;">${lat.toFixed(6)}, ${lng.toFixed(6)}</span>
          <span style="color: #7D7566; font-size: 10px; display:block;">Updated: ${updatedAt}</span>
        </div>
      `;
      marker.bindPopup(popupHtml);

      markersGroup.addLayer(marker);
    });

    const bounds = markersGroup.getBounds();
    if (bounds.isValid()) mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [locatedAgents, isLeafletReady, selectedAgent?.id, createAgentIcon, onSelectAgent]);

  // Fit bounds to all located markers
  const fitToMarkers = () => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    if (locatedAgents.length === 0) return;
    const bounds = markersLayerRef.current.getBounds();
    if (bounds.isValid()) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  };

  const handleAgentCardClick = (agent: AgentApiItem) => {
    setSelectedAgent(agent);
    if (onSelectAgent) onSelectAgent(agent);

    if (agent.current_latitude !== null && agent.current_longitude !== null) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([agent.current_latitude, agent.current_longitude], 15, {
          animate: true,
        });
      }
    }
  };

  return (
    <div
      className={`relative w-full ${height} rounded-2xl bg-[#EBE4D5] border border-beige-border overflow-hidden flex flex-col select-none`}
    >
      {/* Top Map Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Search & Filter Group */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto bg-beige-card/95 backdrop-blur-md p-1.5 rounded-xl border border-beige-border shadow-sm">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-beige-muted absolute left-2.5 top-2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter agents by name, ID, territory..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 rounded-lg bg-beige-bg text-xs text-beige-text placeholder-beige-muted border border-beige-border focus:outline-none focus:border-beige-terracotta w-44 sm:w-60"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-beige-bg text-xs text-beige-text border border-beige-border focus:outline-none focus:border-beige-terracotta"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active (On Duty)</option>
            <option value="busy">Busy</option>
            <option value="break">On Break</option>
            <option value="inactive">Inactive</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-beige-bg text-xs text-beige-text border border-beige-border focus:outline-none focus:border-beige-terracotta"
          >
            <option value="all">All Locations</option>
            <option value="gps">GPS source</option>
            <option value="admin_provided">Admin-entered</option>
            <option value="unlocated">Unlocated Only</option>
          </select>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-beige-card/95 backdrop-blur-md p-1.5 rounded-xl border border-beige-border shadow-sm">
          <button
            onClick={() => loadAgentsData()}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition disabled:opacity-50"
            title="Refresh database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-beige-terracotta" : ""}`} />
          </button>

          {locatedAgents.length > 0 && (
            <button
              onClick={fitToMarkers}
              className="p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
              title="Fit map to all markers"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setShowUnlocatedList(!showUnlocatedList)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              showUnlocatedList
                ? "bg-beige-terracotta text-white"
                : "bg-beige-sand text-beige-text hover:bg-beige-border"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Unlocated ({unlocatedAgents.length})</span>
          </button>
        </div>
      </div>

      {/* Main Map Canvas */}
      <div className="relative w-full h-full flex-1">
        {/* Leaflet Loading Overlay */}
        {!isLeafletReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-beige-card/90 text-beige-muted text-xs gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-beige-terracotta" />
            <span>Loading OpenStreetMap engine...</span>
          </div>
        )}

        {/* Database Error Alert */}
        {error && (
          <div className="absolute top-16 left-4 right-4 z-30 p-3 rounded-xl bg-[#FDF2F0] border border-beige-terracotta/40 text-beige-terracotta text-xs flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => loadAgentsData()}
              className="px-2.5 py-1 rounded-lg bg-beige-terracotta text-white font-semibold text-[11px]"
            >
              Retry
            </button>
          </div>
        )}

        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Map Legend */}
        <div className="absolute bottom-3 left-3 z-20 pointer-events-auto bg-beige-card/95 backdrop-blur-md p-2.5 rounded-xl border border-beige-border shadow-sm text-[11px] space-y-1.5 max-w-xs">
          <span className="font-bold text-[10px] uppercase tracking-wider text-beige-muted block">
            Map Legend &amp; Provenance
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-beige-text">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4A7C59]"></span>
              <span>Active</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C86D51]"></span>
              <span>Busy</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]"></span>
              <span>Break</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#6B7280]"></span>
              <span>Inactive</span>
            </div>
          </div>
          <div className="pt-1 border-t border-beige-border/60 flex items-center gap-3 text-[10px] text-beige-muted">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>GPS updated within 5 min</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>Admin-entered</span>
            </div>
          </div>
        </div>

        {/* Zero Located Agents Notice */}
        {locatedAgents.length === 0 && !isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none p-4">
            <div className="pointer-events-auto bg-beige-card/95 backdrop-blur-md p-5 rounded-2xl border border-beige-border shadow-xl text-center max-w-sm space-y-2">
              <Compass className="w-8 h-8 text-beige-terracotta mx-auto" />
              <h4 className="font-bold text-sm text-beige-text">No Coordinates Placed</h4>
              <p className="text-xs text-beige-muted leading-relaxed">
                {agents.length === 0
                  ? "No agents exist in the database yet. Create your first field agent to place pins."
                  : `All ${agents.length} agent(s) currently lack saved coordinates. Add coordinates during agent creation or await device GPS check-in.`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Selected Agent Details Side Panel */}
      {selectedAgent && (
        <div className="absolute top-16 right-3 z-30 w-80 max-w-[calc(100%-24px)] rounded-2xl bg-beige-card/98 backdrop-blur-md border border-beige-border shadow-2xl p-4 animate-in slide-in-from-right duration-200 space-y-3">
          <div className="flex items-start justify-between pb-2.5 border-b border-beige-border">
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="font-bold text-sm text-beige-text">{selectedAgent.name}</h4>
                <StatusBadge status={selectedAgent.status as any} size="sm" />
              </div>
              <p className="text-[11px] font-mono text-beige-muted mt-0.5">
                {selectedAgent.agent_code || "AGT-UNASSIGNED"} • {selectedAgent.territory || "Unassigned"}
              </p>
            </div>
            <button
              onClick={() => setSelectedAgent(null)}
              className="p-1 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Location Provenance Banner */}
          <div className="p-2.5 rounded-xl bg-beige-sand/50 border border-beige-border space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-beige-text flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-beige-terracotta" />
                <span>Location Source</span>
              </span>
              <span
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  isRecentGps(selectedAgent)
                    ? "bg-beige-olive-subtle text-beige-olive"
                    : selectedAgent.location_source === "admin_provided"
                    ? "bg-beige-sand text-beige-text border border-beige-border"
                    : "bg-beige-sand/40 text-beige-muted"
                }`}
              >
                {selectedAgent.location_source === "gps"
                  ? locationLabel(selectedAgent)
                  : selectedAgent.location_source === "admin_provided"
                  ? "Admin-entered location"
                  : "Location source unspecified"}
              </span>
            </div>

            {selectedAgent.current_latitude != null && selectedAgent.current_longitude != null ? (
              <p className="font-mono text-[11px] text-beige-text">
                Lat: {selectedAgent.current_latitude.toFixed(6)}, Lng: {selectedAgent.current_longitude.toFixed(6)}
              </p>
            ) : (
              <p className="text-[11px] text-beige-muted italic">No geographic coordinates recorded.</p>
            )}

            {selectedAgent.address && (
              <p className="text-[11px] text-beige-muted pt-1 border-t border-beige-border/40">
                <span className="font-semibold text-beige-text">Address: </span>
                {selectedAgent.address}
              </p>
            )}
            <p className="text-[10px] text-beige-muted">
              Last update: {selectedAgent.last_location_update ? new Date(selectedAgent.last_location_update).toLocaleString() : "Not recorded"}
            </p>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-beige-bg border border-beige-border/60">
              <span className="text-[10px] text-beige-muted block">Battery</span>
              <div className="flex items-center gap-1 text-beige-text font-mono font-semibold mt-0.5">
                <Battery className="w-3 h-3 text-emerald-600" />
                <span>{selectedAgent.battery_level == null ? "Unknown" : `${selectedAgent.battery_level}%`}</span>
              </div>
            </div>

            <div className="p-2 rounded-xl bg-beige-bg border border-beige-border/60">
              <span className="text-[10px] text-beige-muted block">Tasks / Visits</span>
              <span className="text-beige-text font-mono font-semibold mt-0.5 block">
                {selectedAgent.completed_visits} / {selectedAgent.assigned_tasks}
              </span>
            </div>
          </div>

          {/* Contact Details */}
          <div className="space-y-1 text-xs text-beige-text">
            {selectedAgent.phone && (
              <div className="flex items-center gap-1.5 text-beige-muted">
                <Phone className="w-3 h-3" />
                <span className="text-beige-text">{selectedAgent.phone}</span>
              </div>
            )}
            {selectedAgent.email && (
              <div className="flex items-center gap-1.5 text-beige-muted truncate">
                <Mail className="w-3 h-3 shrink-0" />
                <span className="text-beige-text truncate">{selectedAgent.email}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unlocated Agents Side Drawer */}
      {showUnlocatedList && (
        <div className="absolute top-16 left-3 z-30 w-80 max-w-[calc(100%-24px)] rounded-2xl bg-beige-card/98 backdrop-blur-md border border-beige-border shadow-2xl p-4 animate-in slide-in-from-left duration-200 space-y-3 max-h-[calc(100%-80px)] overflow-y-auto">
          <div className="flex items-center justify-between pb-2 border-b border-beige-border">
            <div>
              <h4 className="font-bold text-sm text-beige-text">Unlocated Agents</h4>
              <p className="text-[10px] text-beige-muted">
                {unlocatedAgents.length} agent(s) without saved coordinates
              </p>
            </div>
            <button
              onClick={() => setShowUnlocatedList(false)}
              className="p-1 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {unlocatedAgents.length === 0 ? (
            <div className="py-6 text-center text-xs text-beige-muted">
              <CheckCircle2 className="w-6 h-6 text-beige-olive mx-auto mb-1.5" />
              <span>All registered agents have saved coordinates!</span>
            </div>
          ) : (
            <div className="divide-y divide-beige-border/60 text-xs">
              {unlocatedAgents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => handleAgentCardClick(agent)}
                  className="py-2.5 px-2 hover:bg-beige-sand/60 rounded-xl transition cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="truncate">
                    <span className="font-semibold text-beige-text block truncate">{agent.name}</span>
                    <span className="text-[10px] font-mono text-beige-muted">
                      {agent.agent_code || "No ID"} • {agent.territory || "No territory"}
                    </span>
                  </div>
                  <StatusBadge status={agent.status as any} size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
