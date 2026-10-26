"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import StatusBadge from "@/components/StatusBadge";
import VisitGeofenceCheckIn from "./VisitGeofenceCheckIn";
import CompleteVisitModal from "./CompleteVisitModal";
import { calculateHaversineDistanceKm } from "@/lib/geoUtils";
import {
  X,
  Phone,
  Mail,
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  Calendar,
  Building2,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Navigation,
  Loader2,
} from "lucide-react";

interface VisitDetailDrawerProps {
  visit: AgentVisit | null;
  onClose: () => void;
}

export default function VisitDetailDrawer({
  visit: initialVisit,
  onClose,
}: VisitDetailDrawerProps) {
  const { currentAgent, visits, historyVisits, isOnDuty, checkInVisit, liveGpsCoords, notification, clearNotification } = useAgent();
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [phoneDialed, setPhoneDialed] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Synchronize with live visit state from AgentContext
  const visit = initialVisit
    ? visits.find((v) => v.id === initialVisit.id) ||
      historyVisits.find((v) => v.id === initialVisit.id) ||
      initialVisit
    : null;

  if (!visit) return null;

  const handleCall = () => {
    setPhoneDialed(true);
    setTimeout(() => setPhoneDialed(false), 3000);
  };

  const handleCheckIn = async () => {
    if (isCheckingIn) return;
    setIsCheckingIn(true);
    try {
      await checkInVisit(visit.id);
    } finally {
      setIsCheckingIn(false);
    }
  };

  const activeOrigin = liveGpsCoords || (currentAgent?.currentCoordinates?.lat ? currentAgent.currentCoordinates : null);
  const distanceKm =
    visit?.hasCoordinates && activeOrigin
      ? calculateHaversineDistanceKm(
          activeOrigin.lat,
          activeOrigin.lng,
          visit.coordinates.lat,
          visit.coordinates.lng
        )
      : null;
  const distanceMeters = distanceKm !== null ? Math.round(distanceKm * 1000) : null;
  const isOutsideGeofence = distanceMeters !== null && distanceMeters > 750;

  return (
    <>
      <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
        <div
          className="relative w-full sm:max-w-xl max-h-[90vh] bg-beige-card border-t sm:border border-beige-border sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-beige-border flex items-start justify-between bg-beige-sand/30">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-beige-sand text-beige-muted border border-beige-border">
                  Stop #{visit.orderIndex} • {visit.id}
                </span>
                <StatusBadge status={visit.status} size="sm" />
                <StatusBadge status={visit.priority} size="sm" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-beige-text leading-tight">
                {visit.customerName}
              </h3>
              {visit.company && (
                <p className="text-xs text-beige-muted flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {visit.company}
                </p>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
            {/* Top Notification Toast inside drawer */}
            {notification && (
              <div
                className={`p-3 rounded-xl border flex items-center justify-between gap-2.5 animate-in slide-in-from-top ${
                  notification.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : notification.type === "error"
                    ? "bg-red-50 border-red-200 text-red-800"
                    : "bg-beige-sand border-beige-border text-beige-text"
                }`}
              >
                <div className="flex items-center gap-2">
                  {notification.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : notification.type === "error" ? (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  ) : (
                    <Compass className="w-4 h-4 text-beige-muted shrink-0" />
                  )}
                  <span className="font-semibold text-xs leading-snug">
                    {typeof notification.message === "string"
                      ? notification.message
                      : JSON.stringify(notification.message)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearNotification}
                  className="p-1 rounded-md hover:bg-black/5 text-gray-500 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Quick Actions Row */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleCall}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-beige-sand/70 hover:bg-beige-sand border border-beige-border font-semibold text-beige-text transition shadow-2xs active:scale-[0.98]"
              >
                <Phone className="w-3.5 h-3.5 text-beige-olive" />
                <span>{phoneDialed ? "Connecting..." : "Call Contact"}</span>
              </button>

              <Link
                href={`/agent/routes?visitId=${encodeURIComponent(visit.id)}`}
                onClick={onClose}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-beige-terracotta-subtle/80 hover:bg-beige-terracotta-subtle border border-beige-terracotta/30 font-semibold text-beige-terracotta transition shadow-2xs active:scale-[0.98]"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Get Route</span>
              </Link>
            </div>

            {/* Customer & Contact Info */}
            <div className="p-3.5 rounded-xl bg-beige-sand/30 border border-beige-border space-y-2.5">
              <span className="font-bold text-beige-text uppercase tracking-wider text-[10px] block">
                Contact & Destination
              </span>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-beige-terracotta shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-beige-text">{visit.address}</p>
                    <p className="text-[11px] text-beige-muted">
                      {visit.city || "Saved site"} • Site coordinates: {visit.coordinates.lat.toFixed(4)}°N, {visit.coordinates.lng.toFixed(4)}°E
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-beige-border/60">
                  <Phone className="w-3.5 h-3.5 text-beige-muted shrink-0" />
                  <span className="text-beige-text font-medium">{visit.contactPerson}</span>
                  <span className="text-beige-muted ml-auto font-mono text-[11px]">{visit.phone}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-beige-muted shrink-0" />
                  <span className="text-beige-muted truncate">{visit.email}</span>
                </div>
              </div>
            </div>

            {/* Schedule & Visit Purpose */}
            <div className="p-3.5 rounded-xl bg-beige-card border border-beige-border space-y-2">
              <span className="font-bold text-beige-text uppercase tracking-wider text-[10px] block">
                Schedule & Mission Purpose
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-beige-sand/40 border border-beige-border/60">
                  <Calendar className="w-3.5 h-3.5 text-beige-muted" />
                  <div>
                    <span className="text-beige-muted block text-[10px]">Date</span>
                    <strong className="text-beige-text">{visit.scheduledDate}</strong>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-beige-sand/40 border border-beige-border/60">
                  <Clock className="w-3.5 h-3.5 text-beige-muted" />
                  <div>
                    <span className="text-beige-muted block text-[10px]">Time Window</span>
                    <strong className="text-beige-text">{visit.scheduledTime} ({visit.estimatedDuration})</strong>
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-beige-sand/20 border border-beige-border/50 mt-1">
                <span className="text-[10px] font-semibold text-beige-muted block">Purpose:</span>
                <p className="text-beige-text text-xs mt-0.5 leading-relaxed">{visit.purpose}</p>
              </div>

              {visit.tags && visit.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {visit.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-beige-sand text-beige-muted border border-beige-border/70"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Geofencing Verification Box */}
            <div>
              <VisitGeofenceCheckIn visit={visit} />
            </div>

            {/* Completion Notes / History if completed */}
            {visit.status === "completed" && visit.completionNotes && (
              <div className="p-3.5 rounded-xl bg-beige-olive-subtle/50 border border-beige-olive/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-beige-olive text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Visit Completed at {visit.completedTime || "Recorded"}
                  </span>
                  <span className="text-[10px] font-mono text-beige-olive">
                    GPS geofence verified
                  </span>
                </div>
                <p className="text-xs text-beige-text">{visit.completionNotes}</p>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-beige-border bg-beige-sand/30 flex items-center gap-2">
            <button
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-beige-card hover:bg-beige-sand border border-beige-border text-beige-text transition"
            >
              Close
            </button>

            {visit.status === "in_progress" ? (
              <button
                onClick={() => setShowCompleteModal(true)}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-white shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  isOutsideGeofence ? "bg-amber-700 hover:bg-amber-800" : "bg-[#1E3F35] hover:bg-[#162F27]"
                }`}
              >
                {isOutsideGeofence ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{isOutsideGeofence ? `Complete Visit (${distanceMeters}m away)` : "Complete Visit"}</span>
              </button>
            ) : visit.status === "completed" ? (
              <div className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-[#EAF2EC] text-[#1E3F35] text-center border border-[#CDE1D2]">
                ✓ Visit Completed
              </div>
            ) : (
              <>
                <Link
                  href={`/agent/routes?visitId=${encodeURIComponent(visit.id)}&start=true`}
                  onClick={onClose}
                  className="py-2.5 px-3.5 rounded-xl text-xs font-bold bg-[#1E3F35] hover:bg-[#162F27] text-white shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-4 h-4 text-white" />
                  <span>Start Nav</span>
                </Link>

                <button
                  type="button"
                  disabled={isCheckingIn}
                  onClick={handleCheckIn}
                  className="flex-1 py-2.5 px-3.5 rounded-xl text-xs font-bold bg-[#EAF2EC] text-[#1E3F35] border border-[#CDE1D2] hover:bg-[#D8E9DC] shadow-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isCheckingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Checking In...</span>
                    </>
                  ) : (
                    <>
                      <MapPin className="w-4 h-4" />
                      <span>Check In</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showCompleteModal && (
        <CompleteVisitModal
          visit={visit}
          onClose={() => setShowCompleteModal(false)}
          onSuccess={() => {
            setShowCompleteModal(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
