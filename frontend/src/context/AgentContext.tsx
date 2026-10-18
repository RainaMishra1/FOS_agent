"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { AgentProfile, AgentVisit } from "@/types/agent";
import {
  initialAgentProfile,
  initialAgentVisits,
  mockHistoricalVisits,
  availableAgents,
} from "@/lib/agentMockData";

interface AgentContextType {
  currentAgent: AgentProfile;
  availableAgents: AgentProfile[];
  switchAgent: (agentId: string) => void;
  isOnDuty: boolean;
  toggleDuty: () => void;
  setIsOnDuty: (onDuty: boolean) => void;
  visits: AgentVisit[];
  historyVisits: AgentVisit[];
  selectedVisit: AgentVisit | null;
  setSelectedVisit: (visit: AgentVisit | null) => void;
  checkInVisit: (visitId: string) => { success: boolean; message: string };
  completeVisit: (visitId: string, notes?: string) => { success: boolean; message: string };
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
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [currentAgent, setCurrentAgent] = useState<AgentProfile>(initialAgentProfile);
  const [isOnDuty, setIsOnDuty] = useState<boolean>(true);
  const [visits, setVisits] = useState<AgentVisit[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fos_agent_visits");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return initialAgentVisits;
  });
  const [historyVisits, setHistoryVisits] = useState<AgentVisit[]>(mockHistoricalVisits);
  const [selectedVisit, setSelectedVisit] = useState<AgentVisit | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Cross-dashboard event listener for newly dispatched assignments from Admin
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handleNewVisit = (e: Event) => {
      const customEvent = e as CustomEvent<AgentVisit>;
      if (customEvent.detail) {
        setVisits((prev) => {
          if (prev.some((v) => v.id === customEvent.detail.id)) return prev;
          const next = [...prev, customEvent.detail];
          localStorage.setItem("fos_agent_visits", JSON.stringify(next));
          return next;
        });
        showNotification(
          "info",
          `New Field Assignment Dispatched: ${customEvent.detail.customerName} (${customEvent.detail.scheduledTime})`
        );
      }
    };

    const handleRouteUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ agentId: string; visits: AgentVisit[] }>;
      if (customEvent.detail && customEvent.detail.visits) {
        setVisits(customEvent.detail.visits);
        showNotification(
          "success",
          `Route sequence updated by Dispatch Admin (${customEvent.detail.visits.length} stops)`
        );
      }
    };

    const handleReset = () => {
      setVisits(initialAgentVisits);
    };

    window.addEventListener("fos_new_visit_assigned", handleNewVisit);
    window.addEventListener("fos_route_updated", handleRouteUpdated);
    window.addEventListener("fos_operations_reset", handleReset);
    return () => {
      window.removeEventListener("fos_new_visit_assigned", handleNewVisit);
      window.removeEventListener("fos_route_updated", handleRouteUpdated);
      window.removeEventListener("fos_operations_reset", handleReset);
    };
  }, []);

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  };

  const clearNotification = () => setNotification(null);

  const toggleDuty = () => {
    setIsOnDuty((prev) => {
      const next = !prev;
      showNotification(
        next ? "success" : "info",
        next
          ? "You are now ON DUTY. Live field tracking active."
          : "You are now OFF DUTY. Location updates paused."
      );
      return next;
    });
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

  const checkInVisit = (visitId: string) => {
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) {
      return { success: false, message: "Visit not found." };
    }

    if (!isOnDuty) {
      showNotification("error", "Cannot check in while Off Duty. Please toggle to On Duty first.");
      return { success: false, message: "Cannot check in while Off Duty." };
    }

    if (visit.mockDistanceMeters > 100) {
      showNotification(
        "error",
        `Outside 100m geofence radius (${visit.mockDistanceMeters}m away). Move closer to enable check-in.`
      );
      return {
        success: false,
        message: `Outside 100m geofence radius (${visit.mockDistanceMeters}m away).`,
      };
    }

    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const updatedVisit: AgentVisit = {
      ...visit,
      status: "in_progress",
      geofenceVerified: true,
      accuracyMeters: Math.floor(Math.random() * 12) + 8, // Realistic 8-20m accuracy
      checkInTime: timeString,
    };

    setVisits((prev) => prev.map((v) => (v.id === visitId ? updatedVisit : v)));
    if (selectedVisit?.id === visitId) {
      setSelectedVisit(updatedVisit);
    }

    showNotification(
      "success",
      `Geofence Check-in Verified at ${visit.customerName}! (${updatedVisit.mockDistanceMeters}m distance, ±${updatedVisit.accuracyMeters}m accuracy)`
    );

    return {
      success: true,
      message: `Checked in successfully at ${timeString}.`,
    };
  };

  const completeVisit = (visitId: string, notes?: string) => {
    const visit = visits.find((v) => v.id === visitId);
    if (!visit) {
      return { success: false, message: "Visit not found." };
    }

    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const completedVisit: AgentVisit = {
      ...visit,
      status: "completed",
      completedTime: timeString,
      completionNotes:
        notes ||
        visit.completionNotes ||
        `Visit completed on schedule by ${currentAgent.name}. Geofence verified.`,
    };

    setVisits((prev) => prev.map((v) => (v.id === visitId ? completedVisit : v)));
    setHistoryVisits((prev) => [completedVisit, ...prev]);

    if (selectedVisit?.id === visitId) {
      setSelectedVisit(completedVisit);
    }

    showNotification(
      "success",
      `Visit at ${visit.customerName} marked as completed! Great job.`
    );

    return {
      success: true,
      message: `Visit completed at ${timeString}.`,
    };
  };

  const resetDemoData = () => {
    setVisits(initialAgentVisits);
    setHistoryVisits(mockHistoricalVisits);
    setSelectedVisit(null);
    setIsOnDuty(true);
    showNotification("info", "Demo state reset to original values.");
  };

  // Computed statistics
  const stats = useMemo(() => {
    const todayVisits = visits.filter(
      (v) => v.scheduledDate === "2026-10-18" || v.status === "completed" || v.status === "in_progress"
    );
    const todayTotal = todayVisits.length;
    const todayCompleted = todayVisits.filter((v) => v.status === "completed").length;
    const todayRemaining = todayTotal - todayCompleted;
    const completionPercentage = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

    // Find next visit (in_progress first, then first pending)
    const inProgress = todayVisits.find((v) => v.status === "in_progress");
    const pending = todayVisits.find((v) => v.status === "pending");
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
