"use client";

import React, { useState } from "react";
import { mockAgents, mockCustomers } from "@/lib/mockData";
import { Agent, Customer } from "@/types";
import {
  Route,
  ArrowUpDown,
  Sparkles,
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  AlertCircle,
  MoveUp,
  MoveDown,
  Trash2,
  Plus,
  RefreshCw,
} from "lucide-react";

export default function RoutePlanningPage() {
  const [selectedAgentId, setSelectedAgentId] = useState(mockAgents[0].id);
  const [selectedStops, setSelectedStops] = useState<Customer[]>([
    mockCustomers[0],
    mockCustomers[1],
    mockCustomers[5],
    mockCustomers[3],
  ]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedMessage, setOptimizedMessage] = useState<string | null>(null);

  const selectedAgent = mockAgents.find((a) => a.id === selectedAgentId) || mockAgents[0];

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...selectedStops];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setSelectedStops(next);
  };

  const handleMoveDown = (index: number) => {
    if (index === selectedStops.length - 1) return;
    const next = [...selectedStops];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setSelectedStops(next);
  };

  const handleRemoveStop = (id: string) => {
    setSelectedStops((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAddStop = (customer: Customer) => {
    if (!selectedStops.some((s) => s.id === customer.id)) {
      setSelectedStops((prev) => [...prev, customer]);
    }
  };

  const simulateOptimization = () => {
    setIsOptimizing(true);
    setOptimizedMessage(null);

    // Simulate multi-stop TSP solver
    setTimeout(() => {
      // Re-order by latitude (simulated TSP nearest-neighbor)
      const sorted = [...selectedStops].sort((a, b) => b.coordinates.lat - a.coordinates.lat);
      setSelectedStops(sorted);
      setIsOptimizing(false);
      setOptimizedMessage("Route optimized! Estimated travel distance reduced by 4.2 km (22% savings).");
    }, 800);
  };

  const estimatedDistanceKm = (selectedStops.length * 3.8).toFixed(1);
  const estimatedTimeMins = selectedStops.length * 28;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-beige-border/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
              Route Planning & Sequence Solver
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-beige-sand text-beige-muted text-xs font-semibold border border-beige-border">
              Simulated Engine
            </span>
          </div>
          <p className="text-xs text-beige-muted mt-0.5">
            Multi-stop travel optimization for field representatives with road distance estimates.
          </p>
        </div>

        <button
          onClick={simulateOptimization}
          disabled={isOptimizing || selectedStops.length < 2}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-sm flex items-center gap-2 transition disabled:opacity-50"
        >
          {isOptimizing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span>{isOptimizing ? "Solving Route..." : "Simulate TSP Optimization"}</span>
        </button>
      </div>

      {/* Optimization Result Notification */}
      {optimizedMessage && (
        <div className="p-3.5 rounded-xl bg-beige-olive-subtle border border-beige-olive/40 text-xs font-medium text-beige-olive flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{optimizedMessage}</span>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider">Demo Estimate</span>
        </div>
      )}

      {/* Main Grid: Controls & Route Sequence vs Route Map Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Agent Selector & Waypoint Sequencing (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Agent Picker Card */}
          <div className="p-4 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-3">
            <label className="block text-xs font-bold text-beige-text">
              1. Select Field Agent
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border p-2.5 text-beige-text font-medium focus:outline-none focus:border-beige-terracotta"
            >
              {mockAgents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} ({ag.territory})
                </option>
              ))}
            </select>

            <div className="p-2.5 rounded-xl bg-beige-sand/50 border border-beige-border flex items-center justify-between text-xs">
              <span className="text-beige-muted">Departure Point:</span>
              <span className="font-semibold text-beige-text">
                {selectedAgent.territory} Depot
              </span>
            </div>
          </div>

          {/* Ordered Stops List */}
          <div className="p-4 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-beige-border">
              <label className="text-xs font-bold text-beige-text">
                2. Stop Sequence ({selectedStops.length} stops)
              </label>
              <span className="text-[10px] text-beige-muted">Use arrows to manually reorder</span>
            </div>

            {selectedStops.length === 0 ? (
              <div className="py-8 text-center text-xs text-beige-muted">
                No stops added to this route yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {selectedStops.map((stop, idx) => (
                  <div
                    key={stop.id}
                    className="p-3 rounded-xl bg-beige-bg border border-beige-border flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-beige-terracotta text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-beige-text truncate">{stop.name}</p>
                        <p className="text-[10px] text-beige-muted truncate">{stop.address.split(",")[0]}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleMoveUp(idx)}
                        disabled={idx === 0}
                        className="p-1 rounded text-beige-muted hover:text-beige-text disabled:opacity-30"
                        title="Move Up"
                      >
                        <MoveUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveDown(idx)}
                        disabled={idx === selectedStops.length - 1}
                        className="p-1 rounded text-beige-muted hover:text-beige-text disabled:opacity-30"
                        title="Move Down"
                      >
                        <MoveDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveStop(stop.id)}
                        className="p-1 rounded text-beige-muted hover:text-red-600"
                        title="Remove Stop"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Available Stops Dropdown */}
          <div className="p-3.5 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
            <span className="text-[11px] font-bold text-beige-muted uppercase tracking-wider block mb-2">
              Available Customer Destinations
            </span>
            <div className="flex flex-wrap gap-1.5">
              {mockCustomers
                .filter((c) => !selectedStops.some((s) => s.id === c.id))
                .slice(0, 4)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleAddStop(c)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-beige-sand hover:bg-beige-sidebar text-beige-text border border-beige-border flex items-center gap-1 transition"
                  >
                    <Plus className="w-3 h-3 text-beige-terracotta" />
                    <span className="truncate max-w-[130px]">{c.name}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Right Column: Route Map Preview & Metrics (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Estimated Metrics Summary Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-beige-card border border-beige-border">
              <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Estimated Distance</span>
              <span className="text-lg font-bold text-beige-text font-mono mt-0.5 block">
                {estimatedDistanceKm} km
              </span>
              <span className="text-[10px] text-beige-muted">Mock road calculation</span>
            </div>

            <div className="p-3.5 rounded-xl bg-beige-card border border-beige-border">
              <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Estimated Duration</span>
              <span className="text-lg font-bold text-beige-olive font-mono mt-0.5 block">
                ~{Math.floor(estimatedTimeMins / 60)}h {estimatedTimeMins % 60}m
              </span>
              <span className="text-[10px] text-beige-muted">Includes 25m / stop</span>
            </div>

            <div className="p-3.5 rounded-xl bg-beige-card border border-beige-border">
              <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Efficiency Score</span>
              <span className="text-lg font-bold text-beige-terracotta font-mono mt-0.5 block">
                94 / 100
              </span>
              <span className="text-[10px] text-beige-muted">Clustered stops</span>
            </div>
          </div>

          {/* Route Map Preview Canvas */}
          <div className="relative w-full h-[450px] rounded-2xl bg-[#EBE4D5] border border-beige-border overflow-hidden p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between z-10">
              <div className="px-3 py-1 rounded-xl bg-beige-card/90 backdrop-blur-md border border-beige-border text-xs font-semibold text-beige-text flex items-center gap-1.5 shadow-sm">
                <Route className="w-3.5 h-3.5 text-beige-terracotta" />
                <span>Simulated Route Waypoints</span>
              </div>
              <span className="text-[10px] font-semibold text-beige-muted bg-beige-card/90 px-2 py-1 rounded-lg border border-beige-border">
                Demo Coordinates
              </span>
            </div>

            {/* SVG Visual Road Path Connecting Stops */}
            <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="routeGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E3DAC9" strokeWidth="0.8" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#routeGrid)" />

              {/* Connecting Curving Route Path */}
              <path
                d="M 80,340 C 140,260 220,180 320,140 S 440,240 540,210 S 680,120 720,80"
                fill="none"
                stroke="#B76E52"
                strokeWidth="3.5"
                strokeDasharray="6,4"
              />
            </svg>

            {/* Render Waypoint Pins on Canvas */}
            <div className="absolute inset-0 pointer-events-none p-8">
              {selectedStops.map((stop, idx) => {
                const offsets = [
                  { left: "15%", top: "72%" },
                  { left: "38%", top: "32%" },
                  { left: "65%", top: "48%" },
                  { left: "82%", top: "20%" },
                ];
                const pos = offsets[idx % offsets.length];

                return (
                  <div
                    key={stop.id}
                    style={{ left: pos.left, top: pos.top }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                  >
                    <div className="flex flex-col items-center group cursor-pointer">
                      <div className="w-8 h-8 rounded-full bg-beige-terracotta text-white flex items-center justify-center font-bold text-xs shadow-lg ring-4 ring-beige-terracotta/20 group-hover:scale-115 transition">
                        {idx + 1}
                      </div>
                      <span className="mt-1 px-2 py-0.5 rounded bg-beige-card/95 border border-beige-border text-[10px] font-semibold text-beige-text shadow-xs whitespace-nowrap">
                        {stop.name.split(" ")[0]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Notice Footer */}
            <div className="z-10 text-[11px] text-beige-muted bg-beige-card/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-beige-border flex items-center gap-1.5 self-start">
              <AlertCircle className="w-3.5 h-3.5 text-beige-muted shrink-0" />
              <span>Full OSRM multi-stop road distance matrix and Google OR-Tools integration connects in Phase 4.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
