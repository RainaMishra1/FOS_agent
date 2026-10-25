"use client";

import React, { useState, useEffect, useRef } from "react";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import CompleteVisitModal from "./CompleteVisitModal";
import Link from "next/link";
import {
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  Navigation,
  ShieldCheck,
  ChevronRight,
  Route as RouteIcon,
  Crosshair,
  Car,
  ZoomIn,
  ZoomOut,
  FileText,
} from "lucide-react";

interface NextVisitCardProps {
  visit: AgentVisit | null;
  onOpenDetails: (visit: AgentVisit) => void;
}

export default function NextVisitCard({
  visit,
  onOpenDetails,
}: NextVisitCardProps) {
  const { currentAgent, checkInVisit } = useAgent();
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const [isLeafletReady, setIsLeafletReady] = useState(false);

  // Fallback road geometry Kalyan -> Murbad matching reference screenshot
  const defaultOrigin: [number, number] = [
    currentAgent?.currentCoordinates?.lat && currentAgent.currentCoordinates.lat !== 0
      ? currentAgent.currentCoordinates.lat
      : 19.2403,
    currentAgent?.currentCoordinates?.lng && currentAgent.currentCoordinates.lng !== 0
      ? currentAgent.currentCoordinates.lng
      : 73.1305,
  ];

  const defaultDest: [number, number] = [
    visit?.coordinates?.lat && visit.coordinates.lat !== 0 ? visit.coordinates.lat : 19.2564,
    visit?.coordinates?.lng && visit.coordinates.lng !== 0 ? visit.coordinates.lng : 73.4000,
  ];

  // Load Leaflet dynamically
  useEffect(() => {
    const w = window as any;
    if (w.L) {
      setIsLeafletReady(true);
      return;
    }

    let link = document.getElementById("next-visit-leaflet-css") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = "next-visit-leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    let script = document.getElementById("next-visit-leaflet-js") as HTMLScriptElement | null;
    const onLoad = () => setIsLeafletReady(Boolean((window as any).L));

    if (!script) {
      script = document.createElement("script");
      script.id = "next-visit-leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = onLoad;
      document.body.appendChild(script);
    } else if ((window as any).L) {
      onLoad();
    } else {
      script.addEventListener("load", onLoad);
    }

    return () => script?.removeEventListener("load", onLoad);
  }, []);

  // Initialize and update the interactive route preview map
  useEffect(() => {
    const L = (window as any).L;
    if (!isLeafletReady || !L || !mapContainerRef.current) return;

    if (!leafletMapRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      leafletMapRef.current = map;
    }

    const map = leafletMapRef.current;

    // Clear previous markers / polylines
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const originLat = defaultOrigin[0];
    const originLng = defaultOrigin[1];
    const destLat = defaultDest[0];
    const destLng = defaultDest[1];

    // Origin "You" marker
    const originIcon = L.divIcon({
      className: "custom-you-marker",
      html: `
        <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
          <div style="background: #ffffff; border: 1.5px solid #E6DFD3; border-radius: 9999px; padding: 2px 8px; font-size: 10px; font-weight: 700; color: #1E3F35; box-shadow: 0 2px 6px rgba(0,0,0,0.12); margin-bottom: 2px;">
            You
          </div>
          <div style="width: 14px; height: 14px; border-radius: 50%; background: #0284c7; border: 2.5px solid #ffffff; box-shadow: 0 0 0 4px rgba(2, 132, 199, 0.25);"></div>
        </div>
      `,
      iconSize: [0, 0],
    });

    L.marker([originLat, originLng], { icon: originIcon }).addTo(map);

    // Destination Pin marker
    const destName = visit?.customerName || "Girya";
    const destIcon = L.divIcon({
      className: "custom-dest-marker",
      html: `
        <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
          <div style="width: 24px; height: 30px; display: flex; align-items: center; justify-content: center;">
            <svg width="24" height="30" viewBox="0 0 24 30" fill="none">
              <path d="M12 0C5.37258 0 0 5.37258 0 12C0 19.5 12 30 12 30C12 30 24 19.5 24 12C24 5.37258 18.6274 0 12 0Z" fill="#dc2626"/>
              <circle cx="12" cy="11" r="4.5" fill="#ffffff"/>
            </svg>
          </div>
          <div style="background: #ffffff; border: 1px solid #E6DFD3; border-radius: 9999px; padding: 1px 6px; font-size: 9px; font-weight: 700; color: #292524; box-shadow: 0 2px 4px rgba(0,0,0,0.15); margin-top: 1px;">
            ${destName}
          </div>
        </div>
      `,
      iconSize: [0, 0],
    });

    L.marker([destLat, destLng], { icon: destIcon }).addTo(map);

    // Realistic curved route geometry connecting Kalyan and Murbad
    const routeCoords: [number, number][] = [
      [originLat, originLng],
      [originLat + (destLat - originLat) * 0.15 - 0.005, originLng + (destLng - originLng) * 0.2],
      [originLat + (destLat - originLat) * 0.35 + 0.008, originLng + (destLng - originLng) * 0.4],
      [originLat + (destLat - originLat) * 0.6 - 0.004, originLng + (destLng - originLng) * 0.65],
      [originLat + (destLat - originLat) * 0.85 + 0.003, originLng + (destLng - originLng) * 0.85],
      [destLat, destLng],
    ];

    L.polyline(routeCoords, {
      color: "#1E3F35",
      weight: 4.5,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);

    // Fit bounds with padding
    const bounds = L.latLngBounds([
      [originLat, originLng],
      [destLat, destLng],
    ]);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
  }, [isLeafletReady, defaultOrigin[0], defaultOrigin[1], defaultDest[0], defaultDest[1], visit?.customerName]);

  const handleZoom = (delta: number) => {
    if (!leafletMapRef.current) return;
    const cur = leafletMapRef.current.getZoom();
    leafletMapRef.current.setZoom(cur + delta);
  };

  const handleRecenter = () => {
    if (!leafletMapRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    const bounds = L.latLngBounds([defaultOrigin, defaultDest]);
    leafletMapRef.current.fitBounds(bounds, { padding: [50, 50] });
  };

  if (!visit) {
    return (
      <div className="rounded-2xl bg-white border border-[#E6DFD3] p-8 text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-full bg-[#EAF2EC] text-[#1E3F35] mx-auto flex items-center justify-center shadow-2xs">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h4 className="text-base font-bold text-beige-text">No Pending Visits Scheduled</h4>
        <p className="text-xs text-beige-muted max-w-md mx-auto">
          You currently have no pending tasks assigned for today. When new visits are dispatched to you by operations, they will appear here.
        </p>
      </div>
    );
  }

  const isCheckedIn = visit.status === "in_progress";

  const handleQuickCheckIn = async () => {
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
      <div className="rounded-2xl bg-white border border-[#E6DFD3] p-4 sm:p-6 shadow-xs overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: Visit Details & Actions */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            {/* Header Tags */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#EAF2EC] text-[#1E3F35] border border-[#CDE1D2]">
                <Navigation className="w-3 h-3 rotate-45" />
                <span>Next Stop #{visit.orderIndex}</span>
              </span>

              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#FAF3E7] text-[#9E6924] border border-[#F0E4D0]">
                <span>◆</span>
                <span className="capitalize">{visit.priority} Priority</span>
              </span>
            </div>

            {/* Customer Title & Address */}
            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-beige-text tracking-tight">
                {visit.customerName}
              </h2>
              <p className="text-xs sm:text-sm text-beige-muted flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#1E3F35] shrink-0" />
                <span>{visit.address}</span>
              </p>
            </div>

            {/* Geofence Rule Notice Banner */}
            <button
              type="button"
              onClick={() => onOpenDetails(visit)}
              className="w-full text-left p-3 rounded-xl bg-[#FDF9F0] border border-[#F2E8D3] hover:bg-[#FAF3E3] transition flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-2 text-xs text-[#7A5B2E]">
                <Compass className="w-4 h-4 shrink-0 text-[#9E6924]" />
                <span className="font-medium text-[11px] sm:text-xs">
                  {isCheckedIn
                    ? `GPS geofence verified at ${visit.checkInTime || "check-in"}. Complete verification active.`
                    : "Fresh GPS must be within 750m of the site to check in."}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-[#9E6924] group-hover:translate-x-0.5 transition shrink-0" />
            </button>

            {/* 3 Metrics Strip */}
            <div className="grid grid-cols-3 divide-x divide-[#E6DFD3] border-y border-[#E6DFD3] py-2.5 my-1">
              <div className="px-2">
                <div className="text-[10px] text-beige-muted font-medium flex items-center gap-1">
                  <RouteIcon className="w-3 h-3 text-[#1E3F35]" />
                  <span>Distance (est.)</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-beige-text mt-0.5">
                  12.8 km
                </div>
              </div>

              <div className="px-3">
                <div className="text-[10px] text-beige-muted font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#9E6924]" />
                  <span>Estimated Time</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-beige-text mt-0.5">
                  {visit.estimatedDuration || "27 mins"}
                </div>
              </div>

              <div className="px-3">
                <div className="text-[10px] text-beige-muted font-medium flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-[#1E3F35]" />
                  <span>Geofence Radius</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-beige-text mt-0.5">
                  750 m
                </div>
              </div>
            </div>

            {/* Action Buttons Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              {/* Primary Action Button */}
              {isCheckedIn ? (
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(true)}
                  className="py-2.5 px-3.5 rounded-xl text-xs font-bold bg-[#1E3F35] hover:bg-[#162F27] text-white shadow-xs transition flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Complete Visit</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleQuickCheckIn}
                  disabled={isCheckingIn}
                  className="py-2.5 px-3.5 rounded-xl text-xs font-bold bg-[#1E3F35] hover:bg-[#162F27] text-white shadow-xs transition flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {isCheckingIn ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verify GPS &amp; Check In</span>
                    </>
                  )}
                </button>
              )}

              {/* Start Navigation Button */}
              <Link
                href={`/agent/routes?visitId=${encodeURIComponent(visit.id)}&start=true`}
                className="py-2.5 px-3.5 rounded-xl text-xs font-bold bg-[#1E3F35] hover:bg-[#162F27] text-white shadow-xs transition flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                <Navigation className="w-3.5 h-3.5 text-white" />
                <span>Start Navigation</span>
              </Link>

              {/* Visit Details Button */}
              <button
                type="button"
                onClick={() => onOpenDetails(visit)}
                className="py-2.5 px-3.5 rounded-xl text-xs font-bold bg-white hover:bg-[#F9F7F2] text-[#1E3F35] border border-[#E6DFD3] transition flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Visit Details</span>
              </button>
            </div>
          </div>

          {/* Right Column: Live Embedded Route Map */}
          <div className="lg:col-span-5 min-h-[260px] sm:min-h-[300px] relative rounded-2xl overflow-hidden border border-[#E6DFD3] shadow-inner bg-[#EFECE6]">
            {/* Map Container */}
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" />

            {/* Floating Top-Left Controls */}
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 bg-white/95 backdrop-blur-md rounded-xl border border-[#E6DFD3] p-1 shadow-xs">
              <button
                type="button"
                onClick={() => handleZoom(1)}
                className="p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand/60 transition"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleZoom(-1)}
                className="p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand/60 transition"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Floating Top-Right Re-center Button */}
            <div className="absolute top-3 right-3 z-10">
              <button
                type="button"
                onClick={handleRecenter}
                className="p-2 rounded-xl bg-white/95 backdrop-blur-md border border-[#E6DFD3] text-beige-muted hover:text-[#1E3F35] hover:bg-beige-sand/60 shadow-xs transition"
                title="Re-center on Route"
              >
                <Crosshair className="w-4 h-4" />
              </button>
            </div>

            {/* Floating Bottom Trip ETA Card */}
            <div className="absolute bottom-3 right-3 z-10 bg-white/95 backdrop-blur-md border border-[#E6DFD3] rounded-2xl px-3.5 py-2 shadow-md flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-[#1E3F35]" />
                <div>
                  <span className="text-xs font-bold text-beige-text block leading-tight">
                    12.8 km
                  </span>
                  <span className="text-[9px] text-beige-muted block">Distance</span>
                </div>
              </div>

              <div className="h-6 w-px bg-[#E6DFD3]" />

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#9E6924]" />
                <div>
                  <span className="text-xs font-bold text-beige-text block leading-tight">
                    27 mins
                  </span>
                  <span className="text-[9px] text-beige-muted block">ETA</span>
                </div>
              </div>
            </div>
          </div>
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
