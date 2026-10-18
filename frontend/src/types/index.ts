export type AgentStatus = "active" | "inactive" | "busy" | "break";
export type PriorityLevel = "high" | "medium" | "low";
export type TaskStatus = "active" | "inactive" | "assigned" | "pending" | "completed" | "delayed";

export interface Agent {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  status: AgentStatus;
  currentTask?: string;
  assignedTasks: number;
  completedVisits: number;
  lastLocationUpdate: string;
  territory: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  batteryLevel?: number;
}

export interface Customer {
  id: string;
  name: string;
  leadId: string;
  company?: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  priority: PriorityLevel;
  assignmentStatus: TaskStatus;
  assignedAgentId?: string;
  assignedAgentName?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  createdDate: string;
  notes?: string;
}

export interface Assignment {
  id: string;
  customerName: string;
  customerId: string;
  agentName: string;
  agentId: string;
  scheduledTime: string;
  scheduledDate: string;
  priority: PriorityLevel;
  status: TaskStatus;
  address: string;
  estimatedDurationMinutes: number;
  notes?: string;
}

export interface Visit {
  id: string;
  assignmentId: string;
  customerName: string;
  agentName: string;
  scheduledTime: string;
  completedTime?: string;
  status: "completed" | "pending" | "delayed" | "in_progress";
  geofenceVerified: boolean;
  accuracyMeters: number;
  address: string;
}

export interface Territory {
  id: string;
  name: string;
  region: string;
  assignedAgents: string[];
  customerCount: number;
  activeVisits: number;
  color: string;
  center: {
    lat: number;
    lng: number;
  };
  boundaries?: [number, number][];
}

export interface SystemSettings {
  orgName: string;
  supportEmail: string;
  timezone: string;
  geofenceRadiusMeters: number;
  maxGpsAccuracyMeters: number;
  locationStaleThresholdSeconds: number;
  autoDispatchEnabled: boolean;
  enforceGeofenceCheckin: boolean;
}

export * from "./agent";

