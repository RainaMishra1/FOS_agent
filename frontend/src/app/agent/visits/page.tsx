"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useAgent } from "@/context/AgentContext";
import { AgentVisit } from "@/types/agent";
import DutyToggleButton from "@/components/agent/DutyToggleButton";
import VisitDetailDrawer from "@/components/agent/VisitDetailDrawer";
import CompleteVisitModal from "@/components/agent/CompleteVisitModal";
import { CalendarDays, Clock3, MapPin, Navigation, RefreshCw } from "lucide-react";

type VisitTab = "today" | "upcoming" | "completed";

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatVisitDate(value: string) {
  if (!value) return "Date not set";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatVisitTime(value: string) {
  if (!value) return "Time not set";
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = match[3]?.toUpperCase();
  if (suffix) return `${hour}:${minute} ${suffix}`;
  if (hour > 23) return value;
  const period = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute} ${period}`;
}

function statusLabel(status: AgentVisit["status"]) {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  if (status === "delayed") return "Delayed";
  return "Not started";
}

export default function MyVisitsPage() {
  const {
    visits,
    historyVisits,
    isOnDuty,
    checkInVisit,
    isLoading,
    error,
    refreshAgentData,
  } = useAgent();

  const [activeTab, setActiveTab] = useState<VisitTab>("today");
  const [selectedVisit, setSelectedVisit] = useState<AgentVisit | null>(null);
  const [visitToComplete, setVisitToComplete] = useState<AgentVisit | null>(null);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  const today = localDateString();
  const completedVisits = useMemo(() => {
    const byId = new Map<string, AgentVisit>();
    [...historyVisits, ...visits.filter((visit) => visit.status === "completed")]
      .forEach((visit) => byId.set(visit.id, visit));
    return Array.from(byId.values()).sort((a, b) => (b.completedTime || "").localeCompare(a.completedTime || ""));
  }, [historyVisits, visits]);

  const todayVisits = useMemo(
    () => visits
      .filter((visit) => visit.status !== "completed" && (!visit.scheduledDate || visit.scheduledDate <= today))
      .sort((a, b) => a.orderIndex - b.orderIndex),
    [visits, today]
  );
  const upcomingVisits = useMemo(
    () => visits
      .filter((visit) => visit.status !== "completed" && visit.scheduledDate > today)
      .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`)),
    [visits, today]
  );

  const lists: Record<VisitTab, AgentVisit[]> = {
    today: todayVisits,
    upcoming: upcomingVisits,
    completed: completedVisits,
  };
  const selectedVisits = lists[activeTab];
  const tabs: { id: VisitTab; label: string; count: number }[] = [
    { id: "today", label: "Today", count: todayVisits.length },
    { id: "upcoming", label: "Upcoming", count: upcomingVisits.length },
    { id: "completed", label: "Completed", count: completedVisits.length },
  ];

  const handleCheckIn = async (visit: AgentVisit) => {
    if (checkingInId) return;
    setCheckingInId(visit.id);
    try {
      await checkInVisit(visit.id);
    } finally {
      setCheckingInId(null);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-5 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-beige-text">My visits</h1>
          <p className="mt-1 text-sm text-beige-muted">Your schedule, one stop at a time.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshAgentData(true)}
            disabled={isLoading}
            aria-label="Refresh visits"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-beige-border bg-white text-beige-text disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {!isOnDuty && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>You’re off duty. Turn on duty before checking in to a visit.</p>
          <DutyToggleButton size="sm" />
        </section>
      )}

      {error && (
        <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>{error}</p>
          <button type="button" onClick={() => void refreshAgentData(true)} className="font-semibold underline">Try again</button>
        </section>
      )}

      <nav aria-label="Visit lists" className="grid grid-cols-3 gap-2 rounded-xl border border-beige-border bg-white p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={`rounded-lg px-2 py-3 text-sm font-semibold transition ${activeTab === tab.id ? "bg-[#1E3F35] text-white" : "text-beige-muted hover:bg-beige-bg hover:text-beige-text"}`}
          >
            {tab.label} <span className={activeTab === tab.id ? "ml-1 text-white/75" : "ml-1 text-beige-muted"}>{tab.count}</span>
          </button>
        ))}
      </nav>

      <section aria-live="polite" className="space-y-3">
        {isLoading && selectedVisits.length === 0 ? (
          <div className="rounded-xl border border-beige-border bg-white p-6 text-center text-sm text-beige-muted">Loading your visits…</div>
        ) : selectedVisits.length === 0 ? (
          <div className="rounded-xl border border-beige-border bg-white px-5 py-10 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-beige-muted" />
            <h2 className="mt-3 font-semibold text-beige-text">
              {activeTab === "today" ? "No visits for today" : activeTab === "upcoming" ? "No upcoming visits" : "No completed visits yet"}
            </h2>
            <p className="mt-1 text-sm text-beige-muted">
              {activeTab === "today" ? "New visits assigned to you will appear here." : "Your visit list will update when there’s something to show."}
            </p>
          </div>
        ) : (
          selectedVisits.map((visit) => {
            const completed = visit.status === "completed";
            const inProgress = visit.status === "in_progress";
            const isCheckingIn = checkingInId === visit.id;
            const canStart = !completed && !inProgress && activeTab !== "upcoming";

            return (
              <article key={visit.id} className="rounded-xl border border-beige-border bg-white p-4 shadow-xs sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${completed ? "bg-emerald-50 text-emerald-800" : inProgress ? "bg-blue-50 text-blue-800" : visit.status === "delayed" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
                        {statusLabel(visit.status)}
                      </span>
                      {visit.priority === "high" && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">High priority</span>}
                    </div>
                    <h2 className="text-lg font-bold text-beige-text">{visit.customerName}</h2>
                    {visit.company && <p className="mt-0.5 text-sm text-beige-muted">{visit.company}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-beige-bg px-3 py-2 text-sm font-semibold text-beige-text">
                    <Clock3 className="h-4 w-4" />
                    <span>{activeTab === "today" ? "Today · " : ""}{formatVisitTime(visit.scheduledTime)}</span>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm text-beige-muted">
                  {activeTab !== "today" && (
                    <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" />{formatVisitDate(visit.scheduledDate)}</p>
                  )}
                  <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#1E3F35]" /><span>{visit.address || "Address not available"}{visit.city ? `, ${visit.city}` : ""}</span></p>
                  {visit.purpose && <p className="rounded-lg bg-beige-bg px-3 py-2 text-sm text-beige-text">{visit.purpose}</p>}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-beige-border pt-4">
                  {canStart && (
                    <button
                      type="button"
                      onClick={() => void handleCheckIn(visit)}
                      disabled={Boolean(checkingInId) || !isOnDuty}
                      className="min-h-10 rounded-lg bg-[#1E3F35] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCheckingIn ? "Checking location…" : "Check in"}
                    </button>
                  )}
                  {inProgress && (
                    <button type="button" onClick={() => setVisitToComplete(visit)} className="min-h-10 rounded-lg bg-[#1E3F35] px-4 py-2 text-sm font-semibold text-white">
                      Complete visit
                    </button>
                  )}
                  {!completed && (
                    <Link href={`/agent/routes?visitId=${encodeURIComponent(visit.id)}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-beige-border px-4 py-2 text-sm font-semibold text-beige-text hover:bg-beige-bg">
                      <Navigation className="h-4 w-4" /> Directions
                    </Link>
                  )}
                  <button type="button" onClick={() => setSelectedVisit(visit)} className="min-h-10 rounded-lg px-3 py-2 text-sm font-semibold text-[#1E3F35] hover:bg-[#EAF2EC]">
                    Visit details
                  </button>
                  {completed && visit.completedTime && <span className="self-center text-sm text-beige-muted">Completed at {visit.completedTime}</span>}
                </div>
              </article>
            );
          })
        )}
      </section>

      {selectedVisit && <VisitDetailDrawer visit={selectedVisit} onClose={() => setSelectedVisit(null)} />}
      {visitToComplete && (
        <CompleteVisitModal
          visit={visitToComplete}
          onClose={() => setVisitToComplete(null)}
          onSuccess={() => setVisitToComplete(null)}
        />
      )}
    </main>
  );
}
