"use client";

import React, { useState } from "react";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import { calculateHaversineDistanceKm, formatDistance } from "@/lib/geoUtils";
import {
  CheckCircle2,
  X,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

interface CompleteVisitModalProps {
  visit: AgentVisit;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CompleteVisitModal({
  visit,
  onClose,
  onSuccess,
}: CompleteVisitModalProps) {
  const { completeVisit, liveGpsCoords } = useAgent();
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(liveGpsCoords);
  const [isAcquiringGps, setIsAcquiringGps] = useState<boolean>(!liveGpsCoords);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [notes, setNotes] = useState(visit.completionNotes || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use the app's live position; only if there isn't one yet, wait for the device (up to 20 s).
  // A slow or failed lookup never blocks completion: the server makes the final check.
  React.useEffect(() => {
    if (liveGpsCoords) {
      setIsAcquiringGps(false);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setIsAcquiringGps(false);
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsAcquiringGps(false);
        setGpsError(null);
      },
      (err) => {
        if (cancelled) return;
        setIsAcquiringGps(false);
        if (err.code === err.PERMISSION_DENIED) setGpsError("Location is blocked. Allow it, then try again.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
    );
    return () => {
      cancelled = true;
    };
  }, [liveGpsCoords]);

  const activeCoords = liveGpsCoords || deviceCoords;
  const distanceKm =
    visit.hasCoordinates && activeCoords
      ? calculateHaversineDistanceKm(
          activeCoords.lat,
          activeCoords.lng,
          visit.coordinates.lat,
          visit.coordinates.lng
        )
      : null;

  const distanceMeters = distanceKm !== null ? Math.round(distanceKm * 1000) : null;
  const isOutsideGeofence = distanceMeters !== null && distanceMeters > 750;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await completeVisit(visit.id, notes);
      if (res.success) {
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to complete visit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const away = distanceKm !== null ? formatDistance(distanceKm) : `${distanceMeters} m`;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center sm:p-4 bg-black/40 animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white border border-[#E3E2EE] shadow-2xl p-5 sm:p-6 space-y-4 animate-rise"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 20px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-[#16151F]">Complete visit</h3>
            <p className="text-sm text-[#62607A] truncate">{visit.customerName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-[#62607A] hover:bg-[#F1F0F8]" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${
            gpsError || isOutsideGeofence ? "bg-red-50 text-red-700" : isAcquiringGps ? "bg-[#FDF3E1] text-[#B7791F]" : "bg-[#E6F4EC] text-[#00843E]"
          }`}
        >
          {isAcquiringGps ? (
            <span className="w-4 h-4 border-2 border-[#B7791F] border-t-transparent rounded-full animate-spin" />
          ) : gpsError || isOutsideGeofence ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
          {isAcquiringGps ? "Finding you…" : gpsError ? gpsError : isOutsideGeofence ? `${away} away — move closer` : "In check-in zone"}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-[#16151F]">Notes</span>
            <textarea
              rows={4}
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-sm p-3 rounded-xl bg-white border border-[#E3E2EE] text-[#16151F] placeholder-[#9A98AE] focus:outline-hidden focus:ring-2 focus:ring-[#393185]/30 resize-none"
              placeholder="What was done?"
            />
          </label>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-12 flex-1 rounded-xl text-sm font-semibold bg-[#F1F0F8] text-[#16151F] transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isOutsideGeofence || Boolean(gpsError)}
              className="h-12 flex-[2] rounded-xl text-sm font-bold text-white bg-[#00843E] hover:bg-[#006F34] transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {isSubmitting ? "Saving…" : "Complete"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
