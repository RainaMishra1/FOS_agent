"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Customer, Agent, Assignment, TaskStatus } from "@/types";
import { mockCustomers, mockAgents, mockAssignments } from "@/lib/mockData";
import { initialAgentVisits } from "@/lib/agentMockData";
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
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return mockCustomers;
  });

  const [agents, setAgents] = useState<Agent[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_AGENTS);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return mockAgents;
  });

  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_ASSIGNMENTS);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return mockAssignments;
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

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>("CUST-407"); // Default to Kalyan Textiles Outlet (unassigned)

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
        accuracyMeters: 0,
        mockDistanceMeters: 250, // Simulated distance
        orderIndex: 6,
        tags: ["Nearest-Agent Dispatched", customer.priority.toUpperCase()],
      };

      try {
        const existingVisitsJson = localStorage.getItem("fos_agent_visits");
        const existingVisits: AgentVisit[] = existingVisitsJson
          ? JSON.parse(existingVisitsJson)
          : initialAgentVisits;
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
    setCustomers(mockCustomers);
    setAgents(mockAgents);
    setAssignments(mockAssignments);
    setMaxWorkloadLimit(6);
    setSelectedLeadId("CUST-407");
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY_CUSTOMERS);
      localStorage.removeItem(STORAGE_KEY_AGENTS);
      localStorage.removeItem(STORAGE_KEY_ASSIGNMENTS);
      localStorage.removeItem(STORAGE_KEY_WORKLOAD);
      localStorage.removeItem("fos_agent_visits");
      window.dispatchEvent(new CustomEvent("fos_operations_reset"));
    }
    showNotification("info", "Operations state reset to default mock values.");
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
