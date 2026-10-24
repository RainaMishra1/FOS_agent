"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  MapPin,
  Navigation,
  Compass,
  CheckCircle2,
  CornerUpRight,
  CornerUpLeft,
  ArrowUp,
  RotateCcw,
  Volume2,
  VolumeX,
  LocateFixed,
  ExternalLink,
  X,
  Play,
  Pause,
  ListOrdered,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { RouteLeg, RouteStep } from "@/lib/api";

export interface RouteMapStop {
  id: string;
  customer_name?: string | null;
  customer_address?: string | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  status: string;
  order_index?: number;
  distance_meters?: number | null;
  is_nearest?: boolean;
}

interface AgentRoadRouteMapProps {
  origin: { latitude: number; longitude: number } | null;
  stops: RouteMapStop[];
  geometry: [number, number][];
  selectedStopId?: string | null;
  onSelectStop?: (stop: RouteMapStop) => void;
  onGetRoute?: (stop: RouteMapStop) => void;
  singleDestinationMode?: boolean;
  activeDestinationStop?: RouteMapStop | null;
  legs?: RouteLeg[];
  isNavigating?: boolean;
  onStartNavigation?: (stop?: RouteMapStop | null) => void;
  onStopNavigation?: () => void;
  onCheckIn?: (stop: RouteMapStop) => void;
}

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDist(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export default function AgentRoadRouteMap({
  origin,
  stops,
  geometry,
  selectedStopId,
  onSelectStop,
  onGetRoute,
  singleDestinationMode = false,
  activeDestinationStop,
  legs = [],
  isNavigating = false,
  onStartNavigation,
  onStopNavigation,
  onCheckIn,
}: AgentRoadRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const vehicleMarkerRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [showStepsDrawer, setShowStepsDrawer] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isSimulating, setIsSimulating] = useState(true);

  // Active navigation progress state
  const [simIndex, setSimIndex] = useState(0);
  const [currentBearing, setCurrentBearing] = useState(0);
  const [userPannedAway, setUserPannedAway] = useState(false);

  // Load Leaflet dynamically
  useEffect(() => {
    const w = window as any;
    if (w.L) {
      setReady(true);
      return;
    }
    let link = document.getElementById("fos-agent-leaflet-css") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = "fos-agent-leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    let script = document.getElementById("fos-agent-leaflet-js") as HTMLScriptElement | null;
    const onLoad = () => setReady(Boolean((window as any).L));
    if (!script) {
      script = document.createElement("script");
      script.id = "fos-agent-leaflet-js";
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

  // Ordered route coordinates in Leaflet [lat, lon] format
  const routeLatLngs = useMemo<[number, number][]>(() => {
    if (!geometry || geometry.length < 2) return [];
    return geometry.map(([lon, lat]) => [lat, lon]);
  }, [geometry]);

  // Current active navigation position
  const currentPos = useMemo<[number, number]>(() => {
    if (isNavigating && routeLatLngs.length > 0) {
      const idx = Math.min(simIndex, routeLatLngs.length - 1);
      return routeLatLngs[idx];
    }
    if (origin) return [origin.latitude, origin.longitude];
    if (routeLatLngs.length > 0) return routeLatLngs[0];
    return [19.2403, 73.1305]; // Kalyan default
  }, [isNavigating, routeLatLngs, simIndex, origin]);

  // Derived turn-by-turn steps from OSRM or synthesized from route coordinates
  const navigationSteps = useMemo(() => {
    if (legs && legs.length > 0 && legs[0].steps && legs[0].steps.length > 0) {
      return legs[0].steps.map((st, i) => {
        const mod = st.maneuver?.modifier || "";
        const type = st.maneuver?.type || "";
        const name = st.name || (i === 0 ? "Current Road" : "Connecting Road");
        let instruction = "";
        let iconType: "left" | "right" | "straight" | "arrive" = "straight";

        if (type === "arrive") {
          instruction = `Arrive at ${activeDestinationStop?.customer_name || "destination"}`;
          iconType = "arrive";
        } else if (mod.includes("left")) {
          instruction = `Turn left onto ${name}`;
          iconType = "left";
        } else if (mod.includes("right")) {
          instruction = `Turn right onto ${name}`;
          iconType = "right";
        } else {
          instruction = i === 0 ? `Head towards ${name}` : `Continue straight on ${name}`;
          iconType = "straight";
        }

        return {
          id: `step-${i}`,
          instruction,
          distanceMeters: st.distance,
          iconType,
          name,
        };
      });
    }

    // Real steps based on destination and road path
    const destName = activeDestinationStop?.customer_name || "Customer Destination";
    const destAddr = activeDestinationStop?.customer_address || "Designated Location";
    if (activeDestinationStop) {
      const dist = Math.round(activeDestinationStop.distance_meters || 500);
      return [
        {
          id: "step-0",
          instruction: `Drive toward ${destAddr}`,
          distanceMeters: dist,
          iconType: "straight" as const,
          name: destAddr,
        },
        {
          id: "step-1",
          instruction: `Arrive at ${destName}`,
          distanceMeters: 50,
          iconType: "arrive" as const,
          name: destName,
        },
      ];
    }
    return [];
  }, [legs, activeDestinationStop]);

  // Current maneuver based on simulation progress
  const currentStep = useMemo(() => {
    if (!navigationSteps.length) return null;
    const progressPct = routeLatLngs.length > 1 ? simIndex / (routeLatLngs.length - 1) : 0;
    const stepIdx = Math.min(Math.floor(progressPct * navigationSteps.length), navigationSteps.length - 1);
    return navigationSteps[stepIdx];
  }, [navigationSteps, simIndex, routeLatLngs.length]);

  const nextStep = useMemo(() => {
    if (!navigationSteps.length) return null;
    const progressPct = routeLatLngs.length > 1 ? simIndex / (routeLatLngs.length - 1) : 0;
    const stepIdx = Math.min(Math.floor(progressPct * navigationSteps.length) + 1, navigationSteps.length - 1);
    return navigationSteps[stepIdx] || null;
  }, [navigationSteps, simIndex, routeLatLngs.length]);

  // Calculate remaining distance and ETA
  const remainingDistanceMeters = useMemo(() => {
    if (routeLatLngs.length > 1) {
      let dist = 0;
      for (let i = simIndex; i < routeLatLngs.length - 1; i++) {
        dist += distanceMeters(routeLatLngs[i][0], routeLatLngs[i][1], routeLatLngs[i + 1][0], routeLatLngs[i + 1][1]);
      }
      return Math.max(dist, 20);
    }
    if (activeDestinationStop?.distance_meters) {
      return activeDestinationStop.distance_meters;
    }
    return 0;
  }, [routeLatLngs, simIndex, activeDestinationStop]);

  const remainingSeconds = useMemo(() => {
    if (remainingDistanceMeters <= 0) return 0;
    // Average 30 km/h = ~8.33 m/s
    return Math.max(60, Math.round(remainingDistanceMeters / 8.33));
  }, [remainingDistanceMeters]);

  const etaString = useMemo(() => {
    const etaDate = new Date(Date.now() + remainingSeconds * 1000);
    return etaDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [remainingSeconds]);

  // Reset simulation when starting navigation
  useEffect(() => {
    if (isNavigating) {
      setSimIndex(0);
      setUserPannedAway(false);
    }
  }, [isNavigating]);

  // Navigation driving simulation interval
  useEffect(() => {
    if (!isNavigating || !isSimulating || routeLatLngs.length < 2) return;

    const timer = setInterval(() => {
      setSimIndex((prev) => {
        if (prev >= routeLatLngs.length - 1) {
          return prev; // Reached end of destination
        }
        const next = prev + 1;
        // Calculate bearing between current and next coordinate
        const p1 = routeLatLngs[prev];
        const p2 = routeLatLngs[next];
        const b = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
        setCurrentBearing(b);
        return next;
      });
    }, 1400);

    return () => clearInterval(timer);
  }, [isNavigating, isSimulating, routeLatLngs]);

  // Initialize and update Leaflet Map
  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !mapRef.current) return;

    if (!instanceRef.current) {
      const map = L.map(mapRef.current, {
        zoomControl: !isNavigating,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      map.on("dragstart", () => {
        if (isNavigating) setUserPannedAway(true);
      });

      instanceRef.current = map;
      layerRef.current = L.featureGroup().addTo(map);
    }

    const map = instanceRef.current;
    const layer = layerRef.current;
    layer.clearLayers();
    const bounds: [number, number][] = [];

    // 1. Draw Destination / Task Markers
    stops.forEach((stop, index) => {
      if (stop.customer_latitude == null || stop.customer_longitude == null) return;
      const pos: [number, number] = [stop.customer_latitude, stop.customer_longitude];
      const isSelected = selectedStopId === stop.id;
      const isNearest = Boolean(stop.is_nearest);
      const isDone = stop.status === "completed";
      const isInProgress = stop.status === "in_progress";

      const bg = isSelected ? "#1E3F35" : isNearest ? "#2D6A4F" : isDone ? "#40916C" : isInProgress ? "#1E3F35" : "#6B7280";
      const border = isSelected ? "3px solid #ffffff" : isNearest ? "3px solid #EAF2EC" : "2px solid #ffffff";
      const stopBadge = stop.order_index ?? index + 1;
      const labelText = isNearest ? `★ ${stopBadge}` : `${stopBadge}`;

      const customIcon = L.divIcon({
        className: "custom-task-marker",
        html: `
          <div style="
            background: ${bg};
            color: #ffffff;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            border: ${border};
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
          ">
            ${labelText}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker(pos, { icon: customIcon, zIndexOffset: isSelected ? 1000 : 500 });
      marker.bindTooltip(
        `<div style="font-size: 11px; font-weight: 600;">${stop.customer_name || "Customer Site"}<br/><span style="color: #666; font-weight: normal;">${stop.customer_address || ""}</span></div>`,
        { direction: "top" }
      );
      marker.on("click", () => onSelectStop?.(stop));
      marker.addTo(layer);
      bounds.push(pos);
    });

    // 2. Draw Polyline Route
    if (routeLatLngs.length > 1) {
      // Glow background line
      L.polyline(routeLatLngs, {
        color: "#1E3F35",
        weight: isNavigating ? 8 : 6,
        opacity: isNavigating ? 0.3 : 0.2,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer);

      // Main active navigation polyline
      L.polyline(routeLatLngs, {
        color: "#2D6A4F",
        weight: isNavigating ? 6 : 4,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer);
    }

    // 3. Draw Vehicle / Live Agent Marker
    const vehicleIconHtml = isNavigating
      ? `
        <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; inset: 0; background: rgba(30, 63, 53, 0.25); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="
            background: #1E3F35;
            color: #ffffff;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 3px solid #ffffff;
            box-shadow: 0 4px 14px rgba(0,0,0,0.4);
            transform: rotate(${currentBearing}deg);
            transition: transform 0.4s ease;
          ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="1">
              <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
            </svg>
          </div>
        </div>
      `
      : `
        <div style="
          background: #1E3F35;
          color: #ffffff;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        ">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
          </svg>
        </div>
      `;

    const vehicleIcon = L.divIcon({
      className: "custom-vehicle-marker",
      html: vehicleIconHtml,
      iconSize: isNavigating ? [44, 44] : [30, 30],
      iconAnchor: isNavigating ? [22, 22] : [15, 15],
    });

    vehicleMarkerRef.current = L.marker(currentPos, {
      icon: vehicleIcon,
      zIndexOffset: 2000,
      title: "Your GPS Vehicle Position",
    }).addTo(layer);

    bounds.push(currentPos);

    // Camera Framing
    if (isNavigating) {
      if (!userPannedAway) {
        if (bounds.length > 1) {
          map.fitBounds(L.latLngBounds(bounds), { padding: [60, 60], maxZoom: 16 });
        } else {
          map.setView(currentPos, 16, { animate: true });
        }
      }
    } else {
      if (bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 15 });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      }
    }

    setTimeout(() => map.invalidateSize(), 150);
  }, [ready, stops, routeLatLngs, isNavigating, currentPos, currentBearing, selectedStopId, userPannedAway]);

  const handleRecenter = () => {
    setUserPannedAway(false);
    if (instanceRef.current && currentPos) {
      instanceRef.current.setView(currentPos, 17, { animate: true });
    }
  };

  const googleMapsUrl = activeDestinationStop?.customer_latitude != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${activeDestinationStop.customer_latitude},${activeDestinationStop.customer_longitude}&travelmode=driving`
    : `https://www.google.com/maps`;

  return (
    <div className={`relative isolate z-0 overflow-hidden rounded-2xl border border-[#E6DFD3] bg-[#F5F2EB] shadow-xs transition-all duration-300 ${isNavigating ? "h-[540px] sm:h-[600px]" : "h-[440px]"}`}>
      {/* Map DOM Element */}
      <div ref={mapRef} className="absolute inset-0" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F5F2EB]/90 text-xs font-semibold text-beige-muted">
          Loading OpenStreetMap Navigation…
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODE A: GOOGLE MAPS ACTIVE DRIVING HUD (isNavigating = true)
         ───────────────────────────────────────────────────────────── */}
      {isNavigating && (
        <>
          {/* 1. TOP MANEUVER BANNER (Google Maps Dark Emerald Card) */}
          <div className="absolute top-3 left-3 right-3 z-[1000] max-w-lg mx-auto">
            <div className="rounded-2xl bg-[#15332A] text-white p-3.5 sm:p-4 shadow-xl border border-white/10 backdrop-blur-md flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Big Direction Icon */}
                <div className="w-12 h-12 rounded-2xl bg-white/15 text-white flex items-center justify-center shrink-0 border border-white/20 shadow-inner">
                  {currentStep?.iconType === "left" ? (
                    <CornerUpLeft className="w-6 h-6 text-[#9AE6B4]" />
                  ) : currentStep?.iconType === "right" ? (
                    <CornerUpRight className="w-6 h-6 text-[#9AE6B4]" />
                  ) : currentStep?.iconType === "arrive" ? (
                    <MapPin className="w-6 h-6 text-[#9AE6B4]" />
                  ) : (
                    <ArrowUp className="w-6 h-6 text-[#9AE6B4]" />
                  )}
                </div>

                {/* Turn Instruction Text */}
                <div className="min-w-0">
                  <div className="text-sm sm:text-base font-bold tracking-tight text-white truncate">
                    {currentStep?.instruction || "Continue on route"}
                  </div>
                  {nextStep && (
                    <div className="text-[11px] text-[#A0AEC0] flex items-center gap-1.5 mt-0.5 truncate">
                      <span>Then</span>
                      <span className="text-white/90 truncate">{nextStep.instruction}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Speed & GPS Indicator */}
              <div className="text-right shrink-0 border-l border-white/15 pl-3">
                <span className="text-xs font-mono font-bold text-[#9AE6B4] block">{isNavigating ? "LIVE GPS" : "READY"}</span>
                <span className="text-[9px] uppercase tracking-wider text-white/70 font-semibold block">Turn-by-Turn</span>
              </div>
            </div>
          </div>

          {/* 2. FLOATING QUICK ACTION BUTTONS (Right Side) */}
          <div className="absolute right-3 top-24 z-[1000] flex flex-col gap-2">
            {/* Re-center Button */}
            {userPannedAway && (
              <button
                type="button"
                onClick={handleRecenter}
                className="w-10 h-10 rounded-xl bg-white border border-[#E6DFD3] text-[#1E3F35] shadow-lg flex items-center justify-center hover:bg-[#F9F7F2] transition cursor-pointer"
                title="Re-center on vehicle"
              >
                <LocateFixed className="w-5 h-5 text-[#1E3F35]" />
              </button>
            )}

            {/* Turn-by-Turn Steps List Modal Toggle */}
            <button
              type="button"
              onClick={() => setShowStepsDrawer(!showStepsDrawer)}
              className="w-10 h-10 rounded-xl bg-white border border-[#E6DFD3] text-[#1E3F35] shadow-lg flex items-center justify-center hover:bg-[#F9F7F2] transition cursor-pointer"
              title="Show turn-by-turn directions"
            >
              <ListOrdered className="w-5 h-5 text-[#1E3F35]" />
            </button>

            {/* Simulation Pause/Play Toggle */}
            <button
              type="button"
              onClick={() => setIsSimulating(!isSimulating)}
              className="w-10 h-10 rounded-xl bg-white border border-[#E6DFD3] text-[#1E3F35] shadow-lg flex items-center justify-center hover:bg-[#F9F7F2] transition cursor-pointer"
              title={isSimulating ? "Pause driving simulation" : "Resume driving simulation"}
            >
              {isSimulating ? <Pause className="w-4 h-4 text-[#1E3F35]" /> : <Play className="w-4 h-4 text-[#1E3F35]" />}
            </button>

            {/* Open directly in Google Maps Mobile / Web */}
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white border border-[#E6DFD3] text-[#1E3F35] shadow-lg flex items-center justify-center hover:bg-[#F9F7F2] transition cursor-pointer"
              title="Open Navigation in Google Maps"
            >
              <ExternalLink className="w-4 h-4 text-[#1E3F35]" />
            </a>
          </div>

          {/* 3. BOTTOM FLOATING HUD (Google Maps ETA & Controls Card) */}
          <div className="absolute bottom-3 left-3 right-3 z-[1000] max-w-lg mx-auto">
            <div className="rounded-2xl bg-white/95 backdrop-blur-md border border-[#E6DFD3] p-4 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                {/* Left: ETA, Remaining Time, Remaining Distance */}
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-black text-[#1E3F35] tracking-tight">
                      {etaString}
                    </span>
                    <span className="text-xs font-bold text-[#1E3F35]">
                      {Math.ceil(remainingSeconds / 60)} min
                    </span>
                    <span className="text-xs text-beige-muted">·</span>
                    <span className="text-xs font-semibold text-beige-muted">
                      {formatDist(remainingDistanceMeters)}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-beige-text truncate">
                    Destination: {activeDestinationStop?.customer_name || "Assigned Task Site"}
                  </div>
                </div>

                {/* Right: Exit / Stop Button */}
                <div className="flex items-center gap-2 shrink-0">
                  {onCheckIn && activeDestinationStop && (
                    <button
                      type="button"
                      onClick={() => onCheckIn(activeDestinationStop)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#EAF2EC] text-[#1E3F35] border border-[#CDE1D2] hover:bg-[#D8E9DC] transition cursor-pointer"
                    >
                      Check In
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onStopNavigation}
                    className="w-10 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center justify-center transition cursor-pointer"
                    title="Exit Navigation"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Progress bar along route */}
              <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#1E3F35] h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${routeLatLngs.length > 1 ? Math.min(100, Math.round((simIndex / (routeLatLngs.length - 1)) * 100)) : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* 4. TURN-BY-TURN STEPS OVERLAY DRAWER */}
          {showStepsDrawer && (
            <div className="absolute inset-x-3 bottom-24 top-20 z-[1001] bg-white/98 backdrop-blur-md rounded-2xl border border-[#E6DFD3] shadow-2xl p-4 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-[#E6DFD3]">
                <div className="flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-[#1E3F35]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#1E3F35]">
                    Turn-by-Turn Directions
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStepsDrawer(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[#E6DFD3]/60 py-2 space-y-1">
                {navigationSteps.map((step, idx) => (
                  <div key={step.id} className="py-2.5 flex items-start gap-3 text-xs">
                    <span className="w-6 h-6 rounded-lg bg-[#EAF2EC] text-[#1E3F35] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-beige-text leading-tight">{step.instruction}</p>
                      <p className="text-[10px] text-beige-muted mt-0.5">{formatDist(step.distanceMeters)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-[#E6DFD3] text-center">
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-[#1E3F35] hover:underline inline-flex items-center gap-1"
                >
                  <span>Open in Google Maps App</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODE B: NORMAL OVERVIEW MAP (isNavigating = false)
         ───────────────────────────────────────────────────────────── */}
      {!isNavigating && (
        <>
          {/* Header Legend */}
          <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-[#E6DFD3] bg-white/95 px-3 py-2 text-xs font-semibold shadow-xs backdrop-blur-md">
            <span className="flex items-center gap-1.5 text-beige-text">
              <Navigation className="h-4 w-4 text-[#1E3F35]" />
              {singleDestinationMode ? "Direct Route" : "All Stops Route"}
            </span>
            <span className="text-beige-muted">·</span>
            <span className="flex items-center gap-1 text-[#1E3F35]">
              <span className="h-2 w-2 rounded-full bg-[#1E3F35] inline-block" />
              {origin ? "Your GPS Location" : "GPS Unavailable"}
            </span>
            {activeDestinationStop && (
              <>
                <span className="text-beige-muted">·</span>
                <span className="flex items-center gap-1 text-[#1E3F35] font-bold truncate max-w-[160px]">
                  <MapPin className="h-3.5 w-3.5 text-[#1E3F35]" />
                  {activeDestinationStop.customer_name}
                </span>
              </>
            )}
          </div>

          {/* Start Driving Navigation Prominent Button on Map */}
          {activeDestinationStop && onStartNavigation && (
            <div className="absolute right-3 top-3 z-10">
              <button
                type="button"
                onClick={() => onStartNavigation(activeDestinationStop)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1E3F35] hover:bg-[#162F27] text-white font-bold text-xs shadow-md transition transform hover:scale-102 cursor-pointer"
              >
                <Navigation className="w-4 h-4 text-white" />
                <span>Start Navigation</span>
              </button>
            </div>
          )}

          {/* Hint overlay at bottom */}
          <div className="absolute right-3 bottom-3 z-10 rounded-lg border border-[#E6DFD3] bg-white/90 px-2.5 py-1 text-[10px] text-beige-muted shadow-xs pointer-events-none">
            Click marker to select task · OSRM Road Geometry
          </div>
        </>
      )}
    </div>
  );
}
