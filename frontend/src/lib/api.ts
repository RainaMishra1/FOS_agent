export interface HealthResponse {
  status: string;
  project: string;
  environment: string;
  version: string;
  timestamp: string;
}

export interface ExtensionInfo {
  name: string;
  version: string;
}

export interface DatabaseHealthResponse {
  status: string;
  environment: string;
  database_connected: boolean;
  postgis_enabled: boolean;
  postgis_version?: string | null;
  installed_extensions?: ExtensionInfo[];
  error?: string | null;
  timestamp: string;
}

export interface KpiSummaryData {
  total_field_agents: number;
  agents_currently_active: number;
  total_customers: number;
  total_leads: number;
  visits_scheduled_today: number;
  visits_completed_today: number;
  completed_percentage: number;
  pending_assignments: number;
  active_change: string;
  pending_change: string;
}

export interface DashboardRecentAssignmentData {
  id: string;
  assignment_code?: string | null;
  customer_name: string;
  address?: string | null;
  agent_name: string;
  scheduled_time: string;
  scheduled_date: string;
  priority: string;
  status: string;
}

export interface DashboardActiveAgentData {
  id: string;
  agent_code?: string | null;
  name: string;
  initials: string;
  status: string;
  territory?: string | null;
  completed_visits: number;
  assigned_tasks: number;
  battery_level?: number | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  last_location_update?: string | null;
}

export interface DashboardUpcomingVisitData {
  id: string;
  visit_code?: string | null;
  customer_name: string;
  agent_name: string;
  address?: string | null;
  scheduled_time: string;
  scheduled_date: string;
  status: string;
  geofence_verified: boolean;
}

export interface WeeklyRunRateDayData {
  day: string;
  date: string;
  scheduled: number;
  completed: number;
  rate: number;
}

export interface DashboardSummaryData {
  kpi: KpiSummaryData;
  active_agents: DashboardActiveAgentData[];
  recent_assignments: DashboardRecentAssignmentData[];
  today_visits: DashboardUpcomingVisitData[];
  weekly_activity: WeeklyRunRateDayData[];
  as_of_date: string;
  avg_geofence_accuracy_meters?: number | null;
}

export interface AgentApiItem {
  id: string;
  auth_linked?: boolean;
  agent_code?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  territory?: string | null;
  address?: string | null;
  location_source?: "admin_provided" | "gps" | "unknown" | string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  battery_level?: number | null;
  last_location_update?: string | null;
  assigned_tasks: number;
  completed_visits: number;
  created_at: string;
}

export interface AgentListApiResult {
  total: number;
  skip: number;
  limit: number;
  items: AgentApiItem[];
}

export async function inviteAgentAccount(agentId: string, token?: string | null): Promise<{
  agent_id: string;
  linked: boolean;
  invitation_sent: boolean;
  detail: string;
}> {
  return await apiFetch<{
    agent_id: string;
    linked: boolean;
    invitation_sent: boolean;
    detail: string;
  }>(`/agents/${agentId}/invite`, { method: "POST" }, token);
}

/**
 * Resolves and normalizes the backend API base URL.
 * Prioritizes NEXT_PUBLIC_API_BASE_URL, with backward-compatible fallback to NEXT_PUBLIC_API_URL
 * and localhost:8000 for local development.
 */
export function getApiBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000/api/v1";

  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed.endsWith("/api/v1") && !trimmed.endsWith("/api")) {
    return `${trimmed}/api/v1`;
  }
  return trimmed;
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * Standard HTTP error class carrying HTTP status code and response payload.
 */
export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Centralized fetch helper for FastAPI endpoints with Bearer token authentication.
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null,
  timeoutMs: number = 15000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const fullUrl = `${API_BASE_URL}${cleanEndpoint}`;

  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      let errorDetail = "";
      try {
        const errorJson = await response.json();
        if (typeof errorJson.detail === "string") {
          errorDetail = errorJson.detail;
        } else if (Array.isArray(errorJson.detail)) {
          errorDetail = errorJson.detail
            .map((e: any) => {
              if (typeof e === "string") return e;
              if (e && typeof e === "object" && e.msg) {
                const loc = Array.isArray(e.loc) ? e.loc.filter((l: any) => l !== "body").join(".") : "";
                return loc ? `${loc}: ${e.msg}` : e.msg;
              }
              return JSON.stringify(e);
            })
            .join("; ");
        } else if (errorJson.detail && typeof errorJson.detail === "object") {
          errorDetail = errorJson.detail.msg || JSON.stringify(errorJson.detail);
        } else if (typeof errorJson.message === "string") {
          errorDetail = errorJson.message;
        } else {
          errorDetail = JSON.stringify(errorJson);
        }
      } catch {
        errorDetail = await response.text();
      }

      if (response.status === 401) {
        throw new ApiError(
          401,
          "Authentication failed or session expired. Please sign in again.",
          errorDetail
        );
      } else if (response.status === 403) {
        throw new ApiError(
          403,
          "Access denied: Administrative privileges required.",
          errorDetail
        );
      } else if (response.status === 404) {
        throw new ApiError(404, "Requested resource not found.", errorDetail);
      } else {
        throw new ApiError(
          response.status,
          `API request failed with status ${response.status}`,
          errorDetail
        );
      }
    }

    return await response.json();
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err.name === "AbortError") {
      throw new ApiError(
        504,
        `Request to ${cleanEndpoint} timed out after ${timeoutMs / 1000} seconds.`
      );
    }
    throw new ApiError(
      503,
      `Cannot connect to backend server at ${API_BASE_URL}. Ensure the FastAPI service is running.`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Health check endpoints.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  return await apiFetch<HealthResponse>("/health", { method: "GET" });
}

export async function fetchDatabaseHealth(): Promise<DatabaseHealthResponse> {
  return await apiFetch<DatabaseHealthResponse>("/health/db", { method: "GET" }, null, 10000);
}

/**
 * Fetches real-time Admin Operations Control Center metrics and data aggregates.
 */
export async function fetchDashboardSummary(
  token?: string | null,
  asOfDate?: string
): Promise<DashboardSummaryData> {
  const query = asOfDate ? `?as_of_date=${encodeURIComponent(asOfDate)}` : "";
  return await apiFetch<DashboardSummaryData>(`/dashboard/summary${query}`, { method: "GET" }, token);
}

/**
 * Fetches field agent directory with server-side pagination, search, and filtering.
 * Pass `as_of_date` (YYYY-MM-DD) to scope assigned_tasks / completed_visits to that day.

 */
export async function fetchAgents(
  token?: string | null,
  params: {
    skip?: number;
    limit?: number;
    status?: string;
    territory?: string;
    search?: string;
    as_of_date?: string;
  } = {}
): Promise<AgentListApiResult> {
  const searchParams = new URLSearchParams();
  if (params.skip !== undefined) searchParams.set("skip", params.skip.toString());
  if (params.limit !== undefined) searchParams.set("limit", params.limit.toString());
  if (params.status && params.status !== "all") searchParams.set("status", params.status);
  if (params.territory && params.territory !== "all") searchParams.set("territory", params.territory);
  if (params.search && params.search.trim()) searchParams.set("search", params.search.trim());
  if (params.as_of_date) searchParams.set("as_of_date", params.as_of_date);

  const qs = searchParams.toString();
  const endpoint = `/agents${qs ? `?${qs}` : ""}`;
  return await apiFetch<AgentListApiResult>(endpoint, { method: "GET" }, token);
}

/**
 * Fetches detailed profile and telemetry for a single agent.
 */
export async function fetchAgentById(
  agentId: string,
  token?: string | null
): Promise<AgentApiItem> {
  return await apiFetch<AgentApiItem>(`/agents/${agentId}`, { method: "GET" }, token);
}

export interface AgentCreatePayload {
  auth_user_id: string;
  name: string;
  email: string;
  phone?: string | null;
  agent_code: string;
  status?: string;
  territory?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Creates and registers a new field agent in PostgreSQL via FastAPI.
 * Requires administrator role.
 */
export async function createAgent(
  payload: AgentCreatePayload,
  token?: string | null
): Promise<AgentApiItem> {
  return await apiFetch<AgentApiItem>(
    "/agents",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export interface VisitApiResponse {
  id: string;
  visit_code?: string | null;
  customer_id: string;
  agent_id: string;
  customer_name?: string | null;
  customer_company?: string | null;
  customer_contact_person?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  geofence_verified: boolean;
  check_in_time?: string | null;
  completed_time?: string | null;
  completion_notes?: string | null;
  order_index: number;
  estimated_duration_minutes: number;
  purpose?: string | null;
  priority?: "high" | "medium" | "low" | string | null;
  created_at: string;
}

export interface AgentRouteData {
  date: string;
  origin: { latitude: number; longitude: number; source: string; updated_at?: string | null; accuracy_meters?: number | null } | null;
  origin_error?: string | null;
  stops: VisitApiResponse[];
  completed: VisitApiResponse[];
}

export interface RoadRouteData {
  geometry: { type: "LineString"; coordinates: [number, number][] } | null;
  distance_meters: number;
  duration_seconds: number;
  legs: Array<{ distance: number; duration: number }>;
}

export async function fetchAgentTodayRoute(token?: string | null, asOfDate?: string): Promise<AgentRouteData> {
  const query = asOfDate ? `?as_of_date=${encodeURIComponent(asOfDate)}` : "";
  return await apiFetch<AgentRouteData>(`/agent/routes/today${query}`, { method: "GET" }, token);
}

export async function optimizeAgentTodayRoute(token?: string | null, asOfDate?: string): Promise<{
  ordered_visit_ids: string[]; optimized: boolean; cost_model?: string; detail: string;
}> {
  const query = asOfDate ? `?as_of_date=${encodeURIComponent(asOfDate)}` : "";
  return await apiFetch(`/agent/routes/optimize${query}`, { method: "POST" }, token);
}

export async function fetchAgentRouteGeometry(visitIds: string[], token?: string | null): Promise<RoadRouteData> {
  const params = new URLSearchParams({ visit_ids: visitIds.join(",") });
  return await apiFetch<RoadRouteData>(`/agent/routes/geometry?${params.toString()}`, { method: "GET" }, token);
}

export interface VisitListApiResponse {
  total: number;
  items: VisitApiResponse[];
}

export async function fetchScheduledVisits(
  agentId: string,
  visitDate: string,
  token?: string | null,
): Promise<VisitListApiResponse> {
  const params = new URLSearchParams({ agent_id: agentId, visit_date: visitDate });
  return await apiFetch<VisitListApiResponse>(`/visits?${params.toString()}`, { method: "GET" }, token);
}

export interface AdminRoutePreview {
  ordered_visit_ids: string[];
  geometry: { type: "LineString"; coordinates: [number, number][] } | null;
  distance_meters: number;
  duration_seconds: number;
  legs: Array<{ distance: number; duration: number }>;
  origin: { latitude: number; longitude: number; updated_at: string };
}

export async function previewAdminRoute(payload: {
  agent_id: string;
  scheduled_date: string;
  visit_ids?: string[];
  optimize?: boolean;
}, token?: string | null): Promise<AdminRoutePreview> {
  return await apiFetch<AdminRoutePreview>("/visits/route/optimize", {
    method: "POST", body: JSON.stringify(payload),
  }, token);
}

export async function saveAdminRouteOrder(payload: {
  agent_id: string;
  scheduled_date: string;
  visit_ids: string[];
}, token?: string | null): Promise<{ saved: boolean; ordered_visit_ids: string[] }> {
  return await apiFetch("/visits/route/order", {
    method: "PUT", body: JSON.stringify(payload),
  }, token);
}

export interface VisitDispatchPayload {
  agent_id: string;
  customer_name: string;
  company?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  scheduled_date: string;
  scheduled_time: string;
  priority: "high" | "medium" | "low";
  notes?: string;
}

export interface GeocodeCandidate {
  latitude: number;
  longitude: number;
  display_name: string;
  locality?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  category?: string | null;
  type?: string | null;
  importance?: number | null;
  place_id?: number | string | null;
}

export async function geocodeDispatchAddress(input: {
  address: string; locality?: string; state?: string; postal_code?: string; country?: string;
}, token?: string | null): Promise<{ candidates: GeocodeCandidate[]; attempted_queries?: string[]; cached: boolean }> {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => { if (value?.trim()) params.set(key, value.trim()); });
  return await apiFetch<{ candidates: GeocodeCandidate[]; attempted_queries?: string[]; cached: boolean }>(
    `/visits/geocode?${params.toString()}`,
    { method: "GET" },
    token
  );
}

export async function reverseGeocodeDispatchLocation(latitude: number, longitude: number, token?: string | null): Promise<{display_name: string; address: Record<string, string>; cached: boolean}> {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
  return await apiFetch(`/visits/reverse-geocode?${params.toString()}`, { method: "GET" }, token);
}

export async function createDispatchedVisit(payload: VisitDispatchPayload, token?: string | null): Promise<VisitApiResponse> {
  return await apiFetch<VisitApiResponse>("/visits/dispatch", {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export interface AgentStatsApiResponse {
  today_total: number;
  today_completed: number;
  today_remaining: number;
  completion_percentage: number;
  next_visit?: VisitApiResponse | null;
}

export interface AgentDashboardApiResponse {
  agent: AgentApiItem;
  stats: AgentStatsApiResponse;
  today_visits: VisitApiResponse[];
  upcoming_visits: VisitApiResponse[];
  recent_history: VisitApiResponse[];
  as_of_date: string;
}

/**
 * Fetches operational profile for the authenticated field agent.
 */
export async function fetchAgentMe(token?: string | null): Promise<AgentApiItem> {
  return await apiFetch<AgentApiItem>("/agent/me", { method: "GET" }, token);
}

/**
 * Fetches personalized control dashboard for the authenticated field agent.
 */
export async function fetchAgentDashboard(
  token?: string | null,
  asOfDate?: string
): Promise<AgentDashboardApiResponse> {
  const query = asOfDate ? `?as_of_date=${encodeURIComponent(asOfDate)}` : "";
  return await apiFetch<AgentDashboardApiResponse>(`/agent/dashboard${query}`, { method: "GET" }, token);
}

/**
 * Fetches scheduled visits assigned strictly to the authenticated field agent.
 */
export async function fetchAgentVisits(
  token?: string | null,
  params: {
    visit_date?: string;
    status?: string;
    search?: string;
    skip?: number;
    limit?: number;
  } = {}
): Promise<VisitListApiResponse> {
  const sp = new URLSearchParams();
  if (params.visit_date) sp.set("visit_date", params.visit_date);
  if (params.status && params.status !== "all") sp.set("status", params.status);
  if (params.search && params.search.trim()) sp.set("search", params.search.trim());
  if (params.skip !== undefined) sp.set("skip", params.skip.toString());
  if (params.limit !== undefined) sp.set("limit", params.limit.toString());

  const qs = sp.toString();
  return await apiFetch<VisitListApiResponse>(`/agent/visits${qs ? `?${qs}` : ""}`, { method: "GET" }, token);
}

/**
 * Fetches a single visit details assigned to the authenticated field agent.
 */
export async function fetchAgentVisitById(
  visitId: string,
  token?: string | null
): Promise<VisitApiResponse> {
  return await apiFetch<VisitApiResponse>(`/agent/visits/${visitId}`, { method: "GET" }, token);
}

/**
 * Fetches completed visit history for the authenticated field agent.
 */
export async function fetchAgentVisitHistory(
  token?: string | null,
  params: {
    search?: string;
    skip?: number;
    limit?: number;
  } = {}
): Promise<VisitListApiResponse> {
  const sp = new URLSearchParams();
  if (params.search && params.search.trim()) sp.set("search", params.search.trim());
  if (params.skip !== undefined) sp.set("skip", params.skip.toString());
  if (params.limit !== undefined) sp.set("limit", params.limit.toString());

  const qs = sp.toString();
  return await apiFetch<VisitListApiResponse>(`/agent/visit-history${qs ? `?${qs}` : ""}`, { method: "GET" }, token);
}

/**
 * Updates visit status, completion notes, and geofence verification on the backend.
 */
export async function updateAgentVisitStatus(
  visitId: string,
  status: string,
  notes?: string,
  token?: string | null
): Promise<VisitApiResponse> {
  return await apiFetch<VisitApiResponse>(
    `/agent/visits/${visitId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status,
        completion_notes: notes,
      }),
    },
    token
  );
}

/**
 * Updates the authenticated agent's duty availability (active, off_duty, break).
 */
export async function updateAgentDutyStatus(
  status: string,
  token?: string | null
): Promise<AgentApiItem> {
  return await apiFetch<AgentApiItem>(
    "/agent/duty",
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
    token
  );
}

export interface AgentLocationPayload {
  latitude: number;
  longitude: number;
  gps_accuracy?: number | null;
  battery_level?: number | null;
  location_source?: "gps" | "manual";
}

/**
 * Updates coordinates and telemetry for the authenticated field agent.
 * Sends coordinates and provenance source ('gps' or 'manual') to FastAPI.
 */
export async function updateAgentLocation(
  payload: AgentLocationPayload,
  token?: string | null
): Promise<AgentApiItem> {
  return await apiFetch<AgentApiItem>(
    "/agent/me/location",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token
  );
}

