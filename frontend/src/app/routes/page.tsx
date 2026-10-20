"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useOperations } from "@/context/OperationsContext";
import { mockAgents, mockCustomers, mockAssignments } from "@/lib/mockData";
import { initialAgentVisits } from "@/lib/agentMockData";
import { Agent, Customer, Assignment } from "@/types";
import { AgentVisit } from "@/types/agent";
import RouteMap from "@/components/RouteMap";
import StatusBadge from "@/components/StatusBadge";
import {
  BaseRouteStop,
  RouteOptimizationResult,
  optimizeRouteNearestNeighbour,
  calculateRouteSequenceMetrics,
} from "@/lib/routeOptimizer";
import {
  Route,
  Sparkles,
  RefreshCw,
  Calendar,
  User,
  CheckSquare,
  Square,
  MoveUp,
  MoveDown,
  Trash2,
  Plus,
  Navigation,
  Clock,
  Compass,
  AlertCircle,
  CheckCircle2,
  Send,
  RotateCcw,
  SlidersHorizontal,
  Layers,
  ArrowRight,
  ShieldCheck,
  Building2,
  Phone,
  Info,
} from "lucide-react";

function getInitialVisitsForAgent(
  agentId: string,
  date: string,
  customers: Customer[]
): BaseRouteStop[] {
  if (agentId === "AGT-101" && date === "2026-10-18") {
    return initialAgentVisits.map((v) => ({
      id: v.id,
      name: v.customerName,
      customerName: v.customerName,
      address: v.address,
      coordinates: v.coordinates,
      scheduledTime: v.scheduledTime,
      scheduledDate: v.scheduledDate,
      priority: v.priority,
      status: v.status,
      company: v.company,
      estimatedDuration: v.estimatedDuration,
      phone: v.phone,
    }));
  }

  const agentAssignments = mockAssignments.filter(
    (a) => a.agentId === agentId && a.scheduledDate === date
  );

  if (agentAssignments.length > 0) {
    return agentAssignments.map((a) => {
      const cust = customers.find((c) => c.id === a.customerId);
      return {
        id: a.id,
        name: a.customerName,
        customerName: a.customerName,
        address: a.address,
        coordinates: cust ? cust.coordinates : { lat: 12.9716, lng: 77.5946 },
        scheduledTime: a.scheduledTime,
        scheduledDate: a.scheduledDate,
        priority: a.priority,
        status: a.status,
        estimatedDuration: a.estimatedDurationMinutes,
      };
    });
  }

  const nearby = customers.slice(0, 4);
  const times = ["09:30 AM", "11:00 AM", "01:30 PM", "03:15 PM"];
  return nearby.map((c, i) => ({
    id: `STOP-${c.id}`,
    name: c.name,
    customerName: c.name,
    address: c.address,
    coordinates: c.coordinates,
    scheduledTime: times[i % times.length],
    scheduledDate: date,
    priority: c.priority,
    status: "pending",
    company: c.company,
    estimatedDuration: "35 mins",
    phone: c.phone,
  }));
}

export default function AdminRoutePlanningPage() {
  const { agents: contextAgents, customers: contextCustomers } = useOperations();

  const agentsList = contextAgents && contextAgents.length > 0 ? contextAgents : mockAgents;
  const customersList = contextCustomers && contextCustomers.length > 0 ? contextCustomers : mockCustomers;

  // Selected Agent and Date
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agentsList[0]?.id || "AGT-101");
  const [selectedDate, setSelectedDate] = useState<string>("2026-10-18");

  // Selected agent object
  const selectedAgent = useMemo(() => {
    return agentsList.find((a) => a.id === selectedAgentId) || agentsList[0];
  }, [agentsList, selectedAgentId]);

  // Available stops assigned to the agent for selected date
  const [stops, setStops] = useState<BaseRouteStop[]>(() =>
    getInitialVisitsForAgent("AGT-101", "2026-10-18", mockCustomers)
  );
  const [initialStops, setInitialStops] = useState<BaseRouteStop[]>(() =>
    getInitialVisitsForAgent("AGT-101", "2026-10-18", mockCustomers)
  );
  const [selectedStopIds, setSelectedStopIds] = useState<Set<string>>(() => {
    const init = getInitialVisitsForAgent("AGT-101", "2026-10-18", mockCustomers);
    return new Set(init.map((s) => s.id));
  });
  const [activeStopId, setActiveStopId] = useState<string | null>(null);

  // Optimization & Dispatch states
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isDispatched, setIsDispatched] = useState(false);
  const [optimizationMessage, setOptimizationMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load initial stops whenever selectedAgent or selectedDate changes
  useEffect(() => {
    let loadedVisits: BaseRouteStop[] = [];

    // Check if visits exist in localStorage for this agent
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("fos_agent_visits");
        if (stored) {
          const parsed: AgentVisit[] = JSON.parse(stored);
          const matching = parsed.filter(
            (v) =>
              (v.scheduledDate === selectedDate || !v.scheduledDate) &&
              (v.status !== "completed" || selectedDate === "2026-10-18")
          );
          if (matching.length > 0 && selectedAgent.id === "AGT-101") {
            loadedVisits = matching.map((v) => ({
              id: v.id,
              name: v.customerName,
              customerName: v.customerName,
              address: v.address,
              coordinates: v.coordinates,
              scheduledTime: v.scheduledTime,
              scheduledDate: v.scheduledDate,
              priority: v.priority,
              status: v.status,
              company: v.company,
              estimatedDuration: v.estimatedDuration,
              phone: v.phone,
            }));
          }
        }
      } catch {
        // fallback
      }
    }

    if (loadedVisits.length === 0) {
      loadedVisits = getInitialVisitsForAgent(selectedAgent.id, selectedDate, customersList);
    }

    setStops(loadedVisits);
    setInitialStops(loadedVisits);
    setSelectedStopIds(new Set(loadedVisits.map((s) => s.id)));
    setOptimizationMessage(null);
    setErrorMessage(null);
    setIsDispatched(false);
  }, [selectedAgentId, selectedDate, selectedAgent, customersList]);

  // Filter stops that are currently selected in the multi-select
  const activeStopsInRoute = useMemo(() => {
    return stops.filter((s) => selectedStopIds.has(s.id));
  }, [stops, selectedStopIds]);

  // Compute live metrics based on displayed stop sequence
  const routeMetrics: RouteOptimizationResult = useMemo(() => {
    const startPoint = selectedAgent.coordinates || { lat: 12.9716, lng: 77.5946 };
    const initialSelectedStops = initialStops.filter((s) => selectedStopIds.has(s.id));

    return calculateRouteSequenceMetrics(
      startPoint,
      activeStopsInRoute,
      initialSelectedStops,
      `${selectedAgent.name} Starting Point (${selectedAgent.territory})`
    );
  }, [selectedAgent, activeStopsInRoute, initialStops, selectedStopIds]);

  // Check if current order differs from initial order
  const isOrderModified = useMemo(() => {
    if (activeStopsInRoute.length !== initialStops.filter((s) => selectedStopIds.has(s.id)).length) {
      return true;
    }
    const initFiltered = initialStops.filter((s) => selectedStopIds.has(s.id));
    return activeStopsInRoute.some((s, idx) => s.id !== initFiltered[idx]?.id);
  }, [activeStopsInRoute, initialStops, selectedStopIds]);

  // Toggle selection for a single stop
  const toggleStopSelection = (id: string) => {
    setSelectedStopIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setOptimizationMessage(null);
  };

  // Select all stops
  const handleSelectAll = () => {
    setSelectedStopIds(new Set(stops.map((s) => s.id)));
    setOptimizationMessage(null);
  };

  // Deselect all stops
  const handleDeselectAll = () => {
    setSelectedStopIds(new Set());
    setOptimizationMessage(null);
  };

  // Manual Reordering: Move Up
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const currentActive = [...activeStopsInRoute];
    const temp = currentActive[index - 1];
    currentActive[index - 1] = currentActive[index];
    currentActive[index] = temp;

    // Merge reordered active stops back into the full stops array preserving unselected stops
    const unselectedStops = stops.filter((s) => !selectedStopIds.has(s.id));
    setStops([...currentActive, ...unselectedStops]);
    setOptimizationMessage(null);
  };

  // Manual Reordering: Move Down
  const handleMoveDown = (index: number) => {
    if (index === activeStopsInRoute.length - 1) return;
    const currentActive = [...activeStopsInRoute];
    const temp = currentActive[index + 1];
    currentActive[index + 1] = currentActive[index];
    currentActive[index] = temp;

    const unselectedStops = stops.filter((s) => !selectedStopIds.has(s.id));
    setStops([...currentActive, ...unselectedStops]);
    setOptimizationMessage(null);
  };

  // Remove stop from route completely
  const handleRemoveStop = (id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
    setSelectedStopIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Add available customer as new stop
  const handleAddCustomerStop = (customer: Customer) => {
    const newStop: BaseRouteStop = {
      id: `CUST-STOP-${customer.id}-${Date.now().toString().slice(-4)}`,
      name: customer.name,
      customerName: customer.name,
      address: customer.address,
      coordinates: customer.coordinates,
      scheduledTime: "04:00 PM",
      scheduledDate: selectedDate,
      priority: customer.priority,
      status: "pending",
      company: customer.company,
      estimatedDuration: "30 mins",
      phone: customer.phone,
    };

    setStops((prev) => [...prev, newStop]);
    setSelectedStopIds((prev) => new Set(prev).add(newStop.id));
    setOptimizationMessage(null);
  };

  // Reset route back to original order
  const handleResetRoute = () => {
    setStops(initialStops);
    setSelectedStopIds(new Set(initialStops.map((s) => s.id)));
    setOptimizationMessage(null);
    setErrorMessage(null);
  };

  // Run Route Optimization (Nearest-Neighbour Heuristic)
  const handleOptimizeRoute = () => {
    if (activeStopsInRoute.length < 2) {
      setErrorMessage("Please select at least 2 stops to optimize route sequence.");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    setIsOptimizing(true);
    setErrorMessage(null);
    setOptimizationMessage(null);

    // Simulate async algorithm computation
    setTimeout(() => {
      const startPoint = selectedAgent.coordinates || { lat: 12.9716, lng: 77.5946 };
      const optResult = optimizeRouteNearestNeighbour(
        startPoint,
        activeStopsInRoute,
        `${selectedAgent.name} Starting Point`
      );

      // Preserve unselected stops at the end
      const unselectedStops = stops.filter((s) => !selectedStopIds.has(s.id));
      setStops([...optResult.orderedStops, ...unselectedStops]);

      setIsOptimizing(false);
      setOptimizationMessage(
        `Route optimized using Nearest-Neighbour heuristic! Saved ~${optResult.distanceSavingsKm} km (${optResult.percentageSavings}% straight-line distance reduction).`
      );
    }, 600);
  };

  // Dispatch / Save updated route order to Agent's active store
  const handleDispatchRoute = () => {
    if (activeStopsInRoute.length === 0) {
      setErrorMessage("Cannot dispatch empty route. Please select at least one stop.");
      return;
    }

    try {
      if (typeof window !== "undefined") {
        // Read existing agent visits
        const stored = localStorage.getItem("fos_agent_visits");
        const existing: AgentVisit[] = stored ? JSON.parse(stored) : initialAgentVisits;

        // Map active stops into AgentVisit format with newly assigned orderIndex
        const updatedAgentVisits: AgentVisit[] = activeStopsInRoute.map((stop, idx) => {
          const match = existing.find((v) => v.id === stop.id || v.customerName === stop.name);
          return {
            id: match?.id || `VST-${Date.now().toString().slice(-3)}-${idx + 1}`,
            assignmentId: match?.assignmentId || `ASN-${Date.now().toString().slice(-4)}`,
            customerId: match?.customerId || stop.id,
            customerName: stop.name,
            company: stop.company || match?.company,
            contactPerson: match?.contactPerson || `${stop.name.split(" ")[0]} (Site Contact)`,
            phone: stop.phone || match?.phone || "+91 80 2233 4455",
            email: match?.email || "ops@client.in",
            address: stop.address,
            city: "Bengaluru",
            coordinates: stop.coordinates,
            scheduledDate: selectedDate,
            scheduledTime: stop.scheduledTime || `${9 + idx}:00 AM`,
            estimatedDuration: typeof stop.estimatedDuration === "string" ? stop.estimatedDuration : "35 mins",
            purpose: match?.purpose || `Field inspection and service delivery at ${stop.name}.`,
            priority: stop.priority || "medium",
            status: (match?.status as any) || "pending",
            geofenceVerified: match?.geofenceVerified || false,
            orderIndex: idx + 1,
            tags: match?.tags || ["Dispatched Route", stop.priority?.toUpperCase() || "NORMAL"],
          };
        });

        // Save to localStorage
        localStorage.setItem("fos_agent_visits", JSON.stringify(updatedAgentVisits));

        // Fire cross-component notification event
        window.dispatchEvent(
          new CustomEvent("fos_route_updated", {
            detail: { agentId: selectedAgent.id, visits: updatedAgentVisits },
          })
        );
      }

      setIsDispatched(true);
      setTimeout(() => setIsDispatched(false), 4500);
    } catch {
      setErrorMessage("Could not sync route sequence to storage.");
    }
  };

  // Customers available to add (not currently in the stops list)
  const availableToAdd = useMemo(() => {
    return customersList
      .filter((c) => !stops.some((s) => s.id === c.id || s.name === c.name))
      .slice(0, 5);
  }, [customersList, stops]);

  return (
    <div className="space-y-6">
      {/* Page Title & Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-beige-border/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
              Route Planning &amp; Optimization
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-beige-sand text-beige-muted text-xs font-semibold border border-beige-border">
              Phase 5
            </span>
          </div>
          <p className="text-xs text-beige-muted mt-0.5">
            Sequence multi-stop field agent routes with straight-line Haversine nearest-neighbour optimization.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleResetRoute}
            disabled={!isOrderModified && activeStopsInRoute.length === initialStops.length}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-beige-card border border-beige-border text-beige-text hover:bg-beige-sand transition flex items-center gap-1.5 shadow-xs disabled:opacity-40"
            title="Restore original stop sequence"
          >
            <RotateCcw className="w-3.5 h-3.5 text-beige-muted" />
            <span>Reset Order</span>
          </button>

          <button
            type="button"
            onClick={handleOptimizeRoute}
            disabled={isOptimizing || activeStopsInRoute.length < 2}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-sm flex items-center gap-2 transition disabled:opacity-40"
          >
            <Sparkles className={`w-4 h-4 ${isOptimizing ? "animate-spin" : ""}`} />
            <span>{isOptimizing ? "Computing Nearest-Neighbour..." : "Optimize Route"}</span>
          </button>

          <button
            type="button"
            onClick={handleDispatchRoute}
            disabled={activeStopsInRoute.length === 0}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-olive hover:bg-beige-olive-light text-white shadow-sm flex items-center gap-1.5 transition disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Dispatch to Agent</span>
          </button>
        </div>
      </div>

      {/* Optimization & Success Notification Banners */}
      {optimizationMessage && (
        <div className="p-3.5 rounded-2xl bg-beige-olive-subtle border border-beige-olive/40 text-xs font-medium text-beige-olive flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-beige-olive" />
            <span>{optimizationMessage}</span>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/70 border border-beige-olive/30">
            DEMO Heuristic
          </span>
        </div>
      )}

      {isDispatched && (
        <div className="p-3.5 rounded-2xl bg-beige-olive-subtle border border-beige-olive/40 text-xs font-medium text-beige-olive flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-beige-olive" />
            <span>
              Route successfully dispatched to <strong>{selectedAgent.name}</strong>! Active stop sequence synced to Agent Portal.
            </span>
          </div>
          <span className="text-[10px] font-bold">LIVE SYNCED</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-[#FDF2F0] border border-beige-terracotta/40 text-xs font-medium text-beige-terracotta flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-[11px] underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Top Filter Strip: Agent & Date Selectors */}
      <div className="p-4 rounded-2xl bg-beige-card border border-beige-border shadow-xs grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Agent Selector (6 Cols) */}
        <div className="md:col-span-6 space-y-1.5">
          <label className="text-xs font-bold text-beige-text flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-beige-terracotta" />
            <span>Target Field Representative</span>
          </label>
          <div className="relative">
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border p-2.5 text-beige-text font-semibold focus:outline-none focus:border-beige-terracotta transition"
            >
              {agentsList.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} • {ag.territory} ({ag.status.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Selector (4 Cols) */}
        <div className="md:col-span-4 space-y-1.5">
          <label className="text-xs font-bold text-beige-text flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-beige-terracotta" />
            <span>Schedule Date</span>
          </label>
          <div className="relative">
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border p-2.5 text-beige-text font-semibold focus:outline-none focus:border-beige-terracotta transition"
            >
              <option value="2026-10-18">Today — Oct 18, 2026 (Active Operations)</option>
              <option value="2026-10-19">Tomorrow — Oct 19, 2026 (Upcoming Schedule)</option>
              <option value="2026-10-20">Tuesday — Oct 20, 2026</option>
            </select>
          </div>
        </div>

        {/* Selected Agent Quick Pill (2 Cols) */}
        <div className="md:col-span-2 flex flex-col justify-center items-start md:items-end text-xs">
          <span className="text-[10px] text-beige-muted">Departure Point</span>
          <span className="font-bold text-beige-text truncate max-w-[150px]">
            {selectedAgent.territory.split("(")[0].trim()}
          </span>
          <span className="text-[10px] text-beige-olive font-mono">
            {selectedAgent.coordinates?.lat != null && selectedAgent.coordinates?.lng != null
              ? `${selectedAgent.coordinates.lat.toFixed(3)}, ${selectedAgent.coordinates.lng.toFixed(3)}`
              : "Coordinates unavailable"}
          </span>
        </div>
      </div>

      {/* Main Grid: Left Stops Sequencing Panel (5 cols) vs Right Map & Metrics (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Multi-select Assigned Stops & Manual Reordering */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-3">
            {/* Header with multi-select controls */}
            <div className="flex items-center justify-between pb-2 border-b border-beige-border">
              <div>
                <h3 className="text-xs font-bold text-beige-text uppercase tracking-wider flex items-center gap-1.5">
                  <Route className="w-3.5 h-3.5 text-beige-terracotta" />
                  Stops in Route Sequence
                </h3>
                <span className="text-[11px] text-beige-muted">
                  {activeStopsInRoute.length} of {stops.length} selected for route
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-beige-sand hover:bg-beige-sidebar text-beige-text transition"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-beige-sand hover:bg-beige-sidebar text-beige-text transition"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Empty State */}
            {stops.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-beige-sand text-beige-muted flex items-center justify-center mx-auto">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-beige-text">No assigned visits found</p>
                <p className="text-[11px] text-beige-muted max-w-xs mx-auto">
                  There are no scheduled visits for {selectedAgent.name} on {selectedDate}. Choose from available customers below to build a route.
                </p>
              </div>
            ) : (
              /* Stop Sequence List */
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {activeStopsInRoute.map((stop, index) => {
                  const isFirst = index === 0;
                  const isLast = index === activeStopsInRoute.length - 1;
                  const isStopActive = activeStopId === stop.id;
                  const leg = routeMetrics.legs[index];

                  return (
                    <div
                      key={stop.id}
                      onClick={() => setActiveStopId(stop.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                        isStopActive
                          ? "bg-beige-sand/70 border-beige-terracotta ring-1 ring-beige-terracotta/30"
                          : "bg-beige-bg border-beige-border hover:border-beige-border-dark"
                      }`}
                    >
                      {/* Top Row: Checkbox, Number Badge, Title, Time, Reorder Buttons */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Checkbox */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStopSelection(stop.id);
                            }}
                            className="text-beige-terracotta hover:opacity-80 shrink-0"
                            title="Toggle stop in route"
                          >
                            <CheckSquare className="w-4 h-4" />
                          </button>

                          {/* Stop Order Number Badge */}
                          <span className="w-6 h-6 rounded-lg bg-beige-terracotta text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            {index + 1}
                          </span>

                          {/* Stop Name & Time */}
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-beige-text truncate">
                              {stop.name || stop.customerName}
                            </h4>
                            <span className="text-[10px] text-beige-muted flex items-center gap-1 font-mono">
                              <Clock className="w-3 h-3 text-beige-muted" />
                              {stop.scheduledTime || "Time TBD"}
                            </span>
                          </div>
                        </div>

                        {/* Reorder & Remove Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveUp(index);
                            }}
                            disabled={isFirst}
                            className="p-1 rounded-md text-beige-muted hover:text-beige-text hover:bg-beige-sand disabled:opacity-25 transition"
                            title="Move Up in sequence"
                          >
                            <MoveUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveDown(index);
                            }}
                            disabled={isLast}
                            className="p-1 rounded-md text-beige-muted hover:text-beige-text hover:bg-beige-sand disabled:opacity-25 transition"
                            title="Move Down in sequence"
                          >
                            <MoveDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveStop(stop.id);
                            }}
                            className="p-1 rounded-md text-beige-muted hover:text-red-600 hover:bg-beige-sand transition"
                            title="Remove Stop"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Address & Status Pill */}
                      <div className="pl-8 text-[11px] text-beige-muted flex items-center justify-between gap-2">
                        <span className="truncate">{stop.address}</span>
                        {stop.priority && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                              stop.priority === "high"
                                ? "bg-red-100 text-red-700"
                                : stop.priority === "medium"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-beige-sand text-beige-muted"
                            }`}
                          >
                            {stop.priority}
                          </span>
                        )}
                      </div>

                      {/* Leg distance estimate strip */}
                      {leg && (
                        <div className="pl-8 pt-1 border-t border-beige-border/60 flex items-center justify-between text-[10px] text-beige-muted font-mono">
                          <span>From {leg.fromName.split(" ")[0]}:</span>
                          <span className="font-semibold text-beige-text">
                            {leg.formattedDistance} (~{leg.formattedTransitTime})
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Unselected Stops (Excluded from Route) */}
                {stops.filter((s) => !selectedStopIds.has(s.id)).length > 0 && (
                  <div className="pt-2 border-t border-beige-border space-y-2">
                    <span className="text-[10px] font-bold text-beige-muted uppercase tracking-wider block">
                      Excluded from Route ({stops.filter((s) => !selectedStopIds.has(s.id)).length})
                    </span>
                    {stops
                      .filter((s) => !selectedStopIds.has(s.id))
                      .map((stop) => (
                        <div
                          key={stop.id}
                          className="p-2.5 rounded-xl bg-beige-card/60 border border-dashed border-beige-border flex items-center justify-between text-xs opacity-75"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => toggleStopSelection(stop.id)}
                              className="text-beige-muted hover:text-beige-terracotta"
                              title="Include in route"
                            >
                              <Square className="w-4 h-4" />
                            </button>
                            <span className="text-beige-muted truncate">{stop.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleStopSelection(stop.id)}
                            className="text-[10px] text-beige-terracotta font-semibold hover:underline"
                          >
                            + Include
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick-Add Customer Lead as Stop */}
          <div className="p-4 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-beige-text flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-beige-terracotta" />
                <span>Add Additional Customer Stop</span>
              </span>
              <span className="text-[10px] text-beige-muted">From Customer Database</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {availableToAdd.map((cust) => (
                <button
                  key={cust.id}
                  type="button"
                  onClick={() => handleAddCustomerStop(cust)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-beige-bg hover:bg-beige-sand text-beige-text border border-beige-border flex items-center gap-1.5 transition shadow-2xs"
                >
                  <Plus className="w-3 h-3 text-beige-terracotta" />
                  <span className="truncate max-w-[140px]">{cust.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Route Map Preview & Real-time Route Sequence Metrics (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Estimated Metrics Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-3.5 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
              <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Total Stops</span>
              <span className="text-lg font-bold text-beige-text block mt-0.5">
                {activeStopsInRoute.length} Stops
              </span>
              <span className="text-[10px] text-beige-olive block">
                {activeStopsInRoute.filter((s) => s.status === "completed").length} completed
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
              <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Straight-Line Dist.</span>
              <span className="text-lg font-bold text-beige-text font-mono block mt-0.5">
                {routeMetrics.formattedTotalDistance}
              </span>
              <span className="text-[10px] text-beige-muted block">Haversine metric</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
              <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Est. Duration</span>
              <span className="text-lg font-bold text-beige-olive font-mono block mt-0.5">
                {routeMetrics.formattedTotalDuration}
              </span>
              <span className="text-[10px] text-beige-muted block">Transit + on-site</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
              <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Savings</span>
              <span className="text-lg font-bold text-beige-terracotta font-mono block mt-0.5">
                {routeMetrics.percentageSavings > 0 ? `-${routeMetrics.percentageSavings}%` : "Baseline"}
              </span>
              <span className="text-[10px] text-beige-muted block">
                {routeMetrics.distanceSavingsKm > 0 ? `${routeMetrics.distanceSavingsKm} km saved` : "Direct order"}
              </span>
            </div>
          </div>

          {/* Interactive Route Map */}
          <RouteMap
            startCoords={selectedAgent.coordinates || { lat: 12.9716, lng: 77.5946 }}
            startLabel={`Origin: ${selectedAgent.name} (${selectedAgent.territory})`}
            stops={activeStopsInRoute}
            legs={routeMetrics.legs}
            activeStopId={activeStopId}
            onSelectStop={(st) => setActiveStopId(st.id)}
            height="h-[430px]"
            isOptimized={routeMetrics.isOptimized || Boolean(optimizationMessage)}
          />

          {/* Transparent Methodological Disclaimer */}
          <div className="p-3 rounded-2xl bg-beige-sand/60 border border-beige-border text-[11px] text-beige-muted space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-beige-text">
              <Info className="w-3.5 h-3.5 text-beige-terracotta shrink-0" />
              <span>{routeMetrics.demoBadge}: Route Heuristic Disclaimer</span>
            </div>
            <p className="leading-relaxed">
              {routeMetrics.disclaimer}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
