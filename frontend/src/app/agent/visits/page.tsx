"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useAgent } from "@/context/AgentContext";
import { AgentVisit } from "@/types/agent";
import StatusBadge from "@/components/StatusBadge";
import VisitDetailDrawer from "@/components/agent/VisitDetailDrawer";
import CompleteVisitModal from "@/components/agent/CompleteVisitModal";
import {
  CalendarCheck,
  Search,
  Filter,
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  ArrowUpDown,
  Building2,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

export default function MyVisitsPage() {
  const { visits, historyVisits, isOnDuty, checkInVisit } = useAgent();
  const [activeTab, setActiveTab] = useState<"today" | "upcoming" | "completed" | "all">("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedVisitForDrawer, setSelectedVisitForDrawer] = useState<AgentVisit | null>(null);
  const [completeModalVisit, setCompleteModalVisit] = useState<AgentVisit | null>(null);

  // Filter logic
  const filteredVisits = useMemo(() => {
    let list: AgentVisit[] = [];

    if (activeTab === "today") {
      list = visits.filter(
        (v) => v.scheduledDate === "2026-10-18" || v.status === "completed" || v.status === "in_progress"
      );
    } else if (activeTab === "upcoming") {
      list = visits.filter((v) => v.scheduledDate !== "2026-10-18" && v.status !== "completed");
    } else if (activeTab === "completed") {
      list = [
        ...visits.filter((v) => v.status === "completed"),
        ...historyVisits,
      ];
    } else {
      // all
      list = [...visits, ...historyVisits];
    }

    // Apply priority filter
    if (priorityFilter !== "all") {
      list = list.filter((v) => v.priority === priorityFilter);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v.customerName.toLowerCase().includes(q) ||
          v.address.toLowerCase().includes(q) ||
          v.purpose.toLowerCase().includes(q) ||
          (v.company && v.company.toLowerCase().includes(q))
      );
    }

    return list;
  }, [visits, historyVisits, activeTab, priorityFilter, searchQuery]);

  // Tab counts
  const todayCount = visits.filter(
    (v) => v.scheduledDate === "2026-10-18" || v.status === "completed" || v.status === "in_progress"
  ).length;
  const upcomingCount = visits.filter(
    (v) => v.scheduledDate !== "2026-10-18" && v.status !== "completed"
  ).length;
  const completedCount =
    visits.filter((v) => v.status === "completed").length + historyVisits.length;
  const allCount = visits.length + historyVisits.length;

  const handleQuickCheckIn = (e: React.MouseEvent, visit: AgentVisit) => {
    e.stopPropagation();
    if (!isOnDuty) return;
    checkInVisit(visit.id);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-beige-text">My Visits</h2>
          <p className="text-xs text-beige-muted">
            Manage your assigned customer appointments, geofenced arrivals, and field completion logs.
          </p>
        </div>

        <Link
          href="/agent/routes"
          className="self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-semibold bg-beige-terracotta-subtle text-beige-terracotta border border-beige-terracotta/30 hover:bg-beige-terracotta hover:text-white transition flex items-center gap-1.5"
        >
          <span>View on Map Route →</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-beige-sand/60 border border-beige-border overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("today")}
          className={`flex-1 min-w-[75px] py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
            activeTab === "today"
              ? "bg-beige-card text-beige-text shadow-xs font-bold border border-beige-border"
              : "text-beige-muted hover:text-beige-text"
          }`}
        >
          <span>Today</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeTab === "today"
                ? "bg-beige-terracotta text-white"
                : "bg-beige-border text-beige-muted"
            }`}
          >
            {todayCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("upcoming")}
          className={`flex-1 min-w-[85px] py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
            activeTab === "upcoming"
              ? "bg-beige-card text-beige-text shadow-xs font-bold border border-beige-border"
              : "text-beige-muted hover:text-beige-text"
          }`}
        >
          <span>Upcoming</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeTab === "upcoming"
                ? "bg-beige-terracotta text-white"
                : "bg-beige-border text-beige-muted"
            }`}
          >
            {upcomingCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("completed")}
          className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
            activeTab === "completed"
              ? "bg-beige-card text-beige-text shadow-xs font-bold border border-beige-border"
              : "text-beige-muted hover:text-beige-text"
          }`}
        >
          <span>Completed</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeTab === "completed"
                ? "bg-beige-olive text-white"
                : "bg-beige-border text-beige-muted"
            }`}
          >
            {completedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`flex-1 min-w-[70px] py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
            activeTab === "all"
              ? "bg-beige-card text-beige-text shadow-xs font-bold border border-beige-border"
              : "text-beige-muted hover:text-beige-text"
          }`}
        >
          <span>All</span>
          <span className="text-[10px] text-beige-muted">({allCount})</span>
        </button>
      </div>

      {/* Search and Secondary Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-beige-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer, address, or purpose..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-beige-card border border-beige-border text-beige-text placeholder-beige-muted focus:outline-hidden focus:ring-2 focus:ring-beige-terracotta/40"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs bg-beige-card border border-beige-border text-beige-text focus:outline-hidden focus:ring-2 focus:ring-beige-terracotta/40"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>
      </div>

      {/* Visits List */}
      <div className="space-y-3">
        {filteredVisits.length === 0 ? (
          <div className="p-8 rounded-2xl bg-beige-card border border-beige-border text-center space-y-2">
            <CalendarCheck className="w-8 h-8 text-beige-muted mx-auto" />
            <p className="text-sm font-bold text-beige-text">No visits found</p>
            <p className="text-xs text-beige-muted">
              Try adjusting your tab filter or search query.
            </p>
          </div>
        ) : (
          filteredVisits.map((visit) => {
            const isCompleted = visit.status === "completed";
            const isInProgress = visit.status === "in_progress";
            const isWithinGeofence = visit.mockDistanceMeters <= 100;

            return (
              <div
                key={visit.id}
                onClick={() => setSelectedVisitForDrawer(visit)}
                className={`p-4 rounded-2xl bg-beige-card border transition-all duration-150 shadow-2xs hover:shadow-sm cursor-pointer space-y-3 group ${
                  isInProgress
                    ? "border-beige-terracotta/80 ring-1 ring-beige-terracotta/40"
                    : isCompleted
                    ? "border-beige-border hover:border-beige-olive/50"
                    : "border-beige-border hover:border-beige-border-dark"
                }`}
              >
                {/* Top Row: Stop Index + Status Badges + Schedule */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-beige-sand text-beige-text border border-beige-border">
                      #{visit.orderIndex}
                    </span>
                    <StatusBadge status={visit.status} size="sm" />
                    <StatusBadge status={visit.priority} size="sm" />
                  </div>

                  <div className="text-xs font-semibold text-beige-text flex items-center gap-1 shrink-0">
                    <Clock className="w-3.5 h-3.5 text-beige-muted" />
                    <span>{visit.scheduledTime}</span>
                  </div>
                </div>

                {/* Customer Info & Address */}
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-beige-text group-hover:text-beige-terracotta transition">
                    {visit.customerName}
                  </h3>
                  {visit.company && (
                    <p className="text-[11px] text-beige-muted">{visit.company}</p>
                  )}
                  <p className="text-xs text-beige-muted flex items-start gap-1 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-beige-terracotta shrink-0 mt-0.5" />
                    <span className="truncate">{visit.address}</span>
                  </p>
                </div>

                {/* Purpose Snippet */}
                <p className="text-[11px] text-beige-muted line-clamp-2 bg-beige-sand/30 p-2 rounded-xl border border-beige-border/50">
                  {visit.purpose}
                </p>

                {/* Bottom Row: Geofence Status + Quick Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-beige-border/60 text-xs">
                  {/* Geofence status tag */}
                  <div className="flex items-center gap-1.5">
                    {isCompleted || visit.geofenceVerified ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-beige-olive bg-beige-olive-subtle px-2 py-0.5 rounded-full border border-beige-olive/30">
                        <ShieldCheck className="w-3 h-3" />
                        Geofence Verified (±{visit.accuracyMeters || 12}m)
                      </span>
                    ) : isWithinGeofence ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-beige-olive bg-beige-olive-subtle px-2 py-0.5 rounded-full border border-beige-olive/30">
                        <Compass className="w-3 h-3" />
                        Within Geofence ({visit.mockDistanceMeters}m)
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-beige-muted bg-beige-sand px-2 py-0.5 rounded-full border border-beige-border">
                        <MapPin className="w-3 h-3" />
                        {visit.mockDistanceMeters}m away (Need &lt;100m)
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {isInProgress ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompleteModalVisit(visit);
                        }}
                        className="px-3 py-1 rounded-lg text-xs font-bold bg-beige-olive text-white hover:bg-beige-olive-light transition shadow-2xs"
                      >
                        Complete Visit
                      </button>
                    ) : !isCompleted && isWithinGeofence ? (
                      <button
                        type="button"
                        onClick={(e) => handleQuickCheckIn(e, visit)}
                        disabled={!isOnDuty}
                        className="px-3 py-1 rounded-lg text-xs font-bold bg-beige-terracotta text-white hover:bg-beige-terracotta-light transition shadow-2xs disabled:opacity-50"
                      >
                        Check In ({visit.mockDistanceMeters}m)
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-beige-muted group-hover:text-beige-text flex items-center gap-0.5">
                        <span>Details</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

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
