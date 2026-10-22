"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAgent } from "@/context/AgentContext";
import { useAuth } from "@/context/AuthContext";
import { AgentVisit } from "@/types/agent";
import AgentRoadRouteMap from "@/components/agent/AgentRoadRouteMap";
import StatusBadge from "@/components/StatusBadge";
import VisitDetailDrawer from "@/components/agent/VisitDetailDrawer";
import CompleteVisitModal from "@/components/agent/CompleteVisitModal";
import { fetchAgentRouteGeometry, fetchAgentTodayRoute, optimizeAgentTodayRoute, AgentRouteData, RoadRouteData } from "@/lib/api";
import { AlertTriangle, CheckCircle2, Clock, Compass, MapPin, Navigation, RefreshCw, Route, ShieldCheck, Sparkles } from "lucide-react";

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function AgentRoutePage() {
  const { session } = useAuth();
  const { checkInVisit, isOnDuty } = useAgent();
  const [routeData, setRouteData] = useState<AgentRouteData | null>(null);
  const [roadRoute, setRoadRoute] = useState<RoadRouteData | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentVisit | null>(null);
  const [completeVisit, setCompleteVisit] = useState<AgentVisit | null>(null);

  const loadRoute = useCallback(async (keepOrder = false) => {
    setLoading(true); setError(null);
    try {
      const result = await fetchAgentTodayRoute(session?.access_token, localDateString());
      setRouteData(result);
      const ids = keepOrder && orderedIds.length ? orderedIds : result.stops.map((v) => v.id);
      setOrderedIds(ids);
      const geometryIds = ids.filter((id) => {
        const stop = result.stops.find((v) => v.id === id);
        return stop?.customer_latitude != null && stop?.customer_longitude != null;
      });
      if (!result.origin) {
        setRoadRoute(null);
      } else try {
        setRoadRoute(await fetchAgentRouteGeometry(geometryIds, session?.access_token));
      } catch (routeErr: any) {
        setRoadRoute(null);
        setError(`Your assigned stops loaded, but road routing is unavailable: ${routeErr?.detail || routeErr?.message || "try again later"}`);
      }
    } catch (err: any) {
      setError(err?.detail || err?.message || "Could not load your route from the server.");
      setRouteData(null); setRoadRoute(null);
    } finally { setLoading(false); }
  }, [session?.access_token, orderedIds]);

  useEffect(() => { void loadRoute(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const orderedStops = useMemo(() => {
    if (!routeData) return [];
    const byId = new Map(routeData.stops.map((stop) => [stop.id, stop]));
    return orderedIds.map((id) => byId.get(id)).filter((stop): stop is NonNullable<typeof stop> => Boolean(stop));
  }, [routeData, orderedIds]);

  const toAgentVisit = (v: AgentRouteData["stops"][number]): AgentVisit => ({
    id: v.id, assignmentId: v.visit_code || v.id.slice(0, 8), customerId: v.customer_id,
    customerName: v.customer_name || "Customer Site", company: v.customer_company || undefined,
    contactPerson: v.customer_contact_person || v.customer_name || "Authorized Representative",
    phone: v.customer_phone || "", email: v.customer_email || "", address: v.customer_address || "Address unavailable",
    city: v.customer_city || "", coordinates: { lat: v.customer_latitude ?? 0, lng: v.customer_longitude ?? 0 },
    hasCoordinates: v.customer_latitude != null && v.customer_longitude != null,
    scheduledTime: v.scheduled_time, scheduledDate: v.scheduled_date,
    estimatedDuration: `${v.estimated_duration_minutes || 45} mins`, purpose: v.purpose || "Field visit",
    priority: (v.priority === "high" || v.priority === "low" ? v.priority : "medium"),
    status: v.status as AgentVisit["status"], geofenceVerified: v.geofence_verified,
    checkInTime: v.check_in_time || undefined,
    completedTime: v.completed_time || undefined, completionNotes: v.completion_notes || undefined,
    orderIndex: v.order_index, tags: ["Assigned"],
  });

  const visitsForMap = orderedStops;
  const completedCount = routeData?.completed.length || 0;
  const totalStopCount = (routeData?.stops.length || 0) + completedCount;
  const onSiteMinutes = routeData?.stops.reduce((sum, v) => sum + (v.estimated_duration_minutes || 45), 0) || 0;

  const optimize = async () => {
    if (!routeData) return;
    setOptimizing(true); setError(null); setNotice(null);
    try {
      const result = await optimizeAgentTodayRoute(session?.access_token, localDateString());
      const ids = result.ordered_visit_ids;
      setOrderedIds(ids);
      setNotice(result.detail);
      const geometryIds = ids.filter((id) => {
        const stop = routeData.stops.find((v) => v.id === id);
        return stop?.customer_latitude != null && stop?.customer_longitude != null;
      });
      setRoadRoute(null);
      setRoadRoute(await fetchAgentRouteGeometry(geometryIds, session?.access_token));
    } catch (err: any) { setError(err?.detail || err?.message || "Route optimization failed."); }
    finally { setOptimizing(false); }
  };

  return <div className="space-y-4 animate-in fade-in duration-200">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-beige-text sm:text-xl">Today&apos;s Field Route</h2><span className="rounded-full border border-beige-border bg-beige-sand px-2 py-0.5 text-[10px] font-bold text-beige-muted">Live assignments</span></div>
        <p className="text-xs text-beige-muted">Assigned customer stops, your latest location, and road route</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => void loadRoute(true)} disabled={loading} className="flex items-center gap-1.5 rounded-xl border border-beige-border bg-beige-card px-3 py-2 text-xs font-semibold text-beige-text disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</button>
        <button onClick={() => void optimize()} disabled={optimizing || loading || !routeData?.origin || (routeData?.stops.length || 0) < 2} className="flex items-center gap-1.5 rounded-xl bg-beige-terracotta px-3 py-2 text-xs font-semibold text-white shadow-2xs disabled:opacity-50"><Sparkles className={`h-3.5 w-3.5 ${optimizing ? "animate-spin" : ""}`} />{optimizing ? "Optimizing…" : "Optimize Sequence"}</button>
      </div>
    </div>

    {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {notice && <div className="flex items-start gap-2 rounded-xl border border-beige-olive/30 bg-beige-olive-subtle p-3 text-xs text-beige-olive"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice} Route order is a preview and does not change assignments.</div>}

    {loading && <div className="rounded-2xl border border-beige-border bg-beige-card p-8 text-center text-sm text-beige-muted">Loading your assigned route…</div>}
    {!loading && routeData && <>
      {!routeData.origin && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{routeData.origin_error || "Your assigned stops are shown below, but a current GPS fix is needed to draw the road route or optimize the sequence."} Your assigned stops remain available below. Allow location access, wait for a better fix, then refresh.</span></div>}
      <div className="flex items-start gap-2 rounded-xl border border-beige-border bg-beige-sand/70 p-3 text-[11px] text-beige-muted"><Navigation className="mt-0.5 h-4 w-4 shrink-0 text-beige-terracotta" /><p><strong className="text-beige-text">Road route from live operational data.</strong> Travel distance and time come from OSRM road-network routing. Estimated visit durations are added separately; traffic conditions are not included.</p></div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-2xl border border-beige-border bg-beige-card p-3"><span className="block text-[10px] text-beige-muted">Stops Today</span><strong className="text-base text-beige-text">{totalStopCount}</strong><span className="mt-0.5 block text-[10px] text-beige-olive">{completedCount} completed today</span></div>
        <div className="rounded-2xl border border-beige-border bg-beige-card p-3"><span className="block text-[10px] text-beige-muted">Road Distance</span><strong className="font-mono text-base text-beige-text">{roadRoute ? formatDistance(roadRoute.distance_meters) : "—"}</strong><span className="mt-0.5 block text-[10px] text-beige-muted">OSRM driving route</span></div>
        <div className="rounded-2xl border border-beige-border bg-beige-card p-3"><span className="block text-[10px] text-beige-muted">Est. Duration</span><strong className="font-mono text-base text-beige-olive">{roadRoute ? `${Math.round(roadRoute.duration_seconds / 60 + onSiteMinutes)} min` : "—"}</strong><span className="mt-0.5 block text-[10px] text-beige-muted">Road + scheduled visit time</span></div>
        <div className="rounded-2xl border border-beige-border bg-beige-card p-3"><span className="block text-[10px] text-beige-muted">GPS Starting Point</span><strong className="text-base capitalize text-beige-text">{!routeData.origin ? "Unavailable" : routeData.origin.accuracy_meters == null ? "GPS" : `±${Math.round(routeData.origin.accuracy_meters)} m`}</strong><span className="mt-0.5 block text-[10px] text-beige-muted">{routeData.origin?.updated_at ? `Updated ${new Date(routeData.origin.updated_at).toLocaleTimeString()}` : "Latest saved position"}</span></div>
      </div>

      <section className="space-y-1.5"><h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-beige-text"><Compass className="h-3.5 w-3.5 text-beige-terracotta" />Road Route &amp; Assigned Stops</h3><AgentRoadRouteMap origin={routeData.origin} stops={visitsForMap} geometry={roadRoute?.geometry?.coordinates || []} /></section>

      <section className="space-y-2 pt-2">
        <div className="flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-beige-text"><Route className="h-3.5 w-3.5 text-beige-terracotta" />Route Sequence ({orderedStops.length} stops)</h3><span className="text-[11px] text-beige-muted">Server-assigned order or optimization preview</span></div>
        {!orderedStops.length && <div className="rounded-2xl border border-beige-border bg-beige-card p-5 text-sm text-beige-muted">No active visits are assigned to your account for today.</div>}
        {orderedStops.map((raw, index) => {
          const visit = toAgentVisit(raw);
          const routableIndex = orderedStops
            .filter((stop) => stop.customer_latitude != null && stop.customer_longitude != null)
            .findIndex((stop) => stop.id === raw.id);
          const leg = routableIndex >= 0 ? roadRoute?.legs[routableIndex] : undefined;
          const isDone = visit.status === "completed";
          const isInProgress = visit.status === "in_progress";
          return <div key={visit.id} onClick={() => setSelected(visit)} className={`cursor-pointer space-y-2.5 rounded-2xl border bg-beige-card p-4 shadow-2xs transition hover:shadow-sm ${isInProgress ? "border-beige-terracotta/80 ring-1 ring-beige-terracotta/40" : "border-beige-border"}`}>
            <div className="flex items-center justify-between text-[11px]"><div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${isDone ? "bg-beige-olive" : isInProgress ? "bg-beige-terracotta" : "bg-beige-text"}`}>{isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}</span><span className="font-bold text-beige-text">Stop #{index + 1} · {visit.scheduledTime}</span></div><span className="font-mono text-beige-muted">{leg ? `${formatDistance(leg.distance)} · ${Math.round(leg.duration / 60)} min` : "Road leg unavailable"}</span></div>
            <div className="pl-8"><div className="flex items-center justify-between"><h4 className="text-sm font-bold text-beige-text">{visit.customerName}</h4><StatusBadge status={visit.status} size="sm" /></div>{visit.company && <p className="text-[11px] text-beige-muted">{visit.company}</p>}<p className="mt-0.5 flex items-start gap-1 text-xs text-beige-muted"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-beige-terracotta" />{visit.address}</p></div>
            <div className="flex items-center justify-between border-t border-beige-border/60 pl-8 pt-1 text-xs"><span className="flex items-center gap-1 text-[11px] text-beige-muted">{isDone ? <><ShieldCheck className="h-3.5 w-3.5 text-beige-olive" />Completed {visit.completedTime || ""}</> : <><Clock className="h-3.5 w-3.5" />{visit.priority} priority</>}</span>{isInProgress ? <button onClick={(e) => { e.stopPropagation(); setCompleteVisit(visit); }} className="rounded-lg bg-beige-olive px-2.5 py-1 font-bold text-white">Complete Visit</button> : !isDone ? <button onClick={(e) => { e.stopPropagation(); if (isOnDuty) void checkInVisit(visit.id); }} className="rounded-lg bg-beige-terracotta px-2.5 py-1 font-bold text-white">Check In</button> : null}</div>
          </div>;
        })}
      </section>
    </>}

    {selected && <VisitDetailDrawer visit={selected} onClose={() => setSelected(null)} />}
    {completeVisit && <CompleteVisitModal visit={completeVisit} onClose={() => setCompleteVisit(null)} />}
  </div>;
}
