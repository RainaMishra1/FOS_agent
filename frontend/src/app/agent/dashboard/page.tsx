"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAgent } from "@/context/AgentContext";
import { AgentVisit } from "@/types/agent";
import NextVisitCard from "@/components/agent/NextVisitCard";
import AgentMapPreview from "@/components/agent/AgentMapPreview";
import VisitDetailDrawer from "@/components/agent/VisitDetailDrawer";
import StatusBadge from "@/components/StatusBadge";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Navigation,
  Route,
  ShieldCheck,
  MapPin,
  Compass,
  ArrowRight,
  Battery,
  AlertTriangle,
  Sparkles,
  PhoneCall,
  Coffee,
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
  } = useAgent();

  const [activeDrawerVisit, setActiveDrawerVisit] = useState<AgentVisit | null>(null);

  // Today's completed and recent visits
  const todayVisits = visits.filter(
    (v) => v.scheduledDate === "2026-10-18" || v.status === "completed" || v.status === "in_progress"
  );
  const completedToday = todayVisits.filter((v) => v.status === "completed");

  const handleOpenDetails = (visit: AgentVisit) => {
    setActiveDrawerVisit(visit);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* 1. Welcome Header & Agent Profile Card */}
      <div className="rounded-2xl bg-gradient-to-br from-beige-card via-beige-sand/40 to-beige-sand/70 border border-beige-border p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-beige-terracotta text-white font-bold text-base flex items-center justify-center shadow-sm">
                {currentAgent.initials}
              </div>
              <span
                className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${
                  isOnDuty ? "bg-beige-olive animate-pulse" : "bg-beige-muted"
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-beige-text">
                  Welcome back, {currentAgent.name}
                </h2>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-beige-sand text-beige-muted border border-beige-border">
                  {currentAgent.id}
                </span>
              </div>
              <p className="text-xs text-beige-muted">
                {currentAgent.role} • {currentAgent.territory}
              </p>
            </div>
          </div>

          {/* Quick Duty Control Pill */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={toggleDuty}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border shadow-xs ${
                isOnDuty
                  ? "bg-beige-olive text-white border-beige-olive hover:bg-beige-olive-light"
                  : "bg-beige-sand text-beige-muted border-beige-border hover:bg-beige-border"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnDuty ? "bg-white animate-pulse" : "bg-beige-muted"
                }`}
              />
              <span>{isOnDuty ? "On Duty • GPS Active" : "Off Duty • Paused"}</span>
            </button>
          </div>
        </div>

        {/* Status notice if off duty */}
        {!isOnDuty && (
          <div className="p-2.5 rounded-xl bg-beige-sand border border-beige-border text-xs text-beige-text flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-beige-terracotta shrink-0" />
              <span>You are currently Off Duty. Check-ins are locked until you resume duty.</span>
            </span>
            <button
              type="button"
              onClick={toggleDuty}
              className="text-xs font-bold text-beige-terracotta hover:underline ml-2"
            >
              Resume Duty
            </button>
          </div>
        )}
      </div>

      {/* 2. Key Daily Performance Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 sm:p-4 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <div className="flex items-center justify-between text-beige-muted mb-1">
            <span className="text-[11px] font-semibold">Today&apos;s Visits</span>
            <CalendarCheck className="w-4 h-4 text-beige-terracotta" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-beige-text">
            {stats.todayTotal}
          </div>
          <div className="text-[10px] text-beige-muted mt-0.5">Assigned for today</div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <div className="flex items-center justify-between text-beige-muted mb-1">
            <span className="text-[11px] font-semibold">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-beige-olive" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-beige-olive">
            {stats.todayCompleted}
          </div>
          <div className="text-[10px] text-beige-muted mt-0.5">
            {stats.completionPercentage}% completion rate
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <div className="flex items-center justify-between text-beige-muted mb-1">
            <span className="text-[11px] font-semibold">Remaining</span>
            <Clock className="w-4 h-4 text-beige-amber" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-beige-text">
            {stats.todayRemaining}
          </div>
          <div className="text-[10px] text-beige-muted mt-0.5">Pending check-in</div>
        </div>

        <div className="p-3 sm:p-4 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <div className="flex items-center justify-between text-beige-muted mb-1">
            <span className="text-[11px] font-semibold">Geofence Policy</span>
            <ShieldCheck className="w-4 h-4 text-beige-olive" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-beige-text">
            100m
          </div>
          <div className="text-[10px] text-beige-olive font-medium mt-0.5">
            100% compliance rate
          </div>
        </div>
      </div>

      {/* 3. Next Visit Standout Card */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-beige-text uppercase tracking-wider flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 text-beige-terracotta" />
            Current Priority Assignment
          </h3>
          <Link
            href="/agent/visits"
            className="text-[11px] font-semibold text-beige-terracotta hover:underline flex items-center gap-1"
          >
            <span>All {stats.todayTotal} Visits</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <NextVisitCard
          visit={stats.nextVisit}
          onOpenDetails={handleOpenDetails}
        />
      </section>

      {/* 4. Prominent Interactive Map Preview */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-beige-text uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-beige-terracotta" />
            Today&apos;s Customer Stops &amp; Route Preview
          </h3>
          <Link
            href="/agent/routes"
            className="text-[11px] font-semibold text-beige-terracotta hover:underline flex items-center gap-1"
          >
            <span>Open Route View</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <AgentMapPreview
          height="h-64 sm:h-72"
          onSelectVisit={handleOpenDetails}
          showRouteLine={true}
          highlightVisitId={stats.nextVisit?.id}
        />
      </section>

      {/* 5. Quick Actions Row */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Link
          href="/agent/routes"
          className="p-3 rounded-2xl bg-beige-card hover:bg-beige-sand/60 border border-beige-border text-center transition shadow-2xs group"
        >
          <div className="w-8 h-8 rounded-xl bg-beige-terracotta-subtle text-beige-terracotta mx-auto flex items-center justify-center mb-1.5 group-hover:scale-105 transition">
            <Route className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-beige-text block">View Route</span>
          <span className="text-[10px] text-beige-muted">5 stops ordered</span>
        </Link>

        <Link
          href="/agent/visits"
          className="p-3 rounded-2xl bg-beige-card hover:bg-beige-sand/60 border border-beige-border text-center transition shadow-2xs group"
        >
          <div className="w-8 h-8 rounded-xl bg-beige-olive-subtle text-beige-olive mx-auto flex items-center justify-center mb-1.5 group-hover:scale-105 transition">
            <CalendarCheck className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-beige-text block">My Visits</span>
          <span className="text-[10px] text-beige-muted">{stats.todayRemaining} remaining</span>
        </Link>

        <Link
          href="/agent/history"
          className="p-3 rounded-2xl bg-beige-card hover:bg-beige-sand/60 border border-beige-border text-center transition shadow-2xs group"
        >
          <div className="w-8 h-8 rounded-xl bg-beige-sand text-beige-muted mx-auto flex items-center justify-center mb-1.5 group-hover:scale-105 transition">
            <Clock className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-beige-text block">Visit History</span>
          <span className="text-[10px] text-beige-muted">Past logs &amp; seals</span>
        </Link>

        <Link
          href="/agent/profile"
          className="p-3 rounded-2xl bg-beige-card hover:bg-beige-sand/60 border border-beige-border text-center transition shadow-2xs group"
        >
          <div className="w-8 h-8 rounded-xl bg-beige-amber-subtle text-beige-amber mx-auto flex items-center justify-center mb-1.5 group-hover:scale-105 transition">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-beige-text block">My Profile</span>
          <span className="text-[10px] text-beige-muted">Battery &amp; stats</span>
        </Link>
      </section>

      {/* 6. Recent Visit Activity */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-beige-text uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-beige-muted" />
            Recent Visit Activity
          </h3>
          <Link
            href="/agent/history"
            className="text-[11px] font-semibold text-beige-terracotta hover:underline"
          >
            View All History →
          </Link>
        </div>

        <div className="rounded-2xl bg-beige-card border border-beige-border divide-y divide-beige-border/60 overflow-hidden shadow-xs">
          {/* Today's completed visits or first history */}
          {(completedToday.length > 0 ? completedToday : historyVisits.slice(0, 2)).map((visit) => (
            <div
              key={visit.id}
              onClick={() => handleOpenDetails(visit)}
              className="p-3.5 hover:bg-beige-sand/40 transition cursor-pointer flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-beige-olive-subtle text-beige-olive flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-beige-text truncate">
                      {visit.customerName}
                    </span>
                    <span className="text-[10px] font-mono text-beige-olive bg-beige-olive-subtle px-1.5 py-0.2 rounded border border-beige-olive/30 shrink-0">
                      Geofence Verified
                    </span>
                  </div>
                  <p className="text-[11px] text-beige-muted truncate">
                    {visit.address} • {visit.completedTime ? `Completed at ${visit.completedTime}` : visit.scheduledTime}
                  </p>
                </div>
              </div>

              <span className="text-[11px] font-semibold text-beige-terracotta shrink-0">
                Details →
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Visit Detail Drawer / Modal */}
      {activeDrawerVisit && (
        <VisitDetailDrawer
          visit={activeDrawerVisit}
          onClose={() => setActiveDrawerVisit(null)}
        />
      )}
    </div>
  );
}
