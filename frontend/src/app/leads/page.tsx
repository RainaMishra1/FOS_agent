"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, Loader2, MapPin, Phone, X } from "lucide-react";
import TerritoryMap, { MapMarker, MapTerritory } from "@/components/TerritoryMap";
import { useAuth } from "@/context/AuthContext";
import {
  LeadReviewItem,
  LeadVerificationStatus,
  TerritoryApiItem,
  apiErrorMessage,
  approveLead,
  fetchLeadsForReview,
  fetchTerritories,
  rejectLead,
} from "@/lib/api";

const TABS: { key: LeadVerificationStatus | "all"; label: string }[] = [
  { key: "pending", label: "Waiting for review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-[#F1F0F8] text-[#393185] border-[#D7D4EE]",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatWhen = (value?: string | null) => (value ? new Date(value).toLocaleString() : "—");

const inputClass =
  "w-full text-sm rounded-xl border border-[#E3E2EE] bg-[#FAFAFD] px-3 py-2 text-[#16151F] focus:outline-none focus:border-[#393185]";

export default function LeadApprovalsPage() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [tab, setTab] = useState<LeadVerificationStatus | "all">("pending");
  const [leads, setLeads] = useState<LeadReviewItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [territories, setTerritories] = useState<TerritoryApiItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [scheduleVisit, setScheduleVisit] = useState(true);
  const [visitDate, setVisitDate] = useState(today());
  const [visitTime, setVisitTime] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [list, t] = await Promise.all([fetchLeadsForReview({ verification_status: tab }, token), fetchTerritories(token)]);
      setLeads(list.items);
      setPendingCount(list.pending);
      setTerritories(t);
      setSelectedId((current) => (current && list.items.some((l) => l.id === current) ? current : list.items[0]?.id || null));
    } catch (err) {
      setError(apiErrorMessage(err, "Could not load leads."));
    } finally {
      setLoading(false);
    }
  }, [tab, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = leads.find((l) => l.id === selectedId) || null;

  useEffect(() => {
    setRejectReason("");
    setScheduleVisit(true);
    setVisitDate(today());
    setVisitTime("");
  }, [selectedId]);

  const mapTerritories: MapTerritory[] = useMemo(
    () =>
      territories.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        subtitle: t.agent_name || null,
        points: t.points,
      })),
    [territories]
  );

  const markers: MapMarker[] = useMemo(() => {
    if (!selected) return [];
    const list: MapMarker[] = [
      { id: "lead", latitude: selected.latitude, longitude: selected.longitude, label: `Lead: ${selected.customer_name}`, kind: "lead" },
    ];
    if (selected.captured_latitude != null && selected.captured_longitude != null) {
      list.push({
        id: "gps",
        latitude: selected.captured_latitude,
        longitude: selected.captured_longitude,
        label: `${selected.created_by_agent_name || "Agent"}'s GPS when submitting`,
        kind: "gps",
        accuracyMeters: selected.captured_accuracy_meters,
      });
    }
    return list;
  }, [selected]);

  const approve = async () => {
    if (!selected) return;
    if (scheduleVisit && !visitDate) return setError("Choose a date for the visit.");
    setBusy("approve");
    setError(null);
    try {
      await approveLead(
        selected.id,
        { schedule_visit: scheduleVisit, scheduled_date: scheduleVisit ? visitDate : undefined, scheduled_time: visitTime || undefined },
        token
      );
      setNotice(
        `${selected.customer_name} approved and assigned to ${selected.created_by_agent_name || "the agent"}${
          scheduleVisit ? `, with a visit on ${visitDate}` : ""
        }.`
      );
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not approve the lead."));
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (!selected) return;
    if (rejectReason.trim().length < 3) return setError("Write a short reason so the agent knows why.");
    setBusy("reject");
    setError(null);
    try {
      await rejectLead(selected.id, rejectReason.trim(), token);
      setNotice(`${selected.customer_name} rejected.`);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not reject the lead."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#16151F] flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6" /> Lead approvals
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">{pendingCount} waiting</span>
          )}
        </h1>
        <p className="text-sm text-[#62607A] mt-1">
          Leads created by agents in their territories. Approving a lead counts it as verified and assigns it to the agent who
          created it.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-[#E3E2EE] bg-[#F7F7FB] p-1 text-xs font-semibold">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3.5 py-1.5 ${tab === t.key ? "bg-white text-[#16151F] shadow-xs" : "text-[#62607A] hover:text-[#16151F]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && <div className="rounded-xl border border-[#D7D4EE] bg-[#F1F0F8] px-3.5 py-2.5 text-xs text-[#393185]">{notice}</div>}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="rounded-2xl border border-[#E3E2EE] bg-white p-3 space-y-2 max-h-[720px] overflow-y-auto">
          {loading && (
            <p className="flex items-center gap-1.5 p-2 text-xs text-[#62607A]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </p>
          )}
          {!loading && leads.length === 0 && <p className="p-2 text-xs text-[#62607A]">No leads here.</p>}
          {leads.map((lead) => (
            <button
              key={lead.id}
              onClick={() => setSelectedId(lead.id)}
              className={`w-full text-left rounded-xl border p-3 text-xs ${
                selectedId === lead.id ? "border-[#393185] bg-[#F7F7FB]" : "border-[#EDECF5] bg-[#FAFAFD] hover:border-[#CFCDE2]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold text-[#16151F]">{lead.customer_name}</span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${STATUS_STYLE[lead.verification_status]}`}>
                  {lead.verification_status}
                </span>
              </div>
              <div className="text-[#62607A] mt-0.5">
                {lead.created_by_agent_name || "Unknown agent"} · {lead.territory_name || "no territory"}
              </div>
              <div className="text-[11px] text-[#9A98AE]">{formatWhen(lead.submitted_at || lead.created_at)}</div>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <TerritoryMap
            territories={mapTerritories}
            markers={markers}
            highlightId={selected?.territory_id || null}
            fitKey={selected ? `${selected.id}` : `t${territories.length}`}
            heightClass="h-[340px]"
          />

          {selected && (
            <div className="rounded-2xl border border-[#E3E2EE] bg-white p-4 space-y-4">
              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-base font-bold text-[#16151F]">{selected.customer_name}</div>
                  {selected.company && <div className="text-[#62607A]">{selected.company}</div>}
                  {selected.phone && (
                    <div className="flex items-center gap-1 text-[#16151F]">
                      <Phone className="h-3.5 w-3.5" /> {selected.phone}
                    </div>
                  )}
                  {selected.email && <div className="text-[#62607A]">{selected.email}</div>}
                  <div className="flex items-start gap-1 text-[#16151F]">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {selected.address}, {selected.city}
                  </div>
                  {selected.notes && <div className="rounded-lg bg-[#F7F7FB] p-2 text-[#16151F]">{selected.notes}</div>}
                </div>
                <div className="space-y-1 text-[#62607A]">
                  <div>
                    Created by <strong className="text-[#16151F]">{selected.created_by_agent_name || "—"}</strong>
                    {selected.created_by_agent_code ? ` (${selected.created_by_agent_code})` : ""}
                  </div>
                  <div>Territory: <strong className="text-[#16151F]">{selected.territory_name || "—"}</strong></div>
                  <div>Submitted: {formatWhen(selected.submitted_at)}</div>
                  <div>Priority: <span className="capitalize text-[#16151F]">{selected.priority}</span></div>
                  <div className="rounded-lg border border-[#D7D4EE] bg-[#F7F7FB] p-2 text-[#393185]">
                    <div className="flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5" /> GPS checks passed when submitted
                    </div>
                    <div className="text-[11px]">
                      Inside territory · agent {selected.captured_distance_meters != null ? `${Math.round(selected.captured_distance_meters)}m` : "—"} from the
                      lead · accuracy ±{selected.captured_accuracy_meters != null ? Math.round(selected.captured_accuracy_meters) : "—"}m
                    </div>
                  </div>
                  {selected.verification_status === "rejected" && selected.rejection_reason && (
                    <div className="rounded-lg bg-rose-50 p-2 text-rose-700">Rejected: {selected.rejection_reason}</div>
                  )}
                  {selected.verification_status !== "pending" && <div>Reviewed: {formatWhen(selected.reviewed_at)}</div>}
                </div>
              </div>

              {selected.verification_status === "pending" && (
                <div className="grid gap-4 border-t border-[#EDECF5] pt-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-[#16151F]">Approve</h3>
                    <label className="flex items-center gap-2 text-xs text-[#16151F]">
                      <input type="checkbox" checked={scheduleVisit} onChange={(e) => setScheduleVisit(e.target.checked)} />
                      Schedule a follow-up visit for {selected.created_by_agent_name || "the agent"}
                    </label>
                    {scheduleVisit && (
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" min={today()} value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className={inputClass} />
                        <input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} className={inputClass} />
                      </div>
                    )}
                    <button
                      onClick={approve}
                      disabled={busy !== null}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#393185] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#006F34] disabled:opacity-50"
                    >
                      {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Approve and assign to {selected.created_by_agent_name || "agent"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-[#16151F]">Reject</h3>
                    <textarea
                      rows={3}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      maxLength={1000}
                      placeholder="Reason shown to the agent, e.g. duplicate customer, wrong phone number"
                      className={`${inputClass} resize-none`}
                    />
                    <button
                      onClick={reject}
                      disabled={busy !== null}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      Reject lead
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
