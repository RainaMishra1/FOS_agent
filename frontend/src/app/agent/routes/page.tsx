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
  const { checkInVisit, isOnDuty } = useAgent();

  const [routeData, setRouteData] = useState<AgentRouteData | null>(null);
  const [roadRoute, setRoadRoute] = useState<RoadRouteData | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [selectedTaskStopId, setSelectedTaskStopId] = useState<string | null>(preselectedVisitId);
  const [isSingleTaskRoute, setIsSingleTaskRoute] = useState(false);

  const [loading, setLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedForDrawer, setSelectedForDrawer] = useState<AgentVisit | null>(null);
  const [completeVisit, setCompleteVisit] = useState<AgentVisit | null>(null);

  // Cache last routed location and target to avoid redundant OSRM queries on every minor GPS jitter
  const lastRoutedLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastRoutedTargetRef = useRef<string | null>(null);

  // Sync GPS location if meaningfully moved (> 25 meters)
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
      setLoading(true);
      setError(null);
      try {
        // Fast non-blocking GPS read
        if (session?.access_token && typeof navigator !== "undefined" && navigator.geolocation) {
          const position = await new Promise<GeolocationPosition | null>((resolve) => {
            navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
              enableHighAccuracy: true,
              timeout: 3_000,
              maximumAge: 15_000,
            });
          });

          if (position) {
            await syncLocationIfMoved(
              session.access_token,
              position.coords.latitude,
              position.coords.longitude,
              position.coords.accuracy
            );
          }
        }

        const result = await fetchAgentTodayRoute(session?.access_token, localDateString());
        setRouteData(result);

        const ids = keepOrder && orderedIds.length ? orderedIds : result.stops.map((v) => v.id);
        setOrderedIds(ids);

        // Determine destination stops for OSRM geometry
        if (!result.origin) {
          setRoadRoute(null);
          return;
        }

        // Check if there is a target stop requested
        const targetId = selectedTaskStopId || preselectedVisitId;
        if (targetId && result.stops.some((s) => s.id === targetId)) {
          setSelectedTaskStopId(targetId);
          setIsSingleTaskRoute(true);
          try {
            const geom = await fetchAgentRouteGeometry([targetId], session?.access_token);
            setRoadRoute(geom);
          } catch {
            setRoadRoute(null);
          }
        } else {
          // Route through all ordered routable stops
          const geometryIds = ids.filter((id) => {
            const stop = result.stops.find((v) => v.id === id);
            return stop?.customer_latitude != null && stop?.customer_longitude != null;
          });

          if (geometryIds.length > 0) {
            try {
              const geom = await fetchAgentRouteGeometry(geometryIds, session?.access_token);
              setRoadRoute(geom);
            } catch (routeErr: any) {
              setRoadRoute(null);
              setError(
                `Your assigned stops loaded, but road routing is unavailable: ${
                  routeErr?.detail || routeErr?.message || "try again later"
                }`
              );
            }
          } else {
            setRoadRoute(null);
          }
        }
      } catch (err: any) {
        setError(err?.detail || err?.message || "Could not load your route from the server.");
        setRouteData(null);
        setRoadRoute(null);
      } finally {
        setLoading(false);
      }
    },
    [session?.access_token, orderedIds, selectedTaskStopId, preselectedVisitId, syncLocationIfMoved]
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
    const computed = routeData.stops.map((stop) => {
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

    try {
      const geom = await fetchAgentRouteGeometry([taskStop.id], session?.access_token);
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

  // View full day multi-stop sequence route
  const handleViewFullRoute = async () => {
    if (!routeData?.origin) return;
    setSelectedTaskStopId(null);
    setIsSingleTaskRoute(false);
    setRouteLoading(true);
    setError(null);

    try {
      const geometryIds = orderedIds.filter((id) => {
        const stop = routeData.stops.find((v) => v.id === id);
        return stop?.customer_latitude != null && stop?.customer_longitude != null;
      });

      if (geometryIds.length > 0) {
        const geom = await fetchAgentRouteGeometry(geometryIds, session?.access_token);
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

  const completedCount = routeData?.completed.length || 0;
  const totalStopCount = (routeData?.stops.length || 0) + completedCount;

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
        const stop = routeData.stops.find((v) => v.id === id);
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
            disabled={optimizing || loading || !routeData?.origin || (routeData?.stops.length || 0) < 2}
            className="flex items-center gap-1.5 rounded-xl bg-beige-terracotta px-3 py-2 text-xs font-semibold text-white shadow-2xs disabled:opacity-50 hover:bg-beige-terracotta/90 transition"
          >
            <Sparkles className={`h-3.5 w-3.5 ${optimizing ? "animate-spin" : ""}`} />
            {optimizing ? "Optimizing…" : "Optimize Sequence"}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
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
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
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
            <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-3.5 sm:p-4 text-xs shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-amber-950 text-sm">Nearest Pending Task:</span>
                      <span className="font-bold text-beige-text text-sm">{nearestPendingTask.customer_name}</span>
                      <StatusBadge status={nearestPendingTask.status} size="sm" />
                    </div>
                    <p className="text-stone-600 mt-0.5 flex items-center gap-1 text-[11px]">
                      <MapPin className="h-3 w-3 text-beige-terracotta shrink-0" />
                      {nearestPendingTask.customer_address}
                    </p>
                    <p className="font-semibold text-amber-800 text-[11px] mt-0.5">
                      Straight-line distance:{" "}
                      {nearestPendingTask.distance_meters != null
                        ? formatDistance(nearestPendingTask.distance_meters)
                        : "Distance calculating…"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    onClick={() => handleGetRouteForTask(nearestPendingTask)}
                    disabled={routeLoading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-beige-terracotta px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-beige-terracotta/90 transition disabled:opacity-50"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    {selectedTaskStopId === nearestPendingTask.id && isSingleTaskRoute
                      ? "Route Active"
                      : "Get Route to Nearest"}
                  </button>
                  <button
                    onClick={() => setSelectedForDrawer(toAgentVisit(nearestPendingTask))}
                    className="rounded-xl border border-beige-border bg-beige-card px-3 py-2 text-xs font-semibold text-beige-text hover:bg-beige-sand transition"
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
                <Compass className="h-3.5 w-3.5 text-beige-terracotta" />
                Road Route &amp; Pending Tasks Map
              </h3>
              {isSingleTaskRoute && (
                <button
                  onClick={handleViewFullRoute}
                  className="text-[11px] font-semibold text-beige-terracotta hover:underline flex items-center gap-1"
                >
                  <ListOrdered className="h-3 w-3" />
                  Show Full Route All Stops
                </button>
              )}
            </div>

            <AgentRoadRouteMap
              origin={routeData.origin}
              stops={stopsWithDistances}
              geometry={roadRoute?.geometry?.coordinates || []}
              selectedStopId={selectedTaskStopId}
              onSelectStop={(stop) => {
                setSelectedTaskStopId(stop.id);
                void handleGetRouteForTask(stop);
              }}
              singleDestinationMode={isSingleTaskRoute}
              activeDestinationStop={activeDestinationStop}
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
                        ? "border-amber-300 hover:border-amber-400"
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
                              ? "bg-amber-600"
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
                              <span className="px-2 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300">
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
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleGetRouteForTask(raw)}
                          disabled={routeLoading}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-xs ${
                            isSelected
                              ? "bg-beige-olive text-white hover:bg-beige-olive-light"
                              : "bg-beige-terracotta text-white hover:bg-beige-terracotta/90"
                          }`}
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          {isSelected ? "Route Displayed" : "Get Route"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedForDrawer(visit)}
                          className="rounded-xl border border-beige-border bg-beige-card px-3 py-2 text-xs font-semibold text-beige-text hover:bg-beige-sand transition"
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
                            onClick={() => {
                              if (isOnDuty) void checkInVisit(visit.id);
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
        <VisitDetailDrawer visit={selectedForDrawer} onClose={() => setSelectedForDrawer(null)} />
      )}
      {completeVisit && (
        <CompleteVisitModal visit={completeVisit} onClose={() => setCompleteVisit(null)} />
      )}
    </div>
  );
}
