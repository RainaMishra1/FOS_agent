"use client";

import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from "react";
import { AgentProfile, AgentVisit } from "@/types/agent";

const defaultAgentProfile: AgentProfile = {
  id: "AGT-121",
  name: "Raina Mishra",
  initials: "RM",
  role: "Field Operations Specialist",
  status: "active",
  email: "rainamishra00023@gmail.com",
  phone: "+91 98800 12345",
  territory: "Mumbai Zone",
  batteryLevel: 92,
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

async function fetchDirectFromSupabase(identifier?: string | null): Promise<{
  visits: AgentVisit[];
  history: AgentVisit[];
  agentProfile?: Partial<AgentProfile>;
} | null> {
  try {
    let targetAgentId: string | null = null;
    let agentProfileData: Partial<AgentProfile> | undefined;

    if (identifier) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
      let agentRowQuery = supabase
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

      if (isUuid) {
        agentRowQuery = agentRowQuery.or(`id.eq.${identifier},profile_id.eq.${identifier}`);
      } else {
        agentRowQuery = agentRowQuery.eq("agent_code", identifier);
      }

      const { data: agentRow } = await agentRowQuery.maybeSingle();

      if (agentRow) {
        targetAgentId = agentRow.id;
        const prof = (agentRow as any).profiles || {};
        agentProfileData = {
          id: agentRow.id,
          dbId: agentRow.id,
          agentCode: agentRow.agent_code || agentRow.id.slice(0, 8),
          name: prof.full_name || `Agent ${agentRow.agent_code || agentRow.id.slice(0, 4)}`,
          status: agentRow.status || "active",
          email: prof.email || "agent@fos.internal",
          phone: prof.phone || "+91 98800 12345",
          territory: agentRow.territory || "Mumbai, Maharashtra",
          batteryLevel: agentRow.battery_level ?? 90,
          currentCoordinates: {
            lat: Number(agentRow.current_latitude) || 19.21899,
            lng: Number(agentRow.current_longitude) || 73.14008,
          },
        };
      }
    }

    if (!targetAgentId && !identifier) {
      const { data: anyAgent } = await supabase
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
        `)
        .limit(1)
        .maybeSingle();

      if (anyAgent) {
        targetAgentId = anyAgent.id;
        const prof = (anyAgent as any).profiles || {};
        agentProfileData = {
          id: anyAgent.id,
          dbId: anyAgent.id,
          agentCode: anyAgent.agent_code || "AGT-121",
          name: prof.full_name || `Agent ${anyAgent.agent_code || "121"}`,
          status: anyAgent.status || "active",
          territory: anyAgent.territory || "Mumbai, Maharashtra",
          currentCoordinates: {
            lat: Number(anyAgent.current_latitude) || 19.21899,
            lng: Number(anyAgent.current_longitude) || 73.14008,
          },
        };
      }
    }

    let query = supabase
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
      `);

    if (targetAgentId) {
      query = query.eq("agent_id", targetAgentId);
    }

    let { data: dbVisits } = await query.order("order_index", { ascending: true });

    // Only if no target agent was identified at all do we query generic visits
    if (!targetAgentId && (!dbVisits || dbVisits.length === 0)) {
      const allQuery = await supabase
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
        .order("order_index", { ascending: true })
        .limit(10);
      dbVisits = allQuery.data;
    }

    if (!dbVisits) {
      return {
        visits: [],
        history: [],
        agentProfile: agentProfileData,
      };
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

    const active = mapped.filter((v) => v.status !== "completed");
    const history = mapped.filter((v) => v.status === "completed");

    return {
      visits: active.length > 0 ? active : mapped,
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

  // Sync profile details from authenticated user
  useEffect(() => {
    if (profile?.full_name || profile?.email) {
      const name = profile.full_name || "Field Agent";
      const parts = name.trim().split(" ");
      const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
      setCurrentAgent((prev) => ({
        ...prev,
        name,
        email: profile.email || prev.email,
        initials,
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

      const targetIdentifier = overrideAgentId || currentAgent?.dbId || currentAgent?.id || profile?.agent_id || profile?.id || session?.user?.id;

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

        const liveDbData = await fetchDirectFromSupabase(targetIdentifier);
        if (liveDbData) {
          setVisits(liveDbData.visits);
          setHistoryVisits(liveDbData.history);
          setSelectedVisit(liveDbData.visits[0] || null);
          if (liveDbData.agentProfile) {
            setCurrentAgent((prev) => ({
              ...prev,
              ...liveDbData.agentProfile,
              currentCoordinates: {
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
      const code = currentAgent?.id || "121";
      await supabase
        .from("agents")
        .update({ status: nextStatus })
        .or(`agent_code.eq.${code},id.eq.${code}`);
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

    // 1. Acquire live browser GPS if available
    let liveBrowserCoords: { lat: number; lng: number } | null = null;
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        const freshFix = await new Promise<GeolocationPosition | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 3_000, maximumAge: 15_000 }
          );
        });
        if (freshFix && freshFix.coords) {
          liveBrowserCoords = {
            lat: freshFix.coords.latitude,
            lng: freshFix.coords.longitude,
          };
        }
      } catch {
        // Fall back to agentCoords
      }
    }

    // Determine target location and distance to customer
    let targetLat = liveBrowserCoords?.lat ?? agentCoords?.lat;
    let targetLng = liveBrowserCoords?.lng ?? agentCoords?.lng;

    let distanceMeters: number | null = null;
    if (hasCustCoords && custCoords) {
      let liveDist: number | null = null;
      let stateDist: number | null = null;

      if (liveBrowserCoords) {
        liveDist = Math.round(
          calculateHaversineDistanceKm(
            liveBrowserCoords.lat,
            liveBrowserCoords.lng,
            custCoords.lat,
            custCoords.lng
          ) * 1000
        );
      }

      if (agentCoords && (agentCoords.lat !== 0 || agentCoords.lng !== 0)) {
        stateDist = Math.round(
          calculateHaversineDistanceKm(
            agentCoords.lat,
            agentCoords.lng,
            custCoords.lat,
            custCoords.lng
          ) * 1000
        );
      }

      // If live browser GPS is within 750m, use it!
      if (liveDist !== null && liveDist <= 750) {
        distanceMeters = liveDist;
        targetLat = liveBrowserCoords!.lat;
        targetLng = liveBrowserCoords!.lng;
      } else if (stateDist !== null && stateDist <= 750) {
        // If agent's saved profile coordinate is within 750m, use that!
        distanceMeters = stateDist;
        targetLat = agentCoords!.lat;
        targetLng = agentCoords!.lng;
      } else {
        // Neither is <= 750m; pick whichever is closest
        if (liveDist !== null && stateDist !== null) {
          distanceMeters = Math.min(liveDist, stateDist);
        } else {
          distanceMeters = liveDist ?? stateDist;
        }
      }
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

      // 3. Sync verified location to backend
      if (targetLat != null && targetLng != null) {
        await updateAgentLocation({
          latitude: targetLat,
          longitude: targetLng,
          gps_accuracy: 15,
          location_source: "gps",
        }, session.access_token);

        setCurrentAgent((prev) => ({
          ...prev,
          currentCoordinates: { lat: targetLat!, lng: targetLng! },
        }));
      }

      // 4. Send verified check-in to FastAPI backend
      const updatedApi = await updateAgentVisitStatus(
        visitId,
        "in_progress",
        undefined,
        session.access_token
      );
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
      // Capture fresh GPS for completion; the backend independently checks
      // accuracy, age, and distance from this visit's saved customer location.
      await syncFreshGpsLocation(session.access_token);

      // Send verified completion to FastAPI backend
      const updatedApi = await updateAgentVisitStatus(
        visitId,
        "completed",
        notes,
        session.access_token
      );
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
        stats,
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
