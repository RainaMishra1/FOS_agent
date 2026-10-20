"use client";

import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from "react";
import { AgentProfile, AgentVisit } from "@/types/agent";
import {
  initialAgentProfile,
  availableAgents,
} from "@/lib/agentMockData";
import { useAuth } from "@/context/AuthContext";
import {
  fetchAgentDashboard,
  updateAgentVisitStatus,
  updateAgentDutyStatus,
  VisitApiResponse,
  AgentApiItem,
  ApiError,
} from "@/lib/api";

interface AgentContextType {
  currentAgent: AgentProfile;
  availableAgents: AgentProfile[];
  switchAgent: (agentId: string) => void;
  isOnDuty: boolean;
  toggleDuty: () => Promise<void>;
  setIsOnDuty: (onDuty: boolean) => void;
  visits: AgentVisit[];
  historyVisits: AgentVisit[];
  selectedVisit: AgentVisit | null;
  setSelectedVisit: (visit: AgentVisit | null) => void;
  checkInVisit: (visitId: string) => Promise<{ success: boolean; message: string }>;
  completeVisit: (visitId: string, notes?: string) => Promise<{ success: boolean; message: string }>;
  updateMockDistance: (visitId: string, distanceMeters: number) => void;
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
    priority: "medium",
    status: (v.status as any) || "pending",
    geofenceVerified: v.geofence_verified,
    accuracyMeters: v.geofence_verified ? 12 : 0,
    mockDistanceMeters: 45, // default simulation baseline for testing
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

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const { session, isAuthenticated, role } = useAuth();

  const [currentAgent, setCurrentAgent] = useState<AgentProfile>(initialAgentProfile);
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

  // Fetch real agent dashboard from FastAPI backend
  const loadAgentData = useCallback(
    async (showLoader = true) => {
      if (showLoader) setIsLoading(true);
      setError(null);

      try {
        const data = await fetchAgentDashboard(session?.access_token);
        setIsLiveBackend(true);

        if (data.agent) {
          const profile = mapApiAgentToProfile(data.agent);
          setCurrentAgent(profile);
          setIsOnDuty(data.agent.status === "active");
        }

        const mappedToday = (data.today_visits || []).map(mapApiVisitToAgentVisit);
        const mappedUpcoming = (data.upcoming_visits || []).map(mapApiVisitToAgentVisit);
        const mappedHistory = (data.recent_history || []).map(mapApiVisitToAgentVisit);

        // Combine today and upcoming into active visits collection
        const allActive = [...mappedToday, ...mappedUpcoming];
        setVisits(allActive);
        setHistoryVisits(mappedHistory);

        // Select the next active visit by default if none selected
        if (allActive.length > 0) {
          setSelectedVisit((prev) => (prev ? allActive.find((v) => v.id === prev.id) || allActive[0] : allActive[0]));
        } else {
          setSelectedVisit(null);
        }
      } catch (err: any) {
        console.error("Agent dashboard fetch failed:", err);
        setIsLiveBackend(false);
        const errorMsg = extractErrorMessage(
          err,
          "Failed to connect to backend service. Please check your connection."
        );
        setError(errorMsg);

        // Never substitute sample visits when the operational backend is unavailable.
        setVisits([]);
        setHistoryVisits([]);
        setSelectedVisit(null);
      } finally {
        if (showLoader) setIsLoading(false);
      }
    },
    [session?.access_token]
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
    try {
      await updateAgentDutyStatus(nextStatus, session?.access_token);
      setIsOnDuty(!isOnDuty);
      setCurrentAgent((prev) => ({ ...prev, status: nextStatus }));
      showNotification(
        !isOnDuty ? "success" : "info",
        !isOnDuty
          ? "You are now ON DUTY. Field tracking active."
          : "You are now OFF DUTY. Location updates paused."
      );
    } catch (err: any) {
      const msg = extractErrorMessage(err, "Failed to update duty status on server.");
      showNotification("error", msg);
    }
  };

  const switchAgent = (agentId: string) => {
    const found = availableAgents.find((a) => a.id === agentId);
    if (found) {
      setCurrentAgent(found);
      showNotification("info", `Switched agent profile to ${found.name}`);
    }
  };

  const updateMockDistance = (visitId: string, distanceMeters: number) => {
    setVisits((prev) =>
      prev.map((v) => {
        if (v.id === visitId) {
          return { ...v, mockDistanceMeters: distanceMeters };
        }
        return v;
      })
    );
    if (selectedVisit?.id === visitId) {
      setSelectedVisit((prev) => (prev ? { ...prev, mockDistanceMeters: distanceMeters } : null));
    }
  };

  const checkInVisit = async (visitId: string): Promise<{ success: boolean; message: string }> => {
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) {
      return { success: false, message: "Visit record not found." };
    }

    if (!isOnDuty) {
      showNotification("error", "Cannot check in while Off Duty. Please toggle to On Duty first.");
      return { success: false, message: "Cannot check in while Off Duty." };
    }

    try {
      // Send verified check-in to FastAPI backend
      const updatedApi = await updateAgentVisitStatus(
        visitId,
        "in_progress",
        undefined,
        true,
        session?.access_token
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
      // Send verified completion to FastAPI backend
      const updatedApi = await updateAgentVisitStatus(
        visitId,
        "completed",
        notes,
        true,
        session?.access_token
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

  // Computed statistics from live visits
  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const todayVisits = visits.filter(
      (v) => v.scheduledDate === today || v.status === "completed" || v.status === "in_progress"
    );

    const todayTotal = todayVisits.length;
    const todayCompleted = todayVisits.filter((v) => v.status === "completed").length;
    const todayRemaining = todayTotal - todayCompleted;
    const completionPercentage =
      todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

    const inProgress = todayVisits.find((v) => v.status === "in_progress");
    const pending = todayVisits.find((v) => v.status === "pending" || v.status === "delayed");
    const nextVisit = inProgress || pending || null;

    return {
      todayTotal,
      todayCompleted,
      todayRemaining,
      completionPercentage,
      nextVisit,
    };
  }, [visits]);

  return (
    <AgentContext.Provider
      value={{
        currentAgent,
        availableAgents,
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
        updateMockDistance,
        resetDemoData,
        notification,
        clearNotification,
        stats,
        isLoading,
        error,
        isLiveBackend,
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
