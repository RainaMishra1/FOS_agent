"use client";

import React, { useState } from "react";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import { calculateHaversineDistanceKm, formatDistance } from "@/lib/geoUtils";
import {
  CheckCircle2,
  X,
  FileText,
  Clock,
  ShieldCheck,
  PenTool,
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
  const { completeVisit, currentAgent } = useAgent();
  const [notes, setNotes] = useState(
    visit.completionNotes ||
      "Inspection and verification tasks successfully carried out. Hardware seals confirmed and customer acknowledged completion."
  );
  const [hasSignature, setHasSignature] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl bg-beige-card border border-beige-border shadow-2xl p-5 sm:p-6 space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-beige-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-beige-olive-subtle text-beige-olive flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-beige-text">Complete Customer Visit</h3>
              <p className="text-[11px] text-beige-muted">{visit.customerName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visit Context Summary */}
        <div className="p-3 rounded-xl bg-beige-sand/50 border border-beige-border text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-beige-muted">Scheduled Window:</span>
            <span className="font-semibold text-beige-text">{visit.scheduledTime}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-beige-muted">Geofence Status:</span>
            <span className={`font-semibold flex items-center gap-1 ${isOutsideGeofence ? "text-red-600" : "text-beige-olive"}`}>
              {isOutsideGeofence ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                  Outside 750m zone ({distanceMeters}m away)
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {distanceMeters !== null ? `Within 750m (${distanceMeters}m away)` : "Fresh GPS 750m checked on submit"}
                </>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-beige-muted">Arrival Check-in:</span>
            <span className="font-semibold text-beige-text">
              {visit.checkInTime || "Recorded"}
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Outside Geofence Warning */}
        {isOutsideGeofence && !error && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div className="leading-snug">
              <strong>Geofence Notice:</strong> You are currently <strong>{distanceMeters}m</strong> away from this customer site. Completion requires being within 750 metres.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Completion Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-beige-text flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-beige-muted" />
              Visit Outcome & Field Notes
            </label>
            <textarea
              rows={3}
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs p-3 rounded-xl bg-beige-card border border-beige-border text-beige-text placeholder-beige-muted focus:outline-hidden focus:ring-2 focus:ring-beige-terracotta/40 resize-none"
              placeholder="Enter work performed, serial numbers, client feedback..."
            />
          </div>

          {/* Customer Signature Placeholder */}
          <div className="p-3 rounded-xl bg-beige-card border border-dashed border-beige-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-beige-text flex items-center gap-1.5">
                <PenTool className="w-3.5 h-3.5 text-beige-muted" />
                Customer Digital Acknowledgement
              </span>
              <button
                type="button"
                onClick={() => setHasSignature(!hasSignature)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                  hasSignature
                    ? "bg-beige-olive-subtle text-beige-olive border-beige-olive/30"
                    : "bg-beige-sand text-beige-muted border-beige-border"
                }`}
              >
                {hasSignature ? "✓ Signed on device" : "Tap to collect signature"}
              </button>
            </div>
            {hasSignature && (
              <div className="h-14 rounded-lg bg-beige-sand/30 flex items-center justify-center font-serif italic text-sm text-beige-muted border border-beige-border/60">
                &ldquo;R. Pillai — Facilities Director&rdquo;
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold bg-beige-sand hover:bg-beige-border text-beige-text transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isOutsideGeofence}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold text-white shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                isOutsideGeofence
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-beige-terracotta hover:bg-beige-terracotta-light"
              }`}
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Finalizing...
                </>
              ) : isOutsideGeofence ? (
                <>
                  <AlertCircle className="w-4 h-4" />
                  Outside 750m Zone ({distanceMeters}m)
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Verify GPS & Complete Visit
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
