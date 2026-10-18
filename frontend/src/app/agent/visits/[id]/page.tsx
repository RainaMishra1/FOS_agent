"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAgent } from "@/context/AgentContext";
import StatusBadge from "@/components/StatusBadge";
import GeofenceSimulator from "@/components/agent/GeofenceSimulator";
import CompleteVisitModal from "@/components/agent/CompleteVisitModal";
import AgentMapPreview from "@/components/agent/AgentMapPreview";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  Calendar,
  Building2,
  Navigation,
  ShieldCheck,
  Share2,
} from "lucide-react";

export default function VisitDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { visits, historyVisits, isOnDuty } = useAgent();
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [phoneDialed, setPhoneDialed] = useState(false);

  const visitId = params?.id as string;
  const allVisits = [...visits, ...historyVisits];
  const visit = allVisits.find((v) => v.id === visitId) || visits[0];

  const handleCall = () => {
    setPhoneDialed(true);
    setTimeout(() => setPhoneDialed(false), 3000);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-beige-border">
        <Link
          href="/agent/visits"
          className="flex items-center gap-1.5 text-xs font-semibold text-beige-muted hover:text-beige-text transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Visits</span>
        </Link>

        <div className="flex items-center gap-2">
          <StatusBadge status={visit.status} size="sm" />
          <StatusBadge status={visit.priority} size="sm" />
        </div>
      </div>

      {/* Customer Header Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-beige-sand text-beige-muted border border-beige-border">
                Stop #{visit.orderIndex} • {visit.id}
              </span>
              <span className="text-xs text-beige-muted">{visit.scheduledDate}</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-beige-text mt-1">
              {visit.customerName}
            </h1>
            {visit.company && (
              <p className="text-xs text-beige-muted flex items-center gap-1 mt-0.5">
                <Building2 className="w-3.5 h-3.5" />
                {visit.company}
              </p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCall}
              className="py-2 px-3 rounded-xl text-xs font-semibold bg-beige-sand hover:bg-beige-border text-beige-text border border-beige-border transition flex items-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5 text-beige-olive" />
              <span>{phoneDialed ? "Calling..." : "Call Contact"}</span>
            </button>

            <Link
              href="/agent/routes"
              className="py-2 px-3 rounded-xl text-xs font-semibold bg-beige-terracotta-subtle text-beige-terracotta hover:bg-beige-terracotta hover:text-white border border-beige-terracotta/30 transition flex items-center gap-1.5"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Route</span>
            </Link>
          </div>
        </div>

        {/* Address and Contact details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-beige-border/60 text-xs">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-beige-muted tracking-wider">
              Site Address
            </span>
            <p className="font-semibold text-beige-text flex items-start gap-1">
              <MapPin className="w-3.5 h-3.5 text-beige-terracotta shrink-0 mt-0.5" />
              <span>{visit.address}</span>
            </p>
            <p className="text-[11px] text-beige-muted pl-4">
              Mock GPS: {visit.coordinates.lat.toFixed(4)}° N, {visit.coordinates.lng.toFixed(4)}° E
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-beige-muted tracking-wider">
              Primary Contact
            </span>
            <p className="font-semibold text-beige-text">{visit.contactPerson}</p>
            <p className="text-[11px] text-beige-muted font-mono">{visit.phone}</p>
            <p className="text-[11px] text-beige-muted">{visit.email}</p>
          </div>
        </div>
      </div>

      {/* Schedule & Mission Purpose */}
      <div className="p-4 sm:p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-3">
        <h3 className="text-xs font-bold text-beige-text uppercase tracking-wider">
          Schedule &amp; Visit Objectives
        </h3>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-beige-sand/40 border border-beige-border/60">
            <span className="text-[10px] text-beige-muted block">Window</span>
            <strong className="text-beige-text">{visit.scheduledTime}</strong>
          </div>
          <div className="p-2.5 rounded-xl bg-beige-sand/40 border border-beige-border/60">
            <span className="text-[10px] text-beige-muted block">Duration</span>
            <strong className="text-beige-text">{visit.estimatedDuration}</strong>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-beige-sand/20 border border-beige-border/60 space-y-1">
          <span className="text-[10px] font-bold text-beige-muted uppercase">Scope of Work:</span>
          <p className="text-xs text-beige-text leading-relaxed">{visit.purpose}</p>
        </div>

        {visit.tags && visit.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visit.tags.map((t) => (
              <span
                key={t}
                className="text-[10px] px-2 py-0.5 rounded-md bg-beige-sand text-beige-muted border border-beige-border/70"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Geofencing Verification Box */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-beige-text uppercase tracking-wider">
          Geofencing &amp; Check-In Verification
        </h3>
        <GeofenceSimulator visit={visit} />
      </section>

      {/* Complete Visit Button / Status Card */}
      <div className="p-4 rounded-2xl bg-beige-card border border-beige-border shadow-xs flex items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-beige-text block">Visit Completion</span>
          <span className="text-[11px] text-beige-muted">
            {visit.status === "completed"
              ? `Completed at ${visit.completedTime || "recorded"}`
              : "Record field notes and customer signature upon conclusion"}
          </span>
        </div>

        {visit.status === "in_progress" || visit.geofenceVerified ? (
          <button
            type="button"
            onClick={() => setShowCompleteModal(true)}
            className="py-2.5 px-4 rounded-xl text-xs font-bold bg-beige-olive hover:bg-beige-olive-light text-white shadow-xs transition flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            Complete Visit
          </button>
        ) : visit.status === "completed" ? (
          <span className="text-xs font-bold text-beige-olive px-3 py-1.5 rounded-xl bg-beige-olive-subtle border border-beige-olive/30">
            ✓ Completed
          </span>
        ) : (
          <span className="text-xs text-beige-muted">Check in first</span>
        )}
      </div>

      {/* Modal */}
      {showCompleteModal && (
        <CompleteVisitModal
          visit={visit}
          onClose={() => setShowCompleteModal(false)}
        />
      )}
    </div>
  );
}
