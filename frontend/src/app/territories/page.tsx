"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Layers, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import TerritoryMap, { MapTerritory } from "@/components/TerritoryMap";
import RegionEditor, {
  PickTarget,
  RegionDraft,
  applyMapClick,
  emptyRegion,
  regionBoundary,
  regionFromTerritory,
  regionMarkers,
  regionOutline,
  suggestedRegionName,
} from "@/components/RegionEditor";
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
import { describeTerritory } from "@/lib/territoryText";

const COLORS = ["#393185", "#B86F52", "#C48A3F", "#4A6B82", "#7A5A85", "#5C7C64", "#B04A5A", "#3E7C8C"];

type Mode = { kind: "view" } | { kind: "create" } | { kind: "edit"; id: string; changeArea: boolean };

const inputClass =
  "w-full text-sm rounded-xl border border-[#E3E2EE] bg-[#FAFAFD] px-3 py-2 text-[#16151F] focus:outline-none focus:border-[#393185]";

export default function TerritoriesPage() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [territories, setTerritories] = useState<TerritoryApiItem[]>([]);
  const [agents, setAgents] = useState<AgentApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [region, setRegion] = useState<RegionDraft>(emptyRegion());
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [t, a] = await Promise.all([fetchTerritories(token), fetchAgents(token, { limit: 100 })]);
      setTerritories(t);
      setAgents(a.items);
      setFitKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not load regions."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const editingId = mode.kind === "edit" ? mode.id : null;
  const defining = mode.kind === "create" || (mode.kind === "edit" && mode.changeArea);
  const regionByAgent = useMemo(() => new Map(territories.map((t) => [t.agent_id, t])), [territories]);

  // Suggest a name like "Kalyan – Thane" until the admin types their own.
  useEffect(() => {
    if (!defining || nameTouched) return;
    const suggestion = suggestedRegionName(region);
    if (suggestion) setName(suggestion);
  }, [defining, nameTouched, region]);

  const preview = defining ? regionOutline(region) : [];
  const previewKey = preview.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (defining && region.kind !== "drawn" && preview.length) setFitKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  const mapTerritories: MapTerritory[] = territories
    .filter((t) => !(defining && t.id === editingId))
    .map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      subtitle: [t.agent_name, describeTerritory(t)].filter(Boolean).join(" · ") || null,
      points: t.points,
    }));

  const resetForm = () => {
    setMode({ kind: "view" });
    setName("");
    setNameTouched(false);
    setAgentId("");
    setRegion(emptyRegion());
    setPickTarget(null);
    setError(null);
  };

  const startCreate = () => {
    resetForm();
    setColor(COLORS[territories.length % COLORS.length]);
    setMode({ kind: "create" });
    setNotice(null);
  };

  const startEdit = (t: TerritoryApiItem) => {
    resetForm();
    setMode({ kind: "edit", id: t.id, changeArea: false });
    setName(t.name);
    setNameTouched(true);
    setAgentId(t.agent_id);
    setColor(t.color);
    setRegion(regionFromTerritory(t));
    setSelectedId(t.id);
    setNotice(null);
  };

  const save = async () => {
    setError(null);
    if (!agentId) return setError("Choose the agent for this region.");
    if (!name.trim()) return setError("Give the region a name.");
    let boundary = {};
    if (defining) {
      const result = regionBoundary(region);
      if ("error" in result) return setError(result.error);
      boundary = result;
    }
    setSaving(true);
    try {
      if (mode.kind === "create") {
        const created = await createTerritory({ name: name.trim(), agent_id: agentId, color, ...boundary }, token);
        setNotice(`Region "${created.name}" assigned to ${created.agent_name || "the agent"}.`);
      } else if (mode.kind === "edit") {
        const updated = await updateTerritory(mode.id, { name: name.trim(), agent_id: agentId, color, ...boundary }, token);
        setNotice(`Region "${updated.name}" updated.`);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save the region."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: TerritoryApiItem) => {
    if (!window.confirm(`Remove region "${t.name}"? ${t.agent_name || "The agent"} won't be able to create leads until they get a new one.`)) return;
    try {
      await deleteTerritory(t.id, token);
      setNotice(`Region "${t.name}" removed.`);
      if (editingId === t.id) resetForm();
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not remove the region."));
    }
  };

  const agentsWithout = agents.filter((a) => a.status === "active" && !regionByAgent.has(a.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#16151F] flex items-center gap-2">
            <Layers className="h-6 w-6" /> Agent regions
          </h1>
          <p className="text-sm text-[#62607A] mt-1">
            Each agent gets one region, and regions can&apos;t overlap. Agents create leads only inside their region, and new
            dispatches go to the agent whose region contains the address.
          </p>
        </div>
        {mode.kind === "view" && (
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#393185] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#006F34]"
          >
            <Plus className="h-4 w-4" /> Assign a region
          </button>
        )}
      </div>

      {notice && <div className="rounded-xl border border-[#D7D4EE] bg-[#F1F0F8] px-3.5 py-2.5 text-xs text-[#393185]">{notice}</div>}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <TerritoryMap
          territories={mapTerritories}
          draftPoints={preview}
          draftColor={color}
          showDraftCorners={region.kind === "drawn"}
          onMapClick={
            defining && (region.kind === "drawn" || pickTarget)
              ? (lat, lng) => {
                  void applyMapClick(region, pickTarget, lat, lng, setRegion);
                  setPickTarget(null);
                }
              : undefined
          }
          markers={defining ? regionMarkers(region) : []}
          highlightId={selectedId}
          onTerritoryClick={(id) => setSelectedId(id)}
          fitKey={fitKey}
          heightClass="h-[560px]"
        />

        <div className="space-y-4">
          {mode.kind !== "view" && (
            <div className="rounded-2xl border border-[#E3E2EE] bg-white p-4 space-y-3">
              <h2 className="text-sm font-bold text-[#16151F]">{mode.kind === "create" ? "Assign a region" : "Edit region"}</h2>
              <div>
                <label className="block text-xs font-semibold text-[#16151F] mb-1">Agent *</label>
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={inputClass}>
                  <option value="">Choose the agent…</option>
                  {agents.map((a) => {
                    const existing = regionByAgent.get(a.id);
                    const taken = Boolean(existing && existing.id !== editingId);
                    return (
                      <option key={a.id} value={a.id} disabled={taken}>
                        {a.name} ({a.agent_code || a.id.slice(0, 8)}){taken ? ` · has "${existing!.name}"` : ""}
                        {a.status !== "active" ? ` · ${a.status}` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              {defining ? (
                <RegionEditor value={region} onChange={setRegion} pickTarget={pickTarget} onPickTargetChange={setPickTarget} />
              ) : (
                <div className="rounded-xl bg-[#F7F7FB] px-3 py-2 text-xs text-[#16151F]">
                  {describeTerritory(territories.find((t) => t.id === editingId)!) || "Drawn on the map"}
                  <button
                    type="button"
                    onClick={() => mode.kind === "edit" && setMode({ ...mode, changeArea: true })}
                    className="ml-2 inline-flex items-center gap-1 font-semibold text-[#393185] underline underline-offset-2"
                  >
                    <Pencil className="h-3 w-3" /> Change the area
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#16151F] mb-1">Region name *</label>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(true);
                  }}
                  maxLength={120}
                  className={inputClass}
                  placeholder="e.g. Kalyan – Thane"
                />
              </div>
              <div>
                <span className="block text-xs font-semibold text-[#16151F] mb-1">Colour</span>
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Colour ${c}`}
                      onClick={() => setColor(c)}
                      className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-[#16151F]" : "border-white"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={resetForm} className="rounded-xl px-3 py-2 text-xs font-semibold text-[#62607A]">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#393185] px-4 py-2 text-xs font-bold text-white hover:bg-[#006F34] disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[#E3E2EE] bg-white p-4 space-y-3">
            <h2 className="text-sm font-bold text-[#16151F]">
              {territories.length} region{territories.length === 1 ? "" : "s"}
            </h2>
            {loading && (
              <p className="flex items-center gap-1.5 text-xs text-[#62607A]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </p>
            )}
            {!loading && territories.length === 0 && (
              <p className="text-xs text-[#62607A]">No regions yet. Click &quot;Assign a region&quot;.</p>
            )}
            <ul className="space-y-2">
              {territories.map((t) => (
                <li
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`rounded-xl border p-3 text-xs cursor-pointer ${
                    selectedId === t.id ? "border-[#393185] bg-[#F7F7FB]" : "border-[#EDECF5] bg-[#FAFAFD]"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#16151F] truncate">{t.name}</div>
                      <div className="text-[#62607A]">
                        {t.agent_name || "Unknown agent"}
                        {t.agent_code ? ` · ${t.agent_code}` : ""}
                      </div>
                      {describeTerritory(t) && <div className="text-[11px] text-[#16151F]">{describeTerritory(t)}</div>}
                      <div className="text-[11px] text-[#9A98AE]">
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
                          className="rounded-lg border border-[#E3E2EE] bg-white p-1.5 text-[#16151F] hover:bg-[#F7F7FB]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${t.name}`}
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
                No region yet: {agentsWithout.map((a) => a.name).join(", ")}. They can&apos;t create leads until they get one.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
