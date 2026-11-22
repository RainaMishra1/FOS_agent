"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
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
  ListOrdered,
  Phone,
  ChevronDown,
  ChevronsRight,
  Flag,
} from "lucide-react";
import { RouteLeg, RouteStep, TrafficSpeedInterval } from "@/lib/api";

export interface RouteMapStop {
  id: string;
  customer_name?: string | null;
  customer_address?: string | null;
  customer_phone?: string | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  status: string;
  order_index?: number;
  distance_meters?: number | null;
  is_nearest?: boolean;
}

const EMPTY_TRAFFIC_INTERVALS: TrafficSpeedInterval[] = [];
const CHECK_IN_RADIUS_METERS = 750;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  trafficAware?: boolean;
  trafficSpeedIntervals?: TrafficSpeedInterval[];
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
  trafficAware = false,
  trafficSpeedIntervals = EMPTY_TRAFFIC_INTERVALS,
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
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [userPannedAway, setUserPannedAway] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => setPortalReady(true), []);

  // Full-screen trip mode: lock page scroll, keep the screen awake, start following the agent.
  useEffect(() => {
    if (!isNavigating) return;
    setUserPannedAway(false);
    setSheetExpanded(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let wakeLock: any = null;
    let cancelled = false;
    const requestWakeLock = async () => {
      try {
        const nav = navigator as any;
        if (nav.wakeLock?.request && document.visibilityState === "visible") {
          wakeLock = await nav.wakeLock.request("screen");
          if (cancelled) wakeLock?.release?.();
        }
      } catch {
        // Wake lock is optional (unsupported browser or battery saver).
      }
    };
    void requestWakeLock();
    const onVisible = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("visibilitychange", onVisible);
      try {
        wakeLock?.release?.();
      } catch {
        // ignore
      }
    };
  }, [isNavigating]);

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

  // Current active navigation position (stays at agent's real GPS position)
  const currentPos = useMemo<[number, number] | null>(() => {
    if (origin) return [origin.latitude, origin.longitude];
    if (routeLatLngs.length > 0) return routeLatLngs[0];
    return null;
  }, [origin, routeLatLngs]);

  // Bearing towards next road segment
  const currentBearing = useMemo(() => {
    if (!currentPos || routeLatLngs.length < 2) return 0;
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    routeLatLngs.forEach((point, index) => {
      const distance = distanceMeters(currentPos[0], currentPos[1], point[0], point[1]);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });
    const nextPoint = routeLatLngs[Math.min(nearestIndex + 1, routeLatLngs.length - 1)];
    return calculateBearing(currentPos[0], currentPos[1], nextPoint[0], nextPoint[1]);
  }, [routeLatLngs, currentPos]);

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
          instruction = st.maneuver?.instruction || `Arrive at ${activeDestinationStop?.customer_name || "destination"}`;
          iconType = "arrive";
        } else if (mod.includes("left")) {
          instruction = st.maneuver?.instruction || `Turn left onto ${name}`;
          iconType = "left";
        } else if (mod.includes("right")) {
          instruction = st.maneuver?.instruction || `Turn right onto ${name}`;
          iconType = "right";
        } else {
          instruction = st.maneuver?.instruction || (i === 0 ? `Head towards ${name}` : `Continue straight on ${name}`);
          iconType = "straight";
        }

        return {
          id: `step-${i}`,
          instruction,
          distanceMeters: st.distance,
          iconType,
          name,
          location: st.maneuver?.location,
        };
      });
    }

    return [];
  }, [legs, activeDestinationStop]);

  // Current maneuver based on active route
  const currentStepIndex = useMemo(() => {
    if (!navigationSteps.length) return null;
    if (!currentPos) return 0;
    let closestIndex = 0;
    let closestDistance = Infinity;
    navigationSteps.forEach((step, index) => {
      if (!step.location) return;
      const distance = distanceMeters(currentPos[0], currentPos[1], step.location[1], step.location[0]);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    return closestIndex;
  }, [navigationSteps, currentPos]);

  // The banner shows the UPCOMING maneuver: once the agent is at (or past) the closest
  // maneuver point, advance to the next one, like ride-hailing apps do.
  const bannerStepIndex = useMemo(() => {
    if (currentStepIndex == null) return null;
    const step = navigationSteps[currentStepIndex];
    if (!currentPos || !step?.location || step.iconType === "arrive") return currentStepIndex;
    const d = distanceMeters(currentPos[0], currentPos[1], step.location[1], step.location[0]);
    return d < 30 && currentStepIndex + 1 < navigationSteps.length ? currentStepIndex + 1 : currentStepIndex;
  }, [currentStepIndex, navigationSteps, currentPos]);

  const bannerStep = bannerStepIndex == null ? null : navigationSteps[bannerStepIndex];
  const bannerThenStep = bannerStepIndex == null ? null : navigationSteps[bannerStepIndex + 1] ?? null;

  const distanceToManeuver = useMemo(() => {
    if (!currentPos || !bannerStep?.location) return null;
    return distanceMeters(currentPos[0], currentPos[1], bannerStep.location[1], bannerStep.location[0]);
  }, [currentPos, bannerStep]);

  const distanceToDestination = useMemo(() => {
    if (!currentPos || activeDestinationStop?.customer_latitude == null || activeDestinationStop?.customer_longitude == null) return null;
    return distanceMeters(currentPos[0], currentPos[1], activeDestinationStop.customer_latitude, activeDestinationStop.customer_longitude);
  }, [currentPos, activeDestinationStop?.customer_latitude, activeDestinationStop?.customer_longitude]);

  // Same 750 m radius the server uses for check-in (testing value).
  const arrivalZone = distanceToDestination != null && distanceToDestination <= CHECK_IN_RADIUS_METERS;

  const nextStep = useMemo(() => {
    if (currentStepIndex == null || currentStepIndex + 1 >= navigationSteps.length) return null;
    return navigationSteps[currentStepIndex + 1];
  }, [navigationSteps, currentStepIndex]);

  // Calculate remaining distance and ETA to destination
  const remainingDistanceMeters = useMemo(() => {
    if (legs && legs.length > 0 && legs[0].distance) {
      return legs[0].distance;
    }
    if (routeLatLngs.length > 1) {
      let dist = 0;
      for (let i = 0; i < routeLatLngs.length - 1; i++) {
        dist += distanceMeters(routeLatLngs[i][0], routeLatLngs[i][1], routeLatLngs[i + 1][0], routeLatLngs[i + 1][1]);
      }
      return dist;
    }
    return 0;
  }, [legs, routeLatLngs, activeDestinationStop]);

  const remainingSeconds = legs[0]?.duration ?? null;

  const etaString = useMemo(() => {
    if (remainingSeconds == null) return "—";
    const etaDate = new Date(Date.now() + remainingSeconds * 1000);
    return etaDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [remainingSeconds]);

  // Invalidate map size when toggling navigation mode or container size changes
  useEffect(() => {
    if (!instanceRef.current) return;
    instanceRef.current.invalidateSize();
    const t1 = setTimeout(() => instanceRef.current?.invalidateSize(), 60);
    const t2 = setTimeout(() => instanceRef.current?.invalidateSize(), 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isNavigating]);

  // Follow the live GPS position while navigating unless the agent pans the map.
  useEffect(() => {
    if (!ready || !vehicleMarkerRef.current || !currentPos) return;
    vehicleMarkerRef.current.setLatLng(currentPos);
    if (isNavigating && !userPannedAway && instanceRef.current) {
      instanceRef.current.setView(currentPos, instanceRef.current.getZoom(), { animate: true });
    }
  }, [ready, currentPos, isNavigating, userPannedAway]);

  // Dedicated effect for vehicle arrow bearing rotation
  useEffect(() => {
    if (!vehicleMarkerRef.current) return;
    const el = vehicleMarkerRef.current.getElement();
    if (el) {
      const arrow = el.querySelector(".vehicle-arrow") as HTMLElement | null;
      if (arrow) {
        arrow.style.transform = `rotate(${currentBearing}deg)`;
      }
    }
  }, [currentBearing]);

  // Initialize and update static map layers (stops, routes, camera bounds)
  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !mapRef.current) return;

    try {
      if (!instanceRef.current) {
        if ((mapRef.current as any)._leaflet_id) {
          delete (mapRef.current as any)._leaflet_id;
        }

        const map = L.map(mapRef.current, {
          zoomControl: !isNavigating,
          attributionControl: true,
        });

        // OSM tiles, softened with CSS (see globals.css) so the route stands out like in ride-hailing apps.
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          className: "fos-soft-tiles",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        }).addTo(map);
        if (!isNavigating && map.zoomControl) map.zoomControl.setPosition("topright");

        map.on("dragstart", () => {
          if (isNavigating) setUserPannedAway(true);
        });

        instanceRef.current = map;
        layerRef.current = L.featureGroup().addTo(map);
      }
    } catch (err) {
      console.warn("Leaflet AgentRoadRouteMap init warning:", err);
    }

    const map = instanceRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];

    // 1. Draw Destination / Task Markers
    stops.forEach((stop, index) => {
      if (stop.customer_latitude == null || stop.customer_longitude == null) return;
      const pos: [number, number] = [stop.customer_latitude, stop.customer_longitude];
      const isSelected = selectedStopId === stop.id;
      const isDestination = isNavigating && activeDestinationStop?.id === stop.id;
      const isNearest = Boolean(stop.is_nearest);
      const isDone = stop.status === "completed";
      const isInProgress = stop.status === "in_progress";

      const bg = isDestination ? "#1E3F35" : isSelected ? "#1E3F35" : isNearest ? "#2D6A4F" : isDone ? "#40916C" : isInProgress ? "#1E3F35" : "#6B7280";
      const border = isDestination ? "3px solid #F59E0B" : isSelected ? "3px solid #ffffff" : isNearest ? "3px solid #EAF2EC" : "2px solid #ffffff";
      const stopBadge = stop.order_index ?? index + 1;
      const labelText = isDestination ? "🎯" : isNearest ? `★ ${stopBadge}` : `${stopBadge}`;
      const opacityStyle = isNavigating && !isDestination ? "opacity: 0.5; transform: scale(0.85);" : "";

      const customIcon = isDestination ? L.divIcon({
        className: "custom-task-marker",
        html: `
          <div style="position: relative; width: 34px; height: 44px;">
            <div style="position: absolute; left: 3px; top: 0; width: 28px; height: 28px; background: #000; border: 3px solid #fff; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
              <div style="width: 8px; height: 8px; background: #fff; border-radius: 1px;"></div>
            </div>
            <div style="position: absolute; left: 16px; top: 28px; width: 2px; height: 14px; background: #000;"></div>
          </div>
        `,
        iconSize: [34, 44],
        iconAnchor: [17, 43],
      }) : L.divIcon({
        className: "custom-task-marker",
        html: `
          <div style="
            background: ${bg};
            color: #ffffff;
            width: ${isDestination ? "38px" : "32px"};
            height: ${isDestination ? "38px" : "32px"};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${isDestination ? "14px" : "11px"};
            font-weight: 700;
            border: ${border};
            box-shadow: 0 4px 14px rgba(0,0,0,0.35);
            transition: all 0.2s ease;
            ${opacityStyle}
          ">
            ${labelText}
          </div>
        `,
        iconSize: isDestination ? [38, 38] : [32, 32],
        iconAnchor: isDestination ? [19, 19] : [16, 16],
      });

      const marker = L.marker(pos, { icon: customIcon, zIndexOffset: isDestination ? 1500 : isSelected ? 1000 : 500 });
      marker.bindTooltip(
        `<div style="font-size: 11px; font-weight: 600;">${escapeHtml(stop.customer_name || "Customer Site")}<br/><span style="color: #666; font-weight: normal;">${escapeHtml(stop.customer_address || "")}</span></div>`,
        { direction: "top" }
      );
      marker.on("click", () => onSelectStop?.(stop));
      marker.addTo(layer);

      // In navigation mode, only add destination to camera bounds
      if (!isNavigating) {
        bounds.push(pos);
      }
    });

    // 2. Draw Polyline Route
    if (routeLatLngs.length > 1) {
      // Glow background line
      L.polyline(routeLatLngs, {
        color: isNavigating ? "#FFFFFF" : "#1E3F35",
        weight: isNavigating ? 11 : 6,
        opacity: isNavigating ? 0.95 : 0.2,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer);

      if (trafficAware && trafficSpeedIntervals.length > 0) {
        let nextStart = 0;
        for (const interval of trafficSpeedIntervals) {
          const start = interval.startPolylinePointIndex ?? nextStart;
          const end = Math.min(interval.endPolylinePointIndex, routeLatLngs.length);
          const segment = routeLatLngs.slice(start, end);
          nextStart = end;
          if (segment.length < 2) continue;
          const color = interval.speed === "TRAFFIC_JAM" ? "#D93025" : interval.speed === "SLOW" ? "#F9AB00" : "#188038";
          L.polyline(segment, {
            color,
            weight: isNavigating ? 6 : 4,
            opacity: 0.98,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(layer);
        }
      } else {
        L.polyline(routeLatLngs, {
          color: isNavigating ? "#111111" : "#2D6A4F",
          weight: isNavigating ? 6 : 4,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(layer);
      }
    }

    // 3. Draw Vehicle / Live Agent Marker
    const vehicleIconHtml = isNavigating
      ? `
        <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; inset: 0; background: rgba(39, 110, 241, 0.25); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div class="vehicle-arrow" style="
            background: #276EF1;
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
            transition: transform 0.3s ease;
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

    if (currentPos) {
      vehicleMarkerRef.current = L.marker(currentPos, {
        icon: vehicleIcon,
        zIndexOffset: 2000,
        title: "Your GPS location",
      }).addTo(layer);
    }

    // Camera bounds framing
    if (isNavigating) {
      const navBounds: [number, number][] = currentPos ? [currentPos] : [];
      if (activeDestinationStop?.customer_latitude != null && activeDestinationStop?.customer_longitude != null) {
        navBounds.push([activeDestinationStop.customer_latitude, activeDestinationStop.customer_longitude]);
      }
      if (routeLatLngs.length > 0) {
        const end = Math.min(routeLatLngs.length, 15);
        for (let i = 0; i < end; i++) {
          navBounds.push(routeLatLngs[i]);
        }
      }

      if (!userPannedAway) {
        if (navBounds.length > 1) {
          map.fitBounds(L.latLngBounds(navBounds), {
            paddingTopLeft: [40, 170],
            paddingBottomRight: [80, 300],
            maxZoom: 17,
          });
        } else if (currentPos) {
          map.setView(currentPos, 17, { animate: true });
        }
      }
    } else {
      if (currentPos) bounds.push(currentPos);
      if (bounds.length > 1) {
        const hasPreviewCard = Boolean(activeDestinationStop && onStartNavigation);
        map.fitBounds(L.latLngBounds(bounds), {
          paddingTopLeft: [40, 60],
          paddingBottomRight: [40, hasPreviewCard ? 230 : 40],
          maxZoom: 15,
        });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      }
    }

    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      if (instanceRef.current) {
        try {
          instanceRef.current.remove();
        } catch {
          // ignore
        }
        instanceRef.current = null;
      }
    };
  }, [ready, stops, routeLatLngs, isNavigating, selectedStopId, activeDestinationStop?.id, trafficAware, trafficSpeedIntervals]);

  const handleRecenter = () => {
    setUserPannedAway(false);
    if (instanceRef.current && currentPos) {
      instanceRef.current.setView(currentPos, 17, { animate: true });
    }
  };

  const orderedGoogleStops = singleDestinationMode
    ? activeDestinationStop ? [activeDestinationStop] : []
    : stops.filter((stop) => stop.customer_latitude != null && stop.customer_longitude != null);
  const googleDestination = orderedGoogleStops[orderedGoogleStops.length - 1];
  const googleWaypoints = orderedGoogleStops.slice(0, -1).slice(0, 9)
    .map((stop) => `${stop.customer_latitude},${stop.customer_longitude}`).join("|");
  const googleMapsUrl = googleDestination?.customer_latitude != null
    ? `https://www.google.com/maps/dir/?api=1${currentPos ? `&origin=${currentPos[0]},${currentPos[1]}` : ""}&destination=${googleDestination.customer_latitude},${googleDestination.customer_longitude}${googleWaypoints ? `&waypoints=${encodeURIComponent(googleWaypoints)}` : ""}&travelmode=driving`
    : "https://www.google.com/maps";

  const sheetContent = (
    <div className={`isolate overflow-hidden bg-[#EEF0F2] ${isNavigating ? "fixed inset-0 z-[2000] h-[100dvh] w-full" : "relative z-0 h-[440px] rounded-2xl border border-[#E6DFD3] shadow-xs"}`}>
      {/* Map DOM Element */}
      <div ref={mapRef} className="absolute inset-0" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#EEF0F2]/90 text-xs font-semibold text-neutral-500">
          Loading map…
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODE A: FULL-SCREEN TRIP SCREEN (Uber / Ola style)
         ───────────────────────────────────────────────────────────── */}
      {isNavigating && (
        <>
          {/* 1. TOP MANEUVER CARD */}
          <div
            className="absolute inset-x-0 top-0 z-[1000] px-3"
            style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}
          >
            <div className="mx-auto max-w-lg overflow-hidden rounded-2xl bg-black text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
              <div className="flex items-center gap-3.5 px-4 py-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <ManeuverIcon type={bannerStep?.iconType} className="h-7 w-7 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  {distanceToManeuver != null && (
                    <div className="text-2xl font-extrabold leading-none tracking-tight">
                      {formatDist(distanceToManeuver)}
                    </div>
                  )}
                  <div className="mt-1 truncate text-[15px] font-semibold leading-snug text-white/90">
                    {bannerStep?.instruction || "Follow the highlighted route"}
                  </div>
                </div>
              </div>
              {bannerThenStep && (
                <div className="flex items-center gap-2 border-t border-white/10 bg-[#1A1A1A] px-4 py-2 text-xs text-white/70">
                  <span className="font-semibold text-white/50">Then</span>
                  <ManeuverIcon type={bannerThenStep.iconType} className="h-4 w-4 shrink-0 text-white" />
                  <span className="truncate text-white/85">{bannerThenStep.instruction}</span>
                </div>
              )}
            </div>
          </div>

          {/* 2. FLOATING ROUND BUTTONS */}
          <div className="absolute right-3 z-[1000] flex flex-col gap-2.5" style={{ bottom: sheetExpanded ? "62dvh" : "calc(env(safe-area-inset-bottom) + 270px)" }}>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-[0_4px_14px_rgba(0,0,0,0.22)] transition active:scale-95"
              title="Open in Google Maps"
              aria-label="Open in Google Maps"
            >
              <ExternalLink className="h-5 w-5" />
            </a>
            <button
              type="button"
              onClick={handleRecenter}
              className={`flex h-12 w-12 items-center justify-center rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.22)] transition active:scale-95 cursor-pointer ${userPannedAway ? "bg-black text-white" : "bg-white text-black"}`}
              title="Re-center on my location"
              aria-label="Re-center on my location"
            >
              <LocateFixed className="h-5 w-5" />
            </button>
          </div>

          {trafficAware && trafficSpeedIntervals.length > 0 && (
            <div className="absolute left-3 z-[1000] flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-neutral-700 shadow-md" style={{ bottom: "calc(env(safe-area-inset-bottom) + 270px)" }}>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#188038]" /> Clear</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#F9AB00]" /> Slow</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#D93025]" /> Heavy</span>
            </div>
          )}

          {/* 3. BOTTOM SHEET */}
          <div className="absolute inset-x-0 bottom-0 z-[1001]">
            <div
              className="mx-auto flex max-w-lg flex-col rounded-t-[28px] bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.18)]"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom), 14px)", maxHeight: sheetExpanded ? "60dvh" : undefined }}
            >
              {/* Drag handle */}
              <button
                type="button"
                onClick={() => setSheetExpanded((v) => !v)}
                className="flex w-full flex-col items-center pt-2.5 pb-1 cursor-pointer"
                aria-label={sheetExpanded ? "Hide directions" : "Show all directions"}
              >
                <span className="h-1.5 w-10 rounded-full bg-neutral-300" />
              </button>

              {/* ETA row */}
              <div className="flex items-center justify-between gap-3 px-5 pt-1">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[28px] font-extrabold leading-none tracking-tight text-black">
                      {remainingSeconds != null ? formatDuration(remainingSeconds) : formatDist(remainingDistanceMeters)}
                    </span>
                    {arrivalZone ? (
                      <span className="rounded-full bg-[#E7F6EC] px-2 py-0.5 text-[11px] font-bold text-[#05813F]">
                        In check-in zone
                      </span>
                    ) : distanceToDestination != null ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">
                        {formatDist(distanceToDestination)} away
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[13px] font-medium text-neutral-500">
                    {formatDist(remainingDistanceMeters)}
                    {remainingSeconds != null && <> · Arrive {etaString}</>}
                    {!trafficAware && <> · No live traffic</>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetExpanded((v) => !v)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-black transition active:scale-95 cursor-pointer"
                  title="Directions list"
                  aria-label="Directions list"
                >
                  {sheetExpanded ? <ChevronDown className="h-5 w-5" /> : <ListOrdered className="h-5 w-5" />}
                </button>
              </div>

              {/* Destination card */}
              <div className="mx-5 mt-4 flex items-center gap-3 rounded-2xl bg-neutral-50 p-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
                  {initialsOf(activeDestinationStop?.customer_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold text-black">
                    {activeDestinationStop?.customer_name || "Customer visit"}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {activeDestinationStop?.customer_address || "Destination"}
                  </div>
                </div>
                {activeDestinationStop?.customer_phone && (
                  <a
                    href={`tel:${activeDestinationStop.customer_phone.replace(/[^\d+]/g, "")}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-sm ring-1 ring-neutral-200 transition active:scale-95"
                    title="Call customer"
                    aria-label="Call customer"
                  >
                    <Phone className="h-[18px] w-[18px]" />
                  </a>
                )}
              </div>

              {/* Expanded directions list */}
              {sheetExpanded && (
                <div className="mx-5 mt-3 min-h-0 flex-1 overflow-y-auto">
                  {navigationSteps.length === 0 && (
                    <p className="py-4 text-center text-xs text-neutral-500">Turn-by-turn steps are not available for this route.</p>
                  )}
                  <ol>
                    {navigationSteps.map((step, idx) => (
                      <li
                        key={step.id}
                        className={`flex items-center gap-3 border-b border-neutral-100 py-3 text-sm ${idx === bannerStepIndex ? "font-bold text-black" : "text-neutral-700"}`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${idx === bannerStepIndex ? "bg-black text-white" : "bg-neutral-100 text-black"}`}>
                          <ManeuverIcon type={step.iconType} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 leading-snug">{step.instruction}</span>
                        <span className="shrink-0 text-xs text-neutral-400">{formatDist(step.distanceMeters)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex items-center gap-2.5 px-5">
                {onCheckIn && activeDestinationStop ? (
                  <SwipeToConfirm
                    label="Swipe to check in"
                    tone={arrivalZone ? "go" : "dark"}
                    onConfirm={() => onCheckIn(activeDestinationStop)}
                  />
                ) : (
                  <div className="flex-1" />
                )}
                <button
                  type="button"
                  onClick={onStopNavigation}
                  className="flex h-14 shrink-0 items-center justify-center rounded-full bg-[#FDECEC] px-5 text-sm font-bold text-[#C62828] transition active:scale-95 cursor-pointer"
                  title="End trip"
                >
                  End
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODE B: TRIP PREVIEW (isNavigating = false)
         ───────────────────────────────────────────────────────────── */}
      {!isNavigating && (
        <>
          <div className="absolute left-3 top-3 z-[1000] flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-800 shadow-md">
            <span className={`h-2 w-2 rounded-full ${origin ? "bg-[#05A357]" : "bg-neutral-400"}`} />
            {origin ? "GPS on" : "GPS unavailable"}
            <span className="text-neutral-300">·</span>
            {singleDestinationMode ? "Direct route" : `${stops.length} stops`}
          </div>

          {activeDestinationStop && onStartNavigation ? (
            <div className="absolute inset-x-3 bottom-3 z-[1000] mx-auto max-w-md rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
              <div className="flex items-stretch gap-3">
                <div className="flex flex-col items-center py-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-black" />
                  <span className="my-1 w-px flex-1 bg-neutral-300" />
                  <span className="h-2.5 w-2.5 bg-black" />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="truncate text-xs font-medium text-neutral-500">
                    {origin ? "Your current location" : "Location unavailable"}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-black">{activeDestinationStop.customer_name || "Customer visit"}</div>
                    <div className="truncate text-[11px] text-neutral-500">{activeDestinationStop.customer_address || ""}</div>
                  </div>
                </div>
                {(remainingSeconds != null || remainingDistanceMeters > 0) && (
                  <div className="shrink-0 text-right">
                    {remainingSeconds != null && <div className="text-lg font-extrabold leading-none text-black">{formatDuration(remainingSeconds)}</div>}
                    {remainingDistanceMeters > 0 && <div className="mt-1 text-[11px] font-medium text-neutral-500">{formatDist(remainingDistanceMeters)}</div>}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onStartNavigation(activeDestinationStop)}
                className="mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black text-[15px] font-bold text-white transition hover:bg-neutral-800 active:scale-[0.99] cursor-pointer"
              >
                <Navigation className="h-4 w-4" />
                Start navigation
              </button>
            </div>
          ) : (
            <div className="pointer-events-none absolute bottom-3 right-3 z-[1000] rounded-full bg-white/90 px-2.5 py-1 text-[10px] text-neutral-500 shadow-sm">
              Tap a stop to preview its route
            </div>
          )}
        </>
      )}
    </div>
  );

  if (isNavigating && portalReady) {
    return createPortal(sheetContent, document.body);
  }
  return sheetContent;
}

function ManeuverIcon({ type, className }: { type?: "left" | "right" | "straight" | "arrive"; className?: string }) {
  if (type === "left") return <CornerUpLeft className={className} />;
  if (type === "right") return <CornerUpRight className={className} />;
  if (type === "arrive") return <Flag className={className} />;
  return <ArrowUp className={className} />;
}

function initialsOf(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "•";
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Uber-style "swipe to confirm" button. Enter/Space also confirm, for keyboard users. */
function SwipeToConfirm({
  label,
  onConfirm,
  tone = "dark",
}: {
  label: string;
  onConfirm: () => void | Promise<unknown>;
  tone?: "dark" | "go";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const KNOB = 48;

  const maxOffset = () => Math.max(0, (trackRef.current?.clientWidth ?? 0) - KNOB - 8);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setOffset(maxOffset());
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setOffset(0);
    }
  };

  const bg = tone === "go" ? "bg-[#05A357]" : "bg-black";

  return (
    <div
      ref={trackRef}
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void confirm();
        }
      }}
      className={`relative h-14 min-w-0 flex-1 select-none overflow-hidden rounded-full ${bg} text-white touch-none`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-white/15"
        style={{ width: offset + KNOB + 8, transition: dragging ? "none" : "width 0.25s ease" }}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center truncate pl-14 pr-4 text-sm font-bold">
        {busy ? "Verifying GPS…" : label}
      </span>
      <div
        onPointerDown={(e) => {
          if (busy) return;
          setDragging(true);
          startXRef.current = e.clientX - offset;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          setOffset(Math.min(maxOffset(), Math.max(0, e.clientX - startXRef.current)));
        }}
        onPointerUp={() => {
          if (!dragging) return;
          setDragging(false);
          if (offset >= maxOffset() * 0.85) void confirm();
          else setOffset(0);
        }}
        onPointerCancel={() => {
          setDragging(false);
          setOffset(0);
        }}
        className="absolute top-1 left-1 flex h-12 w-12 cursor-grab items-center justify-center rounded-full bg-white text-black shadow-md active:cursor-grabbing"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 0.25s ease" }}
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
        ) : (
          <ChevronsRight className="h-6 w-6" />
        )}
      </div>
    </div>
  );
}
