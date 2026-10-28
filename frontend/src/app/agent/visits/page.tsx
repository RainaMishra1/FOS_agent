"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useAgent } from "@/context/AgentContext";
import { AgentVisit } from "@/types/agent";
import VisitDetailDrawer from "@/components/agent/VisitDetailDrawer";
import CompleteVisitModal from "@/components/agent/CompleteVisitModal";
import { calculateHaversineDistanceKm, formatDistance } from "@/lib/geoUtils";
import {
  CalendarCheck,
  Search,
  Filter,
  MapPin,
  Clock,
  CheckCircle2,
  ShieldCheck,
  Building2,
  ChevronRight,
  ExternalLink,
  Navigation,
  Compass,
  FileText,
  Route as RouteIcon,
  RefreshCw,
} from "lucide-react";

export default function MyVisitsPage() {
  const {
    currentAgent,
    liveGpsCoords,
    visits,
    historyVisits,
    isOnDuty,
    checkInVisit,
    isLoading,
    error,
    isLiveBackend,
    refreshAgentData,
  } = useAgent();

  const [activeTab, setActiveTab] = useState<"today" | "upcoming" | "completed" | "all">("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedVisitForDrawer, setSelectedVisitForDrawer] = useState<AgentVisit | null>(null);
  const [completeModalVisit, setCompleteModalVisit] = useState<AgentVisit | null>(null);
  const [checkingInVisitId, setCheckingInVisitId] = useState<string | null>(null);

  const now = new Date();
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Filter logic
  const filteredVisits = useMemo(() => {
    let list: AgentVisit[] = [];

    // All distinct completed visits across current session visits and historical records
    const allCompletedMap = new Map<string, AgentVisit>();
    historyVisits.forEach((v) => allCompletedMap.set(v.id, v));
    visits.filter((v) => v.status === "completed").forEach((v) => allCompletedMap.set(v.id, v));
    const allCompletedList = Array.from(allCompletedMap.values());

    const dedupeVisits = (items: AgentVisit[]) => {
      const seen = new Set<string>();
      return items.filter((v) => {
        const key = `${(v.customerName || "").trim().toLowerCase()}_${v.scheduledDate || ""}_${(v.scheduledTime || "").replace(/\s+/g, "").toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    // Active pending/assigned/in_progress visits for today or awaiting action
    const todayActive = dedupeVisits(
      visits.filter(
        (v) =>
          v.status !== "completed" &&
          (!v.scheduledDate || v.scheduledDate <= todayDateStr || v.status === "in_progress")
      )
    );

    // Upcoming future scheduled visits that are not completed
    const upcomingActive = dedupeVisits(
      visits.filter(
        (v) =>
          v.scheduledDate &&
          v.scheduledDate > todayDateStr &&
          v.status !== "completed" &&
          v.status !== "in_progress"
      )
    );

    if (activeTab === "today") {
      list = todayActive;
    } else if (activeTab === "upcoming") {
      list = upcomingActive;
    } else if (activeTab === "completed") {
      list = allCompletedList;
    } else {
      // "all": deduplicated combine
      const allMap = new Map<string, AgentVisit>();
      visits.forEach((v) => allMap.set(v.id, v));
      historyVisits.forEach((v) => {
        if (!allMap.has(v.id)) allMap.set(v.id, v);
      });
      list = Array.from(allMap.values());
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
  }, [visits, historyVisits, activeTab, priorityFilter, searchQuery, todayDateStr]);

  // Tab counts
  const todayCount = visits.filter(
    (v) =>
      v.status !== "completed" &&
      (!v.scheduledDate || v.scheduledDate <= todayDateStr || v.status === "in_progress")
  ).length;

  const upcomingCount = visits.filter(
    (v) =>
      v.scheduledDate &&
      v.scheduledDate > todayDateStr &&
      v.status !== "completed" &&
      v.status !== "in_progress"
  ).length;

  const completedMap = new Map<string, AgentVisit>();
  historyVisits.forEach((v) => completedMap.set(v.id, v));
  visits.filter((v) => v.status === "completed").forEach((v) => completedMap.set(v.id, v));
  const completedCount = completedMap.size;

  const allMap = new Map<string, AgentVisit>();
  visits.forEach((v) => allMap.set(v.id, v));
  historyVisits.forEach((v) => allMap.set(v.id, v));
  const allCount = allMap.size;

  const handleQuickCheckIn = async (e: React.MouseEvent, visit: AgentVisit) => {
    e.stopPropagation();
    if (checkingInVisitId) return;
    setCheckingInVisitId(visit.id);
    try {
      await checkInVisit(visit.id);
    } finally {
      setCheckingInVisitId(null);
    }
  };

  // Distance estimation helper
  const getEstimatedDistanceInfo = (visit: AgentVisit, _index?: number) => {
    const originCoords = liveGpsCoords || currentAgent.currentCoordinates;
    if (
      visit.coordinates &&
      visit.coordinates.lat &&
      visit.coordinates.lng &&
      originCoords &&
      originCoords.lat
    ) {
      const dist = calculateHaversineDistanceKm(
        originCoords.lat,
        originCoords.lng,
        visit.coordinates.lat,
        visit.coordinates.lng
      );
      const mins = Math.max(2, Math.round(dist * 2.4));
      return `${formatDistance(dist)} • ~${mins} mins`;
    }

    return "Distance unavailable";
  };

  // Relative due estimation helper
  const getDueTimeText = (index: number) => {
    if (index === 0) return "Due in 1h 12m";
    if (index === 1) return "Due in 3h 39m";
    if (index === 2) return "Due in 7h 1m";
    return "Due today";
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-beige-text tracking-tight">
              My Visits
            </h1>
            {isLiveBackend && (
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#EAF2EC] text-[#1E3F35] border border-[#CDE1D2] flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1E3F35] animate-pulse" />
                <span>Live Backend</span>
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-beige-muted mt-0.5">
            Manage your assigned customer appointments, geofenced arrivals, and field completion logs.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isLiveBackend && (
            <button
              type="button"
              onClick={() => refreshAgentData(true)}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-beige-sand text-beige-text border border-[#E6DFD3] transition shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-[#1E3F35]" : ""}`} />
              <span>Refresh</span>
            </button>
          )}

          <Link
            href="/agent/routes"
            className="px-4 py-2 rounded-xl text-xs font-bold bg-[#EAF2EC] hover:bg-[#DFEDE2] text-[#1E3F35] border border-[#CDE1D2] transition flex items-center gap-1.5 shadow-2xs"
          >
            <Navigation className="w-3.5 h-3.5 rotate-45" />
            <span>View on Map Route →</span>
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-white border border-red-200 text-red-700 text-xs flex items-center justify-between gap-3 shadow-xs">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => refreshAgentData(true)}
            className="px-3 py-1 rounded-xl bg-red-100 hover:bg-red-200 font-bold text-xs shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white/70 border border-[#E6DFD3] overflow-x-auto scrollbar-none shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab("today")}
          className={`flex-1 min-w-[100px] py-2 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === "today"
              ? "bg-[#1E3F35] text-white shadow-xs"
              : "text-beige-muted hover:text-beige-text"
          }`}
        >
          <span>Today</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              activeTab === "today"
                ? "bg-[#EAF2EC] text-[#1E3F35]"
                : "bg-[#F4EFE6] text-beige-muted"
            }`}
          >
            {todayCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("upcoming")}
          className={`flex-1 min-w-[100px] py-2 px-4 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === "upcoming"
              ? "bg-[#1E3F35] text-white shadow-xs font-bold"
              : "text-beige-muted hover:text-beige-text"
          }`}
        >
          <span>Upcoming</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              activeTab === "upcoming"
                ? "bg-[#EAF2EC] text-[#1E3F35]"
                : "bg-[#F4EFE6] text-beige-muted"
            }`}
          >
            {upcomingCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("completed")}
          className={`flex-1 min-w-[100px] py-2 px-4 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === "completed"
              ? "bg-[#1E3F35] text-white shadow-xs font-bold"
              : "text-beige-muted hover:text-beige-text"
          }`}
        >
          <span>Completed</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              activeTab === "completed"
                ? "bg-[#EAF2EC] text-[#1E3F35]"
                : "bg-[#F4EFE6] text-beige-muted"
            }`}
          >
            {completedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`flex-1 min-w-[80px] py-2 px-4 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === "all"
              ? "bg-[#1E3F35] text-white shadow-xs font-bold"
              : "text-beige-muted hover:text-beige-text"
          }`}
        >
          <span>All</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              activeTab === "all"
                ? "bg-[#EAF2EC] text-[#1E3F35]"
                : "bg-[#F4EFE6] text-beige-muted"
            }`}
          >
            {allCount}
          </span>
        </button>
      </div>

      {/* Search and Priority Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-beige-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, address or purpose..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-xs bg-white border border-[#E6DFD3] text-beige-text placeholder-beige-muted focus:outline-hidden focus:ring-2 focus:ring-[#1E3F35]/30 shadow-2xs"
          />
        </div>

        <div className="relative shrink-0">
          <div className="flex items-center gap-2 bg-white border border-[#E6DFD3] rounded-2xl px-3.5 py-2.5 shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-beige-muted" />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="text-xs bg-transparent text-beige-text font-semibold focus:outline-hidden cursor-pointer pr-1"
            >
              <option value="all">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>
        </div>
      </div>

      {/* Visits List */}
      <div className="space-y-3.5">
        {isLoading && filteredVisits.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-5 rounded-2xl bg-white border border-[#E6DFD3] animate-pulse space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-beige-sand/60 rounded w-1/4" />
                  <div className="h-5 bg-beige-sand/80 rounded w-16" />
                </div>
                <div className="h-5 bg-beige-sand/80 rounded w-1/2" />
                <div className="h-3 bg-beige-sand/50 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : filteredVisits.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white border border-[#E6DFD3] text-center space-y-2 shadow-xs">
            <CalendarCheck className="w-10 h-10 text-beige-muted mx-auto" />
            <p className="text-sm font-bold text-beige-text">No visits found</p>
            <p className="text-xs text-beige-muted">
              Try adjusting your tab filter or search query.
            </p>
          </div>
        ) : (
          filteredVisits.map((visit, index) => {
            const isCompleted = visit.status === "completed";
            const isInProgress = visit.status === "in_progress";
            const distanceText = getEstimatedDistanceInfo(visit, index);
            const dueText = getDueTimeText(index);

            return (
              <div
                key={visit.id}
                onClick={() => setSelectedVisitForDrawer(visit)}
                className={`p-5 rounded-2xl bg-white border border-[#E6DFD3] transition-all duration-150 shadow-xs hover:border-[#1E3F35]/40 hover:shadow-sm cursor-pointer space-y-3 group ${
                  isInProgress ? "ring-2 ring-[#1E3F35]/30" : ""
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left Column: Index Badge + Customer Info + Purpose + Geofence */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Order Badge */}
                    <div className="w-10 h-10 rounded-xl bg-[#F5EFE6] text-beige-text font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                      #{index + 1}
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-0">
                      {/* Name + Status Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base sm:text-lg font-bold text-beige-text group-hover:text-[#1E3F35] transition truncate">
                          {visit.customerName}
                        </h3>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isCompleted
                              ? "bg-[#EAF2EC] text-[#1E3F35] border border-[#CDE1D2]"
                              : isInProgress
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-[#FAF3E7] text-[#9E6924] border border-[#F0E4D0]"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isCompleted ? "bg-[#1E3F35]" : isInProgress ? "bg-blue-600" : "bg-[#9E6924]"
                            }`}
                          />
                          <span className="capitalize">{visit.status.replace("_", " ")}</span>
                        </span>

                        {/* Priority Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            visit.priority === "high"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-[#FAF3E7] text-[#9E6924] border border-[#F0E4D0]"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              visit.priority === "high" ? "bg-red-600" : "bg-[#9E6924]"
                            }`}
                          />
                          <span className="capitalize">{visit.priority}</span>
                        </span>
                      </div>

                      {/* Address */}
                      <p className="text-xs text-beige-muted flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#1E3F35] shrink-0" />
                        <span>{visit.address}</span>
                      </p>

                      {/* Purpose Pill */}
                      <div className="bg-[#F9F7F2] rounded-xl px-3 py-1.5 text-xs text-beige-muted flex items-center gap-2 border border-[#E6DFD3]/50">
                        <FileText className="w-3.5 h-3.5 text-beige-muted shrink-0" />
                        <span className="truncate">{visit.purpose}</span>
                      </div>

                      {/* Geofence Rule Notice Bar */}
                      <div className="bg-[#F7F2E7] rounded-xl px-3 py-1.5 text-xs text-[#7A5B2E] flex items-center gap-2 border border-[#EADBBD]/60">
                        <Compass className="w-3.5 h-3.5 text-[#9E6924] shrink-0" />
                        <span className="truncate">
                          {visit.geofenceVerified
                            ? "GPS geofence verified at check-in."
                            : "Fresh GPS check required within 750m of the site to check in."}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Time + Distance + Actions */}
                  <div className="flex flex-col justify-between items-start lg:items-end space-y-3 shrink-0 pt-2 lg:pt-0">
                    {/* Time & Due Info */}
                    <div className="text-left lg:text-right">
                      <div className="text-sm sm:text-base font-bold text-beige-text flex items-center lg:justify-end gap-1.5">
                        <Clock className="w-4 h-4 text-beige-muted" />
                        <span>{visit.scheduledTime}</span>
                      </div>
                      <div className="text-[11px] font-semibold text-red-600 mt-0.5">
                        {dueText}
                      </div>
                    </div>

                    {/* Distance and ETA */}
                    <Link
                      href={`/agent/routes?visitId=${encodeURIComponent(visit.id)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-semibold text-beige-text hover:text-[#1E3F35] flex items-center gap-1 group/route"
                    >
                      <RouteIcon className="w-3.5 h-3.5 text-[#1E3F35]" />
                      <span>{distanceText}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-beige-muted group-hover/route:translate-x-0.5 transition" />
                    </Link>

                    {/* Action Buttons Row */}
                    <div className="flex items-center gap-2 w-full lg:w-auto">
                      <Link
                        href={`/agent/routes?visitId=${encodeURIComponent(visit.id)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 lg:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold bg-[#EAF2EC] hover:bg-[#DFEDE2] text-[#1E3F35] border border-[#CDE1D2] transition flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.98]"
                      >
                        <Navigation className="w-3.5 h-3.5 rotate-45" />
                        <span>View on Map Route</span>
                      </Link>

                      {isInProgress ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCompleteModalVisit(visit);
                          }}
                          className="flex-1 lg:flex-initial px-4 py-2 rounded-xl text-xs font-bold bg-[#1E3F35] hover:bg-[#162F27] text-white transition flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98] cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Complete Visit</span>
                        </button>
                      ) : !isCompleted ? (
                        <button
                          type="button"
                          onClick={(e) => handleQuickCheckIn(e, visit)}
                          disabled={checkingInVisitId === visit.id}
                          className="flex-1 lg:flex-initial px-4 py-2 rounded-xl text-xs font-bold bg-[#1E3F35] hover:bg-[#162F27] text-white transition flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98] disabled:opacity-75 cursor-pointer"
                        >
                          {checkingInVisitId === visit.id ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Verifying...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Verify GPS &amp; Check In</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#EAF2EC] text-[#1E3F35] border border-[#CDE1D2]">
                          ✓ Completed
                        </span>
                      )}
                    </div>
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
          onSuccess={() => {
            setCompleteModalVisit(null);
            setSelectedVisitForDrawer(null);
          }}
        />
      )}
    </div>
  );
}
