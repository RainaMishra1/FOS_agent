"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, LocateFixed, MapPin, Plus, X } from "lucide-react";
import TerritoryMap, { MapMarker, MapTerritory } from "@/components/TerritoryMap";
import { useAuth } from "@/context/AuthContext";
import { useAgent } from "@/context/AgentContext";
import {
  LeadReviewItem,
  TerritoryApiItem,
  apiErrorMessage,
  createAgentLead,
  fetchMyLeads,
  fetchMyTerritories,
  updateAgentLocation,
} from "@/lib/api";
import { isPointInPolygon } from "@/lib/geoUtils";
import { reversePhotonAddress } from "@/lib/photon";
import { describeTerritory, metresOutsideTerritory } from "@/lib/territoryText";

interface GpsFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  at: number;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-[#F1F0F8] text-[#393185] border-[#D7D4EE]",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};
const STATUS_LABEL: Record<string, string> = { pending: "Waiting for admin", approved: "Verified", rejected: "Rejected" };

const inputClass =
  "w-full text-sm rounded-xl border border-[#E3E2EE] bg-[#FAFAFD] px-3 py-2.5 text-[#16151F] placeholder-[#9A98AE] focus:outline-none focus:border-[#393185] focus:bg-white";
const labelClass = "block text-xs font-semibold text-[#16151F] mb-1.5";

function getFreshFix(): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This device cannot share GPS location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location is blocked. Allow it to create leads."
              : "Could not get your GPS location. Move outdoors and try again."
          )
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 }
    );
  });
}

export default function AgentLeadsPage() {
  const { session } = useAuth();
  const { locationStatus } = useAgent();
  const token = session?.access_token;

  const [territories, setTerritories] = useState<TerritoryApiItem[]>([]);
  const [leads, setLeads] = useState<LeadReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [gps, setGps] = useState<GpsFix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [notes, setNotes] = useState("");
  const [filling, setFilling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [t, l] = await Promise.all([fetchMyTerritories(token), fetchMyLeads(token)]);
      setTerritories(t);
      setLeads(l.items);
    } catch (err) {
      setLoadError(apiErrorMessage(err, "Could not load your territory and leads."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live GPS while the page is open (only once location is allowed, so opening the page never prompts)
  useEffect(() => {
    if (locationStatus !== "granted") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("This device cannot share GPS location.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() });
        setGpsError(null);
      },
      (err) =>
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked. Allow it to create leads."
            : "Waiting for GPS…"
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [locationStatus]);

  const currentTerritory = useMemo(
    () => (gps ? territories.find((t) => isPointInPolygon(gps.latitude, gps.longitude, t.points)) || null : null),
    [gps, territories]
  );

  // For radius/corridor territories: how far outside the nearest one the agent is.
  const nearestOutside = useMemo(() => {
    if (!gps || currentTerritory) return null;
    let best: { name: string; metres: number } | null = null;
    for (const t of territories) {
      const m = metresOutsideTerritory(t, gps.latitude, gps.longitude);
      if (m != null && (!best || m < best.metres)) best = { name: t.name, metres: m };
    }
    return best;
  }, [gps, currentTerritory, territories]);

  const mapTerritories: MapTerritory[] = useMemo(
    () => territories.map((t) => ({ id: t.id, name: t.name, color: t.color, points: t.points })),
    [territories]
  );
  const markers: MapMarker[] = useMemo(
    () =>
      gps
        ? [{ id: "me", latitude: gps.latitude, longitude: gps.longitude, label: "You are here", kind: "gps", accuracyMeters: gps.accuracy }]
        : [],
    [gps]
  );

  const resetForm = () => {
    setCustomerName("");
    setPhone("");
    setCompany("");
    setEmail("");
    setAddress("");
    setCity("");
    setPriority("medium");
    setNotes("");
    setFormError(null);
  };

  const fillAddressFromGps = async () => {
    if (!gps) return;
    setFilling(true);
    const place = await reversePhotonAddress(gps.latitude, gps.longitude);
    setFilling(false);
    if (!place) {
      setFormError("Couldn't find an address for your location. Type it in.");
      return;
    }
    setAddress(place.formattedAddress || place.label || place.name);
    setCity(place.city || place.locality || city);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!token) return;
    setSubmitting(true);
    try {
      // Take a fresh fix right now and record it, so the server checks where the agent actually is.
      // A fix from the live watch in the last 20 s is fresh enough; otherwise ask the device.
      const fix = gps && Date.now() - gps.at < 20000 ? gps : await getFreshFix();
      setGps(fix);
      await updateAgentLocation(
        { latitude: fix.latitude, longitude: fix.longitude, gps_accuracy: fix.accuracy, location_source: "gps" },
        token
      );
      const lead = await createAgentLead(
        {
          customer_name: customerName.trim(),
          phone: phone.trim(),
          company: company.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim(),
          city: city.trim(),
          latitude: fix.latitude,
          longitude: fix.longitude,
          priority,
          notes: notes.trim() || undefined,
        },
        token
      );
      setNotice(`Lead for ${lead.customer_name} sent for admin verification.`);
      resetForm();
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(apiErrorMessage(err, "Could not create the lead."));
    } finally {
      setSubmitting(false);
    }
  };

  const hasTerritory = territories.length > 0;
  const canSubmit =
    customerName.trim().length > 0 &&
    phone.trim().length >= 6 &&
    address.trim().length >= 5 &&
    city.trim().length > 0 &&
    !submitting;

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#16151F] flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> My leads
          </h1>
        </div>
        {!formOpen && (
          <button
            onClick={() => {
              setFormOpen(true);
              setNotice(null);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#393185] px-3.5 py-2.5 text-xs font-bold text-white hover:bg-[#006F34]"
          >
            <Plus className="h-4 w-4" /> New lead
          </button>
        )}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
        </div>
      )}
      {notice && <div className="rounded-xl border border-[#D7D4EE] bg-[#F1F0F8] px-3.5 py-2.5 text-xs text-[#393185]">{notice}</div>}

      {/* Territory + GPS status */}
      <div className="rounded-2xl border border-[#E3E2EE] bg-white p-3 space-y-3">
        {!loading && !hasTerritory ? (
          <p className="flex items-center gap-1.5 text-xs text-amber-800">
            <AlertCircle className="h-4 w-4" /> You don&apos;t have a region yet.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-[#16151F]">
              Your territor{territories.length === 1 ? "y" : "ies"}: {territories.map((t) => t.name).join(", ") || "…"}
            </span>
            {gps ? (
              currentTerritory ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#D7D4EE] bg-[#F1F0F8] px-2.5 py-1 font-semibold text-[#393185]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> You&apos;re inside {currentTerritory.name}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
                  <AlertCircle className="h-3.5 w-3.5" /> You&apos;re outside your territory
                  {nearestOutside ? ` (${nearestOutside.metres >= 1000 ? `${(nearestOutside.metres / 1000).toFixed(1)} km` : `${Math.round(nearestOutside.metres)}m`} from ${nearestOutside.name})` : ""}
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1 text-[#62607A]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {gpsError || "Getting your GPS location…"}
              </span>
            )}
            {gps && <span className="text-[#9A98AE]">GPS ±{Math.round(gps.accuracy)}m</span>}
          </div>
        )}
        {territories.some((t) => describeTerritory(t)) && (
          <ul className="space-y-0.5 text-[11px] text-[#62607A]">
            {territories.map((t) =>
              describeTerritory(t) ? (
                <li key={t.id}>
                  <strong className="text-[#16151F]">{t.name}:</strong> {describeTerritory(t)}
                </li>
              ) : null
            )}
          </ul>
        )}
        <TerritoryMap
          territories={mapTerritories}
          markers={markers}
          highlightId={currentTerritory?.id || null}
          fitKey={`${territories.length}-${gps ? "gps" : "nogps"}`}
          heightClass="h-64"
        />
      </div>

      {/* New lead form */}
      {formOpen && (
        <form onSubmit={submit} className="rounded-2xl border border-[#E3E2EE] bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#16151F]">New lead</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="rounded-lg p-1 text-[#62607A] hover:text-[#16151F]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="lead-name">Customer name *</label>
              <input id="lead-name" required maxLength={255} value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="lead-phone">Phone *</label>
              <input id="lead-phone" required type="tel" inputMode="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="+91 98765 43210" />
            </div>
            <div>
              <label className={labelClass} htmlFor="lead-company">Shop / company</label>
              <input id="lead-company" maxLength={255} value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="lead-email">Email</label>
              <input id="lead-email" type="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className={labelClass} htmlFor="lead-address">Address *</label>
                <button
                  type="button"
                  onClick={fillAddressFromGps}
                  disabled={!gps || filling}
                  className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#393185] disabled:opacity-50"
                >
                  {filling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
                  Use my current address
                </button>
              </div>
              <textarea id="lead-address" required rows={2} maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} className={`${inputClass} resize-none`} placeholder="Shop no., building, street, area" />
            </div>
            <div>
              <label className={labelClass} htmlFor="lead-city">City *</label>
              <input id="lead-city" required maxLength={100} value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
            </div>
            <div>
              <span className={labelClass}>Priority</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(["high", "medium", "low"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setPriority(level)}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-semibold capitalize ${
                      priority === level ? "border-[#393185] bg-[#F1F0F8] text-[#393185]" : "border-[#E3E2EE] bg-[#FAFAFD] text-[#62607A]"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="lead-notes">Notes for the admin</label>
              <textarea id="lead-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} resize-none`} placeholder="What does the customer need?" />
            </div>
          </div>

          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {formError}
            </div>
          )}
          {gps && !currentTerritory && (
            <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> You are creating this lead outside your area.
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#393185] px-4 py-3 text-sm font-bold text-white hover:bg-[#006F34] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Checking your location…
              </>
            ) : (
              "Submit for verification"
            )}
          </button>
        </form>
      )}

      {/* My leads */}
      <div className="rounded-2xl border border-[#E3E2EE] bg-white p-3 space-y-2">
        <h2 className="px-1 text-sm font-bold text-[#16151F]">Submitted leads</h2>
        {loading && (
          <p className="flex items-center gap-1.5 px-1 text-xs text-[#62607A]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        )}
        {!loading && leads.length === 0 && <p className="px-1 text-xs text-[#62607A]">No leads yet.</p>}
        {leads.map((lead) => (
          <div key={lead.id} className="rounded-xl border border-[#EDECF5] bg-[#FAFAFD] p-3 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-[#16151F]">{lead.customer_name}</div>
                <div className="text-[#62607A]">{lead.phone} · {lead.territory_name || "—"}</div>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[lead.verification_status] || ""}`}>
                {STATUS_LABEL[lead.verification_status] || lead.verification_status}
              </span>
            </div>
            <div className="mt-1 text-[#62607A]">{lead.address}</div>
            {lead.verification_status === "rejected" && lead.rejection_reason && (
              <div className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-rose-700">Reason: {lead.rejection_reason}</div>
            )}
            <div className="mt-1 text-[11px] text-[#9A98AE]">
              Submitted {lead.submitted_at ? new Date(lead.submitted_at).toLocaleString() : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
