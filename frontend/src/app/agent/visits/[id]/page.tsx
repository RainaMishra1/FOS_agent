"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAgent } from "@/context/AgentContext";
import { useAuth } from "@/context/AuthContext";
import { fetchAgentVisitById, ApiError } from "@/lib/api";
import { AgentVisit } from "@/types/agent";
import StatusBadge from "@/components/StatusBadge";
import VisitGeofenceCheckIn from "@/components/agent/VisitGeofenceCheckIn";
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
  AlertTriangle,
  Loader2,
  ShieldAlert,
} from "lucide-react";

export default function VisitDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { session } = useAuth();
  const { visits, historyVisits, isOnDuty } = useAgent();

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [phoneDialed, setPhoneDialed] = useState(false);

  const visitId = params?.id as string;
  const allVisits = [...visits, ...historyVisits];
  const contextVisit = allVisits.find((v) => v.id === visitId);

  const [fetchedVisit, setFetchedVisit] = useState<AgentVisit | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!contextVisit);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If visit is not in local context, fetch directly from FastAPI endpoint
  useEffect(() => {
    if (contextVisit) {
      setFetchedVisit(contextVisit);
      setIsLoading(false);
      return;
    }

    if (!visitId) return;

    let mounted = true;
    async function loadDirectVisit() {
      setIsLoading(true);
      setErrorStatus(null);
      setErrorMessage(null);

      try {
        const data: any = await fetchAgentVisitById(visitId, session?.access_token);
        if (mounted) {
          const hasCoords = Boolean(
            data.customer_latitude != null &&
              data.customer_longitude != null &&
              (data.customer_latitude !== 0 || data.customer_longitude !== 0)
          );
          setFetchedVisit({
            id: data.id,
            assignmentId: data.visit_code || data.id.slice(0, 8),
            customerId: data.customer_id,
            customerName: data.customer_name || "Customer Site",
            company: data.customer_company || undefined,
            contactPerson: data.customer_contact_person || data.customer_name || "Authorized Representative",
            phone: data.customer_phone || "+91 98800 00000",
            email: data.customer_email || "contact@client.com",
            address: data.customer_address || "Address pending geocoding",
            city: data.customer_city || "Bengaluru",
            coordinates: {
              lat: data.customer_latitude ?? 0,
              lng: data.customer_longitude ?? 0,
            },
            hasCoordinates: hasCoords,
            scheduledTime: data.scheduled_time || "10:00 AM",
            scheduledDate: data.scheduled_date,
            estimatedDuration: `${data.estimated_duration_minutes || 45} mins`,
            purpose: data.purpose || "On-site Field Inspection & Verification",
            priority: "medium",
            status: (data.status as any) || "pending",
            geofenceVerified: data.geofence_verified,
            checkInTime: data.check_in_time
              ? new Date(data.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : undefined,
            completedTime: data.completed_time
              ? new Date(data.completed_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : undefined,
            completionNotes: data.completion_notes || undefined,
            orderIndex: data.order_index || 1,
            tags: ["Assigned"],
          });
        }
      } catch (err: any) {
        if (mounted) {
          const status = err instanceof ApiError ? err.status : 500;
          const detailMsg =
            typeof err.detail === "string"
              ? err.detail
              : typeof err.message === "string"
              ? err.message
              : "Failed to load visit details.";
          setErrorMessage(detailMsg);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadDirectVisit();

    return () => {
      mounted = false;
    };
  }, [visitId, contextVisit, session?.access_token]);

  const visit = contextVisit || fetchedVisit;

  const handleCall = () => {
    setPhoneDialed(true);
    setTimeout(() => setPhoneDialed(false), 3000);
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-beige-terracotta mx-auto" />
        <p className="text-xs text-beige-muted">Loading appointment record from backend...</p>
      </div>
    );
  }

  if (errorStatus === 403) {
    return (
      <div className="p-8 rounded-2xl bg-beige-card border border-beige-border text-center space-y-3 max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-beige-sand text-beige-terracotta mx-auto flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-beige-text">Access Forbidden</h2>
        <p className="text-xs text-beige-muted">
          You are not authorized to view this visit. Field agents are restricted to their own assigned appointments.
        </p>
        <Link
          href="/agent/visits"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-beige-sand hover:bg-beige-sand/80 text-xs font-bold text-beige-text border border-beige-border transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to My Visits</span>
        </Link>
      </div>
    );
  }

  if (errorStatus === 404 || !visit) {
    return (
      <div className="p-8 rounded-2xl bg-beige-card border border-beige-border text-center space-y-3 max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-beige-sand text-beige-muted mx-auto flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-beige-text">Visit Record Not Found</h2>
        <p className="text-xs text-beige-muted">
          The requested visit identifier &quot;{visitId}&quot; does not exist in the database.
        </p>
        <Link
          href="/agent/visits"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-beige-sand hover:bg-beige-sand/80 text-xs font-bold text-beige-text border border-beige-border transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to My Visits</span>
        </Link>
      </div>
    );
  }

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
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-beige-sand text-beige-muted border border-beige-border font-semibold">
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
            {visit.hasCoordinates && visit.coordinates.lat !== 0 && visit.coordinates.lng !== 0 ? (
              <p className="text-[11px] text-beige-olive pl-4 flex items-center gap-1 font-mono">
                <Compass className="w-3 h-3" />
                <span>Verified GPS: {visit.coordinates.lat.toFixed(4)}° N, {visit.coordinates.lng.toFixed(4)}° E</span>
              </p>
            ) : (
              <p className="text-[11px] text-beige-muted pl-4 italic">
                Site GPS coordinates not yet geocoded for this customer.
              </p>
            )}
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
        <VisitGeofenceCheckIn visit={visit} />
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

        {visit.status !== "completed" && (
          <button
            type="button"
            onClick={() => setShowCompleteModal(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-beige-olive text-white hover:bg-beige-olive-light transition shadow-xs shrink-0"
          >
            Complete Visit
          </button>
        )}
      </div>

      {/* Complete Visit Modal */}
      {showCompleteModal && (
        <CompleteVisitModal
          visit={visit}
          onClose={() => setShowCompleteModal(false)}
          onSuccess={() => setShowCompleteModal(false)}
        />
      )}
    </div>
  );
}
