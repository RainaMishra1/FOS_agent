"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Layers, Loader2, Save, Trash2, X } from "lucide-react";
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
import { TerritoryApiItem, apiErrorMessage, createTerritory, deleteTerritory, fetchTerritories, updateTerritory } from "@/lib/api";
import { describeTerritory } from "@/lib/territoryText";

const COLORS = ["#393185", "#B86F52", "#C48A3F", "#4A6B82", "#7A5A85", "#5C7C64", "#B04A5A", "#3E7C8C"];

interface AgentRegionModalProps {
  isOpen: boolean;
  agent: { id: string; name: string; agent_code?: string | null } | null;
  onClose: () => void;
  onSaved?: (message: string) => void;
}

/** Assign or change the one region of a single agent, from the Field Agents page. */
export default function AgentRegionModal({ isOpen, agent, onClose, onSaved }: AgentRegionModalProps) {
  const { session } = useAuth();
  const token = session?.access_token;

  const [territories, setTerritories] = useState<TerritoryApiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionDraft>(emptyRegion());
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [changingArea, setChangingArea] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fitKey, setFitKey] = useState(0);

  const existing = useMemo(() => territories.find((t) => t.agent_id === agent?.id) || null, [territories, agent?.id]);

  const load = useCallback(async () => {
    if (!isOpen || !agent || !token) return;
    setLoading(true);
    setError(null);
    try {
      const all = await fetchTerritories(token);
      setTerritories(all);
      const mine = all.find((t) => t.agent_id === agent.id) || null;
      setRegion(mine ? regionFromTerritory(mine) : emptyRegion());
      setName(mine?.name || "");
      setNameTouched(Boolean(mine));
      setChangingArea(!mine);
      setPickTarget(null);
      setFitKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not load regions."));
    } finally {
      setLoading(false);
    }
  }, [isOpen, agent, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!changingArea || nameTouched) return;
    const suggestion = suggestedRegionName(region);
    if (suggestion) setName(suggestion);
  }, [changingArea, nameTouched, region]);

  const preview = changingArea ? regionOutline(region) : [];
  const previewKey = preview.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (changingArea && region.kind !== "drawn" && preview.length) setFitKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  if (!isOpen || !agent) return null;

  const otherRegions: MapTerritory[] = territories
    .filter((t) => !(changingArea && t.agent_id === agent.id))
    .map((t) => ({
      id: t.id,
      name: t.name,
      color: t.agent_id === agent.id ? t.color : "#7B7991",
      subtitle: t.agent_name || null,
      points: t.points,
    }));
  const color = existing?.color || COLORS[territories.length % COLORS.length];

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Give the region a name.");
    let boundary = {};
    if (changingArea) {
      const result = regionBoundary(region);
      if ("error" in result) return setError(result.error);
      boundary = result;
    }
    setSaving(true);
    try {
      if (existing) {
        await updateTerritory(existing.id, { name: name.trim(), ...boundary }, token);
        onSaved?.(`${agent.name}'s region updated to "${name.trim()}".`);
      } else {
        await createTerritory({ name: name.trim(), agent_id: agent.id, color, ...boundary }, token);
        onSaved?.(`Region "${name.trim()}" assigned to ${agent.name}.`);
      }
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save the region."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!window.confirm(`Remove ${agent.name}'s region "${existing.name}"? They won't be able to create leads until they get a new one.`)) return;
    setSaving(true);
    try {
      await deleteTerritory(existing.id, token);
      onSaved?.(`${agent.name}'s region was removed.`);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not remove the region."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/40 px-3 py-6 sm:px-6 flex justify-center items-start">
      <div className="w-full max-w-5xl rounded-3xl border border-[#E3E2EE] bg-[#FAF8F5] p-5 sm:p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#16151F] flex items-center gap-2">
              <Layers className="h-5 w-5" /> Region for {agent.name}
              {agent.agent_code ? <span className="text-sm font-medium text-[#62607A]">({agent.agent_code})</span> : null}
            </h2>
            <p className="text-xs text-[#62607A] mt-0.5">
              One region per agent. Other agents&apos; regions are shown in grey; the new region can&apos;t overlap them.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-[#E3E2EE] bg-white p-2 text-[#62607A]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <TerritoryMap
            territories={otherRegions}
            draftPoints={preview}
            draftColor={color}
            showDraftCorners={region.kind === "drawn"}
            onMapClick={
              changingArea && (region.kind === "drawn" || pickTarget)
                ? (lat, lng) => {
                    void applyMapClick(region, pickTarget, lat, lng, setRegion);
                    setPickTarget(null);
                  }
                : undefined
            }
            markers={changingArea ? regionMarkers(region) : []}
            highlightId={!changingArea ? existing?.id || null : null}
            fitKey={fitKey}
            heightClass="h-[460px]"
          />

          <div className="space-y-3">
            {loading ? (
              <p className="flex items-center gap-1.5 text-xs text-[#62607A]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </p>
            ) : (
              <>
                {existing && !changingArea && (
                  <div className="rounded-xl border border-[#D7D4EE] bg-[#F7F7FB] p-3 text-xs text-[#393185] space-y-1">
                    <div className="font-bold">{existing.name}</div>
                    <div>{describeTerritory(existing) || "Drawn on the map"}</div>
                    <button
                      type="button"
                      onClick={() => setChangingArea(true)}
                      className="font-semibold underline underline-offset-2"
                    >
                      Change the area
                    </button>
                  </div>
                )}
                {changingArea && (
                  <RegionEditor
                    value={region}
                    onChange={setRegion}
                    pickTarget={pickTarget}
                    onPickTargetChange={setPickTarget}
                    idPrefix="agent-region"
                  />
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
                    className="w-full text-sm rounded-xl border border-[#E3E2EE] bg-white px-3 py-2 text-[#16151F] focus:outline-none focus:border-[#393185]"
                    placeholder="e.g. Kalyan – Thane"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  {existing ? (
                    <button
                      type="button"
                      onClick={remove}
                      disabled={saving}
                      className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove region
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-[#62607A]">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={save}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#393185] px-4 py-2 text-xs font-bold text-white hover:bg-[#006F34] disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {existing ? "Save region" : "Assign region"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
