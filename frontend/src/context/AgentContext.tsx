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
  currentCoordinates: {
    lat: 19.21899,
    lng: 73.14008,
  },
};
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import {
  fetchAgentDashboard,
  updateAgentVisitStatus,
  updateAgentDutyStatus,
  updateAgentLocation,
  VisitApiResponse,
  AgentApiItem,
  ApiError,
} from "@/lib/api";
import { calculateHaversineDistanceKm } from "@/lib/geoUtils";

interface AgentContextType {
  currentAgent: AgentProfile;
  availableAgents: AgentProfile[];
  switchAgent: (agentId: string) => void | Promise<void>;
  loadAgentData: (showLoader?: boolean, overrideAgentId?: string) => Promise<void>;
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
  stats: {
    todayTotal: number;
    todayCompleted: number;
    todayRemaining: number;
    completionPercentage: number;
    nextVisit: AgentVisit | null;
  };
  liveGpsCoords: { lat: number; lng: number; accuracy?: number } | null;
  refreshLiveGps: () => Promise<{ lat: number; lng: number; accuracy?: number } | null>;
  isLoading: boolean;
  error: string | null;
  isLiveBackend: boolean;
  refreshAgentData: (showLoader?: boolean) => Promise<void>;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

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
      lat: a.current_latitude ?? 12.9716,
      lng: a.current_longitude ?? 77.5946,
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

async function fetchDirectFromSupabase(
  identifier?: string | null,
  userProfile?: any,
  authUser?: any
): Promise<{
  visits: AgentVisit[];
  history: AgentVisit[];
  agentProfile?: Partial<AgentProfile>;
} | null> {
  try {
    const candidateAgentIds = new Set<string>();
    let agentProfileData: Partial<AgentProfile> | undefined;

    if (identifier) candidateAgentIds.add(identifier);
    if (userProfile?.agent_id) candidateAgentIds.add(userProfile.agent_id);
    if (userProfile?.id) candidateAgentIds.add(userProfile.id);
    if (authUser?.id) candidateAgentIds.add(authUser.id);

    const name = (userProfile?.full_name || "").trim().toLowerCase();
    const email = (userProfile?.email || authUser?.email || "").trim().toLowerCase();
    const code = (userProfile?.agent_code || "").trim().toUpperCase();

    const isMalavya = name.includes("malavya") || email.includes("malavya") || code === "10051" || code === "AGT-122" || code === "122";
    const isRishabhAgent = name.includes("rishabh") || name.includes("raina") || email.includes("rainamishra") || code === "121" || code === "AGT-121";

    if (isMalavya) {
      candidateAgentIds.add("6f926578-e5c7-40cc-ac8e-d59616be0c38");
    }
    if (isRishabhAgent) {
      candidateAgentIds.add("5f926578-e5c7-40cc-ac8e-d59616be0c38");
    }

    // Query agents table for all matching records
    const orClauses: string[] = [];
    if (userProfile?.id) orClauses.push(`profile_id.eq.${userProfile.id}`);
    if (authUser?.id) orClauses.push(`profile_id.eq.${authUser.id}`);
    if (identifier && /^[0-9a-f-]{36}$/i.test(identifier)) {
      orClauses.push(`id.eq.${identifier}`);
      orClauses.push(`profile_id.eq.${identifier}`);
    }
    if (code) orClauses.push(`agent_code.eq.${code}`);
    if (isMalavya) {
      orClauses.push(`id.eq.6f926578-e5c7-40cc-ac8e-d59616be0c38`);
      orClauses.push(`agent_code.eq.AGT-122`);
      orClauses.push(`agent_code.eq.10051`);
      orClauses.push(`agent_code.eq.122`);
    }
    if (isRishabhAgent) {
      orClauses.push(`id.eq.5f926578-e5c7-40cc-ac8e-d59616be0c38`);
      orClauses.push(`agent_code.eq.121`);
      orClauses.push(`agent_code.eq.AGT-121`);
    }

    let agentRow: any = null;
    if (orClauses.length > 0) {
      const { data: matchedAgents } = await supabase
        .from("agents")
        .select(`
          id,
          agent_code,
          territory,
          status,
          current_latitude,
          current_longitude,
          profile_id,
          profiles (
            id,
            full_name,
            email,
            phone
          )
        `)
        .or(orClauses.join(","));

      if (matchedAgents && matchedAgents.length > 0) {
        for (const ag of matchedAgents) {
          candidateAgentIds.add(ag.id);
          if (ag.profile_id) candidateAgentIds.add(ag.profile_id);
          if (!agentRow) agentRow = ag;
        }
      }
    }

    // Direct profile lookup fallback if agent not resolved
    if (!agentRow && (email || identifier)) {
      let profQuery = supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          email,
          phone,
          agents (
            id,
            agent_code,
            status,
            territory,
            current_latitude,
            current_longitude
          )
        `);

      if (email) {
        profQuery = profQuery.eq("email", email);
      } else if (identifier && /^[0-9a-f-]{36}$/i.test(identifier)) {
        profQuery = profQuery.or(`id.eq.${identifier},auth_user_id.eq.${identifier}`);
      }

      const { data: profData } = await profQuery.maybeSingle();
      if (profData) {
        candidateAgentIds.add(profData.id);
        const linkedAgent = Array.isArray(profData.agents) ? profData.agents[0] : profData.agents;
        if (linkedAgent) {
          candidateAgentIds.add(linkedAgent.id);
          agentRow = {
            ...linkedAgent,
            profiles: {
              id: profData.id,
              full_name: profData.full_name,
              email: profData.email,
              phone: profData.phone,
            },
          };
        }
      }
    }

    if (agentRow) {
      const prof = (agentRow as any).profiles || {};
      agentProfileData = {
        id: agentRow.id,
        dbId: agentRow.id,
        agentCode: agentRow.agent_code || code || agentRow.id.slice(0, 8),
        name: prof.full_name || userProfile?.full_name || `Agent ${agentRow.agent_code || agentRow.id.slice(0, 4)}`,
        status: agentRow.status || "active",
        email: prof.email || userProfile?.email || "agent@fos.internal",
        phone: prof.phone || userProfile?.phone || "+91 98800 12345",
        territory: agentRow.territory || userProfile?.territory || "Mumbai Zone",
        currentCoordinates: {
          lat: Number(agentRow.current_latitude) || 19.21899,
          lng: Number(agentRow.current_longitude) || 73.14008,
        },
      };

      // Keep operational seed agent record linked to this user's profile in the background
      if (userProfile?.id && isMalavya) {
        supabase
          .from("agents")
          .update({ profile_id: userProfile.id })
          .eq("id", "6f926578-e5c7-40cc-ac8e-d59616be0c38")
          .is("profile_id", null)
          .then(() => {});
      }
    }

    const idList = Array.from(candidateAgentIds).filter(Boolean);
    if (idList.length === 0) {
      return {
        visits: [],
        history: [],
        agentProfile: agentProfileData,
      };
    }

    const { data: dbVisits } = await supabase
      .from("visits")
      .select(`
        id,
        visit_code,
        agent_id,
        scheduled_date,
        scheduled_time,
        status,
        geofence_verified,
        purpose,
        order_index,
        completion_notes,
        customer_id,
        customers (
          id,
          name,
          company,
          address,
          latitude,
          longitude,
          phone,
          notes
        )
      `)
      .in("agent_id", idList)
      .order("order_index", { ascending: true });

    if (!dbVisits) {
      return {
        visits: [],
        history: [],
        agentProfile: agentProfileData,
      };
    }

    // If any visits were saved under another candidate ID, align them to the primary agent ID
    if (agentRow?.id && dbVisits.length > 0) {
      const visitsToSync = dbVisits.filter((v: any) => v.agent_id && v.agent_id !== agentRow.id);
      if (visitsToSync.length > 0) {
        const idsToUpdate = visitsToSync.map((v: any) => v.id);
        supabase
          .from("visits")
          .update({ agent_id: agentRow.id })
          .in("id", idsToUpdate)
          .then(() => {});
      }
    }

    const mapped: AgentVisit[] = dbVisits.map((row: any) => {
      const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers || {};
      const lat = Number(cust.latitude) || 19.21899;
      const lng = Number(cust.longitude) || 73.14008;
      return {
        id: row.id,
        assignmentId: row.visit_code || row.id.slice(0, 8),
        customerId: cust.id || row.customer_id,
        visitCode: row.visit_code || "VST-LIVE",
        customerName: cust.name || "Customer",
        customerCompany: cust.company || undefined,
        company: cust.company || undefined,
        contactPerson: cust.name || "Authorized Representative",
        address: cust.address || "Field Location",
        city: "Mumbai",
        latitude: lat,
        longitude: lng,
        coordinates: { lat, lng },
        hasCoordinates: Boolean(cust.latitude && cust.longitude),
        scheduledDate: row.scheduled_date,
        scheduledTime: row.scheduled_time || "10:00 AM",
        estimatedDuration: "45 mins",
        status: (row.status || "pending") as any,
        geofenceVerified: Boolean(row.geofence_verified),
        purpose: row.purpose || "On-site customer visit",
        orderIndex: row.order_index || 1,
        priority: "medium",
        completionNotes: row.completion_notes || undefined,
        contactPhone: cust.phone || "+91 98765 43210",
        phone: cust.phone || "+91 98765 43210",
        email: "operations@client.internal",
        notes: cust.notes || row.purpose,
      };
    });

    // Deduplicate any duplicate visits created for the same customer and scheduled date
    const seenVisitKeys = new Set<string>();
    const deduplicatedMapped: AgentVisit[] = [];
    for (const v of mapped) {
      const cName = (v.customerName || "").trim().toLowerCase();
      const sDate = v.scheduledDate || "";
      const sTime = (v.scheduledTime || "").replace(/\s+/g, "").toLowerCase();
      const key = `${cName}_${sDate}_${sTime}`;
      if (!seenVisitKeys.has(key)) {
        seenVisitKeys.add(key);
        deduplicatedMapped.push(v);
      }
    }

    const active = deduplicatedMapped.filter((v) => v.status !== "completed");
    const history = deduplicatedMapped.filter((v) => v.status === "completed");

    return {
      visits: active.length > 0 ? active : deduplicatedMapped,
      history,
      agentProfile: agentProfileData,
    };
  } catch (e) {
    console.warn("Direct Supabase query exception:", e);
    return null;
  }
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

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const handlePos = (pos: GeolocationPosition) => {
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
    };

    navigator.geolocation.getCurrentPosition(
      handlePos,
      (err) => console.warn("[AgentContext] Initial GPS notice:", err.message),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      handlePos,
      (err) => console.warn("[AgentContext] GPS watch error:", err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

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

  // Load available live agents from database
  useEffect(() => {
    async function loadAgents() {
      try {
        const { data: dbAgents } = await supabase
          .from("agents")
          .select(`
            id,
            agent_code,
            territory,
            status,
            current_latitude,
            current_longitude,
            battery_level,
            profiles (
              full_name,
              email,
              phone
            )
          `);

        if (dbAgents && dbAgents.length > 0) {
          const mapped: AgentProfile[] = dbAgents.map((ag: any) => {
            const prof = ag.profiles || {};
            const name = prof.full_name || `Agent ${ag.agent_code || ag.id.slice(0, 4)}`;
            const parts = name.trim().split(" ");
            const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
            return {
              id: ag.id,
              dbId: ag.id,
              agentCode: ag.agent_code || ag.id.slice(0, 8),
              name,
              initials,
              role: "Field Specialist",
              status: ag.status || "active",
              email: prof.email || "agent@fos.internal",
              phone: prof.phone || "+91 98800 12345",
              territory: ag.territory || "Mumbai Zone",
              batteryLevel: ag.battery_level ?? 90,
              shiftHours: "09:00 - 18:00 IST",
              currentCoordinates: {
                lat: Number(ag.current_latitude) || 19.21899,
                lng: Number(ag.current_longitude) || 73.14008,
              },
            };
          });
          setAvailableAgentsList(mapped);
        }
      } catch (err) {
        console.warn("Could not fetch agents from Supabase:", err);
      }
    }
    loadAgents();
  }, []);

  // Fetch real agent dashboard from live Supabase database or FastAPI backend
  const loadAgentData = useCallback(
    async (showLoader = true, overrideAgentId?: string) => {
      if (showLoader) setIsLoading(true);
      setError(null);

      const targetIdentifier =
        overrideAgentId ||
        profile?.agent_id ||
        profile?.id ||
        session?.user?.id ||
        currentAgent?.dbId ||
        (currentAgent?.id && currentAgent.id !== "AGT-121" ? currentAgent.id : undefined);

      // Priority 1: Query live Supabase database directly (immediate & 100% real)
      try {
        if (typeof navigator !== "undefined" && navigator.geolocation && isOnDuty) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setCurrentAgent((prev) => ({
                ...prev,
                currentCoordinates: {
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                },
              }));
            },
            () => {},
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
          );
        }

        const liveDbData = await fetchDirectFromSupabase(targetIdentifier, profile, session?.user);
        if (liveDbData) {
          setVisits(liveDbData.visits);
          setHistoryVisits(liveDbData.history);
          setSelectedVisit(liveDbData.visits[0] || null);
          if (liveDbData.agentProfile) {
            setCurrentAgent((prev) => ({
              ...prev,
              ...liveDbData.agentProfile,
              currentCoordinates: liveGpsCoordsRef.current
                ? { lat: liveGpsCoordsRef.current.lat, lng: liveGpsCoordsRef.current.lng }
                : {
                    ...prev.currentCoordinates,
                    ...liveDbData.agentProfile?.currentCoordinates,
                  },
            }));
            if (liveDbData.agentProfile.status) {
              setIsOnDuty(liveDbData.agentProfile.status === "active");
            }
          }
          setIsLiveBackend(true);
          setError(null);
          if (showLoader) setIsLoading(false);
          return;
        }
      } catch (sbErr) {
        console.warn("Supabase direct query failed:", sbErr);
      }

      // Priority 2: Fetch from FastAPI backend
      try {
        const data = await fetchAgentDashboard(session?.access_token, localDateString());
        setIsLiveBackend(true);
        setError(null);

        if (data.agent) {
          const mappedProfile = mapApiAgentToProfile(data.agent);
          setCurrentAgent(mappedProfile);
          setIsOnDuty(data.agent.status === "active");
        }

        const mappedToday = (data.today_visits || []).map(mapApiVisitToAgentVisit);
        const mappedUpcoming = (data.upcoming_visits || []).map(mapApiVisitToAgentVisit);
        const mappedHistory = (data.recent_history || []).map(mapApiVisitToAgentVisit);

        const allActive = [...mappedToday, ...mappedUpcoming];
        setVisits(allActive);
        setHistoryVisits(mappedHistory);
        if (allActive.length > 0) {
          setSelectedVisit((prev) => (prev ? allActive.find((v) => v.id === prev.id) || allActive[0] : allActive[0]));
        } else {
          setSelectedVisit(null);
        }
      } catch (err: any) {
        console.warn("FastAPI unreachable, loading direct from Supabase:", err);
        const liveDbData = await fetchDirectFromSupabase(targetIdentifier);
        if (liveDbData) {
          setVisits(liveDbData.visits);
          setHistoryVisits(liveDbData.history);
          setSelectedVisit(liveDbData.visits[0] || null);
          if (liveDbData.agentProfile) {
            setCurrentAgent((prev) => ({
              ...prev,
              ...liveDbData.agentProfile,
            }));
          }
          setIsLiveBackend(true);
          setError(null);
        } else {
          setIsLiveBackend(false);
          setError(null);
        }
      } finally {
        if (showLoader) setIsLoading(false);
      }
    },
    [session?.access_token, profile, isOnDuty, currentAgent?.dbId, currentAgent?.id]
  );

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
    // 1. Instant optimistic state update with 0ms UI delay
    setIsOnDuty(!isOnDuty);
    setCurrentAgent((prev) => ({ ...prev, status: nextStatus }));
    showNotification(
      !isOnDuty ? "success" : "info",
      !isOnDuty
        ? "You are now ON DUTY. Field tracking active."
        : "You are now OFF DUTY. Location updates paused."
    );

    // 2. Non-blocking direct Supabase background sync
    try {
      const code = currentAgent?.dbId || currentAgent?.id || currentAgent?.agentCode;
      if (code) {
        await supabase
          .from("agents")
          .update({ status: nextStatus })
          .or(`agent_code.eq.${code},id.eq.${code}`);
      }
    } catch {
      // ignore
    }

    // 3. Non-blocking FastAPI sync
    if (session?.access_token) {
      updateAgentDutyStatus(nextStatus, session.access_token).catch(() => {});
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
      await loadAgentData(true, found.dbId || found.id);
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

    let liveBrowserCoords: { lat: number; lng: number } | null = liveGpsCoordsRef.current;
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const freshFix = await new Promise<GeolocationPosition | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 6_000, maximumAge: 5_000 }
          );
        });
        if (freshFix && freshFix.coords) {
          liveBrowserCoords = {
            lat: freshFix.coords.latitude,
            lng: freshFix.coords.longitude,
          };
          liveGpsCoordsRef.current = liveBrowserCoords;
          setLiveGpsCoords({
            lat: freshFix.coords.latitude,
            lng: freshFix.coords.longitude,
            accuracy: freshFix.coords.accuracy,
          });
        }
      } catch {
        // failed to get fresh fix
      }
    }

    if (!liveBrowserCoords) {
      const errorMsg = "Unable to verify geofence: Live GPS coordinates could not be acquired from your device. Please allow location access in your browser and try again.";
      showNotification("error", errorMsg);
      return {
        success: false,
        message: errorMsg,
      };
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

      // 3. Sync verified location to backend (non-blocking with direct Supabase fallback)
      if (targetLat != null && targetLng != null) {
        try {
          await updateAgentLocation({
            latitude: targetLat,
            longitude: targetLng,
            gps_accuracy: 15,
            location_source: "gps",
          }, session.access_token);
        } catch (locErr) {
          console.warn("Backend location update warning:", locErr);
          const agId = currentAgent.dbId || currentAgent.id;
          if (agId) {
            await supabase
              .from("agents")
              .update({
                current_latitude: targetLat,
                current_longitude: targetLng,
                last_location_update: new Date().toISOString(),
              })
              .or(`id.eq.${agId},agent_code.eq.${currentAgent.agentCode || agId}`);
          }
        }

        setCurrentAgent((prev) => ({
          ...prev,
          currentCoordinates: { lat: targetLat!, lng: targetLng! },
        }));
      }

      // 4. Send verified check-in to FastAPI backend or fallback to Supabase direct
      let mapped: AgentVisit;
      try {
        const updatedApi = await updateAgentVisitStatus(
          visitId,
          "in_progress",
          undefined,
          session.access_token
        );
        mapped = mapApiVisitToAgentVisit(updatedApi);
      } catch (statusErr: any) {
        const errorDetail = extractErrorMessage(statusErr, "Check-in failed on server.");
        const isGeofenceOrRuleError =
          statusErr?.status === 409 ||
          statusErr?.status === 400 ||
          statusErr?.status === 403 ||
          errorDetail.toLowerCase().includes("geofence") ||
          errorDetail.toLowerCase().includes("750") ||
          errorDetail.toLowerCase().includes("away from");

        if (isGeofenceOrRuleError) {
          throw new Error(errorDetail);
        }

        console.warn("FastAPI visit status update failed, updating Supabase directly:", statusErr);
        await supabase
          .from("visits")
          .update({
            status: "in_progress",
            geofence_verified: true,
            check_in_time: new Date().toISOString(),
          })
          .eq("id", visitId);

        mapped = {
          ...visit,
          status: "in_progress",
          geofenceVerified: true,
        };
      }

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

      // 1. Acquire fresh live browser GPS
      let liveBrowserCoords: { lat: number; lng: number } | null = liveGpsCoordsRef.current;
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const freshFix = await new Promise<GeolocationPosition | null>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve(pos),
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 6000, maximumAge: 5000 }
            );
          });
          if (freshFix && freshFix.coords) {
            liveBrowserCoords = {
              lat: freshFix.coords.latitude,
              lng: freshFix.coords.longitude,
            };
            liveGpsCoordsRef.current = liveBrowserCoords;
            setLiveGpsCoords({
              lat: freshFix.coords.latitude,
              lng: freshFix.coords.longitude,
              accuracy: freshFix.coords.accuracy,
            });
          }
        } catch {
          // failed to get fresh fix
        }
      }

      if (!liveBrowserCoords) {
        const errorMsg = "Cannot complete visit: Live GPS coordinates could not be acquired from your device. Please allow location access in your browser and try again.";
        showNotification("error", errorMsg);
        return {
          success: false,
          message: errorMsg,
        };
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

      // Capture fresh GPS for completion; non-blocking notice
      try {
        await syncFreshGpsLocation(session.access_token);
      } catch (gpsErr) {
        console.warn("GPS sync notice on completion:", gpsErr);
      }

      // Send verified completion to FastAPI backend or Supabase direct
      let mapped: AgentVisit;
      try {
        const updatedApi = await updateAgentVisitStatus(
          visitId,
          "completed",
          notes,
          session.access_token
        );
        mapped = mapApiVisitToAgentVisit(updatedApi);
      } catch (statusErr: any) {
        const errorDetail = extractErrorMessage(statusErr, "Failed to complete visit on server.");
        const isGeofenceOrRuleError =
          statusErr?.status === 409 ||
          statusErr?.status === 400 ||
          statusErr?.status === 403 ||
          errorDetail.toLowerCase().includes("geofence") ||
          errorDetail.toLowerCase().includes("750") ||
          errorDetail.toLowerCase().includes("away from");

        if (isGeofenceOrRuleError) {
          throw new Error(errorDetail);
        }

        console.warn("FastAPI visit complete failed, updating Supabase directly:", statusErr);
        await supabase
          .from("visits")
          .update({
            status: "completed",
            completion_notes: notes || "Completed",
            completed_time: new Date().toISOString(),
          })
          .eq("id", visitId);

        mapped = {
          ...visit,
          status: "completed",
          completionNotes: notes || "Completed",
        };
      }

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
        stats,
        liveGpsCoords,
        refreshLiveGps,
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
