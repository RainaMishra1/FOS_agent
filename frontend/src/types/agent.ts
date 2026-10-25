export type VisitPriority = "high" | "medium" | "low";
export type VisitStatus = "pending" | "in_progress" | "completed" | "delayed";

export interface AgentVisit {
  id: string;
  assignmentId: string;
  customerId: string;
  customerName: string;
  company?: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  hasCoordinates?: boolean;
  scheduledTime: string;
  scheduledDate: string;
  estimatedDuration: string;
  purpose: string;
  priority: VisitPriority;
  status: VisitStatus;
  geofenceVerified: boolean;
  checkInTime?: string;
  completedTime?: string;
  completionNotes?: string;
  orderIndex: number;
  tags?: string[];
}

export interface AgentProfile {
  id: string;
  dbId?: string;
  agentCode?: string;
  name: string;
  initials: string;
  role: string;
  status?: string;
  email: string;
  phone: string;
  territory: string;
  batteryLevel: number;
  shiftHours: string;
  avatarUrl?: string;
  currentCoordinates: {
    lat: number;
    lng: number;
  };
}

export interface RouteStop {
  stopNumber: number;
  visit: AgentVisit;
  distanceFromPrevious: string;
  durationFromPrevious: string;
  isCompleted: boolean;
  isNext: boolean;
}
