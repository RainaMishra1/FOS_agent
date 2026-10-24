"use client";

import React, { useState } from "react";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import { CheckCircle2, Loader2, MapPin, ShieldCheck, AlertCircle, Compass } from "lucide-react";
import { calculateHaversineDistanceKm, formatDistance } from "@/lib/geoUtils";

interface VisitGeofenceCheckInProps {
  visit: AgentVisit;
}

export default function VisitGeofenceCheckIn({ visit }: VisitGeofenceCheckInProps) {
  const { checkInVisit, isOnDuty, currentAgent } = useAgent();
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const isCompleted = visit.status === "completed";
  const isInProgress = visit.status === "in_progress";

  // Calculate live distance from agent's known coordinates to customer site
  const distanceKm =
    visit.hasCoordinates && currentAgent?.currentCoordinates
      ? calculateHaversineDistanceKm(
          currentAgent.currentCoordinates.lat,
          currentAgent.currentCoordinates.lng,
          visit.coordinates.lat,
          visit.coordinates.lng
        )
      : null;

  const distanceMeters = distanceKm !== null ? Math.round(distanceKm * 1000) : null;
  const isWithinGeofence = distanceMeters !== null && distanceMeters <= 750;

  const handleCheckIn = async () => {
    if (isCheckingIn || !isOnDuty) return;
    setIsCheckingIn(true);
    try {
      await checkInVisit(visit.id);
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-beige-border bg-beige-card p-4 shadow-xs sm:p-5">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${visit.geofenceVerified ? "bg-beige-olive-subtle text-beige-olive" : isWithinGeofence ? "bg-emerald-50 text-emerald-600" : "bg-beige-terracotta-subtle text-beige-terracotta"}`}>
          {visit.geofenceVerified ? <ShieldCheck className="h-4 w-4" /> : isWithinGeofence ? <Compass className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-beige-text">
              750-metre GPS geofence
            </h4>
            <span className="rounded border border-beige-border bg-beige-sand px-1.5 py-0.5 text-[10px] font-normal text-beige-muted shrink-0">Server verified</span>
          </div>

          {/* Live Distance Estimate Banner */}
          {distanceMeters !== null && !isCompleted && !isInProgress && (
            <div className={`mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${isWithinGeofence ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
              {isWithinGeofence ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>You are <strong>{distanceMeters}m</strong> away (within the 750m zone). Ready to check in!</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>You are far away: <strong>{formatDistance(distanceKm!)}</strong> ({distanceMeters}m). You have to be within 750m.</span>
                </>
              )}
            </div>
          )}

          <p className="mt-1.5 text-[11px] text-beige-muted">
            {isCompleted
              ? "Visit completion was verified against a fresh GPS reading and the saved site location."
              : isInProgress
              ? "Your check-in was verified. GPS range and accuracy will be checked again when you complete the visit."
              : "Allow GPS when prompted. Check-in is accepted only within 750m of the customer's coordinates."}
          </p>
        </div>
      </div>

      {!isCompleted && !isInProgress && (
        <button
          type="button"
          onClick={handleCheckIn}
          disabled={isCheckingIn || !isOnDuty}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-50 ${isWithinGeofence ? "bg-emerald-600 hover:bg-emerald-700" : "bg-beige-terracotta hover:bg-beige-terracotta-light"}`}
        >
          {isCheckingIn ? <><Loader2 className="h-4 w-4 animate-spin" />Acquiring GPS &amp; checking radius…</> : <><MapPin className="h-4 w-4" />{isOnDuty ? (isWithinGeofence ? "Check in now (Inside 750m)" : "Verify location & check in") : "Go On Duty to Check In"}</>}
        </button>
      )}

      {(isCompleted || isInProgress) && visit.geofenceVerified && (
        <p className="flex items-center gap-1.5 rounded-xl border border-beige-olive/30 bg-beige-olive-subtle p-2.5 text-[11px] font-semibold text-beige-olive">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Inside the 750m geofence at the last verified GPS check.
        </p>
      )}
    </section>
  );
}
