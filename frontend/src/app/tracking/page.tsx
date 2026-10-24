"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchAgents,
  fetchScheduledVisits,
  previewAdminRoute,
  AgentApiItem,
  VisitApiResponse,
  AdminRoutePreview,
} from "@/lib/api";
import { mockAgents, mockAssignments } from "@/lib/mockData";
import AgentRoadRouteMap, { RouteMapStop } from "@/components/agent/AgentRoadRouteMap";
import AssignWorkModal from "@/components/AssignWorkModal";
import StatusBadge from "@/components/StatusBadge";
import {
  Navigation,
  MapPin,
  Clock,
  Battery,
  Phone,
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Search,
  Crosshair,
  ShieldCheck,
  Calendar,
  Layers,
  ChevronRight,
  User,
  Radio,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

function localDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatMeters(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export default function AgentTrackingPage() {
  const { session, isAuthenticated } = useAuth();
  const [agents, setAgents] = useState<AgentApiItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState<string>(localDateString);
  const [visits, setVisits] = useState<VisitApiResponse[]>([]);
  const [routePreview, setRoutePreview] = useState<AdminRoutePreview | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const [searchAgent, setSearchAgent] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isLoadingAgents, setIsLoadingAgents] = useState<boolean>(true);
  const [isLoadingVisits, setIsLoadingVisits] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [copiedGps, setCopiedGps] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load agents from live API (falling back to mockAgents if empty or offline)
  const loadAgents = useCallback(async () => {
    setIsLoadingAgents(true);
    setErrorMessage(null);
    try {
      const res = await fetchAgents(session?.access_token, { limit: 100 });
      if (res.items && res.items.length > 0) {
        setAgents(res.items);
        // Prioritize Rishabh or maintain current selection
        setSelectedAgentId((current) => {
          if (current && res.items.some((a) => a.id === current)) return current;
          const rishabh = res.items.find((a) =>
            a.name.toLowerCase().includes("rishabh")
          );
          return rishabh ? rishabh.id : res.items[0].id;
        });
      } else {
        // Fallback to mock agents converted to AgentApiItem shape
        fallbackToMockAgents();
      }
    } catch (err: any) {
      console.warn("Could not load agents from live server, using local data:", err);
      fallbackToMockAgents();
    } finally {
      setIsLoadingAgents(false);
    }
  }, [session?.access_token]);

  const fallbackToMockAgents = () => {
    const converted: AgentApiItem[] = mockAgents.map((m) => ({
      id: m.id,
      agent_code: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      status: m.status === "active" ? "active" : "off_duty",
      territory: m.territory,
      address: "Field Operations Center",
      location_source: "gps",
      current_latitude: m.coordinates?.lat ?? 28.6139,
      current_longitude: m.coordinates?.lng ?? 77.209,
      battery_level: m.batteryLevel ?? 88,
      last_location_update: new Date().toISOString(),
      assigned_tasks: m.assignedTasks,
      completed_visits: m.completedVisits,
      created_at: new Date().toISOString(),
    }));
    setAgents(converted);
    setSelectedAgentId((current) => {
      if (current && converted.some((a) => a.id === current)) return current;
      const rishabh = converted.find((a) =>
        a.name.toLowerCase().includes("rishabh")
      );
      return rishabh ? rishabh.id : converted[0]?.id || "";
    });
  };

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Current selected agent object
  const selectedAgent = useMemo(() => {
    return agents.find((a) => a.id === selectedAgentId) || null;
  }, [agents, selectedAgentId]);

  // Load visits and route geometry for selected agent
  const loadVisitsAndRoute = useCallback(async () => {
    if (!selectedAgentId) return;
    setIsLoadingVisits(true);
    setRoutePreview(null);
    setErrorMessage(null);

    try {
      // 1. Try fetching from live backend
      const visitRes = await fetchScheduledVisits(
        selectedAgentId,
        scheduledDate,
        session?.access_token
      );

      if (visitRes.items && visitRes.items.length > 0) {
        setVisits(visitRes.items);
        // Preview road route via OSRM
        try {
          const preview = await previewAdminRoute(
            {
              agent_id: selectedAgentId,
              scheduled_date: scheduledDate,
              visit_ids: visitRes.items.map((v) => v.id),
            },
            session?.access_token
          );
          setRoutePreview(preview);
        } catch (routeErr) {
          console.warn("OSRM road route preview failed:", routeErr);
        }
      } else {
        // Fallback to local mock visits for this agent if available
        loadMockVisitsForAgent(selectedAgentId);
      }
    } catch (err: any) {
      console.warn("Live visits fetch failed, loading local assignment data:", err);
      loadMockVisitsForAgent(selectedAgentId);
    } finally {
      setIsLoadingVisits(false);
      setIsRefreshing(false);
    }
  }, [selectedAgentId, scheduledDate, session?.access_token]);

  const loadMockVisitsForAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    const agentName = agent?.name || "Rishabh Mishra";

    // Find assignments matching this agent or create realistic defaults
    const filtered = mockAssignments.filter(
      (asn) =>
        asn.agentId === agentId ||
        asn.agentName.toLowerCase() === agentName.toLowerCase()
    );

    const source =
      filtered.length > 0
        ? filtered
        : mockAssignments.filter((asn) => asn.agentName.includes("Rishabh"));

    const baseLat = agent?.current_latitude || 28.6139;
    const baseLng = agent?.current_longitude || 77.209;

    const mockConverted: VisitApiResponse[] = source.map((item, idx) => ({
      id: item.id,
      visit_code: `VIS-${item.id.replace("ASN-", "")}`,
      customer_id: item.customerId,
      agent_id: agentId,
      customer_name: item.customerName,
      customer_company: "Enterprise Client",
      customer_address: item.address,
      customer_latitude: baseLat + (idx + 1) * 0.0075 * (idx % 2 === 0 ? 1 : -1),
      customer_longitude: baseLng + (idx + 1) * 0.0065,
      scheduled_date: scheduledDate,
      scheduled_time_window: item.scheduledTime,
      status: item.status === "active" ? "in_progress" : item.status,
      geofence_verified: item.status === "completed",
      order_index: idx + 1,
      estimated_duration_minutes: item.estimatedDurationMinutes,
      purpose: item.notes,
      priority: item.priority,
      created_at: new Date().toISOString(),
    }));

    setVisits(mockConverted);
  };

  useEffect(() => {
    if (selectedAgentId) {
      loadVisitsAndRoute();
    }
  }, [selectedAgentId, loadVisitsAndRoute]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAgents();
    await loadVisitsAndRoute();
  };

  const handleCopyGps = () => {
    if (selectedAgent?.current_latitude && selectedAgent?.current_longitude) {
      const text = `${selectedAgent.current_latitude.toFixed(6)}, ${selectedAgent.current_longitude.toFixed(6)}`;
      navigator.clipboard.writeText(text);
      setCopiedGps(true);
      setTimeout(() => setCopiedGps(false), 2000);
    }
  };

  // Convert visits to RouteMapStop format for AgentRoadRouteMap
  const mapStops: RouteMapStop[] = useMemo(() => {
    const originLat = selectedAgent?.current_latitude;
    const originLng = selectedAgent?.current_longitude;

    return visits.map((v, idx) => {
      let distanceMeters: number | null = null;
      if (
        originLat != null &&
        originLng != null &&
        v.customer_latitude != null &&
        v.customer_longitude != null
      ) {
        distanceMeters = calculateDistanceMeters(
          originLat,
          originLng,
          v.customer_latitude,
          v.customer_longitude
        );
      }

      return {
        id: v.id,
        customer_name: v.customer_name || "Customer Site",
        customer_address: v.customer_address || "Scheduled Address",
        customer_latitude: v.customer_latitude,
        customer_longitude: v.customer_longitude,
        status: v.status,
        order_index: v.order_index ?? idx + 1,
        distance_meters: distanceMeters,
        is_nearest: idx === 0 && v.status !== "completed",
      };
    });
  }, [visits, selectedAgent]);

  // Route geometry coordinates
  const geometryCoordinates: [number, number][] = useMemo(() => {
    if (routePreview?.geometry?.coordinates) {
      return routePreview.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    }
    // Fallback straight lines if OSRM hasn't returned geometry
    const pts: [number, number][] = [];
    if (selectedAgent?.current_latitude && selectedAgent?.current_longitude) {
      pts.push([selectedAgent.current_latitude, selectedAgent.current_longitude]);
    }
    visits.forEach((v) => {
      if (v.customer_latitude && v.customer_longitude) {
        pts.push([v.customer_latitude, v.customer_longitude]);
      }
    });
    return pts;
  }, [routePreview, selectedAgent, visits]);

  // Filtered visits
  const filteredVisits = useMemo(() => {
    if (statusFilter === "all") return visits;
    return visits.filter((v) => v.status === statusFilter);
  }, [visits, statusFilter]);

  // Search filtered agents
  const filteredAgents = useMemo(() => {
    if (!searchAgent.trim()) return agents;
    const q = searchAgent.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.agent_code && a.agent_code.toLowerCase().includes(q)) ||
        (a.territory && a.territory.toLowerCase().includes(q))
    );
  }, [agents, searchAgent]);

  const completedCount = visits.filter((v) => v.status === "completed").length;
  const inProgressCount = visits.filter((v) => v.status === "in_progress").length;
  const pendingCount = visits.filter((v) => v.status === "pending" || v.status === "assigned").length;

  return (
    <div className="space-y-5 pb-10">
      {/* 1. Header & Agent Selector Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-beige-border/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight flex items-center gap-2">
              <Navigation className="w-6 h-6 text-beige-terracotta" />
              <span>Agent Live Tracking & Task Execution</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold border border-emerald-300">
              Live Telemetry
            </span>
          </div>
          <p className="text-xs text-beige-muted mt-0.5">
            Real-time GPS tracking, active field location, and route tasks assigned to each representative.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-beige-card hover:bg-beige-sand text-beige-text border border-beige-border shadow-2xs flex items-center gap-1.5 transition"
            title="Refresh GPS & Tasks"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-beige-terracotta ${
                isRefreshing ? "animate-spin" : ""
              }`}
            />
            <span>Refresh GPS</span>
          </button>

          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-sm flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Assign Task to {selectedAgent?.name?.split(" ")[0] || "Agent"}</span>
          </button>
        </div>
      </div>

      {/* 2. Interactive Agent Carousel & Selection Bar */}
      <div className="bg-beige-card p-3 rounded-2xl border border-beige-border shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-beige-terracotta animate-pulse" />
            <span className="text-xs font-bold text-beige-text uppercase tracking-wider">
              Select Field Representative:
            </span>
          </div>

          {/* Quick Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter agent by name..."
              value={searchAgent}
              onChange={(e) => setSearchAgent(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-beige-bg text-xs text-beige-text placeholder-beige-muted border border-beige-border focus:outline-none focus:border-beige-terracotta"
            />
          </div>
        </div>

        {/* Agent Cards Horizontal List */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
          {isLoadingAgents ? (
            <div className="text-xs text-beige-muted py-2 px-3">Loading field representatives...</div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-xs text-beige-muted py-2 px-3">No representatives match &ldquo;{searchAgent}&rdquo;</div>
          ) : (
            filteredAgents.map((agent) => {
              const isSelected = agent.id === selectedAgentId;
              const isOnDuty = agent.status === "active";
              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    setSelectedStopId(null);
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition shrink-0 border ${
                    isSelected
                      ? "bg-beige-sand border-beige-terracotta ring-1 ring-beige-terracotta shadow-xs"
                      : "bg-beige-bg/70 hover:bg-beige-sand/60 border-beige-border/80"
                  }`}
                >
                  {/* Avatar Initial with Status Dot */}
                  <div className="relative">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                        isSelected
                          ? "bg-beige-terracotta text-white"
                          : "bg-emerald-900/10 text-beige-terracotta"
                      }`}
                    >
                      {agent.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase()}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-beige-card ${
                        isOnDuty ? "bg-emerald-500" : "bg-neutral-400"
                      }`}
                    />
                  </div>

                  {/* Name and Tasks */}
                  <div>
                    <div className="text-xs font-bold text-beige-text flex items-center gap-1.5">
                      <span>{agent.name}</span>
                      {isSelected && (
                        <span className="text-[10px] font-semibold text-beige-terracotta bg-beige-card px-1.5 py-0.2 rounded border border-beige-terracotta/30">
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-beige-muted flex items-center gap-2 mt-0.5">
                      <span>{isOnDuty ? "On Duty" : "Off Duty"}</span>
                      <span>•</span>
                      <span>{agent.assigned_tasks || 0} visits today</span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 3. Selected Agent Detailed Telemetry & Status Card */}
      {selectedAgent && (
        <div className="bg-beige-card rounded-2xl border border-beige-border p-4 shadow-2xs">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
            {/* Agent Identity */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-beige-terracotta text-white font-bold text-base flex items-center justify-center shadow-xs">
                {selectedAgent.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .substring(0, 2)
                  .toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-sm text-beige-text">
                    {selectedAgent.name}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                      selectedAgent.status === "active"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-neutral-100 text-neutral-600 border-neutral-300"
                    }`}
                  >
                    {selectedAgent.status === "active" ? "Active on Duty" : "Off Duty"}
                  </span>
                </div>
                <div className="text-[11px] text-beige-muted mt-0.5 flex items-center gap-2">
                  <span className="font-mono text-[10px]">{selectedAgent.agent_code || selectedAgent.id}</span>
                  {selectedAgent.territory && (
                    <>
                      <span>•</span>
                      <span>{selectedAgent.territory}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Live GPS Coordinates */}
            <div className="p-2.5 rounded-xl bg-beige-bg border border-beige-border/80">
              <span className="text-[10px] font-bold text-beige-muted uppercase tracking-wider block mb-1">
                Live GPS Location
              </span>
              {selectedAgent.current_latitude && selectedAgent.current_longitude ? (
                <div className="flex items-center justify-between">
                  <div className="font-mono text-xs font-semibold text-beige-text">
                    {selectedAgent.current_latitude.toFixed(5)}° N,{" "}
                    {selectedAgent.current_longitude.toFixed(5)}° E
                  </div>
                  <button
                    onClick={handleCopyGps}
                    className="p-1 rounded hover:bg-beige-sand text-beige-muted hover:text-beige-text transition"
                    title="Copy coordinates"
                  >
                    {copiedGps ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-beige-muted italic">
                  GPS fix awaiting check-in
                </span>
              )}
            </div>

            {/* Device & Battery Health */}
            <div className="p-2.5 rounded-xl bg-beige-bg border border-beige-border/80">
              <span className="text-[10px] font-bold text-beige-muted uppercase tracking-wider block mb-1">
                Device Telemetry
              </span>
              <div className="flex items-center justify-between text-xs text-beige-text font-medium">
                <span className="flex items-center gap-1.5">
                  <Battery className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{selectedAgent.battery_level ?? 90}% Battery</span>
                </span>
                <span className="text-[10px] text-beige-muted">
                  Fix: {selectedAgent.location_source === "admin_provided" ? "Admin Anchor" : "GPS Satellite"}
                </span>
              </div>
            </div>

            {/* Day Task Run Rate */}
            <div className="p-2.5 rounded-xl bg-beige-bg border border-beige-border/80">
              <div className="flex items-center justify-between text-[10px] font-bold text-beige-muted uppercase tracking-wider mb-1">
                <span>Task Execution</span>
                <span className="text-beige-text font-bold">
                  {completedCount} / {visits.length} Complete
                </span>
              </div>
              <div className="w-full bg-beige-border rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-beige-terracotta h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${visits.length > 0 ? (completedCount / visits.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Main Tracking Workspace: Interactive Road Map + Assigned Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT / CENTER: Interactive Road Map (7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-beige-card p-3 rounded-2xl border border-beige-border shadow-2xs space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-beige-border/80">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-beige-terracotta" />
                <h3 className="font-bold text-xs text-beige-text uppercase tracking-wider">
                  Live Field Route & Telemetry Map
                </h3>
              </div>
              {routePreview && (
                <div className="text-[11px] font-semibold text-beige-text flex items-center gap-2">
                  <span>Distance: {formatMeters(routePreview.distance_meters)}</span>
                  <span>•</span>
                  <span>ETA: ~{Math.round(routePreview.duration_seconds / 60)} mins</span>
                </div>
              )}
            </div>

            {/* Map Container */}
            <div className="rounded-xl overflow-hidden border border-beige-border bg-beige-sand/30 h-[480px]">
              <AgentRoadRouteMap
                origin={
                  selectedAgent?.current_latitude && selectedAgent?.current_longitude
                    ? {
                        latitude: selectedAgent.current_latitude,
                        longitude: selectedAgent.current_longitude,
                      }
                    : null
                }
                stops={mapStops}
                geometry={geometryCoordinates}
                selectedStopId={selectedStopId}
                onSelectStop={(stop) => setSelectedStopId(stop.id)}
              />
            </div>

            {/* Map Legend */}
            <div className="flex items-center justify-between text-[11px] text-beige-muted pt-1 px-1 flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#64754f] border border-white inline-block" />
                  <span>{selectedAgent?.name || "Agent"} Live GPS</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2D6A4F] inline-block" />
                  <span>Next Scheduled Task</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#40916C] inline-block" />
                  <span>Completed Task</span>
                </span>
              </div>
              <span className="text-[10px] italic">Click any task card to inspect destination</span>
            </div>
          </div>
        </div>

        {/* RIGHT: Assigned Tasks Panel (5 Cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-beige-card p-4 rounded-2xl border border-beige-border shadow-2xs space-y-3">
            {/* Panel Header */}
            <div className="flex items-center justify-between pb-2 border-b border-beige-border/80">
              <div>
                <h3 className="font-bold text-sm text-beige-text">
                  Assigned Tasks for {selectedAgent?.name || "Representative"}
                </h3>
                <span className="text-[11px] text-beige-muted">
                  {visits.length} total stops scheduled for today
                </span>
              </div>

              {/* Date Selector */}
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-beige-muted" />
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="text-xs bg-beige-bg border border-beige-border rounded-lg px-2 py-1 text-beige-text focus:outline-none focus:border-beige-terracotta"
                />
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 border-b border-beige-border/50 pb-2">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  statusFilter === "all"
                    ? "bg-beige-terracotta text-white"
                    : "text-beige-muted hover:text-beige-text hover:bg-beige-sand"
                }`}
              >
                All ({visits.length})
              </button>
              <button
                onClick={() => setStatusFilter("pending")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  statusFilter === "pending"
                    ? "bg-beige-terracotta text-white"
                    : "text-beige-muted hover:text-beige-text hover:bg-beige-sand"
                }`}
              >
                Pending ({pendingCount})
              </button>
              <button
                onClick={() => setStatusFilter("in_progress")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  statusFilter === "in_progress"
                    ? "bg-beige-terracotta text-white"
                    : "text-beige-muted hover:text-beige-text hover:bg-beige-sand"
                }`}
              >
                In Progress ({inProgressCount})
              </button>
              <button
                onClick={() => setStatusFilter("completed")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  statusFilter === "completed"
                    ? "bg-beige-terracotta text-white"
                    : "text-beige-muted hover:text-beige-text hover:bg-beige-sand"
                }`}
              >
                Completed ({completedCount})
              </button>
            </div>

            {/* Task List */}
            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
              {isLoadingVisits ? (
                <div className="p-8 text-center text-xs text-beige-muted">
                  Loading assigned visits...
                </div>
              ) : filteredVisits.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-beige-bg border border-dashed border-beige-border">
                  <p className="text-xs font-medium text-beige-muted">
                    No tasks found matching filter &ldquo;{statusFilter}&rdquo;
                  </p>
                  <button
                    onClick={() => setIsAssignModalOpen(true)}
                    className="mt-3 px-3 py-1.5 rounded-xl text-xs font-semibold bg-beige-terracotta text-white hover:bg-beige-terracotta-light transition inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Dispatch a Task</span>
                  </button>
                </div>
              ) : (
                filteredVisits.map((visit, index) => {
                  const isSelected = selectedStopId === visit.id;
                  const isDone = visit.status === "completed";
                  const isInProgress = visit.status === "in_progress";

                  // Calculate distance from agent's live GPS
                  let distText = "";
                  if (
                    selectedAgent?.current_latitude != null &&
                    selectedAgent?.current_longitude != null &&
                    visit.customer_latitude != null &&
                    visit.customer_longitude != null
                  ) {
                    const dist = calculateDistanceMeters(
                      selectedAgent.current_latitude,
                      selectedAgent.current_longitude,
                      visit.customer_latitude,
                      visit.customer_longitude
                    );
                    distText = `${formatMeters(dist)} from ${selectedAgent.name.split(" ")[0]}`;
                  }

                  return (
                    <div
                      key={visit.id}
                      onClick={() => setSelectedStopId(visit.id)}
                      className={`p-3 rounded-xl border transition cursor-pointer text-left ${
                        isSelected
                          ? "bg-beige-sand border-beige-terracotta ring-1 ring-beige-terracotta"
                          : "bg-beige-bg/70 hover:bg-beige-sand/50 border-beige-border"
                      }`}
                    >
                      {/* Top Bar: Stop number, Customer Name & Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-6 h-6 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 ${
                              isDone
                                ? "bg-emerald-700 text-white"
                                : isInProgress
                                ? "bg-emerald-900 text-white"
                                : "bg-beige-sand text-beige-text border border-beige-border"
                            }`}
                          >
                            {visit.order_index ?? index + 1}
                          </span>
                          <div>
                            <h4 className="font-bold text-xs text-beige-text leading-tight">
                              {visit.customer_name || "Customer Site"}
                            </h4>
                            {visit.customer_company && (
                              <span className="text-[10px] text-beige-muted">
                                {visit.customer_company}
                              </span>
                            )}
                          </div>
                        </div>

                        <StatusBadge
                          status={visit.status as any}
                          type="assignment"
                          className="text-[10px] px-2 py-0.5 shrink-0"
                        />
                      </div>

                      {/* Time and Address */}
                      <div className="mt-2 space-y-1 text-[11px] text-beige-muted">
                        {visit.customer_address && (
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-beige-terracotta shrink-0 mt-0.5" />
                            <span className="line-clamp-2 leading-tight">
                              {visit.customer_address}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-beige-muted" />
                            <span>
                              {visit.scheduled_time_window || "Flexible window"} (
                              {visit.estimated_duration_minutes || 45} mins)
                            </span>
                          </div>

                          {distText && (
                            <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              {distText}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Geofence Check / Purpose Footer */}
                      <div className="mt-2 pt-2 border-t border-beige-border/60 flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck
                            className={`w-3.5 h-3.5 ${
                              isDone || visit.geofence_verified
                                ? "text-emerald-700"
                                : "text-beige-muted"
                            }`}
                          />
                          <span
                            className={
                              isDone || visit.geofence_verified
                                ? "font-semibold text-emerald-800"
                                : "text-beige-muted"
                            }
                          >
                            {isDone || visit.geofence_verified
                              ? "Geofence Verified"
                              : "Perimeter Check: 750m"}
                          </span>
                        </div>

                        {visit.priority && (
                          <span className="capitalize font-medium text-beige-text">
                            Priority: {visit.priority}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Dispatch Modal */}
      {isAssignModalOpen && (
        <AssignWorkModal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          preselectedAgentId={selectedAgentId}
          preselectedDate={scheduledDate}
          onSuccess={() => {
            setIsAssignModalOpen(false);
            loadVisitsAndRoute();
          }}
        />
      )}
    </div>
  );
}
