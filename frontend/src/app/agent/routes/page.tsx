"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAgent } from "@/context/AgentContext";
import { useAuth } from "@/context/AuthContext";
import { AgentVisit } from "@/types/agent";
import AgentRoadRouteMap, { RouteMapStop } from "@/components/agent/AgentRoadRouteMap";
import StatusBadge from "@/components/StatusBadge";
import VisitDetailDrawer from "@/components/agent/VisitDetailDrawer";
import CompleteVisitModal from "@/components/agent/CompleteVisitModal";
import {
  fetchAgentRouteGeometry,
  fetchAgentTodayRoute,
  optimizeAgentTodayRoute,
  updateAgentLocation,
  AgentRouteData,
  RoadRouteData,
} from "@/lib/api";
import { calculateHaversineDistanceKm } from "@/lib/geoUtils";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Compass,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Zap,
  Check,
  Building2,
  ArrowRight,
  ListOrdered,
  LocateFixed,
  X,
} from "lucide-react";

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function AgentRoutePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-beige-muted">Loading route...</div>}>
      <AgentRoutePageContent />
    </Suspense>
  );
}

function AgentRoutePageContent() {
  const searchParams = useSearchParams();
  const preselectedVisitId = searchParams.get("visitId");

  const { session } = useAuth();
  const { checkInVisit, isOnDuty, visits, currentAgent } = useAgent();

  const [routeData, setRouteData] = useState<AgentRouteData | null>(null);
  const [roadRoute, setRoadRoute] = useState<RoadRouteData | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [selectedTaskStopId, setSelectedTaskStopId] = useState<string | null>(preselectedVisitId);
  const [isSingleTaskRoute, setIsSingleTaskRoute] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [liveGpsCoords, setLiveGpsCoords] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);

  const [loading, setLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedForDrawer, setSelectedForDrawer] = useState<AgentVisit | null>(null);
  const [completeVisit, setCompleteVisit] = useState<AgentVisit | null>(null);

  // Watch device GPS in real time
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveGpsCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => console.warn("GPS watch notice:", err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Sync GPS location in the background if moved
  const syncLocationIfMoved = useCallback(async (token: string, lat: number, lng: number, accuracy?: number) => {
    try {
      await updateAgentLocation(
        {
          latitude: lat,
          longitude: lng,
          gps_accuracy: accuracy,
          location_source: "gps",
        },
        token
      );
    } catch {
      // Ignore background sync errors
    }
  }, []);

  const loadRoute = useCallback(
    async (keepOrder = false) => {
      setError(null);

      // 1. Background GPS update
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLiveGpsCoords({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
            if (session?.access_token) {
              void syncLocationIfMoved(
                session.access_token,
                pos.coords.latitude,
                pos.coords.longitude,
                pos.coords.accuracy
              );
            }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 3000, maximumAge: 30000 }
        );
      }

      // 2. Load route from server or synthesize immediately from AgentContext visits
      try {
        let result: AgentRouteData;
        try {
          result = await fetchAgentTodayRoute(session?.access_token, localDateString());
          if (!result.completed) {
            result.completed = [];
          }
          if (!result.stops) {
            result.stops = [];
          }
          if (liveGpsCoords && result.origin) {
            result.origin.latitude = liveGpsCoords.latitude;
            result.origin.longitude = liveGpsCoords.longitude;
            result.origin.accuracy_meters = liveGpsCoords.accuracy;
          }
        } catch {
          const originLat = liveGpsCoords?.latitude || currentAgent.currentCoordinates?.lat || 19.2403;
          const originLng = liveGpsCoords?.longitude || currentAgent.currentCoordinates?.lng || 73.1305;
          const activeStops = visits.filter((v) => v.status !== "completed");
          const completedStops = visits.filter((v) => v.status === "completed");

          result = {
            date: localDateString(),
            origin: {
              latitude: originLat,
              longitude: originLng,
              source: "gps",
              accuracy_meters: liveGpsCoords?.accuracy ?? 10,
              updated_at: new Date().toISOString(),
            },
            origin_error: null,
            stops: activeStops.map((v, i) => ({
              id: v.id,
              visit_code: v.visitCode,
              customer_name: v.customerName,
              customer_company: v.company,
              customer_address: v.address,
              customer_city: v.city,
              customer_latitude: v.latitude,
              customer_longitude: v.longitude,
              customer_phone: v.phone,
              customer_email: v.email,
              purpose: v.purpose,
              priority: v.priority,
              status: v.status,
              order_index: v.orderIndex || i + 1,
              scheduled_time: v.scheduledTime,
              scheduled_date: v.scheduledDate,
              estimated_duration_minutes: 45,
            })),
            completed: completedStops.map((v, i) => ({
              id: v.id,
              visit_code: v.visitCode,
              customer_name: v.customerName,
              customer_company: v.company,
              customer_address: v.address,
              customer_city: v.city,
              customer_latitude: v.latitude,
              customer_longitude: v.longitude,
              customer_phone: v.phone,
              customer_email: v.email,
              purpose: v.purpose,
              priority: v.priority,
              status: v.status,
              order_index: v.orderIndex || i + 1,
              scheduled_time: v.scheduledTime,
              scheduled_date: v.scheduledDate,
              estimated_duration_minutes: 45,
            })),
          };
        }

        setRouteData(result);

        const ids = keepOrder && orderedIds.length ? orderedIds : (result.stops || []).map((v) => v.id);
        setOrderedIds(ids);

        if (!result.origin) {
          setRoadRoute(null);
          return;
        }

        const autoStart = searchParams.get("start") === "true";
        const targetId = selectedTaskStopId || preselectedVisitId;
        if (targetId && (result.stops || []).some((s) => s.id === targetId)) {
          setSelectedTaskStopId(targetId);
          setIsSingleTaskRoute(true);
          const stop = (result.stops || []).find((s) => s.id === targetId);
          try {
            const fallbackCoords: [number, number][] =
              result.origin && stop?.customer_latitude != null && stop?.customer_longitude != null
                ? [
                    [result.origin.longitude, result.origin.latitude],
                    [stop.customer_longitude, stop.customer_latitude],
                  ]
                : [];
            const geom = await fetchAgentRouteGeometry([targetId], session?.access_token, fallbackCoords);
            setRoadRoute(geom);
            if (autoStart) {
              setIsNavigating(true);
            }
          } catch {
            setRoadRoute(null);
          }
        } else {
          const geometryIds = ids.filter((id) => {
            const stop = (result.stops || []).find((v) => v.id === id);
            return stop?.customer_latitude != null && stop?.customer_longitude != null;
          });

          if (geometryIds.length > 0 && result.origin) {
            try {
              const fallbackCoords: [number, number][] = [
                [result.origin.longitude, result.origin.latitude],
                ...geometryIds.map((id) => {
                  const s = result.stops.find((v) => v.id === id)!;
                  return [s.customer_longitude!, s.customer_latitude!] as [number, number];
                }),
              ];
              const geom = await fetchAgentRouteGeometry(geometryIds, session?.access_token, fallbackCoords);
              setRoadRoute(geom);
            } catch {
              setRoadRoute(null);
            }
          } else {
            setRoadRoute(null);
          }
        }
      } catch (err: any) {
        console.warn("Route load notice:", err);
      } finally {
        setLoading(false);
      }
    },
    [session?.access_token, orderedIds, selectedTaskStopId, preselectedVisitId, syncLocationIfMoved, visits, currentAgent, searchParams]
  );

  useEffect(() => {
    void loadRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  // Compute straight-line distances from agent origin to each pending stop and locate the nearest pending task
  const stopsWithDistances = useMemo(() => {
    if (!routeData) return [];

    const origin = routeData.origin;
    let minDistance = Infinity;
    let nearestId: string | null = null;

    // Calculate straight-line distances in meters
    const computed = (routeData.stops || []).map((stop) => {
      let distanceMeters: number | null = null;
      const isPending = stop.status === "pending" || stop.status === "in_progress" || stop.status === "delayed";

      if (
        origin &&
        stop.customer_latitude != null &&
        stop.customer_longitude != null
      ) {
        const distKm = calculateHaversineDistanceKm(
          origin.latitude,
          origin.longitude,
          stop.customer_latitude,
          stop.customer_longitude
        );
        distanceMeters = distKm * 1000;

        if (isPending && distanceMeters < minDistance) {
          minDistance = distanceMeters;
          nearestId = stop.id;
        }
      }

      return {
        ...stop,
        distance_meters: distanceMeters,
      };
    });

    return computed.map((stop) => ({
      ...stop,
      is_nearest: stop.id === nearestId,
    }));
  }, [routeData]);

  // Nearest pending task stop
  const nearestPendingTask = useMemo(() => {
    return stopsWithDistances.find((s) => s.is_nearest) || null;
  }, [stopsWithDistances]);

  // Filter pending / active tasks for the agent map (excluding completed/cancelled)
  const pendingTasksList = useMemo(() => {
    return stopsWithDistances.filter(
      (s) => s.status === "pending" || s.status === "in_progress" || s.status === "delayed"
    );
  }, [stopsWithDistances]);

  // Currently active destination stop
  const activeDestinationStop = useMemo(() => {
    if (!selectedTaskStopId) return null;
    return stopsWithDistances.find((s) => s.id === selectedTaskStopId) || null;
  }, [stopsWithDistances, selectedTaskStopId]);

  // Fetch or refresh road route for a specific selected task
  const handleGetRouteForTask = async (taskStop: RouteMapStop) => {
    if (!routeData?.origin) {
      setError("Your current GPS location is required to calculate the road route. Please enable location permissions.");
      return;
    }
    if (taskStop.customer_latitude == null || taskStop.customer_longitude == null) {
      setError("This customer does not have mapped entrance coordinates. Please ask an admin to pin the location.");
      return;
    }

    // Check if we already have this route loaded to avoid redundant OSRM calls
    const originLat = routeData.origin.latitude;
    const originLng = routeData.origin.longitude;
    const last = lastRoutedLocationRef.current;
    if (
      last &&
      lastRoutedTargetRef.current === taskStop.id &&
      Math.abs(last.lat - originLat) < 0.0002 &&
      Math.abs(last.lng - originLng) < 0.0002 &&
      roadRoute
    ) {
      setSelectedTaskStopId(taskStop.id);
      setIsSingleTaskRoute(true);
      return;
    }

    setSelectedTaskStopId(taskStop.id);
    setIsSingleTaskRoute(true);
    setRouteLoading(true);
    setError(null);

    const fallbackCoords: [number, number][] = [
      [originLng, originLat],
      [taskStop.customer_longitude!, taskStop.customer_latitude!],
    ];

    try {
      const geom = await fetchAgentRouteGeometry([taskStop.id], session?.access_token, fallbackCoords);
      setRoadRoute(geom);
      lastRoutedLocationRef.current = { lat: originLat, lng: originLng };
      lastRoutedTargetRef.current = taskStop.id;
    } catch (err: any) {
      setError(err?.detail || err?.message || "Could not calculate the road route to this customer.");
      setRoadRoute(null);
    } finally {
      setRouteLoading(false);
    }
  };

  // Start active Google Maps style navigation for a task
  const handleStartNavigation = async (taskStop?: RouteMapStop | null) => {
    const target = taskStop || activeDestinationStop || nearestPendingTask;
    if (!target) return;
    if (selectedTaskStopId !== target.id || !roadRoute) {
      await handleGetRouteForTask(target);
    }
    setIsNavigating(true);
  };

  const handleStopNavigation = () => {
    setIsNavigating(false);
  };

  // View full day multi-stop sequence route
  const handleViewFullRoute = async () => {
    if (!routeData?.origin) return;
    setSelectedTaskStopId(null);
    setIsSingleTaskRoute(false);
    setRouteLoading(true);
    setError(null);

    try {
      const geometryIds = orderedIds.filter((id) => {
        const stop = routeData.stops?.find((v) => v.id === id);
        return stop?.customer_latitude != null && stop?.customer_longitude != null;
      });

      if (geometryIds.length > 0) {
        const fallbackCoords: [number, number][] = [
          [routeData.origin.longitude, routeData.origin.latitude],
          ...geometryIds.map((id) => {
            const s = routeData.stops?.find((v) => v.id === id)!;
            return [s.customer_longitude!, s.customer_latitude!] as [number, number];
          }),
        ];
        const geom = await fetchAgentRouteGeometry(geometryIds, session?.access_token, fallbackCoords);
        setRoadRoute(geom);
      } else {
        setRoadRoute(null);
      }
    } catch (err: any) {
      setError(err?.detail || err?.message || "Road route is temporarily unavailable.");
    } finally {
      setRouteLoading(false);
    }
  };

  // Convert raw API stop to AgentVisit for modals/drawers
  const toAgentVisit = (v: AgentRouteData["stops"][number]): AgentVisit => ({
    id: v.id,
    assignmentId: v.visit_code || v.id.slice(0, 8),
    customerId: v.customer_id,
    customerName: v.customer_name || "Customer Site",
    company: v.customer_company || undefined,
    contactPerson: v.customer_contact_person || v.customer_name || "Authorized Representative",
    phone: v.customer_phone || "",
    email: v.customer_email || "",
    address: v.customer_address || "Address unavailable",
    city: v.customer_city || "",
    coordinates: { lat: v.customer_latitude ?? 0, lng: v.customer_longitude ?? 0 },
    hasCoordinates: v.customer_latitude != null && v.customer_longitude != null,
    scheduledTime: v.scheduled_time,
    scheduledDate: v.scheduled_date,
    estimatedDuration: `${v.estimated_duration_minutes || 45} mins`,
    purpose: v.purpose || "Field visit",
    priority: v.priority === "high" || v.priority === "low" ? v.priority : "medium",
    status: v.status as AgentVisit["status"],
    geofenceVerified: v.geofence_verified,
    checkInTime: v.check_in_time || undefined,
    completedTime: v.completed_time || undefined,
    completionNotes: v.completion_notes || undefined,
    orderIndex: v.order_index,
    tags: ["Assigned"],
  });

  const completedCount = routeData?.completed?.length || 0;
  const totalStopCount = (routeData?.stops?.length || 0) + completedCount;

  // Optimize sequence
  const optimize = async () => {
    if (!routeData) return;
    setOptimizing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await optimizeAgentTodayRoute(session?.access_token, localDateString());
      const ids = result.ordered_visit_ids;
      setOrderedIds(ids);
      setNotice(result.detail);

      const geometryIds = ids.filter((id) => {
        const stop = routeData.stops?.find((v) => v.id === id);
        return stop?.customer_latitude != null && stop?.customer_longitude != null;
      });
      setRoadRoute(null);
      setRoadRoute(await fetchAgentRouteGeometry(geometryIds, session?.access_token));
      setIsSingleTaskRoute(false);
      setSelectedTaskStopId(null);
    } catch (err: any) {
      setError(err?.detail || err?.message || "Route optimization failed.");
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-beige-text sm:text-xl">Field Road Routing &amp; Tasks</h2>
            <span className="rounded-full border border-beige-border bg-beige-sand px-2 py-0.5 text-[10px] font-bold text-beige-muted">
              OSRM + Leaflet
            </span>
          </div>
          <p className="text-xs text-beige-muted">
            Select nearby pending tasks, get live OSRM driving routes from your GPS, and inspect entrance destinations
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => void loadRoute(true)}
            disabled={loading || routeLoading}
            className="flex items-center gap-1.5 rounded-xl border border-beige-border bg-beige-card px-3 py-2 text-xs font-semibold text-beige-text disabled:opacity-50 hover:bg-beige-sand transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh GPS &amp; Tasks
          </button>
          <button
            onClick={() => void optimize()}
            disabled={optimizing || loading || !routeData?.origin || (routeData?.stops?.length || 0) < 2}
            className="flex items-center gap-1.5 rounded-xl bg-beige-terracotta px-3 py-2 text-xs font-semibold text-white shadow-2xs disabled:opacity-50 hover:bg-beige-terracotta/90 transition"
          >
            <Sparkles className={`h-3.5 w-3.5 ${optimizing ? "animate-spin" : ""}`} />
            {optimizing ? "Optimizing…" : "Optimize Sequence"}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 shadow-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 rounded-lg hover:bg-red-100 text-red-700 transition cursor-pointer shrink-0"
            title="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-beige-olive/30 bg-beige-olive-subtle p-3 text-xs text-beige-olive">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice} Route order is a preview and does not alter customer records.
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-beige-border bg-beige-card p-8 text-center text-sm text-beige-muted">
          Loading your assigned route and GPS position…
        </div>
      )}

      {!loading && routeData && (
        <>
          {!routeData.origin && (
            <div className="flex items-start gap-2 rounded-xl border border-beige-border bg-beige-sand/60 p-3 text-sm text-beige-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-beige-muted" />
              <span>
                {routeData.origin_error || "Your current location is unavailable, so the road route cannot be drawn."}{" "}
                Your assigned destinations remain listed below. Allow browser location permissions and click Refresh.
              </span>
            </div>
          )}

          {/* Key Metrics Row */}
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-2xl border border-beige-border bg-beige-card p-3">
              <span className="block text-[10px] text-beige-muted">Active Tasks</span>
              <strong className="text-base text-beige-text">{pendingTasksList.length}</strong>
              <span className="mt-0.5 block text-[10px] text-beige-olive">{completedCount} completed today</span>
            </div>
            <div className="rounded-2xl border border-beige-border bg-beige-card p-3">
              <span className="block text-[10px] text-beige-muted">
                {isSingleTaskRoute ? "Road Distance to Task" : "Total Route Distance"}
              </span>
              <strong className="font-mono text-base text-beige-text">
                {roadRoute ? formatDistance(roadRoute.distance_meters) : "—"}
              </strong>
              <span className="mt-0.5 block text-[10px] text-beige-muted">OSRM driving network</span>
            </div>
            <div className="rounded-2xl border border-beige-border bg-beige-card p-3">
              <span className="block text-[10px] text-beige-muted">Estimated Drive Time</span>
              <strong className="font-mono text-base text-beige-olive">
                {roadRoute ? `${Math.round(roadRoute.duration_seconds / 60)} min` : "—"}
              </strong>
              <span className="mt-0.5 block text-[10px] text-beige-muted">Real road network ETA</span>
            </div>
            <div className="rounded-2xl border border-beige-border bg-beige-card p-3">
              <span className="block text-[10px] text-beige-muted">Agent GPS Position</span>
              <strong className="text-base capitalize text-beige-text">
                {!routeData.origin
                  ? "Unavailable"
                  : routeData.origin.accuracy_meters == null
                  ? "GPS Active"
                  : `±${Math.round(routeData.origin.accuracy_meters)} m`}
              </strong>
              <span className="mt-0.5 block text-[10px] text-beige-muted">
                {routeData.origin?.updated_at
                  ? `Updated ${new Date(routeData.origin.updated_at).toLocaleTimeString()}`
                  : "Latest recorded fix"}
              </span>
            </div>
          </div>

          {/* Nearest Task Highlight Card */}
          {nearestPendingTask && (
            <div className="rounded-2xl border border-beige-olive/30 bg-beige-olive-subtle/40 p-3.5 sm:p-4 text-xs shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-beige-olive text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-beige-olive text-sm">Nearest Pending Task:</span>
                      <span className="font-bold text-beige-text text-sm">{nearestPendingTask.customer_name}</span>
                      <StatusBadge status={nearestPendingTask.status} size="sm" />
                    </div>
                    <p className="text-beige-muted mt-0.5 flex items-center gap-1 text-[11px]">
                      <MapPin className="h-3 w-3 text-beige-olive shrink-0" />
                      {nearestPendingTask.customer_address}
                    </p>
                    <p className="font-semibold text-beige-olive text-[11px] mt-0.5">
                      Straight-line distance:{" "}
                      {nearestPendingTask.distance_meters != null
                        ? formatDistance(nearestPendingTask.distance_meters)
                        : "Distance calculating…"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                  {isNavigating && selectedTaskStopId === nearestPendingTask.id ? (
                    <button
                      type="button"
                      onClick={handleStopNavigation}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-xs font-bold text-white shadow-md transition cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                      <span>Stop Nav</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartNavigation(nearestPendingTask)}
                      disabled={routeLoading}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#1E3F35] hover:bg-[#162F27] px-4 py-2.5 text-xs font-bold text-white shadow-md transition transform hover:scale-102 cursor-pointer disabled:opacity-50"
                    >
                      <Navigation className="h-4 w-4 text-white" />
                      <span>Start Navigation</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleGetRouteForTask(nearestPendingTask)}
                    disabled={routeLoading}
                    className="rounded-xl border border-[#E6DFD3] bg-white px-3 py-2.5 text-xs font-semibold text-beige-text hover:bg-[#F9F7F2] transition cursor-pointer"
                  >
                    Preview Route
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedForDrawer(toAgentVisit(nearestPendingTask))}
                    className="rounded-xl border border-[#E6DFD3] bg-white px-3 py-2.5 text-xs font-semibold text-beige-text hover:bg-[#F9F7F2] transition cursor-pointer"
                  >
                    Details
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Road Route Map */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-beige-text">
                <Compass className="h-3.5 w-3.5 text-[#1E3F35]" />
                {isNavigating ? "Google Maps Driving Navigation" : "Road Route & Pending Tasks Map"}
              </h3>
              {isSingleTaskRoute && !isNavigating && (
                <button
                  onClick={handleViewFullRoute}
                  className="text-[11px] font-semibold text-[#1E3F35] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <ListOrdered className="h-3 w-3" />
                  Show Full Route All Stops
                </button>
              )}
            </div>

            <AgentRoadRouteMap
              origin={routeData.origin}
              stops={pendingTasksList}
              geometry={roadRoute?.geometry?.coordinates || []}
              selectedStopId={selectedTaskStopId}
              onSelectStop={(stop) => {
                setSelectedTaskStopId(stop.id);
                void handleGetRouteForTask(stop);
              }}
              singleDestinationMode={isSingleTaskRoute}
              activeDestinationStop={activeDestinationStop}
              legs={roadRoute?.legs || []}
              isNavigating={isNavigating}
              onStartNavigation={handleStartNavigation}
              onStopNavigation={handleStopNavigation}
              onCheckIn={async (stop) => {
                if (isOnDuty) {
                  const res = await checkInVisit(stop.id);
                  if (res.success) {
                    void loadRoute(true);
                  }
                }
              }}
            />
          </section>

          {/* Pending Tasks Interactive Selector Cards */}
          <section className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-beige-text">
                <Route className="h-3.5 w-3.5 text-beige-terracotta" />
                Select Pending Task for Road Routing ({pendingTasksList.length})
              </h3>
              <span className="text-[11px] text-beige-muted">
                Click “Get Route” or marker on map to navigate
              </span>
            </div>

            {!pendingTasksList.length && (
              <div className="rounded-2xl border border-beige-border bg-beige-card p-6 text-center text-sm text-beige-muted">
                No active pending visits are assigned to your account.
              </div>
            )}

            <div className="space-y-2">
              {pendingTasksList.map((raw) => {
                const visit = toAgentVisit(raw);
                const isSelected = selectedTaskStopId === raw.id && isSingleTaskRoute;
                const isNearest = Boolean(raw.is_nearest);

                return (
                  <div
                    key={visit.id}
                    className={`rounded-2xl border bg-beige-card p-4 shadow-2xs transition ${
                      isSelected
                        ? "border-beige-terracotta ring-2 ring-beige-terracotta/30 bg-beige-sand/20"
                        : isNearest
                        ? "border-beige-olive/40 hover:border-beige-olive"
                        : "border-beige-border hover:border-beige-border-dark"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shrink-0 mt-0.5 ${
                            isSelected
                              ? "bg-beige-terracotta"
                              : isNearest
                              ? "bg-beige-olive"
                              : "bg-beige-text"
                          }`}
                        >
                          {visit.orderIndex}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-beige-text truncate">{visit.customerName}</h4>
                            <StatusBadge status={visit.status} size="sm" />
                            {isNearest && (
                              <span className="px-2 py-0.2 rounded-full bg-beige-olive-subtle text-beige-olive text-[10px] font-bold border border-beige-olive/30">
                                Nearest
                              </span>
                            )}
                          </div>
                          {visit.company && <p className="text-[11px] text-beige-muted">{visit.company}</p>}
                          <p className="mt-0.5 flex items-start gap-1 text-xs text-beige-muted truncate">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-beige-terracotta" />
                            {visit.address}
                          </p>

                          <div className="mt-1 flex items-center gap-3 text-[11px] text-beige-muted flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Scheduled: {visit.scheduledTime}
                            </span>
                            {raw.distance_meters != null && (
                              <span className="font-semibold text-beige-text">
                                Distance from you: {formatDistance(raw.distance_meters)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            if (isNavigating && selectedTaskStopId === raw.id) {
                              handleStopNavigation();
                            } else {
                              handleStartNavigation(raw);
                            }
                          }}
                          disabled={routeLoading}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-xs cursor-pointer ${
                            isNavigating && selectedTaskStopId === raw.id
                              ? "bg-red-600 hover:bg-red-700 text-white"
                              : "bg-[#1E3F35] hover:bg-[#162F27] text-white"
                          }`}
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          {isNavigating && selectedTaskStopId === raw.id ? "Stop Nav" : "Start"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleGetRouteForTask(raw)}
                          disabled={routeLoading}
                          className="rounded-xl border border-[#E6DFD3] bg-white px-3 py-2 text-xs font-semibold text-beige-text hover:bg-[#F9F7F2] transition cursor-pointer"
                        >
                          Preview
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedForDrawer(visit)}
                          className="rounded-xl border border-[#E6DFD3] bg-white px-3 py-2 text-xs font-semibold text-beige-text hover:bg-[#F9F7F2] transition cursor-pointer"
                        >
                          Details
                        </button>

                        {visit.status === "in_progress" ? (
                          <button
                            type="button"
                            onClick={() => setCompleteVisit(visit)}
                            className="rounded-xl bg-beige-olive px-3 py-2 text-xs font-bold text-white hover:bg-beige-olive-light transition"
                          >
                            Complete
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              if (isOnDuty) {
                                const res = await checkInVisit(visit.id);
                                if (res.success) {
                                  void loadRoute(true);
                                }
                              }
                            }}
                            className="rounded-xl bg-beige-sand border border-beige-border px-3 py-2 text-xs font-bold text-beige-text hover:bg-beige-border transition"
                          >
                            Check In
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {selectedForDrawer && (
        <VisitDetailDrawer
          visit={selectedForDrawer}
          onClose={() => {
            setSelectedForDrawer(null);
            void loadRoute(true);
          }}
        />
      )}
      {completeVisit && (
        <CompleteVisitModal
          visit={completeVisit}
          onClose={() => {
            setCompleteVisit(null);
            void loadRoute(true);
          }}
          onSuccess={() => {
            setCompleteVisit(null);
            setSelectedForDrawer(null);
            void loadRoute(true);
          }}
        />
      )}
    </div>
  );
}
