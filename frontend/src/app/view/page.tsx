"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Hexagon,
  Inbox,
  Info,
  Layers,
  Lightbulb,
  Loader2,
  MapPin,
  RefreshCw,
  Scale,
  User,
  X,
} from "lucide-react";
import DispatchMap, { DispatchMapAgent, DispatchMapLink, DispatchMapPoint, DispatchMapRegion } from "@/components/DispatchMap";
import { DonutChart, ShareBar, StackedBarChart, StackedRow } from "@/components/dispatch/Charts";
import { useAuth } from "@/context/AuthContext";
import {
  DispatchAgent,
  DispatchLead,
  DispatchStage,
  TerritoryApiItem,
  apiErrorMessage,
  fetchDispatchOverview,
  fetchTerritories,
} from "@/lib/api";
import { isPointInPolygon } from "@/lib/geoUtils";
import { HexCell, hexBin } from "@/lib/hexbin";

// ------------------------------------------------------------------ constants
const STAGES: { key: DispatchStage; label: string; color: string }[] = [
  { key: "unassigned", label: "Unassigned", color: "#B04A5A" },
  { key: "awaiting_verification", label: "Awaiting verification", color: "#7A5A85" },
  { key: "assigned", label: "Assigned", color: "#4A6B82" },
  { key: "in_progress", label: "In progress", color: "#C48A3F" },
  { key: "completed", label: "Completed", color: "#393185" },
];
const STAGE = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<DispatchStage, (typeof STAGES)[number]>;
const HEX_SIZE_M = 600; // ≈ 1.2 km across

/** Shown only when the system has no leads, so the layout can be seen. Not saved anywhere. */
const EXAMPLE_LEAD: DispatchLead = {
  id: "example-lead",
  lead_code: "EXAMPLE",
  stage: "unassigned",
  priority: "medium",
  source: "admin",
  customer_name: "Example customer",
  company: "Example shop",
  address: "Near Thane railway station (example only)",
  city: "Thane",
  latitude: 19.1863,
  longitude: 72.9757,
  created_at: new Date().toISOString(),
  waiting_hours: 2,
  is_example: true,
};

type Layer = "leads" | "agents" | "density" | "regions";
type Selection = { kind: "lead"; id: string } | { kind: "agent"; id: string } | { kind: "hex"; cell: HexCell } | null;

const formatWait = (hours?: number | null) =>
  hours == null ? "—" : hours < 1 ? `${Math.round(hours * 60)} min` : hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} days`;
const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AG";

const card = "rounded-2xl border border-[#E3E2EE] bg-white shadow-xs";
const AUTO_REFRESH_MS = 60_000;

/** How fresh an agent's last reported location is. */
function freshness(updated?: string | null, now = Date.now()): { level: "live" | "recent" | "stale"; label: string } {
  if (!updated) return { level: "stale", label: "Location never reported" };
  const minutes = (now - new Date(updated).getTime()) / 60_000;
  const ago =
    minutes < 1 ? "just now" : minutes < 60 ? `${Math.round(minutes)} min ago` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`;
  if (minutes <= 5) return { level: "live", label: `Live · updated ${ago}` };
  if (minutes <= 60) return { level: "recent", label: `Last seen ${ago}` };
  return { level: "stale", label: `Last seen ${ago}` };
}

const FRESH_DOT = { live: "#22c55e", recent: "#f59e0b", stale: "#9ca3af" } as const;

const kmBetween = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * r) / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};

function KpiCard({
  icon: Icon,
  tint,
  title,
  value,
  subtitle,
  share,
}: {
  icon: React.ElementType;
  tint: string;
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  share?: { value: number; total: number; color: string };
}) {
  return (
    <div className={`${card} p-4 space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#62607A]">{title}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${tint}1A`, color: tint }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-2xl font-bold text-[#16151F]">{value}</div>
      {share && <ShareBar {...share} />}
      {subtitle && <div className="text-[11px] text-[#62607A]">{subtitle}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function DispatchViewPage() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [leads, setLeads] = useState<DispatchLead[]>([]);
  const [agents, setAgents] = useState<DispatchAgent[]>([]);
  const [territories, setTerritories] = useState<TerritoryApiItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [layers, setLayers] = useState<Record<Layer, boolean>>({ leads: true, agents: true, density: false, regions: true });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [stageFilter, setStageFilter] = useState<Record<DispatchStage, boolean>>({
    unassigned: true,
    awaiting_verification: true,
    assigned: true,
    in_progress: true,
    completed: true,
  });
  const [panel, setPanel] = useState<"agents" | "queue">("agents");
  const [selection, setSelection] = useState<Selection>(null);
  const [fitKey, setFitKey] = useState(0);

  /** `quiet` refreshes keep the current map view and don't show the loading state. */
  const load = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [overview, regions] = await Promise.all([fetchDispatchOverview(token), fetchTerritories(token)]);
      setLeads(overview.leads);
      setAgents(overview.agents);
      setGeneratedAt(overview.generated_at);
      setTerritories(regions);
      setNow(Date.now());
      if (!quiet) setFitKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not load dispatch data."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep agent positions current without moving the map.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void load(true), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, load]);

  // ---------------------------------------------------------------- derived data
  const usingExample = !loading && !error && leads.length === 0;
  const allLeads = useMemo(() => (usingExample ? [EXAMPLE_LEAD] : leads), [usingExample, leads]);
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const regionByAgent = useMemo(() => new Map(territories.map((t) => [t.agent_id, t])), [territories]);

  const regionAt = useCallback(
    (lat: number, lng: number) => territories.find((t) => isPointInPolygon(lat, lng, t.points)) || null,
    [territories]
  );
  const leadRegion = useMemo(() => {
    const map = new Map<string, TerritoryApiItem | null>();
    for (const lead of allLeads) map.set(lead.id, regionAt(lead.latitude, lead.longitude));
    return map;
  }, [allLeads, regionAt]);

  const visibleLeads = useMemo(() => allLeads.filter((l) => stageFilter[l.stage]), [allLeads, stageFilter]);

  const stageCounts = useMemo(() => {
    const counts = Object.fromEntries(STAGES.map((s) => [s.key, 0])) as Record<DispatchStage, number>;
    for (const lead of allLeads) counts[lead.stage] += 1;
    return counts;
  }, [allLeads]);
  const total = allLeads.length;
  const waitingCount = stageCounts.unassigned + stageCounts.awaiting_verification;
  const activeCount = stageCounts.assigned + stageCounts.in_progress;

  const workload = useMemo(() => {
    const rows = agents.map((agent) => {
      const own = allLeads.filter((l) => l.assigned_agent_id === agent.id);
      const byStage = Object.fromEntries(STAGES.map((s) => [s.key, 0])) as Record<DispatchStage, number>;
      own.forEach((l) => (byStage[l.stage] += 1));
      return { agent, total: own.length, active: byStage.assigned + byStage.in_progress, byStage };
    });
    const working = rows.filter((r) => r.agent.status !== "inactive");
    const mean = working.length ? working.reduce((s, r) => s + r.active, 0) / working.length : 0;
    const sd = working.length ? Math.sqrt(working.reduce((s, r) => s + (r.active - mean) ** 2, 0) / working.length) : 0;
    // 100 = everyone holds the same number of active leads; lower = more uneven.
    const balance = working.length >= 2 && mean > 0 ? Math.round(100 * (1 - Math.min(1, sd / mean))) : null;
    return { rows: rows.sort((a, b) => b.active - a.active || b.total - a.total), mean, balance };
  }, [agents, allLeads]);

  const queue = useMemo(
    () =>
      allLeads
        .filter((l) => l.stage === "unassigned" || l.stage === "awaiting_verification")
        .sort((a, b) => (b.waiting_hours ?? 0) - (a.waiting_hours ?? 0)),
    [allLeads]
  );

  const hexes = useMemo(() => hexBin(visibleLeads, HEX_SIZE_M), [visibleLeads]);

  const areaRows: StackedRow[] = useMemo(() => {
    const groups = new Map<string, { label: string; sublabel?: string; leads: DispatchLead[] }>();
    for (const lead of allLeads) {
      const region = leadRegion.get(lead.id);
      const key = region ? region.id : `city:${(lead.city || "Unknown").split(",")[0].trim().toLowerCase()}`;
      const group = groups.get(key) || {
        label: region ? region.name : (lead.city || "Unknown").split(",")[0].trim(),
        sublabel: region ? region.agent_name || undefined : "no region",
        leads: [],
      };
      group.leads.push(lead);
      groups.set(key, group);
    }
    return Array.from(groups.entries())
      .map(([key, g]) => ({
        key,
        label: g.label,
        sublabel: g.sublabel,
        segments: STAGES.map((s) => ({ key: s.key, label: s.label, color: s.color, value: g.leads.filter((l) => l.stage === s.key).length })),
      }))
      .sort((a, b) => b.segments.reduce((s, x) => s + x.value, 0) - a.segments.reduce((s, x) => s + x.value, 0))
      .slice(0, 8);
  }, [allLeads, leadRegion]);

  const insights = useMemo(() => {
    const list: { tone: "warn" | "info" | "good"; title: string; text: string }[] = [];
    if (allLeads.length === 0) return list;
    if (hexes.length) {
      const busiest = hexes[0];
      const sample = allLeads.find((l) => l.id === busiest.itemIds[0]);
      list.push({
        tone: "info",
        title: "Highest demand",
        text: `${busiest.count} lead${busiest.count === 1 ? "" : "s"} within about 1 km${sample ? ` around ${sample.address.split(",").slice(-1)[0].trim() || sample.city}` : ""}.`,
      });
    }
    const unassigned = queue.filter((l) => l.stage === "unassigned");
    if (unassigned.length) {
      list.push({
        tone: "warn",
        title: "Waiting for an owner",
        text: `${unassigned.length} lead${unassigned.length === 1 ? "" : "s"}; the oldest has waited ${formatWait(unassigned[0].waiting_hours)}.`,
      });
    }
    const pending = queue.length - unassigned.length;
    if (pending) list.push({ tone: "info", title: "Needs verification", text: `${pending} agent-created lead${pending === 1 ? "" : "s"} in Lead Approvals.` });
    const outside = allLeads.filter((l) => !leadRegion.get(l.id)).length;
    if (territories.length === 0) list.push({ tone: "warn", title: "No regions", text: "No agent regions are set up, so leads can't be matched to areas." });
    else if (outside) list.push({ tone: "warn", title: "Outside every region", text: `${outside} lead${outside === 1 ? "" : "s"} are not covered by any agent's region.` });
    const outsideOwner = allLeads.filter((l) => {
      if (!l.assigned_agent_id) return false;
      const ownRegion = regionByAgent.get(l.assigned_agent_id);
      return ownRegion ? !isPointInPolygon(l.latitude, l.longitude, ownRegion.points) : false;
    });
    if (outsideOwner.length) {
      list.push({
        tone: "warn",
        title: "Outside owner's region",
        text: `${outsideOwner.length} lead${outsideOwner.length === 1 ? " is" : "s are"} assigned to an agent whose region doesn't contain ${outsideOwner.length === 1 ? "it" : "them"}.`,
      });
    }
    const busy = workload.rows[0];
    if (busy && workload.mean > 0 && busy.active >= 2 && busy.active / workload.mean >= 1.5) {
      list.push({ tone: "warn", title: "Overloaded agent", text: `${busy.agent.name} holds ${busy.active} active leads, ${(busy.active / workload.mean).toFixed(1)}× the team average.` });
    }
    const idle = workload.rows.filter((r) => r.agent.status === "active" && r.active === 0);
    if (idle.length && activeCount + stageCounts.unassigned > 0) {
      list.push({ tone: "info", title: "Free capacity", text: `${idle.map((r) => r.agent.name).slice(0, 3).join(", ")}${idle.length > 3 ? "…" : ""} ${idle.length === 1 ? "has" : "have"} no open leads.` });
    }
    if (workload.balance != null && workload.balance >= 80) list.push({ tone: "good", title: "Balanced", text: "Open leads are spread evenly across agents." });
    return list;
  }, [allLeads, hexes, queue, leadRegion, regionByAgent, territories.length, workload, activeCount, stageCounts.unassigned]);

  // ---------------------------------------------------------------- map inputs
  const selectedAgentId = selection?.kind === "agent" ? selection.id : null;
  const selectedLeadId = selection?.kind === "lead" ? selection.id : null;
  const hexLeadIds = selection?.kind === "hex" ? new Set(selection.cell.itemIds) : null;

  const mapPoints: DispatchMapPoint[] = useMemo(
    () =>
      visibleLeads.map((lead) => {
        const owner = lead.assigned_agent_id ? agentById.get(lead.assigned_agent_id) : null;
        return {
          id: lead.id,
          latitude: lead.latitude,
          longitude: lead.longitude,
          color: STAGE[lead.stage].color,
          label: `${lead.company || lead.customer_name} · ${STAGE[lead.stage].label}${owner ? ` · ${owner.name}` : ""}`,
          faded:
            (selectedAgentId != null && lead.assigned_agent_id !== selectedAgentId) || (hexLeadIds != null && !hexLeadIds.has(lead.id)),
          selected: lead.id === selectedLeadId,
          dashed: lead.is_example,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleLeads, agentById, selectedAgentId, selectedLeadId, selection]
  );
  const mapRegions: DispatchMapRegion[] = useMemo(
    () =>
      territories.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        points: t.points,
        highlighted: selectedAgentId === t.agent_id,
        faded: selectedAgentId != null && selectedAgentId !== t.agent_id,
      })),
    [territories, selectedAgentId]
  );
  const mapAgents: DispatchMapAgent[] = useMemo(() => {
    const located = agents.filter((a) => a.latitude != null && a.longitude != null);
    // Agents reporting the same spot would hide each other: fan them out slightly (~60 m).
    const groups = new Map<string, DispatchAgent[]>();
    for (const a of located) {
      const key = `${a.latitude!.toFixed(4)},${a.longitude!.toFixed(4)}`;
      groups.set(key, [...(groups.get(key) || []), a]);
    }
    const out: DispatchMapAgent[] = [];
    for (const group of Array.from(groups.values())) {
      group.forEach((a, i) => {
        const angle = (2 * Math.PI * i) / group.length;
        const spread = group.length > 1 ? 0.0006 : 0;
        const fresh = freshness(a.last_location_update, now);
        out.push({
          id: a.id,
          latitude: a.latitude! + spread * Math.sin(angle),
          longitude: a.longitude! + spread * Math.cos(angle),
          name: a.name,
          initials: initials(a.name),
          color: regionByAgent.get(a.id)?.color || "#393185",
          freshness: fresh.level,
          ageLabel: fresh.label,
          highlighted: a.id === selectedAgentId,
          faded: selectedAgentId != null && a.id !== selectedAgentId,
        });
      });
    }
    return out;
  }, [agents, regionByAgent, selectedAgentId, now]);

  // When an agent is selected, connect them to each of their open leads.
  const mapLinks: DispatchMapLink[] = useMemo(() => {
    if (!selectedAgentId) return [];
    const pin = mapAgents.find((a) => a.id === selectedAgentId);
    if (!pin) return [];
    return visibleLeads
      .filter((l) => l.assigned_agent_id === selectedAgentId && l.stage !== "completed")
      .map((l) => ({
        id: l.id,
        from: [pin.latitude, pin.longitude] as [number, number],
        to: [l.latitude, l.longitude] as [number, number],
        color: pin.color,
        label: `${l.company || l.customer_name}: ${kmBetween([pin.latitude, pin.longitude], [l.latitude, l.longitude]).toFixed(1)} km straight-line`,
      }));
  }, [selectedAgentId, mapAgents, visibleLeads]);

  const selectedLead = selectedLeadId ? allLeads.find((l) => l.id === selectedLeadId) || null : null;
  const selectedAgentRow = selectedAgentId ? workload.rows.find((r) => r.agent.id === selectedAgentId) || null : null;
  const maxAgentTotal = Math.max(1, ...workload.rows.map((r) => r.total));

  const agentChartRows: StackedRow[] = workload.rows.map((r) => ({
    key: r.agent.id,
    label: r.agent.name,
    sublabel: r.agent.territory_name || "no region",
    highlighted: r.agent.id === selectedAgentId,
    segments: STAGES.filter((s) => s.key !== "unassigned" && s.key !== "awaiting_verification").map((s) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      value: r.byStage[s.key],
    })),
  }));

  const balanceTone = workload.balance == null ? "#9A98AE" : workload.balance >= 80 ? "#393185" : workload.balance >= 50 ? "#C48A3F" : "#B04A5A";

  // ---------------------------------------------------------------- render
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#00843E] text-white">
            <Hexagon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#16151F]">Dispatch view</h1>
            <p className="text-sm text-[#62607A]">Where leads are, who owns them, and whether work is spread evenly.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E3E2EE] bg-white px-3 py-1.5 text-[11px] text-[#62607A]">
            <span className={`h-2 w-2 rounded-full ${error ? "bg-rose-500" : "bg-emerald-500"}`} />
            Read-only{generatedAt ? ` · updated ${new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E3E2EE] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#16151F]">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-[#393185]" />
            Auto-refresh every minute
          </label>
          <button
            onClick={() => void load(false)}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#E3E2EE] bg-white px-4 py-2.5 text-xs font-semibold text-[#16151F] shadow-xs hover:bg-[#F4F4F9]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {usingExample && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <Info className="h-4 w-4 shrink-0" /> There are no leads yet, so one example lead (dashed outline) illustrates the view. It isn&apos;t saved anywhere.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard icon={Hexagon} tint="#393185" title="Total leads" value={total} subtitle={`${agents.length} agent${agents.length === 1 ? "" : "s"} · ${territories.length} region${territories.length === 1 ? "" : "s"}`} />
        <KpiCard
          icon={Inbox}
          tint="#B04A5A"
          title="Waiting for allocation"
          value={waitingCount}
          share={{ value: waitingCount, total, color: "#B04A5A" }}
          subtitle={`${stageCounts.unassigned} unassigned · ${stageCounts.awaiting_verification} to verify`}
        />
        <KpiCard
          icon={Activity}
          tint="#4A6B82"
          title="Active with agents"
          value={activeCount}
          share={{ value: activeCount, total, color: "#4A6B82" }}
          subtitle={`${stageCounts.assigned} assigned · ${stageCounts.in_progress} in progress`}
        />
        <KpiCard
          icon={CheckCircle2}
          tint="#393185"
          title="Completed"
          value={stageCounts.completed}
          share={{ value: stageCounts.completed, total, color: "#393185" }}
          subtitle={total ? `${Math.round((stageCounts.completed / total) * 100)}% of all leads` : "—"}
        />
        <KpiCard
          icon={Scale}
          tint={balanceTone}
          title="Workload balance"
          value={<span style={{ color: balanceTone }}>{workload.balance == null ? "—" : `${workload.balance}/100`}</span>}
          share={workload.balance == null ? undefined : { value: workload.balance, total: 100, color: balanceTone }}
          subtitle={
            workload.balance == null
              ? "Needs 2+ agents with open leads"
              : workload.balance >= 80
              ? "Evenly spread"
              : workload.balance >= 50
              ? "Somewhat uneven"
              : "Very uneven"
          }
        />
      </div>

      {/* Console: map + side list */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Map card */}
        <div className={`${card} p-3 space-y-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-xl border border-[#E3E2EE] bg-[#F7F7FB] p-1 text-xs font-semibold">
              <Layers className="mx-1 h-4 w-4 text-[#62607A]" />
              {([
                ["leads", "Leads"],
                ["agents", "Agents"],
                ["density", "Density"],
                ["regions", "Regions"],
              ] as [Layer, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
                  className={`rounded-lg px-3 py-1.5 ${layers[key] ? "bg-white text-[#16151F] shadow-xs" : "text-[#62607A]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {STAGES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStageFilter((f) => ({ ...f, [s.key]: !f[s.key] }))}
                  title={stageFilter[s.key] ? "Hide on the map" : "Show on the map"}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    stageFilter[s.key] ? "border-[#E3E2EE] bg-white text-[#16151F]" : "border-dashed border-[#E3E2EE] bg-transparent text-[#9A98AE] line-through"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color, opacity: stageFilter[s.key] ? 1 : 0.35 }} />
                  {s.label} <span className="text-[#9A98AE]">{stageCounts[s.key]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative h-[600px]">
            <DispatchMap
              points={mapPoints}
              showPoints={layers.leads}
              hexes={hexes}
              showHexes={layers.density}
              regions={mapRegions}
              showRegions={layers.regions}
              agents={mapAgents}
              showAgents={layers.agents}
              links={layers.agents ? mapLinks : []}
              onPointClick={(id) => setSelection({ kind: "lead", id })}
              onAgentClick={(id) => setSelection({ kind: "agent", id })}
              onHexClick={(cell) => setSelection({ kind: "hex", cell })}
              fitKey={fitKey}
            />

            {layers.density && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-xl bg-white/95 px-3 py-2 text-[11px] text-[#62607A] shadow-sm">
                <div className="mb-1 font-semibold text-[#16151F]">Leads per ~1.2 km hexagon</div>
                <div className="flex items-center gap-1">
                  <span>fewer</span>
                  {["#F6EBDD", "#EFCFB3", "#E3A887", "#CF7B5C", "#B04A3A", "#7E2E22"].map((c) => (
                    <span key={c} className="h-2.5 w-5" style={{ background: c }} />
                  ))}
                  <span>more</span>
                </div>
              </div>
            )}

            {/* Floating detail card */}
            {selection && (
              <div className="absolute right-3 top-3 z-[1000] max-h-[calc(100%-24px)] w-[300px] overflow-y-auto rounded-2xl border border-[#E3E2EE] bg-white p-4 text-xs shadow-lg">
                <button
                  onClick={() => setSelection(null)}
                  aria-label="Close details"
                  className="absolute right-2.5 top-2.5 rounded-lg p-1 text-[#62607A] hover:bg-[#F7F7FB] hover:text-[#16151F]"
                >
                  <X className="h-4 w-4" />
                </button>

                {selectedAgentRow && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5 pr-6">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ background: regionByAgent.get(selectedAgentRow.agent.id)?.color || "#393185" }}
                      >
                        {initials(selectedAgentRow.agent.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-[#16151F]">{selectedAgentRow.agent.name}</div>
                        <div className="text-[#62607A]">
                          {selectedAgentRow.agent.agent_code || "—"} · <span className="capitalize">{selectedAgentRow.agent.status}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#F7F7FB] px-3 py-2 space-y-1">
                      <div>
                        Region: <strong className="text-[#16151F]">{selectedAgentRow.agent.territory_name || "none assigned"}</strong>
                      </div>
                      {(() => {
                        const a = selectedAgentRow.agent;
                        const fresh = freshness(a.last_location_update, now);
                        if (a.latitude == null || a.longitude == null) return <div className="text-[#62607A]">Location never reported</div>;
                        const open = allLeads.filter((l) => l.assigned_agent_id === a.id && l.stage !== "completed");
                        const dists = open.map((l) => kmBetween([a.latitude!, a.longitude!], [l.latitude, l.longitude]));
                        return (
                          <>
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ background: FRESH_DOT[fresh.level] }} />
                              <span className="text-[#16151F]">{fresh.label}</span>
                            </div>
                            <div className="font-mono text-[10px] text-[#62607A]">
                              {a.latitude.toFixed(5)}, {a.longitude.toFixed(5)}
                            </div>
                            {dists.length > 0 && (
                              <div className="text-[#62607A]">
                                Open leads are {Math.min(...dists).toFixed(1)}–{Math.max(...dists).toFixed(1)} km away (straight line)
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {STAGES.filter((s) => s.key !== "unassigned" && s.key !== "awaiting_verification").map((s) => (
                        <div key={s.key} className="rounded-xl border border-[#EDECF5] px-2.5 py-2">
                          <div className="text-[10px] text-[#62607A]">{s.label}</div>
                          <div className="text-lg font-bold" style={{ color: s.color }}>{selectedAgentRow.byStage[s.key]}</div>
                        </div>
                      ))}
                      <div className="rounded-xl border border-[#EDECF5] px-2.5 py-2">
                        <div className="text-[10px] text-[#62607A]">vs team average</div>
                        <div className="text-lg font-bold text-[#16151F]">{workload.mean > 0 ? `${(selectedAgentRow.active / workload.mean).toFixed(1)}×` : "—"}</div>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 font-semibold text-[#16151F]">Their leads ({selectedAgentRow.total})</div>
                      {allLeads
                        .filter((l) => l.assigned_agent_id === selectedAgentRow.agent.id)
                        .map((l) => (
                          <button key={l.id} onClick={() => setSelection({ kind: "lead", id: l.id })} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-[#F7F7FB]">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STAGE[l.stage].color }} />
                            <span className="flex-1 truncate text-[#16151F]">{l.company || l.customer_name}</span>
                            {l.next_visit_date && <span className="text-[10px] text-[#9A98AE]">{l.next_visit_date.slice(5)}</span>}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {selectedLead && (
                  <div className="space-y-2.5">
                    <div className="pr-6">
                      <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: STAGE[selectedLead.stage].color }}>
                        {STAGE[selectedLead.stage].label}
                      </span>
                      <div className="mt-1.5 text-sm font-bold text-[#16151F]">{selectedLead.company || selectedLead.customer_name}</div>
                      {selectedLead.company && <div className="text-[#62607A]">{selectedLead.customer_name}</div>}
                    </div>
                    <div className="flex items-start gap-1.5 text-[#16151F]">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B86F52]" /> {selectedLead.address}, {selectedLead.city}
                    </div>
                    <dl className="grid grid-cols-[80px_1fr] gap-y-1 text-[#62607A]">
                      <dt>Owner</dt>
                      <dd className="font-semibold text-[#16151F]">
                        {selectedLead.assigned_agent_id ? (
                          <button className="underline underline-offset-2" onClick={() => setSelection({ kind: "agent", id: selectedLead.assigned_agent_id! })}>
                            {agentById.get(selectedLead.assigned_agent_id)?.name || "Unknown agent"}
                          </button>
                        ) : (
                          "Not assigned"
                        )}
                      </dd>
                      <dt>Region</dt>
                      <dd className="text-[#16151F]">{leadRegion.get(selectedLead.id)?.name || "outside every region"}</dd>
                      <dt>Priority</dt>
                      <dd className="capitalize text-[#16151F]">{selectedLead.priority}</dd>
                      <dt>Source</dt>
                      <dd className="text-[#16151F]">{selectedLead.source === "agent" ? "Agent-created" : "Admin dispatch"}</dd>
                      {selectedLead.next_visit_date && (
                        <>
                          <dt>Next visit</dt>
                          <dd className="text-[#16151F]">{selectedLead.next_visit_date}</dd>
                        </>
                      )}
                      {selectedLead.waiting_hours != null && (
                        <>
                          <dt>Waiting</dt>
                          <dd className="text-[#16151F]">{formatWait(selectedLead.waiting_hours)}</dd>
                        </>
                      )}
                    </dl>
                    {(() => {
                      const region = leadRegion.get(selectedLead.id);
                      const ownerRegion = selectedLead.assigned_agent_id ? regionByAgent.get(selectedLead.assigned_agent_id) : undefined;
                      if (ownerRegion && !isPointInPolygon(selectedLead.latitude, selectedLead.longitude, ownerRegion.points)) {
                        return (
                          <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-amber-900">
                            Outside the owner&apos;s region ({ownerRegion.name}).
                          </div>
                        );
                      }
                      return region && selectedLead.assigned_agent_id && region.agent_id !== selectedLead.assigned_agent_id ? (
                        <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-amber-900">Owned by someone other than this region&apos;s agent.</div>
                      ) : null;
                    })()}
                    {selectedLead.is_example && <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-amber-900">Example only, not real data.</div>}
                  </div>
                )}

                {selection.kind === "hex" && (
                  <div className="space-y-2">
                    <div className="pr-6 text-sm font-bold text-[#16151F]">
                      {selection.cell.count} lead{selection.cell.count === 1 ? "" : "s"} in this area
                    </div>
                    {selection.cell.itemIds.map((id) => {
                      const l = allLeads.find((x) => x.id === id);
                      return l ? (
                        <button key={id} onClick={() => setSelection({ kind: "lead", id })} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-[#F7F7FB]">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STAGE[l.stage].color }} />
                          <span className="flex-1 truncate text-[#16151F]">{l.company || l.customer_name}</span>
                          <span className="text-[10px] text-[#9A98AE]">{STAGE[l.stage].label}</span>
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-[11px] text-[#9A98AE]">
            Click a lead, an agent pin or (in Density) a hexagon for details. Agent dot:{" "}
            <span className="font-semibold" style={{ color: FRESH_DOT.live }}>● live (≤5 min)</span>{" "}
            <span className="font-semibold" style={{ color: FRESH_DOT.recent }}>● within 1 h</span>{" "}
            <span className="font-semibold" style={{ color: FRESH_DOT.stale }}>● older</span>. Selecting an agent draws lines to their open leads.
          </p>
        </div>

        {/* Side list */}
        <div className={`${card} flex flex-col p-3 xl:h-[690px]`}>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#E3E2EE] bg-[#F7F7FB] p-1 text-xs font-semibold">
            <button onClick={() => setPanel("agents")} className={`rounded-lg py-2 ${panel === "agents" ? "bg-white text-[#16151F] shadow-xs" : "text-[#62607A]"}`}>
              Agents <span className="text-[#9A98AE]">{agents.length}</span>
            </button>
            <button onClick={() => setPanel("queue")} className={`rounded-lg py-2 ${panel === "queue" ? "bg-white text-[#16151F] shadow-xs" : "text-[#62607A]"}`}>
              Waiting <span className={queue.length ? "text-[#B04A5A]" : "text-[#9A98AE]"}>{queue.length}</span>
            </button>
          </div>

          <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
            {loading && (
              <p className="flex items-center gap-1.5 text-xs text-[#62607A]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </p>
            )}

            {panel === "agents" && !loading && (
              <>
                {workload.rows.length === 0 && <p className="text-xs text-[#62607A]">No agents yet.</p>}
                {workload.rows.map((row) => {
                  const selected = selectedAgentId === row.agent.id;
                  const region = regionByAgent.get(row.agent.id);
                  return (
                    <button
                      key={row.agent.id}
                      onClick={() => setSelection(selected ? null : { kind: "agent", id: row.agent.id })}
                      className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-[#393185] bg-[#F7F7FB]" : "border-[#EDECF5] hover:border-[#CFCDE2] hover:bg-[#FAFAFD]"}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: region?.color || "#7B7991" }}>
                          {initials(row.agent.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-bold text-[#16151F]">{row.agent.name}</span>
                            <span className="shrink-0 rounded-full bg-[#EEF3F7] px-2 py-0.5 text-[11px] font-bold text-[#4A6B82]">{row.active} open</span>
                          </div>
                          <div className="truncate text-[11px] text-[#62607A]">
                            {row.agent.territory_name || "No region"} · {row.total} total
                            {row.agent.status !== "active" ? ` · ${row.agent.status}` : ""}
                          </div>
                          {(() => {
                            const fresh = freshness(row.agent.last_location_update, now);
                            return (
                              <div className="flex items-center gap-1 text-[10px] text-[#9A98AE]">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: FRESH_DOT[fresh.level] }} />
                                {fresh.label}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-[#F1F0F8]" aria-hidden="true">
                        {(["assigned", "in_progress", "completed"] as DispatchStage[]).map((k) => (
                          <span key={k} style={{ width: `${(row.byStage[k] / maxAgentTotal) * 100}%`, background: STAGE[k].color }} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {panel === "queue" && !loading && (
              <>
                {queue.length === 0 && (
                  <div className="rounded-xl bg-[#F1F0F8] px-3 py-3 text-xs text-[#393185]">
                    <CheckCircle2 className="mb-1 h-4 w-4" />
                    Nothing is waiting. Every lead has an owner.
                  </div>
                )}
                {queue.map((lead) => {
                  const region = leadRegion.get(lead.id);
                  const owner = region ? agentById.get(region.agent_id) : null;
                  return (
                    <button
                      key={lead.id}
                      onClick={() => setSelection({ kind: "lead", id: lead.id })}
                      className={`w-full rounded-xl border p-3 text-left text-xs ${selectedLeadId === lead.id ? "border-[#393185] bg-[#F7F7FB]" : "border-[#EDECF5] hover:border-[#CFCDE2]"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-bold text-[#16151F]">{lead.company || lead.customer_name}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[#62607A]">
                          <Clock3 className="h-3 w-3" /> {formatWait(lead.waiting_hours)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-semibold" style={{ color: STAGE[lead.stage].color }}>{STAGE[lead.stage].label}</div>
                      <div className="text-[11px] text-[#62607A]">
                        {region ? `In ${region.name} → ${owner?.name || region.agent_name || "its agent"}` : "No region covers this location"}
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Analytics */}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <div className={`${card} p-5 space-y-4`}>
          <div>
            <h2 className="text-sm font-bold text-[#16151F]">Lead status</h2>
            <p className="text-[11px] text-[#62607A]">Share of all leads by dispatch stage. Click a stage to show only it on the map.</p>
          </div>
          <DonutChart
            slices={STAGES.map((s) => ({ key: s.key, label: s.label, value: stageCounts[s.key], color: s.color }))}
            onSliceClick={(key) =>
              setStageFilter(Object.fromEntries(STAGES.map((s) => [s.key, s.key === key])) as Record<DispatchStage, boolean>)
            }
          />
          {!Object.values(stageFilter).every(Boolean) && (
            <button
              onClick={() => setStageFilter(Object.fromEntries(STAGES.map((s) => [s.key, true])) as Record<DispatchStage, boolean>)}
              className="text-[11px] font-semibold text-[#393185] underline underline-offset-2"
            >
              Show all stages on the map
            </button>
          )}
        </div>

        <div className={`${card} p-5 space-y-4`}>
          <div>
            <h2 className="text-sm font-bold text-[#16151F]">Leads per agent</h2>
            <p className="text-[11px] text-[#62607A]">Assigned, in progress and completed, stacked. Click an agent to show their leads.</p>
          </div>
          <StackedBarChart
            rows={agentChartRows}
            average={workload.mean > 0 ? workload.mean : null}
            averageLabel="Team average of open leads"
            onRowClick={(id) => setSelection(selectedAgentId === id ? null : { kind: "agent", id })}
            emptyText="No agents yet."
          />
        </div>

        <div className={`${card} p-5 space-y-4 lg:col-span-2 2xl:col-span-1`}>
          <div>
            <h2 className="text-sm font-bold text-[#16151F]">Leads by area</h2>
            <p className="text-[11px] text-[#62607A]">Grouped by agent region; leads outside every region are grouped by city.</p>
          </div>
          <StackedBarChart rows={areaRows} emptyText="No leads yet." />
        </div>
      </div>

      {/* Insights */}
      <div className={`${card} p-5`}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#16151F]">
          <Lightbulb className="h-4 w-4 text-[#C48A3F]" /> Operational insights
        </h2>
        {insights.length === 0 ? (
          <p className="text-xs text-[#62607A]">Insights appear once there are leads.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {insights.map((item, i) => {
              const Icon = item.tone === "warn" ? AlertTriangle : item.tone === "good" ? CheckCircle2 : Info;
              const style =
                item.tone === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : item.tone === "good"
                  ? "border-[#D7D4EE] bg-[#F1F0F8] text-[#393185]"
                  : "border-[#E3E2EE] bg-[#F7F7FB] text-[#16151F]";
              return (
                <div key={i} className={`rounded-xl border p-3 text-xs ${style}`}>
                  <div className="mb-1 flex items-center gap-1.5 font-bold">
                    <Icon className="h-4 w-4" /> {item.title}
                  </div>
                  {item.text}
                </div>
              );
            })}
          </div>
        )}
        {usingExample && <p className="mt-2 text-[11px] text-[#9A98AE]">Based on the example lead.</p>}
      </div>
    </div>
  );
}
