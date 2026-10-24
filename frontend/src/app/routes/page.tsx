"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import AgentRoadRouteMap from "@/components/agent/AgentRoadRouteMap";
import AssignWorkModal from "@/components/AssignWorkModal";
import StatusBadge from "@/components/StatusBadge";
import {
  AgentApiItem, AdminRoutePreview, fetchAgents, fetchScheduledVisits,
  previewAdminRoute, saveAdminRouteOrder, VisitApiResponse,
} from "@/lib/api";
import {
  AlertTriangle, ArrowDown, ArrowUp, CalendarDays, CheckCircle2,
  LoaderCircle, MapPin, Navigation, RefreshCw, Route, Send, Sparkles,
} from "lucide-react";

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export default function AdminRoutePlanningPage() {
  const { session } = useAuth();
  const [agents, setAgents] = useState<AgentApiItem[]>([]);
  const [agentId, setAgentId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(localDateString);
  const [visits, setVisits] = useState<VisitApiResponse[]>([]);
  const [preview, setPreview] = useState<AdminRoutePreview | null>(null);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingAgents(true);
    try {
      const result = await fetchAgents(session.access_token, { limit: 100 });
      setAgents(result.items);
      setAgentId((current) => current && result.items.some((agent) => agent.id === current)
        ? current : result.items[0]?.id || "");
      setError(null);
    } catch (err: any) {
      setError(err?.detail || err?.message || "Could not load field agents from the server.");
    } finally { setLoadingAgents(false); }
  }, [session?.access_token]);

  useEffect(() => { void loadAgents(); }, [loadAgents]);

  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === agentId) || null, [agents, agentId]);

  const loadVisits = useCallback(async () => {
    if (!session?.access_token || !agentId || !scheduledDate) return;
    setLoadingVisits(true);
    setError(null);
    setMessage(null);
    setPreview(null);
    try {
      const result = await fetchScheduledVisits(agentId, scheduledDate, session.access_token);
      const activeVisits = result.items.filter((visit) => visit.status !== "completed");
      setVisits(activeVisits);
      if (activeVisits.length) {
        try {
          const route = await previewAdminRoute({
            agent_id: agentId,
            scheduled_date: scheduledDate,
            visit_ids: activeVisits.map((visit) => visit.id),
          }, session.access_token);
          setPreview(route);
        } catch (err: any) {
          setError(err?.detail || err?.message || "Stops loaded, but OSRM could not build the road route.");
        }
      }
    } catch (err: any) {
      setError(err?.detail || err?.message || "Could not load assigned visits from the server.");
      setVisits([]);
    } finally { setLoadingVisits(false); }
  }, [session?.access_token, agentId, scheduledDate]);

  useEffect(() => { void loadVisits(); }, [loadVisits]);

  const optimizeRoute = async () => {
    if (!session?.access_token || !agentId || visits.length < 2) return;
    setOptimizing(true); setError(null); setMessage(null);
    try {
      const result = await previewAdminRoute({ agent_id: agentId, scheduled_date: scheduledDate, optimize: true }, session.access_token);
      const byId = new Map(visits.map((visit) => [visit.id, visit]));
      setVisits(result.ordered_visit_ids.map((id) => byId.get(id)).filter((visit): visit is VisitApiResponse => Boolean(visit)));
      setPreview(result);
      setMessage("OSRM optimized the road sequence. Save the route to send this order to the agent.");
    } catch (err: any) {
      setError(err?.detail || err?.message || "Could not optimize this route with OSRM.");
    } finally { setOptimizing(false); }
  };

  const moveVisit = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= visits.length) return;
    const next = [...visits];
    [next[index], next[target]] = [next[target], next[index]];
    setVisits(next);
    setPreview(null);
    setMessage("Sequence changed. Save it to send the new order to the agent.");
    if (session?.access_token && agentId) {
      try {
        const route = await previewAdminRoute({
          agent_id: agentId, scheduled_date: scheduledDate, visit_ids: next.map((visit) => visit.id),
        }, session.access_token);
        setPreview(route);
      } catch (err: any) {
        setError(err?.detail || err?.message || "Could not redraw the road route for this order.");
      }
    }
  };

  const saveRoute = async () => {
    if (!session?.access_token || !agentId || visits.length === 0) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      await saveAdminRouteOrder({ agent_id: agentId, scheduled_date: scheduledDate, visit_ids: visits.map((visit) => visit.id) }, session.access_token);
      setMessage(`Route order saved for ${selectedAgent?.name || "the selected agent"}. It is now available in their Field Agent app.`);
      try {
        const route = await previewAdminRoute({ agent_id: agentId, scheduled_date: scheduledDate, visit_ids: visits.map((visit) => visit.id) }, session.access_token);
        setPreview(route);
      } catch { setPreview(null); }
    } catch (err: any) {
      setError(err?.detail || err?.message || "Could not dispatch this route order.");
    } finally { setSaving(false); }
  };

  const agentGpsIsFresh = selectedAgent?.location_source === "gps" && selectedAgent.last_location_update
    && Date.now() - new Date(selectedAgent.last_location_update).getTime() <= 5 * 60 * 1000;
  const origin = preview?.origin || (agentGpsIsFresh && selectedAgent?.current_latitude != null && selectedAgent.current_longitude != null
    ? { latitude: selectedAgent.current_latitude, longitude: selectedAgent.current_longitude }
    : null);

  return <div className="space-y-5">
    <div className="flex flex-col gap-4 border-b border-beige-border/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-beige-text sm:text-2xl">Route Planning &amp; Optimization</h2>
        <p className="mt-1 text-xs text-beige-muted">Plan real assigned visits with OSRM road routing, then save the sequence to the agent app.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setAddStopOpen(true)} disabled={!selectedAgent || selectedAgent.status.toLowerCase() !== "active"} className="flex items-center gap-2 rounded-xl border border-beige-border bg-beige-card px-3 py-2 text-xs font-semibold text-beige-text disabled:opacity-50">+ Add stop</button>
        <button onClick={() => void loadVisits()} disabled={loadingVisits || !agentId} className="flex items-center gap-2 rounded-xl border border-beige-border bg-beige-card px-3 py-2 text-xs font-semibold text-beige-text disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loadingVisits ? "animate-spin" : ""}`} />Refresh</button>
        <button onClick={() => void optimizeRoute()} disabled={optimizing || loadingVisits || visits.length < 2} className="flex items-center gap-2 rounded-xl bg-beige-terracotta px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Sparkles className={`h-4 w-4 ${optimizing ? "animate-spin" : ""}`} />{optimizing ? "Optimizing…" : "Optimize with OSRM"}</button>
        <button onClick={() => void saveRoute()} disabled={saving || loadingVisits || visits.length === 0} className="flex items-center gap-2 rounded-xl bg-beige-olive px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" />{saving ? "Saving…" : "Dispatch Route"}</button>
      </div>
    </div>

    {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {message && <div className="flex items-start gap-2 rounded-xl border border-beige-olive/30 bg-beige-olive-subtle p-3 text-sm text-beige-olive"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>}

    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-beige-border bg-beige-card p-4 md:grid-cols-12 md:items-end">
      <label className="space-y-1.5 md:col-span-6"><span className="flex items-center gap-1.5 text-xs font-bold text-beige-text"><MapPin className="h-3.5 w-3.5 text-beige-terracotta" />Target Field Agent</span>
        <select value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={loadingAgents || agents.length === 0} className="w-full rounded-xl border border-beige-border bg-beige-bg p-2.5 text-sm text-beige-text">
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.territory || "No territory"} ({agent.status})</option>)}
        </select>
      </label>
      <label className="space-y-1.5 md:col-span-3"><span className="flex items-center gap-1.5 text-xs font-bold text-beige-text"><CalendarDays className="h-3.5 w-3.5 text-beige-terracotta" />Schedule Date</span>
        <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className="w-full rounded-xl border border-beige-border bg-beige-bg p-2.5 text-sm text-beige-text" />
      </label>
      <div className="md:col-span-3 md:text-right"><span className="block text-[10px] text-beige-muted">Agent GPS origin</span><span className="font-mono text-xs text-beige-text">{origin ? `${origin.latitude.toFixed(5)}, ${origin.longitude.toFixed(5)}` : "No current GPS location"}</span></div>
    </div>

    {loadingVisits ? <div className="rounded-2xl border border-beige-border bg-beige-card p-10 text-center text-sm text-beige-muted"><LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading database visits and road route…</div> : (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-bold text-beige-text"><Route className="h-4 w-4 text-beige-terracotta" />Assigned Stops ({visits.length})</h3><span className="text-[11px] text-beige-muted">Move stops or optimize with OSRM</span></div>
          {visits.length === 0 ? <div className="rounded-2xl border border-beige-border bg-beige-card p-6 text-sm text-beige-muted">No active visits are assigned to this agent for {scheduledDate}. Add a real customer stop here, then optimize and dispatch its route.</div> : visits.map((visit, index) => (
            <article key={visit.id} className="rounded-2xl border border-beige-border bg-beige-card p-4">
              <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-beige-terracotta text-xs font-bold text-white">{index + 1}</span><div className="min-w-0"><h4 className="truncate text-sm font-bold text-beige-text">{visit.customer_name || "Customer"}</h4><p className="mt-0.5 text-xs text-beige-muted">{visit.customer_company || ""} · {visit.scheduled_time}</p></div></div><div className="flex shrink-0 items-center gap-1"><button onClick={() => moveVisit(index, -1)} disabled={index === 0} aria-label="Move stop up" className="rounded-lg p-1.5 text-beige-muted hover:bg-beige-sand disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button onClick={() => moveVisit(index, 1)} disabled={index === visits.length - 1} aria-label="Move stop down" className="rounded-lg p-1.5 text-beige-muted hover:bg-beige-sand disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button></div></div>
              <p className="mt-2 flex items-start gap-1.5 pl-10 text-xs text-beige-muted"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-beige-terracotta" />{visit.customer_address || "Address unavailable"}{visit.customer_city ? `, ${visit.customer_city}` : ""}</p>
              <div className="mt-3 flex items-center justify-between pl-10"><StatusBadge status={visit.status} size="sm" /><span className="text-[10px] text-beige-muted">{visit.customer_latitude == null || visit.customer_longitude == null ? "No mapped coordinates" : `${visit.customer_latitude.toFixed(4)}, ${visit.customer_longitude.toFixed(4)}`}</span></div>
            </article>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-beige-text"><Navigation className="h-4 w-4 text-beige-terracotta" />OSRM Road Route</h3>{preview && <div className="text-right text-xs text-beige-muted"><strong className="text-beige-text">{formatDistance(preview.distance_meters)}</strong> · {Math.round(preview.duration_seconds / 60)} min drive</div>}</div>
          {origin ? <AgentRoadRouteMap origin={origin} stops={visits} geometry={preview?.geometry?.coordinates || []} /> : <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-beige-border bg-beige-card p-6 text-center text-sm text-beige-muted">This agent needs to share a current GPS location from the Field Agent app before OSRM can calculate a route.</div>}
          {preview && <p className="text-[11px] text-beige-muted">Road distance and travel time are from OSRM. The route follows the sequence shown on the left.</p>}
        </section>
      </div>
    )}
    <AssignWorkModal
      isOpen={addStopOpen}
      onClose={() => setAddStopOpen(false)}
      preselectedAgentId={agentId}
      preselectedDate={scheduledDate}
      onSuccess={(successText) => {
        setAddStopOpen(false);
        void loadVisits();
        setMessage(`${successText} The new stop is assigned for ${scheduledDate}; optimize or reorder the route and dispatch its sequence.`);
      }}
    />
  </div>;
}
