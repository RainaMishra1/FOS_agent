"use client";

import React, { useState } from "react";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import { CheckCircle2, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { calculateHaversineDistanceKm, formatDistance } from "@/lib/geoUtils";

const CHECK_IN_RADIUS_METERS = 750;

/** Distance to the customer and the check-in button, using the app's live position. */
export default function VisitGeofenceCheckIn({ visit }: { visit: AgentVisit }) {
  const { checkInVisit, liveGpsCoords, locationStatus } = useAgent();
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const isCompleted = visit.status === "completed";
  const isInProgress = visit.status === "in_progress";

  const distanceKm =
    visit.hasCoordinates && liveGpsCoords
      ? calculateHaversineDistanceKm(liveGpsCoords.lat, liveGpsCoords.lng, visit.coordinates.lat, visit.coordinates.lng)
      : null;
  const distanceMeters = distanceKm !== null ? Math.round(distanceKm * 1000) : null;
  const inZone = distanceMeters !== null && distanceMeters <= CHECK_IN_RADIUS_METERS;

  const handleCheckIn = async () => {
    if (isCheckingIn) return;
    setIsCheckingIn(true);
    try {
      await checkInVisit(visit.id);
    } finally {
      setIsCheckingIn(false);
    }
  };

  if (isCompleted) {
    return visit.geofenceVerified ? (
      <p className="flex items-center gap-2 rounded-xl bg-[#E6F4EC] px-3 py-2.5 text-sm font-semibold text-[#00843E]">
        <ShieldCheck className="h-4 w-4" />
        Location verified
      </p>
    ) : null;
  }

  return (
    <section className="space-y-3 rounded-2xl border border-[#E3E2EE] bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {distanceMeters !== null ? (
          <span className={inZone ? "text-[#00843E]" : "text-[#B7791F]"}>
            {inZone ? "In check-in zone" : `${formatDistance(distanceKm!)} away`}
          </span>
        ) : locationStatus === "granted" || locationStatus === "checking" ? (
          <span className="flex items-center gap-1.5 text-[#62607A]">
            <Loader2 className="h-4 w-4 animate-spin" /> Finding you…
          </span>
        ) : (
          <span className="text-red-700">Location is off</span>
        )}
        {isInProgress && (
          <span className="ml-auto flex items-center gap-1 text-[#393185]">
            <CheckCircle2 className="h-4 w-4" /> Checked in
          </span>
        )}
      </div>

      {!isInProgress && (
        <button
          type="button"
          onClick={handleCheckIn}
          disabled={isCheckingIn}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#00843E] text-sm font-bold text-white transition hover:bg-[#006F34] disabled:opacity-60 cursor-pointer"
        >
          {isCheckingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {isCheckingIn ? "Checking…" : "Check in"}
        </button>
      )}
    </section>
  );
}
