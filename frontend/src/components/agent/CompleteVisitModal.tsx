"use client";

import React, { useState } from "react";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import {
  CheckCircle2,
  X,
  FileText,
  Clock,
  ShieldCheck,
  PenTool,
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
  const { completeVisit } = useAgent();
  const [notes, setNotes] = useState(
    visit.completionNotes ||
      "Inspection and verification tasks successfully carried out. Hardware seals confirmed and customer acknowledged completion."
  );
  const [hasSignature, setHasSignature] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await completeVisit(visit.id, notes);
      if (res.success) {
        if (onSuccess) onSuccess();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
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
            <span className="font-semibold text-beige-olive flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Fresh GPS and 750m range checked on submit
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-beige-muted">Arrival Check-in:</span>
            <span className="font-semibold text-beige-text">
              {visit.checkInTime || "Recorded"}
            </span>
          </div>
        </div>

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
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Finalizing...
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
