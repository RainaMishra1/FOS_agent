"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Layers, Loader2, Pencil, Plus, Save, Trash2, Undo2, X } from "lucide-react";
import TerritoryMap, { MapTerritory } from "@/components/TerritoryMap";
import { useAuth } from "@/context/AuthContext";
import {
  AgentApiItem,
  TerritoryApiItem,
  apiErrorMessage,
  createTerritory,
  deleteTerritory,
  fetchAgents,
  fetchTerritories,
  updateTerritory,
} from "@/lib/api";

const COLORS = ["#2E5A44", "#B86F52", "#C48A3F", "#4A6B82", "#7A5A85", "#5C7C64", "#B04A5A", "#3E7C8C"];

type Mode = { kind: "view" } | { kind: "create" } | { kind: "edit"; id: string; redraw: boolean };

const inputClass =
  "w-full text-sm rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3 py-2 text-[#1A201C] focus:outline-none focus:border-[#2E5A44]";

export default function TerritoriesPage() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [territories, setTerritories] = useState<TerritoryApiItem[]>([]);
  const [agents, setAgents] = useState<AgentApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [draft, setDraft] = useState<number[][]>([]);
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [t, a] = await Promise.all([fetchTerritories(token), fetchAgents(token, { limit: 100 })]);
      setTerritories(t);
      setAgents(a.items);
      setFitKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not load territories."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const editingId = mode.kind === "edit" ? mode.id : null;
  const isDrawing = mode.kind === "create" || (mode.kind === "edit" && mode.redraw);

  const mapTerritories: MapTerritory[] = territories
    .filter((t) => !(isDrawing && t.id === editingId))
    .map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      subtitle: t.agent_name ? `${t.agent_name}${t.agent_code ? ` (${t.agent_code})` : ""}` : null,
      points: t.points,
    }));

  const resetForm = () => {
    setMode({ kind: "view" });
    setDraft([]);
    setName("");
    setAgentId("");
    setColor(COLORS[territories.length % COLORS.length]);
    setError(null);
  };

  const startCreate = () => {
    resetForm();
    setColor(COLORS[territories.length % COLORS.length]);
    setMode({ kind: "create" });
    setNotice(null);
  };

  const startEdit = (t: TerritoryApiItem) => {
    setMode({ kind: "edit", id: t.id, redraw: false });
    setName(t.name);
    setAgentId(t.agent_id);
    setColor(t.color);
    setDraft([]);
    setSelectedId(t.id);
    setNotice(null);
    setError(null);
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Give the territory a name.");
    if (!agentId) return setError("Choose the agent who owns this territory.");
    if (isDrawing && draft.length < 3) return setError("Click at least 3 corners on the map.");
    setSaving(true);
    try {
      if (mode.kind === "create") {
        const created = await createTerritory({ name: name.trim(), agent_id: agentId, color, points: draft }, token);
        setNotice(`Territory "${created.name}" saved for ${created.agent_name || "the agent"}.`);
      } else if (mode.kind === "edit") {
        const updated = await updateTerritory(
          mode.id,
          { name: name.trim(), agent_id: agentId, color, ...(mode.redraw ? { points: draft } : {}) },
          token
        );
        setNotice(`Territory "${updated.name}" updated.`);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save the territory."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: TerritoryApiItem) => {
    if (!window.confirm(`Delete territory "${t.name}"? ${t.agent_name || "The agent"} will no longer be able to create leads there.`)) return;
    try {
      await deleteTerritory(t.id, token);
      setNotice(`Territory "${t.name}" deleted.`);
      if (editingId === t.id) resetForm();
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not delete the territory."));
    }
  };

  const territoriesByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    territories.forEach((t) => counts.set(t.agent_id, (counts.get(t.agent_id) || 0) + 1));
    return counts;
  }, [territories]);
  const agentsWithout = agents.filter((a) => a.status === "active" && !territoriesByAgent.has(a.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A201C] flex items-center gap-2">
            <Layers className="h-6 w-6" /> Territories
          </h1>
          <p className="text-sm text-[#756F66] mt-1">
            Draw each agent&apos;s area on the map. Agents can only create leads inside their own territory, and new
            dispatches are suggested to the agent whose territory contains the address.
          </p>
        </div>
        {mode.kind === "view" && (
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#2E5A44] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#234837]"
          >
            <Plus className="h-4 w-4" /> New territory
          </button>
        )}
      </div>

      {notice && (
        <div className="rounded-xl border border-[#CDE1D2] bg-[#EAF2EC] px-3.5 py-2.5 text-xs text-[#1E3F35]">{notice}</div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-2">
          {isDrawing && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-semibold">Drawing:</span>
              <span>click the map to add corners ({draft.length} so far). The shape closes automatically.</span>
              <button
                type="button"
                onClick={() => setDraft((d) => d.slice(0, -1))}
                disabled={draft.length === 0}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 font-semibold disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" /> Undo
              </button>
              <button
                type="button"
                onClick={() => setDraft([])}
                disabled={draft.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 font-semibold disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          )}
          <TerritoryMap
            territories={mapTerritories}
            draftPoints={draft}
            draftColor={color}
            onMapClick={isDrawing ? (lat, lng) => setDraft((d) => [...d, [lat, lng]]) : undefined}
            highlightId={selectedId}
            onTerritoryClick={(id) => setSelectedId(id)}
            fitKey={fitKey}
            heightClass="h-[520px]"
          />
        </div>

        <div className="space-y-4">
          {mode.kind !== "view" && (
            <div className="rounded-2xl border border-[#E6DFD3] bg-white p-4 space-y-3">
              <h2 className="text-sm font-bold text-[#1A201C]">
                {mode.kind === "create" ? "New territory" : "Edit territory"}
              </h2>
              <div>
                <label className="block text-xs font-semibold text-[#1A201C] mb-1">Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} placeholder="e.g. Kalyan West" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1A201C] mb-1">Agent *</label>
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={inputClass}>
                  <option value="">Choose the agent…</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.agent_code || a.id.slice(0, 8)}){a.status !== "active" ? ` · ${a.status}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="block text-xs font-semibold text-[#1A201C] mb-1">Colour</span>
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Colour ${c}`}
                      onClick={() => setColor(c)}
                      className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-[#1A201C]" : "border-white"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              {mode.kind === "edit" && !mode.redraw && (
                <button
                  type="button"
                  onClick={() => {
                    setMode({ ...mode, redraw: true });
                    setDraft([]);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2E5A44] underline underline-offset-2"
                >
                  <Pencil className="h-3.5 w-3.5" /> Redraw the boundary
                </button>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={resetForm} className="rounded-xl px-3 py-2 text-xs font-semibold text-[#756F66]">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#2E5A44] px-4 py-2 text-xs font-bold text-white hover:bg-[#234837] disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[#E6DFD3] bg-white p-4 space-y-3">
            <h2 className="text-sm font-bold text-[#1A201C]">
              {territories.length} territor{territories.length === 1 ? "y" : "ies"}
            </h2>
            {loading && (
              <p className="flex items-center gap-1.5 text-xs text-[#756F66]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </p>
            )}
            {!loading && territories.length === 0 && (
              <p className="text-xs text-[#756F66]">No territories yet. Click &quot;New territory&quot; and draw one on the map.</p>
            )}
            <ul className="space-y-2">
              {territories.map((t) => (
                <li
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`rounded-xl border p-3 text-xs cursor-pointer ${
                    selectedId === t.id ? "border-[#2E5A44] bg-[#F4FAF6]" : "border-[#EFE8DD] bg-[#FCFAF6]"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#1A201C] truncate">{t.name}</div>
                      <div className="text-[#756F66]">
                        {agentById.get(t.agent_id)?.name || t.agent_name || "Unknown agent"}
                        {t.agent_code ? ` · ${t.agent_code}` : ""}
                      </div>
                      <div className="text-[11px] text-[#A39E95]">
                        {t.area_sq_km != null ? `${t.area_sq_km.toFixed(2)} km²` : ""} · {t.lead_count} lead{t.lead_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    {mode.kind === "view" && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          aria-label={`Edit ${t.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(t);
                          }}
                          className="rounded-lg border border-[#E6DFD3] bg-white p-1.5 text-[#1A201C] hover:bg-[#FAF7F0]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${t.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void remove(t);
                          }}
                          className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {agentsWithout.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                No territory yet: {agentsWithout.map((a) => a.name).join(", ")}. They can&apos;t create leads until they have one.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
