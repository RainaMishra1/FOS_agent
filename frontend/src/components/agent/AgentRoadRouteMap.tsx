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
  RotateCw,
  ArrowUpLeft,
  ArrowUpRight,
  Volume2,
  VolumeX,
  Car,
  Bike,
  Footprints,
  LocateFixed,
  ExternalLink,
  X,
  ListOrdered,
  Phone,
  ChevronDown,
  ChevronsRight,
  Flag,
} from "lucide-react";
import { RouteLeg, TrafficSpeedInterval, TravelEstimate, TravelMode } from "@/lib/api";
import {
  ManeuverKind,
  announceThresholds,
  buildInstruction,
  isAnnounced,
  distanceMeters,
  formatDuration,
  maneuverKind,
  nextAnnouncement,
  remainingRoute,
  routeProgress,
} from "@/lib/navigation";
import { useVoiceGuidance } from "@/hooks/useVoiceGuidance";

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
  onCheckIn?: (stop: RouteMapStop) => void | Promise<unknown>;
  /** Car / bike / walk. */
  travelMode?: TravelMode;
  onTravelModeChange?: (mode: TravelMode) => void;
  /** Time and distance for each mode, shown on the mode picker. */
  modeEstimates?: Partial<Record<TravelMode, TravelEstimate | null>>;
  /** True when the route time is an estimate (bike without live traffic). */
  routeEstimated?: boolean;
  /** Called when the agent has left the route and a new one is needed. */
  onReroute?: () => void;
  gpsHeading?: number | null;
  gpsSpeedMps?: number | null;
  /** True while navigation is being prepared (GPS + route), to show progress on the Start button. */
  isStarting?: boolean;
}

function formatDist(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters >= 100 ? Math.round(meters / 10) * 10 : Math.round(meters)} m`;
}

const MODE_OPTIONS: { mode: TravelMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { mode: "car", label: "Car", Icon: Car },
  { mode: "bike", label: "Bike", Icon: Bike },
  { mode: "walk", label: "Walk", Icon: Footprints },
];

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
  travelMode = "car",
  onTravelModeChange,
  modeEstimates,
  routeEstimated = false,
  onReroute,
  gpsHeading = null,
  gpsSpeedMps = null,
  isStarting = false,
}: AgentRoadRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const vehicleMarkerRef = useRef<any>(null);
  const routeCasingRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const { supported: voiceSupported, muted: voiceMuted, setMuted: setVoiceMuted, speak } = useVoiceGuidance();

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

  // Raw GPS position of the agent
  const gpsPos = useMemo<[number, number] | null>(() => {
    if (origin) return [origin.latitude, origin.longitude];
    if (routeLatLngs.length > 0) return routeLatLngs[0];
    return null;
  }, [origin, routeLatLngs]);

  // Where the agent is along the route (snapped point, distance left, off-route distance)
  const progress = useMemo(() => (gpsPos && routeLatLngs.length > 1 ? routeProgress(routeLatLngs, gpsPos) : null), [routeLatLngs, gpsPos]);

  const offRouteLimit = travelMode === "walk" ? 35 : 60;
  // While navigating, show the puck on the road (like ride-hailing apps) when GPS is close to the route.
  const currentPos = useMemo<[number, number] | null>(() => {
    if (isNavigating && progress && progress.offRouteMeters < 30) return progress.snapped;
    return gpsPos;
  }, [isNavigating, progress, gpsPos]);

  // Heading: device compass/GPS heading when moving, otherwise the direction of the road.
  const currentBearing = useMemo(() => {
    if (gpsHeading != null && !Number.isNaN(gpsHeading) && (gpsSpeedMps ?? 0) > 1.5) return gpsHeading;
    return progress?.bearing ?? 0;
  }, [gpsHeading, gpsSpeedMps, progress]);

  // Turn-by-turn steps from OSRM / Google, with their position along the route
  const navigationSteps = useMemo(() => {
    const allSteps = (legs || []).flatMap((leg) => leg.steps || []);
    return allSteps.map((st, i) => {
      const kind = maneuverKind(st.maneuver?.type, st.maneuver?.modifier);
      const instruction = buildInstruction({
        type: st.maneuver?.type,
        modifier: st.maneuver?.modifier,
        name: st.name,
        exit: st.maneuver?.exit,
        provided: st.maneuver?.instruction,
        destinationName: activeDestinationStop?.customer_name || undefined,
      });
      const location = st.maneuver?.location;
      const alongMeters =
        location && routeLatLngs.length > 1 ? routeProgress(routeLatLngs, [location[1], location[0]])?.traveledMeters ?? null : null;
      return {
        id: `step-${i}`,
        instruction,
        distanceMeters: st.distance,
        iconType: kind,
        location,
        alongMeters,
      };
    });
  }, [legs, activeDestinationStop?.customer_name, routeLatLngs]);

  // The UPCOMING maneuver: first step whose point on the route is still ahead of the agent.
  const bannerStepIndex = useMemo(() => {
    if (!navigationSteps.length) return null;
    const traveled = progress?.traveledMeters ?? 0;
    const index = navigationSteps.findIndex(
      (step, i) => i > 0 && step.alongMeters != null && step.alongMeters > traveled + 8
    );
    if (index >= 0) return index;
    return navigationSteps.length - 1;
  }, [navigationSteps, progress]);

  const bannerStep = bannerStepIndex == null ? null : navigationSteps[bannerStepIndex];
  const bannerThenStep = bannerStepIndex == null ? null : navigationSteps[bannerStepIndex + 1] ?? null;

  // Distance along the road to the next maneuver
  const distanceToManeuver = useMemo(() => {
    if (!bannerStep) return null;
    if (progress && bannerStep.alongMeters != null) return Math.max(0, bannerStep.alongMeters - progress.traveledMeters);
    if (!currentPos || !bannerStep.location) return null;
    return distanceMeters(currentPos[0], currentPos[1], bannerStep.location[1], bannerStep.location[0]);
  }, [progress, bannerStep, currentPos]);

  const distanceToDestination = useMemo(() => {
    if (!gpsPos || activeDestinationStop?.customer_latitude == null || activeDestinationStop?.customer_longitude == null) return null;
    return distanceMeters(gpsPos[0], gpsPos[1], activeDestinationStop.customer_latitude, activeDestinationStop.customer_longitude);
  }, [gpsPos, activeDestinationStop?.customer_latitude, activeDestinationStop?.customer_longitude]);

  // Same 750 m radius the server uses for check-in (testing value).
  const arrivalZone = distanceToDestination != null && distanceToDestination <= CHECK_IN_RADIUS_METERS;

  // Total route size and time from the router
  const totalRouteMeters = legs.length ? legs.reduce((sum, leg) => sum + (leg.distance || 0), 0) : progress?.totalMeters ?? 0;
  const totalRouteSeconds = legs.length ? legs.reduce((sum, leg) => sum + (leg.duration || 0), 0) : null;

  // Distance and time left, shrinking as the agent moves along the route
  const remainingDistanceMeters = useMemo(() => {
    if (isNavigating && progress) return progress.remainingMeters;
    return totalRouteMeters;
  }, [isNavigating, progress, totalRouteMeters]);

  const remainingSeconds = useMemo(() => {
    if (totalRouteSeconds == null) return null;
    if (isNavigating && progress && progress.totalMeters > 0) {
      return totalRouteSeconds * (progress.remainingMeters / progress.totalMeters);
    }
    return totalRouteSeconds;
  }, [totalRouteSeconds, isNavigating, progress]);

  const etaString = useMemo(() => {
    if (remainingSeconds == null) return "—";
    const etaDate = new Date(Date.now() + remainingSeconds * 1000);
    return etaDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [remainingSeconds]);

  // ── Voice guidance ────────────────────────────────────────────────
  const spokenRef = useRef<Map<string, Set<number>>>(new Map());
  const startedSpeechRef = useRef(false);
  const arrivedSpokenRef = useRef(false);

  useEffect(() => {
    if (!isNavigating) {
      spokenRef.current = new Map();
      startedSpeechRef.current = false;
      arrivedSpokenRef.current = false;
      return;
    }
    if (!startedSpeechRef.current && bannerStep) {
      startedSpeechRef.current = true;
      const name = activeDestinationStop?.customer_name || "the customer";
      const lead = remainingSeconds != null ? `${formatDuration(remainingSeconds).replace("min", "minutes").replace("hr", "hours")} to ${name}.` : `Starting route to ${name}.`;
      const firstStep = navigationSteps[0];
      speak(`${lead} ${firstStep && firstStep.iconType === "depart" ? firstStep.instruction + "." : ""}`);
    }
  }, [isNavigating, bannerStep, navigationSteps, activeDestinationStop?.customer_name, remainingSeconds, speak]);

  useEffect(() => {
    if (!isNavigating || !bannerStep || distanceToManeuver == null) return;
    if (bannerStep.iconType === "arrive") return; // arrival has its own message below
    if (!isAnnounced(bannerStep.iconType)) return; // don't speak "continue straight"
    let spoken = spokenRef.current.get(bannerStep.id);
    if (!spoken) {
      spoken = new Set();
      spokenRef.current.set(bannerStep.id, spoken);
      // Don't announce the long-range threshold right after the previous turn if we're already past it.
    }
    const text = nextAnnouncement(distanceToManeuver, bannerStep.instruction, announceThresholds(travelMode, gpsSpeedMps), spoken);
    if (text) speak(text);
  }, [isNavigating, bannerStep, distanceToManeuver, travelMode, gpsSpeedMps, speak]);

  useEffect(() => {
    if (!isNavigating || arrivedSpokenRef.current) return;
    const nearEnd = (progress && progress.remainingMeters < 40) || (distanceToDestination != null && distanceToDestination < 40);
    if (nearEnd) {
      arrivedSpokenRef.current = true;
      speak(`You have arrived at ${activeDestinationStop?.customer_name || "your destination"}. Swipe to check in.`);
    }
  }, [isNavigating, progress, distanceToDestination, activeDestinationStop?.customer_name, speak]);

  // ── Automatic re-routing when the agent leaves the route ─────────
  const offRouteCountRef = useRef(0);
  const lastRerouteRef = useRef(0);
  useEffect(() => {
    if (!isNavigating || !progress || !onReroute) return;
    if (progress.offRouteMeters > offRouteLimit) {
      offRouteCountRef.current += 1;
    } else {
      offRouteCountRef.current = 0;
    }
    const now = Date.now();
    if (offRouteCountRef.current >= 2 && now - lastRerouteRef.current > 20000) {
      lastRerouteRef.current = now;
      offRouteCountRef.current = 0;
      spokenRef.current = new Map();
      speak("Rerouting.");
      onReroute();
    }
  }, [isNavigating, progress, offRouteLimit, onReroute, speak]);

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

  // Move the puck smoothly to each new GPS fix and keep the camera on it while navigating.
  const animationRef = useRef<number | null>(null);
  useEffect(() => {
    const marker = vehicleMarkerRef.current;
    if (!ready || !marker || !currentPos) return;
    const from = marker.getLatLng?.();
    const to = currentPos;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    const jump = !from || distanceMeters(from.lat, from.lng, to[0], to[1]) > 300;
    if (jump) {
      marker.setLatLng(to);
    } else {
      const start = performance.now();
      const duration = 900;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const ease = t * (2 - t);
        marker.setLatLng([from.lat + (to[0] - from.lat) * ease, from.lng + (to[1] - from.lng) * ease]);
        if (t < 1) animationRef.current = requestAnimationFrame(step);
      };
      animationRef.current = requestAnimationFrame(step);
    }
    if (isNavigating && !userPannedAway && instanceRef.current) {
      const zoom = Math.max(instanceRef.current.getZoom(), travelMode === "walk" ? 18 : 17);
      instanceRef.current.setView(to, zoom, { animate: true, duration: 0.9 });
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [ready, currentPos, isNavigating, userPannedAway, travelMode]);

  // Trim the route behind the agent so only the road ahead is drawn.
  useEffect(() => {
    if (!isNavigating || !progress || routeLatLngs.length < 2) return;
    const ahead = remainingRoute(routeLatLngs, progress);
    if (trafficAware && trafficSpeedIntervals.length > 0) return; // keep traffic colours aligned
    routeCasingRef.current?.setLatLngs(ahead);
    routeLineRef.current?.setLatLngs(ahead);
  }, [isNavigating, progress, routeLatLngs, trafficAware, trafficSpeedIntervals]);

  // Rotate the vehicle arrow to the direction of travel
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

  // Latest values for the drawing effect, so it doesn't re-run on every GPS fix.
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const currentPosRef = useRef(currentPos);
  currentPosRef.current = currentPos;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const stopsKey = useMemo(
    () =>
      stops
        .map((s) => `${s.id}:${s.status}:${s.customer_latitude}:${s.customer_longitude}:${s.is_nearest ? 1 : 0}:${s.order_index ?? ""}`)
        .join("|"),
    [stops]
  );
  const hasPosition = currentPos != null;
  const navFramedRef = useRef(false);

  // Create the Leaflet map once per container (the full-screen trip view uses its own container).
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
    navFramedRef.current = false;

    return () => {
      if (instanceRef.current) {
        try {
          instanceRef.current.remove();
        } catch {
          // ignore
        }
        instanceRef.current = null;
        layerRef.current = null;
        vehicleMarkerRef.current = null;
        routeCasingRef.current = null;
        routeLineRef.current = null;
      }
    };
  }, [ready, isNavigating]);

  // Draw stops, route and the agent marker. Re-runs only when the route or stops really change.
  useEffect(() => {
    const L = (window as any).L;
    const map = instanceRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];
    const stops = stopsRef.current;
    const currentPos = currentPosRef.current;
    const progress = progressRef.current;
    // While navigating, draw only the road still ahead.
    const drawnRoute: [number, number][] =
      isNavigating && progress && !(trafficAware && trafficSpeedIntervals.length > 0)
        ? remainingRoute(routeLatLngs, progress)
        : routeLatLngs;

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
      routeCasingRef.current = L.polyline(drawnRoute, {
        color: isNavigating ? "#FFFFFF" : "#1E3F35",
        weight: isNavigating ? 11 : 6,
        opacity: isNavigating ? 0.95 : 0.2,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer);
      routeLineRef.current = null;

      if (trafficAware && trafficSpeedIntervals.length > 0) {
        let nextStart = 0;
        for (const interval of trafficSpeedIntervals) {
          const start = interval.startPolylinePointIndex ?? nextStart;
          const end = Math.min(interval.endPolylinePointIndex, routeLatLngs.length - 1);
          // Include the end point so consecutive stretches join up (short slow sections stay visible).
          const segment = routeLatLngs.slice(start, end + 1);
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
        routeLineRef.current = L.polyline(drawnRoute, {
          color: isNavigating ? (travelMode === "walk" ? "#276EF1" : "#111111") : "#2D6A4F",
          dashArray: travelMode === "walk" ? "1 12" : undefined,
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

    // Camera framing. Leaflet can only fit correctly once it knows the container size, so frame
    // now and again after the layout settles (the container may have just resized or moved).
    const frame = () => {
      const m = instanceRef.current;
      if (!m) return;
      m.invalidateSize();
      if (isNavigating) {
        if (navFramedRef.current) return;
        const navBounds: [number, number][] = currentPos ? [currentPos] : [];
        if (activeDestinationStop?.customer_latitude != null && activeDestinationStop?.customer_longitude != null) {
          navBounds.push([activeDestinationStop.customer_latitude, activeDestinationStop.customer_longitude]);
        }
        routeLatLngs.slice(0, 15).forEach((point) => navBounds.push(point));
        if (navBounds.length > 1) {
          m.fitBounds(L.latLngBounds(navBounds), { paddingTopLeft: [40, 170], paddingBottomRight: [80, 300], maxZoom: 17 });
        } else if (currentPos) {
          m.setView(currentPos, 17);
        }
        return;
      }
      // Preview of one visit: frame you, the route and that customer. Otherwise frame all stops.
      const focus: [number, number][] = [];
      if (singleDestinationMode && activeDestinationStop?.customer_latitude != null && activeDestinationStop?.customer_longitude != null) {
        focus.push([activeDestinationStop.customer_latitude, activeDestinationStop.customer_longitude]);
        routeLatLngs.forEach((point) => focus.push(point));
      } else {
        bounds.forEach((point) => focus.push(point));
        routeLatLngs.forEach((point) => focus.push(point));
      }
      if (currentPos) focus.push(currentPos);
      if (focus.length > 1) {
        const hasPreviewCard = Boolean(activeDestinationStop && onStartNavigation);
        m.fitBounds(L.latLngBounds(focus), {
          paddingTopLeft: [40, 60],
          paddingBottomRight: [70, hasPreviewCard ? (onTravelModeChange ? 310 : 230) : 40],
          maxZoom: 17,
        });
      } else if (focus.length === 1) {
        m.setView(focus[0], 15);
      }
    };
    frame();
    const settle = setTimeout(() => {
      if (isNavigating) navFramedRef.current = false;
      frame();
      if (isNavigating) navFramedRef.current = true;
    }, 250);
    if (isNavigating) navFramedRef.current = true;

    return () => clearTimeout(settle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stopsKey, routeLatLngs, isNavigating, selectedStopId, activeDestinationStop?.id, trafficAware, trafficSpeedIntervals, travelMode, hasPosition]);

  const handleRecenter = () => {
    setUserPannedAway(false);
    if (instanceRef.current && currentPos) {
      instanceRef.current.setView(currentPos, travelMode === "walk" ? 18 : 17, { animate: true });
    }
  };

  const orderedGoogleStops = singleDestinationMode
    ? activeDestinationStop ? [activeDestinationStop] : []
    : stops.filter((stop) => stop.customer_latitude != null && stop.customer_longitude != null);
  const googleDestination = orderedGoogleStops[orderedGoogleStops.length - 1];
  const googleWaypoints = orderedGoogleStops.slice(0, -1).slice(0, 9)
    .map((stop) => `${stop.customer_latitude},${stop.customer_longitude}`).join("|");
  const googleMapsUrl = googleDestination?.customer_latitude != null
    ? `https://www.google.com/maps/dir/?api=1${currentPos ? `&origin=${currentPos[0]},${currentPos[1]}` : ""}&destination=${googleDestination.customer_latitude},${googleDestination.customer_longitude}${googleWaypoints ? `&waypoints=${encodeURIComponent(googleWaypoints)}` : ""}&travelmode=${travelMode === "walk" ? "walking" : travelMode === "bike" ? "two-wheeler" : "driving"}`
    : "https://www.google.com/maps";

  const sheetContent = (
    <div className={`isolate overflow-hidden bg-[#EEF0F2] ${isNavigating ? "fixed inset-0 z-[2000] h-[100dvh] w-full" : `relative z-0 ${activeDestinationStop && onStartNavigation && onTravelModeChange ? "h-[540px]" : "h-[440px]"} rounded-2xl border border-[#E6DFD3] shadow-xs`}`}>
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
            {voiceSupported && (
              <button
                type="button"
                onClick={() => setVoiceMuted(!voiceMuted)}
                className={`flex h-12 w-12 items-center justify-center rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.22)] transition active:scale-95 cursor-pointer ${voiceMuted ? "bg-white text-neutral-400" : "bg-white text-black"}`}
                title={voiceMuted ? "Turn voice guidance on" : "Mute voice guidance"}
                aria-label={voiceMuted ? "Turn voice guidance on" : "Mute voice guidance"}
              >
                {voiceMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            )}
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

          {gpsSpeedMps != null && travelMode !== "walk" && !sheetExpanded && (
            <div
              className="absolute left-3 z-[1000] flex h-14 w-14 flex-col items-center justify-center rounded-full border-[3px] border-black bg-white shadow-[0_4px_14px_rgba(0,0,0,0.22)]"
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 312px)" }}
              aria-label="Current speed"
            >
              <span className="text-lg font-extrabold leading-none text-black">{Math.round(Math.max(0, gpsSpeedMps) * 3.6)}</span>
              <span className="text-[9px] font-bold uppercase text-neutral-500">km/h</span>
            </div>
          )}

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
                  <div className="mt-1 flex items-center gap-1 text-[13px] font-medium text-neutral-500">
                    <ModeIcon mode={travelMode} className="h-3.5 w-3.5 text-neutral-700" />
                    <span>
                      {formatDist(remainingDistanceMeters)}
                      {remainingSeconds != null && <> · Arrive {etaString}</>}
                      {routeEstimated ? <> · Est. time</> : travelMode !== "walk" ? (trafficAware ? <> · Live traffic</> : <> · No live traffic</>) : null}
                    </span>
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
              {onTravelModeChange && (
                <div className="mt-3.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Travel mode">
                  {MODE_OPTIONS.map(({ mode, label, Icon }) => {
                    const selected = mode === travelMode;
                    const estimate = modeEstimates?.[mode];
                    const seconds = selected && totalRouteSeconds != null ? totalRouteSeconds : estimate?.duration_seconds;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onTravelModeChange(mode)}
                        className={`flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-2 transition active:scale-[0.98] cursor-pointer ${
                          selected ? "border-black bg-black text-white" : "border-neutral-200 bg-white text-black hover:bg-neutral-50"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-[11px] font-bold">{label}</span>
                        <span className={`text-[11px] ${selected ? "text-white/80" : "text-neutral-500"}`}>
                          {seconds != null ? formatDuration(seconds) : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => onStartNavigation(activeDestinationStop)}
                disabled={isStarting}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black text-[15px] font-bold text-white transition hover:bg-neutral-800 active:scale-[0.99] cursor-pointer disabled:opacity-70"
              >
                {isStarting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Navigation className="h-4 w-4" />
                )}
                {isStarting ? "Getting your location…" : "Start navigation"}
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

function ManeuverIcon({ type, className }: { type?: ManeuverKind; className?: string }) {
  switch (type) {
    case "left":
    case "sharp-left":
      return <CornerUpLeft className={className} />;
    case "right":
    case "sharp-right":
      return <CornerUpRight className={className} />;
    case "slight-left":
      return <ArrowUpLeft className={className} />;
    case "slight-right":
      return <ArrowUpRight className={className} />;
    case "uturn":
      return <RotateCcw className={className} />;
    case "roundabout":
      return <RotateCw className={className} />;
    case "arrive":
      return <Flag className={className} />;
    default:
      return <ArrowUp className={className} />;
  }
}

function ModeIcon({ mode, className }: { mode: TravelMode; className?: string }) {
  const option = MODE_OPTIONS.find((o) => o.mode === mode) ?? MODE_OPTIONS[0];
  const Icon = option.Icon;
  return <Icon className={className} />;
}

function initialsOf(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "•";
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
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
