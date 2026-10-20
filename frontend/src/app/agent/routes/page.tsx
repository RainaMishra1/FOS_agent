"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useAgent } from "@/context/AgentContext";
import { AgentVisit } from "@/types/agent";
import AgentMapPreview from "@/components/agent/AgentMapPreview";
import StatusBadge from "@/components/StatusBadge";
import VisitDetailDrawer from "@/components/agent/VisitDetailDrawer";
import CompleteVisitModal from "@/components/agent/CompleteVisitModal";
import {
  calculateRouteSequenceMetrics,
  optimizeRouteNearestNeighbour,
  BaseRouteStop,
} from "@/lib/routeOptimizer";
import {
  Route,
  Navigation,
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Phone,
  ExternalLink,
  RotateCcw,
  Info,
} from "lucide-react";

export default function AgentRoutePage() {
  const { currentAgent, visits, checkInVisit, isOnDuty } = useAgent();
  const [selectedVisitForDrawer, setSelectedVisitForDrawer] = useState<AgentVisit | null>(null);
  const [completeModalVisit, setCompleteModalVisit] = useState<AgentVisit | null>(null);
  const [isReoptimizing, setIsReoptimizing] = useState(false);
  const [optimizationNotice, setOptimizationNotice] = useState<string | null>(null);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Today's stops sorted by orderIndex
  const todayVisits = useMemo(() => {
    return visits
      .filter(
        (v) =>
          v.scheduledDate === todayStr ||
          v.scheduledDate === "2026-10-18" ||
          v.status === "completed" ||
          v.status === "in_progress"
      )
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [visits, todayStr]);

  // Convert visits to BaseRouteStop format for math optimization
  const baseStops: BaseRouteStop[] = useMemo(() => {
    return todayVisits.map((v) => ({
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
    }));
  }, [todayVisits]);

  // Compute live Haversine metrics based on the current stop sequence
  const routeMetrics = useMemo(() => {
    return calculateRouteSequenceMetrics(
      currentAgent.currentCoordinates,
      baseStops,
      baseStops,
      `${currentAgent.name} Current Location`
    );
  }, [currentAgent, baseStops]);

  const completedCount = todayVisits.filter((v) => v.status === "completed").length;

  // Run local nearest-neighbour heuristic on today's uncompleted stops
  const handleOptimizeRoute = () => {
    if (todayVisits.length < 2) return;

    setIsReoptimizing(true);
    setOptimizationNotice(null);

    setTimeout(() => {
      // Completed visits stay fixed in place; optimize remaining visits
      const completedStops = todayVisits.filter((v) => v.status === "completed");
      const remainingStops = todayVisits.filter((v) => v.status !== "completed");

      const startCoord =
        completedStops.length > 0
          ? completedStops[completedStops.length - 1].coordinates
          : currentAgent.currentCoordinates;

      const remainingBase: BaseRouteStop[] = remainingStops.map((v) => ({
        id: v.id,
        name: v.customerName,
        customerName: v.customerName,
        address: v.address,
        coordinates: v.coordinates,
        scheduledTime: v.scheduledTime,
        priority: v.priority,
        status: v.status,
        company: v.company,
        estimatedDuration: v.estimatedDuration,
      }));

      const optResult = optimizeRouteNearestNeighbour(
        startCoord,
        remainingBase,
        "Current Position"
      );

      // Re-map visits with new order indices
      const reorderedRemaining: AgentVisit[] = optResult.orderedStops.map((st, idx) => {
        const original = remainingStops.find((v) => v.id === st.id)!;
        return {
          ...original,
          orderIndex: completedStops.length + idx + 1,
        };
      });

      const updatedAll = [...completedStops, ...reorderedRemaining];

      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("fos_agent_visits");
          const existingAll: AgentVisit[] = stored ? JSON.parse(stored) : visits;
          const merged = existingAll.map((v) => {
            const found = updatedAll.find((u) => u.id === v.id);
            return found || v;
          });
          localStorage.setItem("fos_agent_visits", JSON.stringify(merged));
          window.dispatchEvent(
            new CustomEvent("fos_route_updated", {
              detail: { agentId: currentAgent.id, visits: merged },
            })
          );
        } catch {
          // fallback
        }
      }

      setIsReoptimizing(false);
      setOptimizationNotice(
        `Route sequence optimized via Nearest-Neighbour heuristic! Saved ~${optResult.distanceSavingsKm} km (${optResult.percentageSavings}% straight-line savings).`
      );
    }, 600);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-beige-text">
              Today&apos;s Field Route
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-beige-sand text-beige-muted border border-beige-border">
              Demo Estimates
            </span>
          </div>
          <p className="text-xs text-beige-muted">
            Ordered customer stops for {currentAgent.name} • {currentAgent.territory}
          </p>
        </div>

        <button
          type="button"
          onClick={handleOptimizeRoute}
          disabled={isReoptimizing || todayVisits.length < 2}
          className="self-start sm:self-auto py-1.5 px-3 rounded-xl text-xs font-semibold bg-beige-terracotta text-white hover:bg-beige-terracotta-light transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isReoptimizing ? "animate-spin" : ""}`} />
          <span>{isReoptimizing ? "Solving Route..." : "Optimize Sequence"}</span>
        </button>
      </div>

      {/* Optimization Notice Banner */}
      {optimizationNotice && (
        <div className="p-3 rounded-xl bg-beige-olive-subtle border border-beige-olive/30 text-xs text-beige-olive flex items-center justify-between animate-in fade-in">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{optimizationNotice}</span>
          </span>
          <button
            onClick={() => setOptimizationNotice(null)}
            className="text-[11px] font-bold underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Demo Estimate Disclaimer Card */}
      <div className="p-3 rounded-xl bg-beige-sand/70 border border-beige-border text-[11px] text-beige-muted flex items-start gap-2">
        <Navigation className="w-4 h-4 shrink-0 mt-0.5 text-beige-terracotta" />
        <div>
          <strong className="block font-semibold text-beige-text">Straight-Line Route Disclaimer:</strong>
          <span>
            {routeMetrics.disclaimer}
          </span>
        </div>
      </div>

      {/* Route Summary Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-3 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <span className="text-[10px] text-beige-muted block">Total Stops</span>
          <strong className="text-base font-bold text-beige-text">
            {todayVisits.length} Stops
          </strong>
          <span className="text-[10px] text-beige-olive block mt-0.5">
            {completedCount} completed
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <span className="text-[10px] text-beige-muted block">Total Distance</span>
          <strong className="text-base font-bold text-beige-text font-mono">
            {routeMetrics.formattedTotalDistance}
          </strong>
          <span className="text-[10px] text-beige-muted block mt-0.5">Straight-Line Demo</span>
        </div>

        <div className="p-3 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <span className="text-[10px] text-beige-muted block">Est. Duration</span>
          <strong className="text-base font-bold text-beige-olive font-mono">
            {routeMetrics.formattedTotalDuration}
          </strong>
          <span className="text-[10px] text-beige-muted block mt-0.5">Transit + on-site</span>
        </div>

        <div className="p-3 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <span className="text-[10px] text-beige-muted block">Policy Radius</span>
          <strong className="text-base font-bold text-beige-text">100m</strong>
          <span className="text-[10px] text-beige-olive block mt-0.5">Geofence locked</span>
        </div>
      </div>

      {/* Interactive Route Map Preview */}
      <section className="space-y-1.5">
        <h3 className="text-xs font-bold text-beige-text uppercase tracking-wider flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-beige-terracotta" />
          Interactive Route &amp; Stop Visualizer
        </h3>
        <AgentMapPreview
          height="h-72 sm:h-96"
          showRouteLine={true}
          onSelectVisit={(v) => setSelectedVisitForDrawer(v)}
        />
      </section>

      {/* Ordered Stops Chronological List */}
      <section className="space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-beige-text uppercase tracking-wider flex items-center gap-1.5">
            <Route className="w-3.5 h-3.5 text-beige-terracotta" />
            Ordered Route Sequence ({todayVisits.length} Stops)
          </h3>
          <span className="text-[11px] text-beige-muted">Step-by-step dispatch order</span>
        </div>

        <div className="space-y-3">
          {todayVisits.map((visit, index) => {
            const isCompleted = visit.status === "completed";
            const isInProgress = visit.status === "in_progress";
            const isWithinGeofence = visit.mockDistanceMeters <= 100;
            const leg = routeMetrics.legs[index];

            return (
              <div
                key={visit.id}
                onClick={() => setSelectedVisitForDrawer(visit)}
                className={`p-4 rounded-2xl bg-beige-card border transition-all shadow-2xs hover:shadow-sm cursor-pointer space-y-2.5 ${
                  isInProgress
                    ? "border-beige-terracotta/80 ring-1 ring-beige-terracotta/40"
                    : isCompleted
                    ? "border-beige-border opacity-90"
                    : "border-beige-border hover:border-beige-border-dark"
                }`}
              >
                {/* Step Connector Label */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-xs ${
                        isCompleted
                          ? "bg-beige-olive"
                          : isInProgress
                          ? "bg-beige-terracotta animate-pulse"
                          : "bg-beige-text"
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : visit.orderIndex}
                    </span>
                    <span className="font-bold text-beige-text">
                      Stop #{visit.orderIndex} • {visit.scheduledTime}
                    </span>
                  </div>

                  {leg ? (
                    <span className="text-beige-muted font-mono">
                      {leg.formattedDistance} (~{leg.formattedTransitTime})
                    </span>
                  ) : (
                    <span className="text-beige-muted font-mono">Next stop</span>
                  )}
                </div>

                {/* Customer Details */}
                <div className="pl-8">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-beige-text">{visit.customerName}</h4>
                    <StatusBadge status={visit.status} size="sm" />
                  </div>
                  {visit.company && (
                    <p className="text-[11px] text-beige-muted">{visit.company}</p>
                  )}
                  <p className="text-xs text-beige-muted flex items-start gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-beige-terracotta shrink-0 mt-0.5" />
                    <span>{visit.address}</span>
                  </p>
                </div>

                {/* Geofence Status & Direct Action */}
                <div className="pl-8 pt-1 flex items-center justify-between text-xs border-t border-beige-border/60">
                  <span className="text-[11px] text-beige-muted flex items-center gap-1">
                    {isCompleted ? (
                      <span className="text-beige-olive font-semibold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Completed ({visit.completedTime})
                      </span>
                    ) : isWithinGeofence ? (
                      <span className="text-beige-olive font-semibold flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5" />
                        Within Geofence ({visit.mockDistanceMeters}m)
                      </span>
                    ) : (
                      <span>{visit.mockDistanceMeters}m from site</span>
                    )}
                  </span>

                  <div className="flex items-center gap-2">
                    {isInProgress ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompleteModalVisit(visit);
                        }}
                        className="py-1 px-2.5 rounded-lg text-xs font-bold bg-beige-olive text-white shadow-2xs hover:bg-beige-olive-light transition"
                      >
                        Complete Visit
                      </button>
                    ) : !isCompleted && isWithinGeofence ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isOnDuty) checkInVisit(visit.id);
                        }}
                        className="py-1 px-2.5 rounded-lg text-xs font-bold bg-beige-terracotta text-white shadow-2xs hover:bg-beige-terracotta-light transition"
                      >
                        Check In ({visit.mockDistanceMeters}m)
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-beige-terracotta">
                        View Stop Details →
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Visit Detail Drawer */}
      {selectedVisitForDrawer && (
        <VisitDetailDrawer
          visit={selectedVisitForDrawer}
          onClose={() => setSelectedVisitForDrawer(null)}
        />
      )}

      {/* Complete Visit Modal */}
      {completeModalVisit && (
        <CompleteVisitModal
          visit={completeModalVisit}
          onClose={() => setCompleteModalVisit(null)}
        />
      )}
    </div>
  );
}
