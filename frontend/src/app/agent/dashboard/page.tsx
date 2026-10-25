"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAgent } from "@/context/AgentContext";
import { AgentVisit } from "@/types/agent";
import NextVisitCard from "@/components/agent/NextVisitCard";
import VisitDetailDrawer from "@/components/agent/VisitDetailDrawer";
import AgentLocationSection from "@/components/agent/AgentLocationSection";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Navigation,
  Route,
  ShieldCheck,
  Compass,
  ArrowRight,
  ChevronRight,
  Crosshair,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Calendar,
} from "lucide-react";

export default function AgentDashboardPage() {
  const {
    currentAgent,
    isOnDuty,
    toggleDuty,
    visits,
    historyVisits,
    stats,
    selectedVisit,
    setSelectedVisit,
    isLoading,
    error,
    isLiveBackend,
    refreshAgentData,
  } = useAgent();

  const [activeDrawerVisit, setActiveDrawerVisit] = useState<AgentVisit | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshAgentData(false);
    setIsRefreshing(false);
  };

  const now = new Date();
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayVisits = visits.filter((v) => v.scheduledDate === todayDateStr || !v.scheduledDate);
  const completedToday = visits.filter((v) => v.status === "completed");

  const handleOpenDetails = (visit: AgentVisit) => {
    setActiveDrawerVisit(visit);
  };

  const displayCompleted = stats.todayCompleted ?? historyVisits.length;
  const displayRemaining = stats.todayRemaining ?? (visits.filter((v) => v.status !== "completed").length);
  const displayTotalVisits = stats.todayTotal ?? (displayRemaining + displayCompleted);
  const displayPct = stats.completionPercentage ?? (displayTotalVisits > 0 ? Math.round((displayCompleted / displayTotalVisits) * 100) : 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Error / Backend Alert Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-white border border-red-200 text-red-800 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold">Backend Sync Notice</h4>
              <p className="text-[11px] opacity-90 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-xl bg-[#1E3F35] text-white font-semibold text-xs hover:bg-[#162F27] transition flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Retry Connection</span>
          </button>
        </div>
      )}

      {/* 1. Welcome Hero Banner with City Skyline Silhouette */}
      <div className="relative rounded-2xl bg-gradient-to-r from-[#F9F7F2] via-[#F5EFE6] to-[#ECE5D8] border border-[#E6DFD3] p-5 sm:p-6 shadow-xs overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Subtle Decorative Skyline SVG */}
        <div className="absolute right-0 bottom-0 top-0 w-80 md:w-96 pointer-events-none opacity-45 overflow-hidden">
          <svg viewBox="0 0 400 160" fill="none" className="w-full h-full object-cover object-bottom">
            <circle cx="280" cy="50" r="32" fill="#EADFC9" />
            <path
              d="M120 160V100H140V160M150 160V80H170V160M180 160V65H210V160M220 160V110H240V160M250 160V70H280V160M290 160V95H310V160M320 160V50H350V160M360 160V105H385V160"
              fill="#DFD6C2"
            />
            <path
              d="M100 160V120H125V160M135 160V110H160V160M175 160V90H200V160M215 160V125H235V160M245 160V85H275V160M285 160V115H315V160M325 160V75H355V160M365 160V120H395V160"
              fill="#D3C7AD"
              opacity="0.7"
            />
          </svg>
        </div>

        {/* Left Side: Welcome Greeting & Status */}
        <div className="relative z-10 space-y-1.5 max-w-xl">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1E3F35] tracking-tight">
              Welcome back, {currentAgent.name} 👋
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${isOnDuty
                  ? "bg-[#EAF2EC] text-[#1E3F35] border border-[#CDE1D2]"
                  : "bg-[#FAF3E7] text-[#9E6924] border border-[#F0E4D0]"
                }`}
            >
              <span className={`w-2 h-2 rounded-full ${isOnDuty ? "bg-[#1E3F35]" : "bg-[#9E6924]"}`} />
              <span>{isOnDuty ? "On Duty • Active" : "Off Duty • Paused"}</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-beige-muted">
            Keep up the good work! You have {displayRemaining} pending visits remaining today ({displayCompleted} completed).
          </p>
        </div>

        {/* Right Side: Territory Badge */}
        <div className="relative z-10 flex items-center gap-2.5 bg-white/95 backdrop-blur-md border border-[#E6DFD3] rounded-2xl px-4 py-2.5 shadow-xs shrink-0 self-start md:self-auto">
          <div className="w-8 h-8 rounded-xl bg-[#EAF2EC] text-[#1E3F35] flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-[#1E3F35]" />
          </div>
          <div>
            <span className="text-xs font-bold text-beige-text block leading-tight">
              {currentAgent.territory?.includes(",") ? currentAgent.territory : `${currentAgent.territory || "Mumbai"}, Maharashtra`}
            </span>
            <span className="text-[10px] text-beige-muted block">Field Operations Area</span>
          </div>
        </div>
      </div>

      {/* 2. Key Daily Performance 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Today's Visits */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E6DFD3] shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-[#EAF2EC] text-[#1E3F35] flex items-center justify-center shadow-2xs">
              <CalendarCheck className="w-4 h-4" />
            </div>
            <ChevronRight className="w-4 h-4 text-beige-muted" />
          </div>
          <div>
            <span className="text-xs font-semibold text-beige-muted block">Today&apos;s Visits</span>
            <div className="text-2xl sm:text-3xl font-bold text-[#1E3F35] tracking-tight mt-0.5">
              {isLoading ? "..." : displayTotalVisits}
            </div>
            <span className="text-[11px] text-beige-muted mt-0.5 block">Assigned for today</span>
          </div>
        </div>

        {/* Card 2: Completed */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E6DFD3] shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-[#EAF2EC] text-[#1E3F35] flex items-center justify-center shadow-2xs">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <ChevronRight className="w-4 h-4 text-beige-muted" />
          </div>
          <div>
            <span className="text-xs font-semibold text-beige-muted block">Completed</span>
            <div className="text-2xl sm:text-3xl font-bold text-[#1E3F35] tracking-tight mt-0.5">
              {isLoading ? "..." : displayCompleted}
            </div>
            <span className="text-[11px] text-beige-muted mt-0.5 block">
              {isLoading ? "..." : `${displayPct}% completion rate`}
            </span>
          </div>
        </div>

        {/* Card 3: Remaining */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E6DFD3] shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-[#FAF3E7] text-[#9E6924] flex items-center justify-center shadow-2xs">
              <Clock className="w-4 h-4" />
            </div>
            <ChevronRight className="w-4 h-4 text-beige-muted" />
          </div>
          <div>
            <span className="text-xs font-semibold text-beige-muted block">Remaining</span>
            <div className="text-2xl sm:text-3xl font-bold text-[#1E3F35] tracking-tight mt-0.5">
              {isLoading ? "..." : displayRemaining}
            </div>
            <span className="text-[11px] text-beige-muted mt-0.5 block">Pending check-ins</span>
          </div>
        </div>

        {/* Card 4: Geofence Radius */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E6DFD3] shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-xl bg-[#EAF2EC] text-[#1E3F35] flex items-center justify-center shadow-2xs">
              <Crosshair className="w-4 h-4" />
            </div>
            <ChevronRight className="w-4 h-4 text-beige-muted" />
          </div>
          <div>
            <span className="text-xs font-semibold text-beige-muted block">Geofence Radius</span>
            <div className="text-2xl sm:text-3xl font-bold text-[#1E3F35] tracking-tight mt-0.5">
              750 m
            </div>
            <span className="text-[11px] text-[#1E3F35] font-semibold mt-0.5 block">
              Check-in within this range
            </span>
          </div>
        </div>
      </div>

      {/* 3. Automatic Location Sharing Section */}
      <section>
        <AgentLocationSection />
      </section>

      {/* 4. Current Priority Assignment Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-[#1E3F35]" />
            <h3 className="text-xs sm:text-sm font-bold text-beige-text uppercase tracking-wider">
              Current Priority Assignment
            </h3>
          </div>
          <Link
            href="/agent/visits"
            className="text-xs font-bold text-[#1E3F35] hover:underline flex items-center gap-1"
          >
            <span>All Visits ({displayTotalVisits})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <NextVisitCard
          visit={stats.nextVisit || visits[0] || null}
          onOpenDetails={handleOpenDetails}
        />
      </section>

      {/* 5. Quick Navigation Shortcuts Row */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/agent/routes"
          className="p-3.5 rounded-2xl bg-white hover:bg-[#F9F7F2] border border-[#E6DFD3] text-center transition shadow-2xs group"
        >
          <div className="w-9 h-9 rounded-xl bg-[#EAF2EC] text-[#1E3F35] mx-auto flex items-center justify-center mb-2 group-hover:scale-105 transition">
            <Route className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-beige-text block">My Routes</span>
          <span className="text-[10px] text-beige-muted">{visits.length} stops ordered</span>
        </Link>

        <Link
          href="/agent/visits"
          className="p-3.5 rounded-2xl bg-white hover:bg-[#F9F7F2] border border-[#E6DFD3] text-center transition shadow-2xs group"
        >
          <div className="w-9 h-9 rounded-xl bg-[#EAF2EC] text-[#1E3F35] mx-auto flex items-center justify-center mb-2 group-hover:scale-105 transition">
            <CalendarCheck className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-beige-text block">My Visits</span>
          <span className="text-[10px] text-beige-muted">{displayRemaining} pending • {displayTotalVisits} total</span>
        </Link>

        <Link
          href="/agent/history"
          className="p-3.5 rounded-2xl bg-white hover:bg-[#F9F7F2] border border-[#E6DFD3] text-center transition shadow-2xs group"
        >
          <div className="w-9 h-9 rounded-xl bg-[#FAF3E7] text-[#9E6924] mx-auto flex items-center justify-center mb-2 group-hover:scale-105 transition">
            <Clock className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-beige-text block">Visit History</span>
          <span className="text-[10px] text-beige-muted">{historyVisits.length} past records</span>
        </Link>

        <Link
          href="/agent/profile"
          className="p-3.5 rounded-2xl bg-white hover:bg-[#F9F7F2] border border-[#E6DFD3] text-center transition shadow-2xs group"
        >
          <div className="w-9 h-9 rounded-xl bg-[#EAF2EC] text-[#1E3F35] mx-auto flex items-center justify-center mb-2 group-hover:scale-105 transition">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-beige-text block">My Profile</span>
          <span className="text-[10px] text-beige-muted">Settings &amp; stats</span>
        </Link>
      </section>

      {/* 6. Recent Activity / Visits Log */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-beige-text uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-beige-muted" />
            <span>Recent Visit Activity</span>
          </h3>
          <Link
            href="/agent/history"
            className="text-[11px] font-semibold text-[#1E3F35] hover:underline"
          >
            View All History →
          </Link>
        </div>

        <div className="rounded-2xl bg-white border border-[#E6DFD3] divide-y divide-[#E6DFD3]/80 overflow-hidden shadow-xs">
          {[...visits.filter((v) => v.status === "completed"), ...historyVisits].slice(0, 4).map((visit) => (
            <div
              key={visit.id}
              onClick={() => handleOpenDetails(visit)}
              className="p-4 hover:bg-beige-sand/30 transition cursor-pointer flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#EAF2EC] text-[#1E3F35] flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-beige-text truncate">
                      {visit.customerName}
                    </span>
                    <span className="text-[10px] font-mono text-[#1E3F35] bg-[#EAF2EC] px-1.5 py-0.2 rounded border border-[#CDE1D2] shrink-0">
                      Completed
                    </span>
                  </div>
                  <p className="text-[11px] text-beige-muted truncate mt-0.5">
                    {visit.address} • {visit.completedTime ? `Completed at ${visit.completedTime}` : visit.scheduledTime}
                  </p>
                </div>
              </div>

              <span className="text-[11px] font-semibold text-[#1E3F35] shrink-0">
                Details →
              </span>
            </div>
          ))}

          {visits.filter((v) => v.status === "completed").length === 0 && historyVisits.length === 0 && (
            <div className="p-6 text-center text-xs text-beige-muted space-y-1">
              <p className="font-semibold text-beige-text">No completed visits recorded yet</p>
              <p>Check in and complete assigned appointments to build your activity history.</p>
            </div>
          )}
        </div>
      </section>

      {/* Visit Detail Drawer / Inspection Modal */}
      {activeDrawerVisit && (
        <VisitDetailDrawer
          visit={activeDrawerVisit}
          onClose={() => setActiveDrawerVisit(null)}
        />
      )}
    </div>
  );
}
