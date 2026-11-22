"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import CompleteVisitModal from "./CompleteVisitModal";
import { calculateHaversineDistanceKm, formatDistance } from "@/lib/geoUtils";
import { loadLeaflet } from "@/lib/leaflet";
import { CheckCircle2, ChevronRight, Clock, MapPin, Navigation, Phone, ShieldCheck } from "lucide-react";

const CHECK_IN_RADIUS_METERS = 750;

interface NextVisitCardProps {
  visit: AgentVisit | null;
  onOpenDetails: (visit: AgentVisit) => void;
}

/** The customer's saved position, or null. Never a made-up fallback. */
function visitPoint(visit: AgentVisit | null): [number, number] | null {
  if (!visit) return null;
  const lat = visit.coordinates?.lat || visit.latitude;
  const lng = visit.coordinates?.lng || visit.longitude;
  return lat && lng ? [lat, lng] : null;
}

export default function NextVisitCard({ visit, onOpenDetails }: NextVisitCardProps) {
  const { liveGpsCoords, checkInVisit } = useAgent();
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [leafletReady, setLeafletReady] = useState(false);

  const dest = visitPoint(visit);
  const you: [number, number] | null = liveGpsCoords ? [liveGpsCoords.lat, liveGpsCoords.lng] : null;
  const distanceMeters = dest && you ? Math.round(calculateHaversineDistanceKm(you[0], you[1], dest[0], dest[1]) * 1000) : null;
  const inZone = distanceMeters != null && distanceMeters <= CHECK_IN_RADIUS_METERS;

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then(() => !cancelled && setLeafletReady(true))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Small map: you, the customer and the 750 m check-in zone.
  useEffect(() => {
    const L = (window as any).L;
    if (!leafletReady || !L || !mapContainerRef.current || !dest) return;
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: !L.Browser.mobile, // don't trap one-finger page scrolling on phones
        tap: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, className: "fos-soft-tiles" }).addTo(mapRef.current);
    }
    const map = mapRef.current;
    const layer = L.layerGroup().addTo(map);
    L.circle(dest, { radius: CHECK_IN_RADIUS_METERS, color: "#393185", weight: 1, fillOpacity: 0.06, dashArray: "4 4" }).addTo(layer);
    L.marker(dest, {
      icon: L.divIcon({
        className: "",
        html: '<div style="width:16px;height:16px;background:#393185;border:3px solid #fff;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    }).addTo(layer);
    if (you) {
      L.marker(you, {
        icon: L.divIcon({
          className: "",
          html: '<div style="width:16px;height:16px;background:#276EF1;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 5px rgba(39,110,241,.2)"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(layer);
      map.fitBounds(L.latLngBounds([dest, you]), { padding: [30, 30], maxZoom: 16 });
    } else {
      map.setView(dest, 15);
    }
    const settle = setTimeout(() => map.invalidateSize(), 120);
    return () => {
      clearTimeout(settle);
      layer.remove();
    };
  }, [leafletReady, dest?.[0], dest?.[1], you?.[0], you?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    []
  );

  if (!visit) {
    return (
      <div className="rounded-2xl bg-white border border-[#E3E2EE] p-8 text-center">
        <CheckCircle2 className="w-8 h-8 mx-auto text-[#00843E]" />
        <p className="mt-2 text-base font-bold text-[#16151F]">No visits left today</p>
      </div>
    );
  }

  const isCheckedIn = visit.status === "in_progress";

  const handleCheckIn = async () => {
    if (isCheckedIn || isCheckingIn) return;
    setIsCheckingIn(true);
    try {
      await checkInVisit(visit.id);
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl bg-white border border-[#E3E2EE] overflow-hidden md:grid md:grid-cols-5">
        <div className="p-4 sm:p-5 space-y-4 md:col-span-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#62607A]">
                <Clock className="w-3.5 h-3.5" />
                {visit.scheduledTime || "Anytime"}
                {isCheckedIn && <span className="rounded-full bg-[#F1F0F8] px-2 py-0.5 text-[#393185] font-bold">Checked in</span>}
              </div>
              <h2 className="mt-1 text-xl sm:text-2xl font-extrabold tracking-tight text-[#16151F] truncate">{visit.customerName}</h2>
              <p className="mt-0.5 text-sm text-[#62607A] flex items-start gap-1.5">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{visit.address}</span>
              </p>
            </div>
            {visit.phone && (
              <a
                href={`tel:${visit.phone.replace(/[^\d+]/g, "")}`}
                className="h-11 w-11 shrink-0 rounded-full border border-[#E3E2EE] flex items-center justify-center text-[#393185] hover:bg-[#F7F7FB]"
                aria-label="Call customer"
              >
                <Phone className="w-4 h-4" />
              </a>
            )}
          </div>

          {distanceMeters != null && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                inZone ? "bg-[#E6F4EC] text-[#00843E]" : "bg-[#FDF3E1] text-[#B7791F]"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${inZone ? "bg-[#00843E]" : "bg-[#B7791F]"}`} />
              {inZone ? "In check-in zone" : `${formatDistance(distanceMeters / 1000)} away`}
            </span>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <Link
              href={`/agent/routes?visitId=${encodeURIComponent(visit.id)}&start=true`}
              className="h-12 rounded-xl bg-[#00843E] hover:bg-[#006F34] text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition"
            >
              <Navigation className="w-4 h-4" />
              Navigate
            </Link>
            {isCheckedIn ? (
              <button
                type="button"
                onClick={() => setShowCompleteModal(true)}
                className="h-12 rounded-xl border-2 border-[#393185] text-[#393185] text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Complete
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckIn}
                disabled={isCheckingIn}
                className="h-12 rounded-xl border-2 border-[#393185] text-[#393185] text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition cursor-pointer disabled:opacity-60"
              >
                {isCheckingIn ? (
                  <span className="w-4 h-4 border-2 border-[#393185] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {isCheckingIn ? "Checking…" : "Check in"}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onOpenDetails(visit)}
            className="w-full flex items-center justify-between text-sm font-semibold text-[#393185] py-1 cursor-pointer"
          >
            Details
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {dest && (
          <div className="relative h-44 md:h-auto md:min-h-[260px] md:col-span-2 bg-[#EEF0F2] border-t md:border-t-0 md:border-l border-[#E3E2EE]">
            <div ref={mapContainerRef} className="absolute inset-0" />
          </div>
        )}
      </div>

      {showCompleteModal && <CompleteVisitModal visit={visit} onClose={() => setShowCompleteModal(false)} />}
    </>
  );
}
