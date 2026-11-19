"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Customer, Agent, Assignment, TaskStatus } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { fetchAgents, fetchCustomers, fetchDashboardSummary } from "@/lib/api";

interface AssignLeadParams {
  customerId: string;
  agentId: string;
  scheduledTime?: string;
  scheduledDate?: string;
  notes?: string;
}

interface OperationsContextType {
  customers: Customer[];
  agents: Agent[];
  assignments: Assignment[];
  maxWorkloadLimit: number;
  setMaxWorkloadLimit: (limit: number) => void;
  selectedLeadId: string | null;
  setSelectedLeadId: (id: string | null) => void;
  assignLeadToAgent: (params: AssignLeadParams) => { success: boolean; message: string };
  unassignLead: (customerId: string) => { success: boolean; message: string };
  resetOperationsData: () => void;
  notification: { type: "success" | "error" | "info"; message: string } | null;
  clearNotification: () => void;
}

const OperationsContext = createContext<OperationsContextType | undefined>(undefined);

function dateToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function OperationsProvider({ children }: { children: React.ReactNode }) {
  const { session, isAuthenticated, role } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [maxWorkloadLimit, setMaxWorkloadLimit] = useState(6);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [notification, setNotification] = useState<OperationsContextType["notification"]>(null);

  const loadLiveOperationsData = useCallback(async () => {
    if (!isAuthenticated || role !== "admin" || !session?.access_token) {
      setCustomers([]);
      setAgents([]);
      setAssignments([]);
      return;
    }

    const [customerResult, agentResult, dashboardResult] = await Promise.allSettled([
      fetchCustomers(session.access_token, { limit: 100 }),
      fetchAgents(session.access_token, { limit: 100, as_of_date: dateToday() }),
      fetchDashboardSummary(session.access_token, dateToday()),
    ]);

    setCustomers(customerResult.status === "fulfilled" ? customerResult.value.items.map<Customer>((item) => ({
      id: item.id,
      name: item.name,
      leadId: item.customer_code || item.id,
      company: item.company || undefined,
      email: item.email || "",
      phone: item.phone || "",
      address: item.address || "",
      city: item.city || "",
      priority: "medium",
      assignmentStatus: "pending",
      coordinates: { lat: item.latitude ?? 0, lng: item.longitude ?? 0 },
      createdDate: item.created_at || "",
      notes: item.notes || "",
    })) : []);

    setAgents(agentResult.status === "fulfilled" ? agentResult.value.items.map<Agent>((item) => ({
      id: item.id,
      name: item.name,
      agentCode: item.agent_code || undefined,
      initials: item.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      email: item.email || "",
      phone: item.phone || "",
      status: item.status as Agent["status"],
      currentTask: undefined,
      assignedTasks: item.assigned_tasks,
      completedVisits: item.completed_visits,
      lastLocationUpdate: item.last_location_update || "",
      territory: item.territory || "",
      address: item.address || "",
      locationSource: (item.location_source || "unknown") as Agent["locationSource"],
      coordinates: item.current_latitude == null || item.current_longitude == null
        ? null
        : { lat: item.current_latitude, lng: item.current_longitude },
      batteryLevel: item.battery_level ?? undefined,
    })) : []);

    setAssignments(dashboardResult.status === "fulfilled" ? dashboardResult.value.recent_assignments.map<Assignment>((item) => ({
      id: item.assignment_code || item.id,
      customerName: item.customer_name,
      customerId: item.id,
      agentName: item.agent_name,
      agentId: "",
      scheduledTime: item.scheduled_time,
      scheduledDate: item.scheduled_date,
      priority: (item.priority || "medium") as Assignment["priority"],
      status: (item.status || "assigned") as TaskStatus,
      address: item.address || "",
      estimatedDurationMinutes: 45,
    })) : []);
  }, [isAuthenticated, role, session?.access_token]);

  useEffect(() => { void loadLiveOperationsData(); }, [loadLiveOperationsData]);

  const assignLeadToAgent = (_params: AssignLeadParams) => {
    const message = "Use the dispatch form to create a visit. Assignment changes are only confirmed after the backend saves them.";
    setNotification({ type: "error", message });
    return { success: false, message };
  };

  const unassignLead = (_customerId: string) => {
    const message = "Unassigning visits is not available in the backend yet.";
    setNotification({ type: "error", message });
    return { success: false, message };
  };

  const resetOperationsData = () => {
    void loadLiveOperationsData();
    setMaxWorkloadLimit(6);
    setNotification({ type: "info", message: "Operational data refreshed from the backend." });
  };

  const clearNotification = () => setNotification(null);

  return (
    <OperationsContext.Provider value={{
      customers, agents, assignments, maxWorkloadLimit, setMaxWorkloadLimit,
      selectedLeadId, setSelectedLeadId, assignLeadToAgent, unassignLead,
      resetOperationsData, notification, clearNotification,
    }}>
      {children}
    </OperationsContext.Provider>
  );
}

export function useOperations() {
  const context = useContext(OperationsContext);
  if (!context) throw new Error("useOperations must be used within an OperationsProvider");
  return context;
}
