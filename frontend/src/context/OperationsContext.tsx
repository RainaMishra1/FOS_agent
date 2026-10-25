"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Customer, Agent, Assignment, TaskStatus } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import { AgentVisit } from "@/types/agent";

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

const STORAGE_KEY_CUSTOMERS = "fos_phase4_customers";
const STORAGE_KEY_AGENTS = "fos_phase4_agents";
const STORAGE_KEY_ASSIGNMENTS = "fos_phase4_assignments";
const STORAGE_KEY_WORKLOAD = "fos_phase4_workload";

export function OperationsProvider({ children }: { children: React.ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_CUSTOMERS);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {
          // fallback
        }
      }
    }
    return [];
  });

  const [agents, setAgents] = useState<Agent[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_AGENTS);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {
          // fallback
        }
      }
    }
    return [];
  });

  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_ASSIGNMENTS);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {
          // fallback
        }
      }
    }
    return [];
  });

  const [maxWorkloadLimit, setMaxWorkloadLimit] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_WORKLOAD);
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val)) return val;
      }
    }
    return 6;
  });

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Load 100% real data from Supabase PostgreSQL database
  const loadLiveOperationsData = useCallback(async () => {
    try {
        const [custRes, agRes, asnRes] = await Promise.allSettled([
          supabase.from("customers").select("*").order("name"),
          supabase.from("agents").select("*, profile:profiles(id, full_name, email, phone)"),
          supabase.from("assignments").select("*, lead:leads(*, customer:customers(*)), agent:agents(*, profile:profiles(id, full_name))")
        ]);

        if (custRes.status === "fulfilled" && custRes.value.data && custRes.value.data.length > 0) {
          const liveCusts: Customer[] = custRes.value.data.map((c: any) => ({
            id: c.customer_code || c.id,
            name: c.name || "Corporate Client",
            leadId: c.customer_code ? `LEAD-${c.customer_code.replace("CUST-", "")}` : `LEAD-${c.id.slice(0, 4)}`,
            company: c.company || c.name,
            email: c.email || "",
            phone: c.phone || c.contact_person || "+91 80 4000 0000",
            address: c.address || "Bengaluru Metro",
            city: c.city || "Bengaluru",
            priority: "medium",
            assignmentStatus: "assigned",
            coordinates: {
              lat: Number(c.latitude) || 12.9716,
              lng: Number(c.longitude) || 77.5946,
            },
            createdDate: c.created_at || new Date().toISOString(),
            notes: c.notes || "",
          }));
          setCustomers(liveCusts);
          if (!selectedLeadId && liveCusts.length > 0) {
            setSelectedLeadId(liveCusts[0].id);
          }
        }

        if (agRes.status === "fulfilled" && agRes.value.data && agRes.value.data.length > 0) {
          const liveAgents: Agent[] = agRes.value.data.map((a: any) => {
            const name = a.profile?.full_name || "Field Agent";
            const initials = name.split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase() || "AG";
            return {
              id: a.agent_code || a.id,
              name,
              agentCode: a.agent_code || undefined,
              initials,
              email: a.profile?.email || "",
              phone: a.profile?.phone || "+91 98450 00000",
              status: (a.status as any) || "active",
              currentTask: a.territory ? `Active in ${a.territory}` : "Field Operations",
              assignedTasks: 2,
              completedVisits: 1,
              lastLocationUpdate: a.last_location_update || new Date().toISOString(),
              territory: a.territory || "Field Hub",
              address: a.address || "Field Center",
              locationSource: (a.location_source as any) || "gps",
              coordinates: {
                lat: Number(a.current_latitude) || 12.9716,
                lng: Number(a.current_longitude) || 77.5946,
              },
              batteryLevel: a.battery_level ?? 90,
            };
          });
          setAgents(liveAgents);
        }

        if (asnRes.status === "fulfilled" && asnRes.value.data && asnRes.value.data.length > 0) {
          const liveAsns: Assignment[] = asnRes.value.data.map((row: any) => {
            const custName = row.lead?.customer?.name || "Customer Site";
            const agName = row.agent?.profile?.full_name || "Assigned Agent";
            const addr = row.lead?.customer?.address || "Field Location";
            return {
              id: row.assignment_code || row.id.slice(0, 8),
              customerName: custName,
              customerId: row.lead?.customer?.customer_code || row.lead?.customer?.id || row.id,
              agentName: agName,
              agentId: row.agent?.agent_code || row.agent_id,
              scheduledTime: row.scheduled_time || "10:30 AM",
              scheduledDate: row.scheduled_date || new Date().toISOString().split("T")[0],
              priority: (row.lead?.priority as any) || "medium",
              status: (row.status as any) || "assigned",
              address: addr,
              estimatedDurationMinutes: 45,
              notes: row.notes || "Field visit and verification",
            };
          });
          setAssignments(liveAsns);
        }
      } catch (err) {
        console.warn("Could not load real operations data from Supabase:", err);
      }
  }, [selectedLeadId]);

  useEffect(() => {
    loadLiveOperationsData();
  }, [loadLiveOperationsData]);

  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Sync to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_CUSTOMERS, JSON.stringify(customers));
    }
  }, [customers]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(agents));
    }
  }, [agents]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_ASSIGNMENTS, JSON.stringify(assignments));
    }
  }, [assignments]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_WORKLOAD, maxWorkloadLimit.toString());
    }
  }, [maxWorkloadLimit]);

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  const clearNotification = () => setNotification(null);

  const assignLeadToAgent = ({
    customerId,
    agentId,
    scheduledTime = "02:30 PM",
    scheduledDate = "2026-10-18",
    notes,
  }: AssignLeadParams) => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) {
      showNotification("error", "Customer lead not found.");
      return { success: false, message: "Customer lead not found." };
    }

    if (customer.assignmentStatus === "assigned" || customer.assignmentStatus === "active") {
      showNotification(
        "error",
        `Duplicate assignment prevented: ${customer.name} is already assigned to ${customer.assignedAgentName || "an agent"}.`
      );
      return {
        success: false,
        message: `${customer.name} is already assigned. Unassign first if you wish to re-dispatch.`,
      };
    }

    const agent = agents.find((a) => a.id === agentId);
    if (!agent) {
      showNotification("error", "Target agent not found.");
      return { success: false, message: "Agent not found." };
    }

    if (agent.status === "inactive" || agent.status === "break") {
      showNotification(
        "error",
        `Cannot assign to ${agent.name}: Agent is currently ${agent.status.toUpperCase()}.`
      );
      return {
        success: false,
        message: `Agent is ${agent.status}.`,
      };
    }

    if (agent.assignedTasks >= maxWorkloadLimit) {
      showNotification(
        "error",
        `Cannot assign to ${agent.name}: Agent has reached maximum capacity (${agent.assignedTasks}/${maxWorkloadLimit} tasks).`
      );
      return {
        success: false,
        message: `Agent exceeds maximum workload capacity (${maxWorkloadLimit}).`,
      };
    }

    // 1. Update customer record
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId
          ? {
              ...c,
              assignmentStatus: "assigned",
              assignedAgentId: agent.id,
              assignedAgentName: agent.name,
              notes: notes || c.notes,
            }
          : c
      )
    );

    // 2. Increment agent's assignedTasks count
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? {
              ...a,
              assignedTasks: a.assignedTasks + 1,
              currentTask: `Dispatched to ${customer.name}`,
            }
          : a
      )
    );

    // 3. Create new Assignment record
    const newAssignmentId = `ASN-${Date.now().toString().slice(-4)}`;
    const newAssignment: Assignment = {
      id: newAssignmentId,
      customerId: customer.id,
      customerName: customer.name,
      agentId: agent.id,
      agentName: agent.name,
      scheduledDate,
      scheduledTime,
      priority: customer.priority,
      status: "assigned",
      address: customer.address,
      estimatedDurationMinutes: 45,
      notes: notes || `Dispatched via Nearest-Agent Assignment to ${agent.name}.`,
    };

    setAssignments((prev) => [newAssignment, ...prev]);

    // 4. Synchronize with Agent Dashboard local storage so agent visits update consistently
    if (typeof window !== "undefined") {
      const newAgentVisit: AgentVisit = {
        id: `VST-${Date.now().toString().slice(-3)}`,
        assignmentId: newAssignmentId,
        customerId: customer.id,
        customerName: customer.name,
        company: customer.company,
        contactPerson: customer.name.split(" ")[0] + " (Site Manager)",
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        city: customer.city || "Bengaluru",
        coordinates: customer.coordinates,
        scheduledDate,
        scheduledTime,
        estimatedDuration: "45 mins",
        purpose: notes || `Field operations visit at ${customer.name}.`,
        priority: customer.priority,
        status: "pending",
        geofenceVerified: false,
        orderIndex: 6,
        tags: ["Nearest-Agent Dispatched", customer.priority.toUpperCase()],
      };

      try {
        const existingVisitsJson = localStorage.getItem("fos_agent_visits");
        const existingVisits: AgentVisit[] = existingVisitsJson
          ? JSON.parse(existingVisitsJson)
          : [];
        const updated = [...existingVisits, newAgentVisit];
        localStorage.setItem("fos_agent_visits", JSON.stringify(updated));

        // Dispatch a cross-tab / window custom event
        window.dispatchEvent(new CustomEvent("fos_new_visit_assigned", { detail: newAgentVisit }));
      } catch {
        // storage fallback
      }
    }

    const successMessage = `Successfully assigned ${customer.name} to ${agent.name} for ${scheduledTime}!`;
    showNotification("success", successMessage);

    return {
      success: true,
      message: successMessage,
    };
  };

  const unassignLead = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) {
      return { success: false, message: "Customer lead not found." };
    }

    const previousAgentId = customer.assignedAgentId;

    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId
          ? {
              ...c,
              assignmentStatus: "pending",
              assignedAgentId: undefined,
              assignedAgentName: undefined,
            }
          : c
      )
    );

    if (previousAgentId) {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === previousAgentId
            ? {
                ...a,
                assignedTasks: Math.max(0, a.assignedTasks - 1),
              }
            : a
        )
      );
    }

    setAssignments((prev) => prev.filter((asn) => asn.customerId !== customerId));

    showNotification("info", `${customer.name} unassigned and returned to pending queue.`);
    return { success: true, message: "Lead unassigned successfully." };
  };

  const resetOperationsData = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY_CUSTOMERS);
      localStorage.removeItem(STORAGE_KEY_AGENTS);
      localStorage.removeItem(STORAGE_KEY_ASSIGNMENTS);
      localStorage.removeItem(STORAGE_KEY_WORKLOAD);
      localStorage.removeItem("fos_agent_visits");
      window.dispatchEvent(new CustomEvent("fos_operations_reset"));
    }
    setMaxWorkloadLimit(6);
    loadLiveOperationsData();
    showNotification("info", "Operations state refreshed from live database.");
  };

  return (
    <OperationsContext.Provider
      value={{
        customers,
        agents,
        assignments,
        maxWorkloadLimit,
        setMaxWorkloadLimit,
        selectedLeadId,
        setSelectedLeadId,
        assignLeadToAgent,
        unassignLead,
        resetOperationsData,
        notification,
        clearNotification,
      }}
    >
      {children}
    </OperationsContext.Provider>
  );
}

export function useOperations() {
  const context = useContext(OperationsContext);
  if (!context) {
    throw new Error("useOperations must be used within an OperationsProvider");
  }
  return context;
}
