"use client";

import React, { useState } from "react";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import { CheckCircle2, Loader2, MapPin, ShieldCheck } from "lucide-react";

interface GeofenceSimulatorProps {
  visit: AgentVisit;
  onCheckInSuccess?: () => void;
  compact?: boolean;
}

export default function GeofenceSimulator({
  visit,
  onCheckInSuccess,
  compact = false,
}: GeofenceSimulatorProps) {
  const { checkInVisit, isOnDuty } = useAgent();
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const isCompleted = visit.status === "completed";
  const isInProgress = visit.status === "in_progress";

  const handleCheckIn = async () => {
    if (isCheckingIn || !isOnDuty) return;
    setIsCheckingIn(true);
    try {
      const result = await checkInVisit(visit.id);
      if (result.success) onCheckInSuccess?.();
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <section className={`rounded-2xl border border-beige-border bg-beige-card shadow-xs ${compact ? "p-3 space-y-2" : "p-4 sm:p-5 space-y-4"}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${visit.geofenceVerified ? "bg-beige-olive-subtle text-beige-olive" : "bg-beige-terracotta-subtle text-beige-terracotta"}`}>
          {visit.geofenceVerified ? <ShieldCheck className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
        </div>
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-beige-text">
            100-metre GPS geofence
            <span className="rounded border border-beige-border bg-beige-sand px-1.5 py-0.5 text-[10px] font-normal text-beige-muted">Server verified</span>
          </h4>
          <p className="mt-1 text-[11px] text-beige-muted">
            {isCompleted
              ? "Visit completion was verified against a fresh GPS reading and the saved site location."
              : isInProgress
              ? "Your check-in was verified. GPS range and accuracy will be checked again when you complete the visit."
              : "Allow GPS when prompted. Check-in is accepted only within 100m of the saved site, with accurate, fresh location data."}
          </p>
        </div>
      </div>

      {!isCompleted && !isInProgress && (
        <button
          type="button"
          onClick={handleCheckIn}
          disabled={isCheckingIn || !isOnDuty}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-beige-terracotta px-4 py-3 text-xs font-bold text-white shadow-md transition hover:bg-beige-terracotta-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCheckingIn ? <><Loader2 className="h-4 w-4 animate-spin" />Checking GPS and range…</> : <><MapPin className="h-4 w-4" />{isOnDuty ? "Verify location & check in" : "Go On Duty to Check In"}</>}
        </button>
      )}

      {(isCompleted || isInProgress) && visit.geofenceVerified && (
        <p className="flex items-center gap-1.5 rounded-xl border border-beige-olive/30 bg-beige-olive-subtle p-2.5 text-[11px] font-semibold text-beige-olive">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Inside the 100m geofence at the last verified GPS check.
        </p>
      )}
    </section>
  );
}
