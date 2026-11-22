"use client";

import React, { useState } from "react";
import { Crosshair, MapPin, Undo2, X } from "lucide-react";
import PhotonAutocompleteInput from "@/components/PhotonAutocompleteInput";
import { MapMarker } from "@/components/TerritoryMap";
import { TerritoryApiItem, TerritoryAreaSpec } from "@/lib/api";
import { areaOutline } from "@/lib/geoUtils";
import { ParsedPhotonPlace, reversePhotonAddress } from "@/lib/photon";

export type RegionKind = "box" | "radius" | "drawn";

/** A searched place: address from search, extra details typed by the admin, and coordinates. */
export interface PickedPlace {
  address: string;
  details: string;
  latitude: number;
  longitude: number;
}

export interface RegionDraft {
  kind: RegionKind;
  start: PickedPlace | null;
  end: PickedPlace | null;
  /** Margin around the box, or radius around the address, in km (as typed). */
  distanceKm: string;
  /** Corners clicked on the map for a drawn region, [lat, lng]. */
  points: number[][];
}

export type PickTarget = "start" | "end" | null;

const KINDS: { key: RegionKind; label: string; hint: string }[] = [
  { key: "box", label: "From → To", hint: "The region is the area between the two places (they sit at opposite corners), plus a margin." },
  { key: "radius", label: "Around a place", hint: "The region is everything within a set distance of one place." },
  { key: "drawn", label: "Draw on map", hint: "Click the map to place each corner of the region." },
];

const inputClass =
  "w-full text-sm rounded-xl border border-[#E6DFD3] bg-white px-3 py-2 text-[#1A201C] focus:outline-none focus:border-[#2E5A44]";

export const placeLabel = (p: PickedPlace) => [p.details.trim(), p.address.trim()].filter(Boolean).join(", ");

export const emptyRegion = (): RegionDraft => ({ kind: "box", start: null, end: null, distanceKm: "1", points: [] });

export function regionFromTerritory(t: TerritoryApiItem): RegionDraft {
  const toPlace = (label?: string | null, lat?: number | null, lng?: number | null): PickedPlace | null =>
    label && lat != null && lng != null ? { address: label, details: "", latitude: lat, longitude: lng } : null;
  const kind: RegionKind = t.definition_type === "box" || t.definition_type === "radius" ? t.definition_type : "drawn";
  return {
    kind,
    start: toPlace(t.start_label, t.start_latitude, t.start_longitude),
    end: toPlace(t.end_label, t.end_latitude, t.end_longitude),
    distanceKm: t.radius_meters ? String(+(t.radius_meters / 1000).toFixed(2)) : "1",
    points: kind === "drawn" ? t.points : [],
  };
}

const distanceMetres = (d: RegionDraft) => Math.round(parseFloat(d.distanceKm) * 1000);
const distanceValid = (d: RegionDraft) => {
  const m = distanceMetres(d);
  return Number.isFinite(m) && m >= 100 && m <= 50_000;
};

/** Outline to preview on the map, [lat, lng]. */
export function regionOutline(d: RegionDraft): number[][] {
  if (d.kind === "drawn") return d.points;
  if (!d.start || !distanceValid(d)) return [];
  if (d.kind === "box") {
    if (!d.end) return [];
    return areaOutline([d.start.latitude, d.start.longitude], [d.end.latitude, d.end.longitude], distanceMetres(d));
  }
  return areaOutline([d.start.latitude, d.start.longitude], null, distanceMetres(d));
}

export function regionMarkers(d: RegionDraft): MapMarker[] {
  if (d.kind === "drawn") return [];
  const list: MapMarker[] = [];
  if (d.start)
    list.push({
      id: "start",
      latitude: d.start.latitude,
      longitude: d.start.longitude,
      label: `${d.kind === "box" ? "From" : "Centre"}: ${placeLabel(d.start)}`,
      kind: "lead",
    });
  if (d.kind === "box" && d.end)
    list.push({ id: "end", latitude: d.end.latitude, longitude: d.end.longitude, label: `To: ${placeLabel(d.end)}`, kind: "agent" });
  return list;
}

/** Suggested region name from the chosen places, e.g. "Kalyan – Thane". */
export function suggestedRegionName(d: RegionDraft): string {
  const short = (p: PickedPlace | null) => (p ? p.address.split(",")[0].trim() : "");
  if (d.kind === "box" && d.start && d.end) return `${short(d.start)} – ${short(d.end)}`;
  if (d.kind === "radius" && d.start) return `${short(d.start)} area`;
  return "";
}

/** API boundary for the draft, or an error message to show. */
export function regionBoundary(d: RegionDraft): { points: number[][] } | { area: TerritoryAreaSpec } | { error: string } {
  if (d.kind === "drawn") return d.points.length >= 3 ? { points: d.points } : { error: "Click at least 3 corners on the map." };
  if (!d.start) return { error: d.kind === "box" ? "Search the starting place (From)." : "Search the centre place." };
  if (d.kind === "box" && !d.end) return { error: "Search the end place (To)." };
  if (!distanceValid(d)) return { error: "Distance must be between 0.1 km and 50 km." };
  return {
    area: {
      start: { label: placeLabel(d.start), latitude: d.start.latitude, longitude: d.start.longitude },
      end: d.kind === "box" && d.end ? { label: placeLabel(d.end), latitude: d.end.latitude, longitude: d.end.longitude } : null,
      radius_meters: distanceMetres(d),
    },
  };
}

/** Apply a map click: add a corner (drawn) or set the place being picked. */
export async function applyMapClick(
  d: RegionDraft,
  target: PickTarget,
  latitude: number,
  longitude: number,
  update: (fn: (prev: RegionDraft) => RegionDraft) => void
): Promise<void> {
  if (d.kind === "drawn") {
    update((prev) => ({ ...prev, points: [...prev.points, [latitude, longitude]] }));
    return;
  }
  if (!target) return;
  const key = target;
  update((prev) => ({ ...prev, [key]: { address: "Selected map point", details: "", latitude, longitude } }));
  const place = await reversePhotonAddress(latitude, longitude);
  if (!place) return;
  update((prev) => {
    const current = prev[key];
    if (!current || current.latitude !== latitude || current.longitude !== longitude) return prev;
    return { ...prev, [key]: { ...current, address: place.formattedAddress || place.label || place.name } };
  });
}

function PlaceField({
  id,
  title,
  place,
  picking,
  onPick,
  onTogglePick,
  onDetails,
  onClear,
}: {
  id: string;
  title: string;
  place: PickedPlace | null;
  picking: boolean;
  onPick: (place: PickedPlace) => void;
  onTogglePick: () => void;
  onDetails: (details: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <div className="space-y-1.5 rounded-xl border border-[#EFE8DD] bg-[#FCFAF6] p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#1A201C]">{title} *</span>
        <button
          type="button"
          onClick={onTogglePick}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
            picking ? "bg-amber-100 text-amber-900" : "text-[#2E5A44] hover:underline"
          }`}
        >
          <Crosshair className="h-3 w-3" /> {picking ? "Click the map…" : "Pick on map"}
        </button>
      </div>
      {place ? (
        <div className="space-y-1.5">
          <div className="flex items-start gap-1.5 text-xs text-[#1A201C]">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B86F52]" />
            <span className="flex-1">{place.address}</span>
            <button type="button" aria-label={`Clear ${title}`} onClick={onClear} className="text-[#756F66] hover:text-[#1A201C]">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="font-mono text-[11px] text-[#756F66]">
            {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
          </div>
          <input
            value={place.details}
            onChange={(e) => onDetails(e.target.value)}
            maxLength={150}
            className={inputClass}
            placeholder="Building, shop no., landmark (optional)"
          />
        </div>
      ) : (
        <PhotonAutocompleteInput
          id={id}
          value={query}
          onChange={setQuery}
          onPlaceSelect={(p: ParsedPhotonPlace) => {
            onPick({ address: p.formattedAddress || p.label || p.name, details: "", latitude: p.latitude, longitude: p.longitude });
            setQuery("");
          }}
          placeholder="Search area, station, street or landmark…"
          className={inputClass}
        />
      )}
    </div>
  );
}

export default function RegionEditor({
  value,
  onChange,
  pickTarget,
  onPickTargetChange,
  idPrefix = "region",
}: {
  value: RegionDraft;
  onChange: (fn: (prev: RegionDraft) => RegionDraft) => void;
  pickTarget: PickTarget;
  onPickTargetChange: (target: PickTarget) => void;
  idPrefix?: string;
}) {
  const d = value;
  const valid = distanceValid(d);
  const kind = KINDS.find((k) => k.key === d.kind)!;

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-[#E6DFD3] bg-[#FAF7F0] p-1 text-[11px] font-semibold">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => {
              onChange((prev) => ({ ...prev, kind: k.key }));
              onPickTargetChange(null);
            }}
            className={`rounded-lg px-1.5 py-1.5 ${d.kind === k.key ? "bg-white text-[#1A201C] shadow-xs" : "text-[#756F66]"}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-[#756F66]">{kind.hint}</p>

      {d.kind === "drawn" ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="flex-1">Click the map to add corners ({d.points.length} so far).</span>
          <button
            type="button"
            onClick={() => onChange((prev) => ({ ...prev, points: prev.points.slice(0, -1) }))}
            disabled={d.points.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 font-semibold disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
          <button
            type="button"
            onClick={() => onChange((prev) => ({ ...prev, points: [] }))}
            disabled={d.points.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 font-semibold disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      ) : (
        <>
          <PlaceField
            id={`${idPrefix}-start`}
            title={d.kind === "box" ? "From" : "Centre place"}
            place={d.start}
            picking={pickTarget === "start"}
            onTogglePick={() => onPickTargetChange(pickTarget === "start" ? null : "start")}
            onPick={(p) => onChange((prev) => ({ ...prev, start: p }))}
            onDetails={(details) => onChange((prev) => (prev.start ? { ...prev, start: { ...prev.start, details } } : prev))}
            onClear={() => onChange((prev) => ({ ...prev, start: null }))}
          />
          {d.kind === "box" && (
            <PlaceField
              id={`${idPrefix}-end`}
              title="To"
              place={d.end}
              picking={pickTarget === "end"}
              onTogglePick={() => onPickTargetChange(pickTarget === "end" ? null : "end")}
              onPick={(p) => onChange((prev) => ({ ...prev, end: p }))}
              onDetails={(details) => onChange((prev) => (prev.end ? { ...prev, end: { ...prev.end, details } } : prev))}
              onClear={() => onChange((prev) => ({ ...prev, end: null }))}
            />
          )}
          <div>
            <label className="block text-xs font-semibold text-[#1A201C] mb-1" htmlFor={`${idPrefix}-distance`}>
              {d.kind === "box" ? "Extra margin around the area (km) *" : "Radius (km) *"}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.1}
                max={20}
                step={0.1}
                value={Math.min(20, Math.max(0.1, parseFloat(d.distanceKm) || 0.1))}
                onChange={(e) => onChange((prev) => ({ ...prev, distanceKm: e.target.value }))}
                className="flex-1 accent-[#2E5A44]"
              />
              <input
                id={`${idPrefix}-distance`}
                inputMode="decimal"
                value={d.distanceKm}
                onChange={(e) => onChange((prev) => ({ ...prev, distanceKm: e.target.value }))}
                className={`${inputClass} w-20`}
              />
            </div>
            {!valid && <p className="mt-1 text-[11px] text-rose-600">Enter between 0.1 and 50 km.</p>}
          </div>
        </>
      )}
    </div>
  );
}
