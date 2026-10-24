"use client";

import React, { useState } from "react";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import StatusBadge from "@/components/StatusBadge";
import CompleteVisitModal from "./CompleteVisitModal";
import Link from "next/link";
import {
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  Navigation,
  Phone,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

interface NextVisitCardProps {
  visit: AgentVisit | null;
  onOpenDetails: (visit: AgentVisit) => void;
}

export default function NextVisitCard({
  visit,
  onOpenDetails,
}: NextVisitCardProps) {
  const { checkInVisit, isOnDuty } = useAgent();
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  if (!visit) {
    return (
      <div className="rounded-2xl bg-beige-card border border-beige-border p-5 text-center space-y-2">
        <div className="w-10 h-10 rounded-full bg-beige-olive-subtle text-beige-olive mx-auto flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-bold text-beige-text">All Scheduled Visits Completed!</h4>
        <p className="text-xs text-beige-muted">
          You have completed all assigned visits for today. Great job!
        </p>
      </div>
    );
  }

  const isCheckedIn = visit.status === "in_progress";

  const handleQuickCheckIn = async () => {
    if (isCheckedIn || !isOnDuty || isCheckingIn) return;
    setIsCheckingIn(true);
    try {
      await checkInVisit(visit.id);
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <>
      <div className="relative rounded-2xl bg-beige-card border-2 border-beige-border-dark/60 p-4 sm:p-5 shadow-sm overflow-hidden space-y-3.5">
        {/* Subtle accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-beige-terracotta to-beige-amber" />

        {/* Header Tag */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-beige-terracotta-subtle text-beige-terracotta border border-beige-terracotta/30">
              ⚡ Next Stop #{visit.orderIndex}
            </span>
            <StatusBadge status={visit.priority} size="sm" />
          </div>

          <span className="text-xs font-semibold text-beige-muted flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {visit.scheduledTime}
          </span>
        </div>

        {/* Customer Information */}
        <div className="space-y-1">
          <h3 className="text-base sm:text-lg font-bold text-beige-text leading-snug">
            {visit.customerName}
          </h3>
          <p className="text-xs text-beige-muted flex items-start gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-beige-terracotta shrink-0 mt-0.5" />
            <span>{visit.address}</span>
          </p>
        </div>

        {/* Geofence Status Pill */}
        <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${isCheckedIn ? "bg-beige-olive-subtle border-beige-olive/30 text-beige-olive" : "bg-beige-sand border-beige-border text-beige-muted"}`}>
          <div className="flex items-center gap-2">
            {isCheckedIn ? (
              <ShieldCheck className="w-4 h-4 shrink-0" />
            ) : (
              <Compass className="w-4 h-4 shrink-0" />
            )}
            <span className="font-semibold text-[11px] sm:text-xs">
              {isCheckedIn
                ? `GPS geofence verified at ${visit.checkInTime || "check-in"}; it will be checked again at completion.`
                : "Fresh GPS must be within 750m of the site to check in."}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpenDetails(visit)}
            className="text-[11px] font-semibold underline underline-offset-2 ml-2 hover:opacity-80 shrink-0"
          >
            Details
          </button>
        </div>

        {/* Action Buttons Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
          {/* Main Action: Check in or Complete */}
          {isCheckedIn ? (
            <button
              type="button"
              onClick={() => setShowCompleteModal(true)}
              className="col-span-2 sm:col-span-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-beige-olive hover:bg-beige-olive-light text-white shadow-xs transition flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <CheckCircle2 className="w-4 h-4" />
              Complete Visit
            </button>
          ) : (
            <button
              type="button"
              onClick={handleQuickCheckIn}
              disabled={isCheckingIn || !isOnDuty}
              className="col-span-2 sm:col-span-1 py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-[0.98] bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isCheckingIn ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Verify GPS & Check In
                </>
              )}
            </button>
          )}

          {/* View Route Action */}
          <Link
            href={`/agent/routes?visitId=${encodeURIComponent(visit.id)}`}
            className="py-2.5 px-3 rounded-xl text-xs font-semibold bg-beige-sand/80 hover:bg-beige-sand border border-beige-border text-beige-text transition flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <Navigation className="w-3.5 h-3.5 text-beige-terracotta" />
            <span>Get Route</span>
          </Link>

          {/* Details / Inspection Drawer */}
          <button
            type="button"
            onClick={() => onOpenDetails(visit)}
            className="py-2.5 px-3 rounded-xl text-xs font-semibold bg-beige-card hover:bg-beige-sand border border-beige-border text-beige-text transition flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <span>Visit Details</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showCompleteModal && (
        <CompleteVisitModal
          visit={visit}
          onClose={() => setShowCompleteModal(false)}
        />
      )}
    </>
  );
}
