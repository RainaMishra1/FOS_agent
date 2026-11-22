"use client";

import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from "react";
import { AgentProfile, AgentVisit } from "@/types/agent";

const defaultAgentProfile: AgentProfile = {
  id: "",
  name: "Field Agent",
  initials: "FA",
  role: "Field Operations Specialist",
  status: "active",
  email: "",
  phone: "",
  territory: "Mumbai Zone",
  batteryLevel: 90,
  shiftHours: "09:00 - 18:00 IST",
  currentCoordinates: { lat: 0, lng: 0 },
};
import { useAuth } from "@/context/AuthContext";
import {
  fetchAgentDashboard,
  updateAgentVisitStatus,
  updateAgentDutyStatus,
  updateAgentLocation,
  VisitApiResponse,
  AgentApiItem,
} from "@/lib/api";
import { calculateHaversineDistanceKm } from "@/lib/geoUtils";

interface AgentContextType {
  currentAgent: AgentProfile;
  availableAgents: AgentProfile[];
  switchAgent: (agentId: string) => void | Promise<void>;
  loadAgentData: (showLoader?: boolean) => Promise<void>;
  isOnDuty: boolean;
  toggleDuty: () => Promise<void>;
  setIsOnDuty: (onDuty: boolean) => void;
  visits: AgentVisit[];
  historyVisits: AgentVisit[];
  selectedVisit: AgentVisit | null;
  setSelectedVisit: (visit: AgentVisit | null) => void;
  checkInVisit: (visitId: string) => Promise<{ success: boolean; message: string }>;
  completeVisit: (visitId: string, notes?: string) => Promise<{ success: boolean; message: string }>;
  resetDemoData: () => void;
  notification: { type: "success" | "error" | "info"; message: string } | null;
  clearNotification: () => void;
  showNotification: (type: "success" | "error" | "info", message: string) => void;
  stats: {
    todayTotal: number;
    todayCompleted: number;
    todayRemaining: number;
    completionPercentage: number;
    nextVisit: AgentVisit | null;
  };
  liveGpsCoords: { lat: number; lng: number; accuracy?: number } | null;
  refreshLiveGps: () => Promise<{ lat: number; lng: number; accuracy?: number } | null>;
  /** Whether this device is giving us location: granted, blocked, GPS off, etc. */
  locationStatus: LocationStatus;
  /** Ask for location (call from a button tap — phones prompt more reliably then). */
  requestLocation: () => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  isLiveBackend: boolean;
  refreshAgentData: (showLoader?: boolean) => Promise<void>;
}

export type LocationStatus = "checking" | "granted" | "prompt" | "denied" | "unavailable" | "unsupported" | "insecure";

type Fix = { lat: number; lng: number; accuracy: number; at: number };

class LocationError extends Error {
  constructor(public reason: "denied" | "unavailable" | "timeout" | "unsupported", message: string) {
    super(message);
  }
}

const LOCATION_MESSAGES = {
  denied: "Location is blocked for this app. Allow it, then try again.",
  unavailable: "Your phone's location (GPS) seems to be off. Turn it on and try again.",
  timeout: "Still finding your location. Move near a window or outdoors and try again.",
  unsupported: "This browser can't share location.",
};

export const AgentContext = createContext<AgentContextType | undefined>(undefined);

function mapApiVisitToAgentVisit(v: VisitApiResponse): AgentVisit {
  const hasCoords = Boolean(
    v.customer_latitude != null &&
      v.customer_longitude != null &&
      (v.customer_latitude !== 0 || v.customer_longitude !== 0)
  );

  return {
    id: v.id,
    assignmentId: v.visit_code || v.id.slice(0, 8),
    customerId: v.customer_id,
    customerName: v.customer_name || "Customer Site",
    company: v.customer_company || undefined,
    contactPerson: v.customer_contact_person || v.customer_name || "Authorized Representative",
    phone: v.customer_phone || "+91 98800 00000",
    email: v.customer_email || "operations@client.internal",
    address: v.customer_address || "Customer location address pending geocode",
    city: v.customer_city || "Bengaluru",
    coordinates: {
      lat: v.customer_latitude ?? 0,
      lng: v.customer_longitude ?? 0,
    },
    hasCoordinates: hasCoords,
    scheduledTime: v.scheduled_time || "10:00 AM",
    scheduledDate: v.scheduled_date,
    estimatedDuration: `${v.estimated_duration_minutes || 45} mins`,
    purpose: v.purpose || "On-site Field Inspection & Verification",
    priority: (v.priority === "high" || v.priority === "low" ? v.priority : "medium"),
    status: (v.status as any) || "pending",
    geofenceVerified: v.geofence_verified,
    checkInTime: v.check_in_time
      ? new Date(v.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : undefined,
    completedTime: v.completed_time
      ? new Date(v.completed_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : undefined,
    completionNotes: v.completion_notes || undefined,
    orderIndex: v.order_index || 1,
    tags: ["Assigned"],
  };
}

function mapApiAgentToProfile(a: AgentApiItem): AgentProfile {
  const nameParts = (a.name || "Field Agent").trim().split(" ");
  const initials =
    nameParts.length > 1
      ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
      : a.name.slice(0, 2).toUpperCase();

  return {
    id: a.agent_code || a.id.slice(0, 8),
    name: a.name || "Field Agent",
    initials,
    role: "Senior Field Specialist",
    status: a.status,
    email: a.email || "agent@fos-system.internal",
    phone: a.phone || "+91 98800 12345",
    territory: a.territory || "Koramangala Zone",
    batteryLevel: a.battery_level ?? 90,
    shiftHours: "09:00 - 18:00 IST",
    currentCoordinates: {
      lat: a.current_latitude ?? 0,
      lng: a.current_longitude ?? 0,
    },
  };
}

function extractErrorMessage(err: any, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  const detail = err.detail !== undefined ? err.detail : err.message;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: any) => (d?.msg ? (d.loc ? `${d.loc.slice(-1)}: ${d.msg}` : d.msg) : JSON.stringify(d)))
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    return detail.msg || JSON.stringify(detail);
  }
  if (typeof err.message === "string") return err.message;
  return fallback;
}

function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function syncFreshGpsLocation(token: string): Promise<void> {
  if (!navigator.geolocation) {
    throw new Error("This browser cannot provide GPS location, so the 750m geofence cannot be verified.");
  }

  // Phase 1: Try quick single fix with recent cache allowed (up to 15s) and 3s timeout
  const getQuickPosition = (): Promise<GeolocationPosition | null> => {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 3_000, maximumAge: 15_000 }
      );
    });
  };

  let position = await getQuickPosition();

  // Phase 2: If no cached position or accuracy > 750m (testing threshold; set to 100m in production), acquire a fresh fix
  const REQUIRED_ACCURACY_METERS = 750;
  if (!position || (position.coords.accuracy && position.coords.accuracy > REQUIRED_ACCURACY_METERS)) {
    position = await new Promise<GeolocationPosition>((resolve, reject) => {
      let watchId: number | null = null;
      let timer: number;
      let bestPosition: GeolocationPosition | null = position;

      const finish = (result?: GeolocationPosition, error?: Error) => {
        window.clearTimeout(timer);
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        if (result) resolve(result);
        else reject(error || new Error("GPS could not determine your location. Move outdoors and try again."));
      };

      timer = window.setTimeout(() => {
        if (bestPosition && bestPosition.coords.accuracy <= REQUIRED_ACCURACY_METERS) {
          finish(bestPosition);
        } else {
          finish(
            undefined,
            new Error(
              bestPosition
                ? `GPS accuracy is ±${Math.round(bestPosition.coords.accuracy)}m; it must be ${REQUIRED_ACCURACY_METERS}m or better. Move outdoors, enable precise location, and try again.`
                : "GPS lookup timed out. Move outdoors, enable precise location, and try again."
            )
          );
        }
      }, 5_000);

      watchId = navigator.geolocation.watchPosition(
        (nextPosition) => {
          if (!bestPosition || nextPosition.coords.accuracy < bestPosition.coords.accuracy) {
            bestPosition = nextPosition;
          }
          // Accept fix immediately once within testing threshold
          if (nextPosition.coords.accuracy <= REQUIRED_ACCURACY_METERS) {
            finish(nextPosition);
          }
        },
        (geoError) => {
          if (geoError.code === geoError.PERMISSION_DENIED) {
            finish(undefined, new Error("Location access is required to verify the 750m geofence."));
          } else if (geoError.code === geoError.POSITION_UNAVAILABLE && !bestPosition) {
            finish(undefined, new Error("Your device could not determine a location. Check that location services are on and try again."));
          }
        },
        { enableHighAccuracy: true, timeout: 5_000, maximumAge: 5_000 }
      );
    });
  }

  await updateAgentLocation({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    gps_accuracy: position.coords.accuracy,
    location_source: "gps",
  }, token);
}

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const { session, isAuthenticated, role, profile } = useAuth();

  const [currentAgent, setCurrentAgent] = useState<AgentProfile>(defaultAgentProfile);
  const [availableAgentsList, setAvailableAgentsList] = useState<AgentProfile[]>([defaultAgentProfile]);
  const [isOnDuty, setIsOnDuty] = useState<boolean>(true);
  const [visits, setVisits] = useState<AgentVisit[]>([]);
  const [historyVisits, setHistoryVisits] = useState<AgentVisit[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<AgentVisit | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiveBackend, setIsLiveBackend] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const showNotification = useCallback((type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  }, []);

  const clearNotification = useCallback(() => setNotification(null), []);

  // Persistent live GPS tracking from browser Geolocation API
  const [liveGpsCoords, setLiveGpsCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const liveGpsCoordsRef = useRef<{ lat: number; lng: number; accuracy?: number } | null>(null);

  const [locationStatus, setLocationStatus] = useState<LocationStatus>("checking");
  const liveFixRef = useRef<Fix | null>(null);
  const [watchKey, setWatchKey] = useState(0);

  const acceptPosition = useCallback((pos: GeolocationPosition) => {
    const fix: Fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() };
    liveFixRef.current = fix;
    const coords = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy };
    liveGpsCoordsRef.current = coords;
    setLiveGpsCoords(coords);
    setLocationStatus("granted");
    setCurrentAgent((prev) => ({ ...prev, currentCoordinates: { lat: fix.lat, lng: fix.lng } }));
    return fix;
  }, []);

  const rejectPosition = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) setLocationStatus("denied");
    else if (err.code === err.POSITION_UNAVAILABLE && !liveFixRef.current) setLocationStatus("unavailable");
    // TIMEOUT: keep waiting; the watch keeps trying.
  }, []);

  // Know the permission state up front (and when the user changes it in settings).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) return setLocationStatus("insecure");
    if (!navigator.geolocation) return setLocationStatus("unsupported");
    let permission: PermissionStatus | null = null;
    const apply = () => {
      if (!permission) return;
      if (permission.state === "denied") setLocationStatus("denied");
      else if (permission.state === "prompt") setLocationStatus((current) => (current === "granted" ? current : "prompt"));
      else setWatchKey((key) => key + 1); // granted (possibly just now): restart tracking
    };
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((status) => {
        permission = status;
        apply();
        status.onchange = apply;
      })
      .catch(() => undefined); // Older Safari: no Permissions API; the watch below tells us instead.
    return () => {
      if (permission) permission.onchange = null;
    };
  }, []);

  // One live GPS watch for the whole agent app.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation || (typeof window !== "undefined" && !window.isSecureContext)) return;
    const watchId = navigator.geolocation.watchPosition(acceptPosition, rejectPosition, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 5000,
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [acceptPosition, rejectPosition, watchKey]);

  /** Best current position: a fix from the last 20 s, otherwise ask the device (up to `waitMs`). */
  const getFix = useCallback(
    async (waitMs = 15000): Promise<Fix> => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        throw new LocationError("unsupported", LOCATION_MESSAGES.unsupported);
      }
      const recent = liveFixRef.current;
      if (recent && Date.now() - recent.at < 20000) return recent;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          const timer = setTimeout(() => reject({ code: 3 }), waitMs + 1000);
          navigator.geolocation.getCurrentPosition(
            (p) => {
              clearTimeout(timer);
              resolve(p);
            },
            (e) => {
              clearTimeout(timer);
              reject(e);
            },
            { enableHighAccuracy: true, timeout: waitMs, maximumAge: 10000 }
          );
        });
        return acceptPosition(pos);
      } catch (err: any) {
        if (err?.code === 1) {
          setLocationStatus("denied");
          throw new LocationError("denied", LOCATION_MESSAGES.denied);
        }
        // Slow GPS: a fix from the last 2 minutes is still usable; the server checks freshness too.
        const older = liveFixRef.current;
        if (older && Date.now() - older.at < 120000) return older;
        if (err?.code === 2) {
          setLocationStatus("unavailable");
          throw new LocationError("unavailable", LOCATION_MESSAGES.unavailable);
        }
        throw new LocationError("timeout", LOCATION_MESSAGES.timeout);
      }
    },
    [acceptPosition]
  );

  const requestLocation = useCallback(async () => {
    try {
      await getFix(20000);
      setWatchKey((key) => key + 1);
      return true;
    } catch (err: any) {
      showNotification("error", err?.message || LOCATION_MESSAGES.timeout);
      return false;
    }
  }, [getFix, showNotification]);

  const refreshLiveGps = useCallback(async (): Promise<{ lat: number; lng: number; accuracy?: number } | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;
    try {
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p),
          (err) => {
            console.warn("[AgentContext] GPS query error:", err.message);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      });
      if (pos && pos.coords) {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        liveGpsCoordsRef.current = coords;
        setLiveGpsCoords(coords);
        setCurrentAgent((prev) => ({
          ...prev,
          currentCoordinates: { lat: coords.lat, lng: coords.lng },
        }));
        return coords;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  useEffect(() => {
    if (profile) {
      const name = profile.full_name || "Field Agent";
      const parts = name.trim().split(" ");
      const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
      setCurrentAgent((prev) => ({
        ...prev,
        id: profile.agent_id || profile.id || prev.id,
        dbId: profile.agent_id ?? undefined,
        agentCode: profile.agent_code ?? undefined,
        name,
        email: profile.email || prev.email,
        initials,
        territory: profile.territory || prev.territory,
      }));
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const mapped: AgentProfile = {
      ...defaultAgentProfile,
      id: profile.agent_code || profile.agent_id || profile.id,
      dbId: profile.agent_id,
      agentCode: profile.agent_code,
      name: profile.full_name || "Field Agent",
      email: profile.email || "",
      territory: profile.territory || "",
      status: profile.agent_status || "active",
    };
    setAvailableAgentsList([mapped]);
  }, [profile]);
  const loadAgentData = useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    setError(null);
    try {
      if (!session?.access_token) throw new Error("Your secure session is unavailable. Sign in again.");
      const data = await fetchAgentDashboard(session.access_token, localDateString());
      setIsLiveBackend(true);
      if (data.agent) {
        setCurrentAgent(mapApiAgentToProfile(data.agent));
        setIsOnDuty(data.agent.status === "active");
      }
      const activeVisits = [...(data.today_visits || []), ...(data.upcoming_visits || [])].map(mapApiVisitToAgentVisit);
      const mappedHistory = (data.recent_history || []).map(mapApiVisitToAgentVisit);
      setVisits(activeVisits);
      setHistoryVisits(mappedHistory);
      setSelectedVisit((previous) => previous ? activeVisits.find((visit) => visit.id === previous.id) || activeVisits[0] || null : activeVisits[0] || null);
    } catch (err: any) {
      setIsLiveBackend(false);
      setVisits([]);
      setHistoryVisits([]);
      setSelectedVisit(null);
      setError(extractErrorMessage(err, "Could not load your field dashboard."));
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, [session?.access_token]);
  // Sync data whenever authenticated session is established
  useEffect(() => {
    if (isAuthenticated) {
      loadAgentData(true);
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, loadAgentData]);

  const toggleDuty = async () => {
    const nextStatus = isOnDuty ? "off_duty" : "active";
    try {
      if (!session?.access_token) throw new Error("Your secure session is unavailable. Sign in again.");
      await updateAgentDutyStatus(nextStatus, session.access_token);
      setIsOnDuty(!isOnDuty);
      setCurrentAgent((prev) => ({ ...prev, status: nextStatus }));
      showNotification(!isOnDuty ? "success" : "info", !isOnDuty
        ? "You are now ON DUTY. Field tracking active."
        : "You are now OFF DUTY. Location updates paused.");
    } catch (err: any) {
      showNotification("error", extractErrorMessage(err, "Could not update duty status."));
    }
  };

  const switchAgent = async (agentId: string) => {
    const found = availableAgentsList.find(
      (a) => a.id === agentId || a.dbId === agentId || a.agentCode === agentId
    );
    if (found) {
      setCurrentAgent(found);
      setIsOnDuty(found.status === "active");
      showNotification("info", `Switched agent profile to ${found.name}`);
      await loadAgentData(true);
    }
  };

  const checkInVisit = async (visitId: string): Promise<{ success: boolean; message: string }> => {
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) {
      return { success: false, message: "Visit record not found." };
    }

    if (!isOnDuty) {
      try {
        await updateAgentDutyStatus("active", session?.access_token);
        setIsOnDuty(true);
        setCurrentAgent((prev) => ({ ...prev, status: "active" }));
      } catch {
        setIsOnDuty(true);
      }
    }

    const agentCoords = currentAgent?.currentCoordinates;
    const custCoords = visit.coordinates;
    const hasCustCoords = Boolean(
      visit.hasCoordinates &&
      custCoords &&
      (custCoords.lat !== 0 || custCoords.lng !== 0)
    );

    let liveBrowserCoords: { lat: number; lng: number } | null = null;
    let liveAccuracy: number | undefined;
    try {
      const fix = await getFix();
      liveBrowserCoords = { lat: fix.lat, lng: fix.lng };
      liveAccuracy = fix.accuracy;
    } catch (err: any) {
      const errorMsg = err?.message || LOCATION_MESSAGES.timeout;
      showNotification("error", errorMsg);
      return { success: false, message: errorMsg };
    }

    const targetLat = liveBrowserCoords.lat;
    const targetLng = liveBrowserCoords.lng;

    let distanceMeters: number | null = null;
    if (hasCustCoords && custCoords) {
      distanceMeters = Math.round(
        calculateHaversineDistanceKm(
          targetLat,
          targetLng,
          custCoords.lat,
          custCoords.lng
        ) * 1000
      );
    }

    // 2. Strict 750m check
    if (distanceMeters !== null && distanceMeters > 750) {
      const errorMsg = `You are not under 750 m. You are ${distanceMeters}m away from the customer's location.`;
      showNotification("error", errorMsg);
      return {
        success: false,
        message: errorMsg,
      };
    }

    try {
      if (!session?.access_token) {
        throw new Error("Your secure session is unavailable. Sign in again to check in.");
      }

      // 3. Save the verified location through the backend
      if (targetLat != null && targetLng != null) {
        try {
          await updateAgentLocation({
            latitude: targetLat,
            longitude: targetLng,
            // Send the device's real accuracy; the server rejects readings without it.
            gps_accuracy: liveAccuracy,
            location_source: "gps",
          }, session.access_token);
        } catch (locErr) {
          throw new Error(extractErrorMessage(locErr, "Could not save your GPS location. Try again."));
        }

        setCurrentAgent((prev) => ({
          ...prev,
          currentCoordinates: { lat: targetLat!, lng: targetLng! },
        }));
      }

      const updatedApi = await updateAgentVisitStatus(visitId, "in_progress", undefined, session.access_token);
      const mapped = mapApiVisitToAgentVisit(updatedApi);

      setVisits((prev) => prev.map((v) => (v.id === visitId ? mapped : v)));
      if (selectedVisit?.id === visitId) {
        setSelectedVisit(mapped);
      }

      showNotification(
        "success",
        `Check-in Verified at ${visit.customerName}! Visit is now In Progress.`
      );

      // Refresh statistics in background
      loadAgentData(false);

      return {
        success: true,
        message: `Checked in successfully.`,
      };
    } catch (err: any) {
      const msg = extractErrorMessage(err, "Check-in failed on server.");
      showNotification("error", msg);
      return {
        success: false,
        message: msg,
      };
    }
  };

  const completeVisit = async (visitId: string, notes?: string): Promise<{ success: boolean; message: string }> => {
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) {
      return { success: false, message: "Visit record not found." };
    }

    try {
      if (!session?.access_token) {
        throw new Error("Your secure session is unavailable. Sign in again to complete this visit.");
      }

      const agentCoords = currentAgent?.currentCoordinates;
      const custCoords = visit.coordinates;
      const hasCustCoords = Boolean(
        visit.hasCoordinates &&
        custCoords &&
        (custCoords.lat !== 0 || custCoords.lng !== 0)
      );

      // 1. Current GPS position
      let liveBrowserCoords: { lat: number; lng: number } | null = null;
      let liveAccuracy: number | undefined;
      try {
        const fix = await getFix();
        liveBrowserCoords = { lat: fix.lat, lng: fix.lng };
        liveAccuracy = fix.accuracy;
      } catch (err: any) {
        const errorMsg = err?.message || LOCATION_MESSAGES.timeout;
        showNotification("error", errorMsg);
        return { success: false, message: errorMsg };
      }

      // 2. Calculate distance to customer site strictly using live GPS
      let distanceMeters: number | null = null;
      if (hasCustCoords && custCoords) {
        distanceMeters = Math.round(
          calculateHaversineDistanceKm(
            liveBrowserCoords.lat,
            liveBrowserCoords.lng,
            custCoords.lat,
            custCoords.lng
          ) * 1000
        );
      }

      // Strict 750m check on completion
      if (distanceMeters !== null && distanceMeters > 750) {
        const errorMsg = `Cannot complete visit: You are not within the 750m geofence. You are ${distanceMeters}m away from the customer's location.`;
        showNotification("error", errorMsg);
        return {
          success: false,
          message: errorMsg,
        };
      }

      if (liveBrowserCoords) {
        setCurrentAgent((prev) => ({
          ...prev,
          currentCoordinates: { lat: liveBrowserCoords!.lat, lng: liveBrowserCoords!.lng },
        }));
      }

      // Send the same fix to the server, which re-checks the 750 m zone.
      try {
        await updateAgentLocation(
          { latitude: liveBrowserCoords.lat, longitude: liveBrowserCoords.lng, gps_accuracy: liveAccuracy, location_source: "gps" },
          session.access_token
        );
      } catch (locErr) {
        const msg = extractErrorMessage(locErr, "Could not save your GPS location. Try again.");
        showNotification("error", msg);
        return { success: false, message: msg };
      }

      const updatedApi = await updateAgentVisitStatus(visitId, "completed", notes, session.access_token);
      const mapped = mapApiVisitToAgentVisit(updatedApi);
      setVisits((prev) => prev.map((v) => (v.id === visitId ? mapped : v)));
      setHistoryVisits((prev) => [mapped, ...prev.filter((h) => h.id !== visitId)]);

      if (selectedVisit?.id === visitId) {
        setSelectedVisit(mapped);
      }

      showNotification(
        "success",
        `Visit at ${visit.customerName} marked as completed! Great job.`
      );

      // Refresh statistics in background
      loadAgentData(false);

      return {
        success: true,
        message: `Visit completed successfully.`,
      };
    } catch (err: any) {
      const msg = extractErrorMessage(err, "Failed to complete visit on server.");
      showNotification("error", msg);
      return {
        success: false,
        message: msg,
      };
    }
  };

  const resetDemoData = () => {
    loadAgentData(true);
    showNotification("info", "Refreshed operational data from backend.");
  };

  // Computed statistics from live visits and history
  const stats = useMemo(() => {
    // Collect all completed visits from history and active list (deduping by id)
    const completedSet = new Set<string>();
    historyVisits.forEach((v) => completedSet.add(v.id));
    visits.filter((v) => v.status === "completed").forEach((v) => completedSet.add(v.id));
    const todayCompleted = completedSet.size;

    // Remaining active visits awaiting action
    const remainingVisits = visits.filter((v) => v.status !== "completed");
    const todayRemaining = remainingVisits.length;

    // Total visits assigned (completed + remaining)
    const todayTotal = todayRemaining + todayCompleted;

    const completionPercentage =
      todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

    const inProgress = remainingVisits.find((v) => v.status === "in_progress");
    const pending = remainingVisits.find((v) => v.status === "pending" || v.status === "delayed");
    const nextVisit = inProgress || pending || remainingVisits[0] || null;

    return {
      todayTotal,
      todayCompleted,
      todayRemaining,
      completionPercentage,
      nextVisit,
    };
  }, [visits, historyVisits]);

  return (
    <AgentContext.Provider
      value={{
        currentAgent,
        availableAgents: availableAgentsList,
        switchAgent,
        isOnDuty,
        toggleDuty,
        setIsOnDuty,
        visits,
        historyVisits,
        selectedVisit,
        setSelectedVisit,
        checkInVisit,
        completeVisit,
        resetDemoData,
        notification,
        clearNotification,
        showNotification,
        stats,
        liveGpsCoords,
        refreshLiveGps,
        locationStatus,
        requestLocation,
        isLoading,
        error,
        isLiveBackend,
        loadAgentData,
        refreshAgentData: loadAgentData,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useAgent must be used within an AgentProvider");
  }
  return context;
}
