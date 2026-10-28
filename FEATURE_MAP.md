# FOS Agent (Field Operations System) — Comprehensive Feature Map

> **Document Version:** 1.0.0  
> **Target Audience:** Engineering Leads, Product Managers, and Operations Leadership.  
> **Purpose:** Detailed operational reference mapping every visible UI component, button, metric, chart, and map directly to its frontend code, backend endpoints, database tables, mathematical algorithms, and external libraries.

---

## Table of Contents
1. [End-to-End System Architecture & Request Lifecycle](#1-end-to-end-system-architecture--request-lifecycle)
2. [Admin Operations Center: Overview Dashboard (`/admin/dashboard`)](#2-admin-operations-center-overview-dashboard-admindashboard)
3. [Live Operations Map & Fleet Telemetry (`/map`)](#3-live-operations-map--fleet-telemetry-map)
4. [Field Agents Directory & Onboarding (`/agents`)](#4-field-agents-directory--onboarding-agents)
5. [Smart Work Dispatch & Geocoding Modal (`AssignWorkModal`)](#5-smart-work-dispatch--geocoding-modal-assignworkmodal)
6. [Live Agent Tracking & Breadcrumb History (`/tracking`)](#6-live-agent-tracking--breadcrumb-history-tracking)
7. [Admin Route Optimization & Sequencing (`/routes`)](#7-admin-route-optimization--sequencing-routes)
8. [Field Agent Mobile Portal: Control Dashboard (`/agent/dashboard`)](#8-field-agent-mobile-portal-control-dashboard-agentdashboard)
9. [Field Agent Mobile Portal: My Visits & Geofence Execution (`/agent/visits`)](#9-field-agent-mobile-portal-my-visits--geofence-execution-agentvisits)
10. [Field Agent Mobile Portal: Turn-by-Turn Route Navigation (`/agent/routes`)](#10-field-agent-mobile-portal-turn-by-turn-route-navigation-agentroutes)
11. [Field Agent Mobile Portal: Historical Visit Audit (`/agent/history`)](#11-field-agent-mobile-portal-historical-visit-audit-agenthistory)
12. [Field Agent Mobile Portal: Profile & GPS Diagnostics (`/agent/profile`)](#12-field-agent-mobile-portal-profile--gps-diagnostics-agentprofile)
13. [System Administration & Operational Policies (`/settings`)](#13-system-administration--operational-policies-settings)
14. [Authentication & Role-Based Access Control (`/login`, `/signup`)](#14-authentication--role-based-access-control-login-signup)
15. [Master Calculation & Formula Reference](#15-master-calculation--formula-reference)

---

## 1. End-to-End System Architecture & Request Lifecycle

```
[User Action in Browser / Mobile Web]
                  │
                  ▼
[React 18 / Next.js 14 Client Component]
  - State update (useState / useOperations / useAgent)
  - Validation & coordinate extraction
                  │
                  ▼
[HTTP Client (`src/lib/api.ts`)]
  - Attaches Bearer JWT from Supabase Auth (`useAuth()`)
  - Calls FastAPI Backend on `http://localhost:8000/api/v1/...`
                  │
                  ▼
[FastAPI Asynchronous Gateway (`app/main.py`)]
  - CORS Middleware & JSON Parsing
  - Dependency Injection: `require_admin` or `require_agent`
  - Token verification against Supabase Auth public keys
                  │
                  ▼
[Domain Router (`app/api/v1/...`)]
  - Computes business logic (Haversine distance, TSP routing, KPI aggregation)
  - External API calls via HTTPX (OSRM for road matrices, Nominatim for geocoding)
                  │
                  ▼
[Database Layer (PostgreSQL with PostGIS via SQLAlchemy 2.0 Async)]
  - Spatial point checks (`ST_SetSRID`, `POINT(long lat, 4326)`)
  - Subquery aggregates (`func.count`, `func.avg`, `joinedload`)
                  │
                  ▼
[Pydantic V2 Response Schema]
  - Serializes database entities into type-safe JSON
                  │
                  ▼
[Frontend UI State Updated]
  - Re-renders DOM, animates charts, draws Leaflet markers, updates progress bars
```

---

## 2. Admin Operations Center: Overview Dashboard (`/admin/dashboard`)

### 2.1 System Health Badge & Diagnostic Modal
- **What it shows:** Live indicator badge showing backend connectivity (`Online` with green pulse or `Degraded`), project version, PostGIS spatial engine availability, and database latency. Clicking it opens the diagnostics modal.
- **Frontend:** [`frontend/src/components/HealthChecker.tsx:L1-L150`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/HealthChecker.tsx)
- **API Endpoint:** `GET /api/v1/health` and `GET /api/v1/health/database`
- **Backend Handler:** [`backend/app/api/v1/health.py:L42-L115`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/health.py#L42-L115) (`get_health_status`, `check_database_health`)
- **Data Source:** System runtime (`datetime.now`), PostgreSQL `SELECT 1`, and PostGIS extension check (`SELECT default_version, installed_version FROM pg_available_extensions WHERE name = 'postgis'`).
- **Calculation / Logic:**
  - Evaluates whether PostgreSQL is reachable within 3.0 seconds.
  - Confirms PostGIS extension is installed and active.
  - If any check fails, returns HTTP 503 with degradation reasons; otherwise HTTP 200 with extension version.
- **Libraries Used:** `asyncpg` / `SQLAlchemy` (for non-blocking database ping), `FastAPI` (REST responses).

---

### 2.2 Metric Card: Total Field Agents
- **What it shows:** Total number of registered field agents in the enterprise, plus a badge showing how many are currently on-duty.
- **Frontend:** [`frontend/src/app/admin/dashboard/page.tsx:L263-L272`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/admin/dashboard/page.tsx#L263-L272) calling [`frontend/src/components/MetricCard.tsx`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/MetricCard.tsx).
- **API Endpoint:** `GET /api/v1/dashboard/summary`
- **Backend Handler:** [`backend/app/api/v1/dashboard.py:L45-L80`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/dashboard.py#L45-L80) (`get_dashboard_summary`)
- **Data Source:** Table `agents`, column `id` and `status`.
- **Calculation / Logic:**
  $$\text{Total Agents} = \text{COUNT}(\text{agents.id})$$
  $$\text{Active Agents} = \text{COUNT}(\text{agents.id}) \quad \text{WHERE } \text{status} = \text{'active'}$$
  *Example:* If there are 12 rows in `agents` table and 8 have `status = 'active'`, the card displays **12** with subtext **"8 on duty"**.
- **Libraries Used:** `SQLAlchemy` scalar subqueries with `func.count`.

---

### 2.3 Metric Card: Visits Scheduled & Today's Completion Rate
- **What it shows:** Total visits queued for today, number of visits already completed, and the percentage completion rate.
- **Frontend:** [`frontend/src/app/admin/dashboard/page.tsx:L274-L283`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/admin/dashboard/page.tsx#L274-L283)
- **API Endpoint:** `GET /api/v1/dashboard/summary`
- **Backend Handler:** [`backend/app/api/v1/dashboard.py:L50-L77`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/dashboard.py#L50-L77)
- **Data Source:** Table `visits`, columns `scheduled_date`, `status`.
- **Calculation / Logic:**
  - Scheduled Today: Count of visits where `scheduled_date == today` OR (`scheduled_date < today` AND `status IN ('pending', 'in_progress', 'delayed')`). This automatically rolls over unfinished past visits.
  - Completed Today: Count of visits where `scheduled_date == today` AND `status == 'completed'`.
  - Rate:
    $$\text{Completion \%} = \text{ROUND}\left(\frac{\text{Completed Today}}{\text{Scheduled Today}} \times 100, 1\right)$$
  *Example:* 10 scheduled visits today, 8 completed. $\frac{8}{10} \times 100 = \mathbf{80.0\%}$.
- **Libraries Used:** `SQLAlchemy` (`func.count`, `case`, `or_`, `and_`).

---

### 2.4 Metric Card: Pending Queue Assignments
- **What it shows:** Number of work assignments currently in the dispatch queue awaiting agent acceptance or in transit.
- **Frontend:** [`frontend/src/app/admin/dashboard/page.tsx:L285-L294`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/admin/dashboard/page.tsx#L285-L294)
- **API Endpoint:** `GET /api/v1/dashboard/summary`
- **Backend Handler:** [`backend/app/api/v1/dashboard.py:L60-L90`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/dashboard.py#L60-L90)
- **Data Source:** Table `assignments`, column `status`.
- **Calculation / Logic:**
  $$\text{Pending Assignments} = \text{COUNT}(\text{assignments.id}) \quad \text{WHERE } \text{status} \in (\text{'assigned'}, \text{'pending'})$$
  *Example:* 4 unassigned leads + 2 assigned but unstarted visits = **6 in queue**.

---

### 2.5 Metric Card: Average Geofence Accuracy
- **What it shows:** Average GPS verification precision radius in meters across all recorded field visits.
- **Frontend:** [`frontend/src/app/admin/dashboard/page.tsx:L296-L305`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/admin/dashboard/page.tsx#L296-L305)
- **API Endpoint:** `GET /api/v1/dashboard/summary`
- **Backend Handler:** [`backend/app/api/v1/dashboard.py:L260-L266`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/dashboard.py#L260-L266)
- **Data Source:** Table `visit_location_logs`, column `accuracy_meters`.
- **Calculation / Logic:**
  $$\text{Avg Geofence Accuracy} = \text{ROUND}\left(\frac{\sum \text{accuracy\_meters}}{N_{\text{records}}}, 1\right)$$
  *Example:* Logged visits recorded accuracies of 12m, 14m, and 16m: $\frac{12 + 14 + 16}{3} = \mathbf{\pm 14.0m}$.
- **Libraries Used:** `SQLAlchemy` (`func.avg`).

---

### 2.6 Chart: Weekly Run Rate Activity (Bar & Progress Chart)
- **What it shows:** 7-day rolling window of operational productivity (from 6 days ago through today). Shows scheduled vs completed counts per day with completion rate percentage.
- **Frontend:** [`frontend/src/app/admin/dashboard/page.tsx:L315-L390`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/admin/dashboard/page.tsx#L315-L390)
- **API Endpoint:** `GET /api/v1/dashboard/summary`
- **Backend Handler:** [`backend/app/api/v1/dashboard.py:L220-L258`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/dashboard.py#L220-L258)
- **Data Source:** Table `visits`, grouped by `scheduled_date`.
- **Calculation / Logic:**
  - Queries `scheduled_date BETWEEN (today - 6 days) AND today`.
  - Aggregates `COUNT(id)` for scheduled and `COUNT(CASE WHEN status = 'completed')` per day.
  - For days with 0 scheduled visits, rate defaults to `0.0%`.
  - Renders dynamic SVG vertical bar heights: $\text{height \%} = \text{MIN}(100, \text{ROUND}((\text{completed} / \text{scheduled}) \times 100))$.
- **Libraries Used:** Native CSS flexbox / Tailwind progress styling; backend uses Python `datetime.timedelta` and SQLAlchemy `group_by`.

---

### 2.7 Table: Active Agents Live Telemetry
- **What it shows:** List of the top active agents with their avatar initials, agent code (`AGT-101`), territory, battery level gauge (green/amber/red), completed/assigned visits ratio, and relative last GPS update time.
- **Frontend:** [`frontend/src/app/admin/dashboard/page.tsx:L400-L480`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/admin/dashboard/page.tsx#L400-L480)
- **API Endpoint:** `GET /api/v1/dashboard/summary`
- **Backend Handler:** [`backend/app/api/v1/dashboard.py:L93-L146`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/dashboard.py#L93-L146)
- **Data Source:** Tables `agents`, `profiles`, and aggregated from `visits`.
- **Calculation / Logic:**
  - Aggregates tasks per agent in a single SQL pass (`GROUP BY Visit.agent_id`).
  - Initials formula: First letter of first name + first letter of last name (`"Marcus Vance"` $\rightarrow$ `"MV"`).
  - Battery color threshold:
    - $\ge 50\%$: Green (`text-emerald-600`)
    - $20\% - 49\%$: Amber (`text-amber-500`)
    - $< 20\%$: Red (`text-rose-500`)

---

### 2.8 Table: Recent Assignments & Today's Visits Feed
- **What it shows:** Chronological list of customer visits dispatched or scheduled today, with customer name, assigned agent name, scheduled time, priority badge (High, Medium, Low), and Geofence status (`Verified` / `Pending Check-in`).
- **Frontend:** [`frontend/src/app/admin/dashboard/page.tsx:L490-L580`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/admin/dashboard/page.tsx#L490-L580)
- **API Endpoint:** `GET /api/v1/dashboard/summary`
- **Backend Handler:** [`backend/app/api/v1/dashboard.py:L148-L218`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/dashboard.py#L148-L218)
- **Data Source:** Tables `assignments`, `leads`, `customers`, `visits`, `agents`, and `profiles`.
- **Calculation / Logic:** Joins `Visit` $\rightarrow$ `Customer` and `Agent` $\rightarrow$ `Profile`. Orders by `scheduled_date DESC`, `created_at DESC` limit 8.

---

## 3. Live Operations Map & Fleet Telemetry (`/map`)

### 3.1 Interactive Map Canvas
- **What it shows:** Full-screen interactive map visualizing all field agent locations, customer appointments, geofences, and cluster pins across operational territories.
- **Frontend:** [`frontend/src/app/map/page.tsx`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/map/page.tsx) rendering [`frontend/src/components/MapView.tsx:L1-L740`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/MapView.tsx)
- **API Endpoint:** `GET /api/v1/agents?limit=100`
- **Backend Handler:** [`backend/app/api/v1/agents.py:L155-L225`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agents.py#L155-L225) (`list_agents`)
- **Data Source:** Table `agents` (`current_latitude`, `current_longitude`, `status`, `location_source`, `last_location_update`, `battery_level`).
- **Calculation / Logic:**
  - GPS Freshness Evaluation:
    $$\text{Age} = \text{Current Time} - \text{last\_location\_update}$$
    If $\text{Age} \le 5 \text{ minutes (300,000 ms)}$ AND $\text{location\_source} = \text{'gps'}$, pin shows animated pulsing live beacon.
    If $> 5 \text{ minutes}$, pin displays "Last recorded GPS" in muted amber.
- **Libraries Used:**
  - `Leaflet 1.9.4` (loaded dynamically from CDN to avoid SSR window errors).
  - OpenStreetMap Carto tiles (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`).
  - Custom HTML DivIcons with SVG avatars and battery indicators.

---

### 3.2 Map Filters (Status, Source, Search)
- **What it shows:**
  - Status Dropdown: `All Statuses`, `Active / On Duty`, `Break`, `Off Duty`.
  - Source Dropdown: `All Sources`, `Live GPS Verified`, `Admin Provided`.
  - Search Input: Filters agents in real time by name, agent code, or territory.
- **Frontend:** [`frontend/src/components/MapView.tsx:L450-L530`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/MapView.tsx#L450-L530)
- **Calculation / Logic:**
  $$\text{Filter Match} = (\text{status} = \text{filter} \lor \text{filter} = \text{'all'}) \land (\text{source} = \text{sourceFilter} \lor \text{sourceFilter} = \text{'all'}) \land (\text{name contains query} \lor \text{code contains query})$$
  Dynamically clears and redraws Leaflet marker layer group (`markersLayerRef.current.clearLayers()`).

---

### 3.3 Agent Quick-Inspect Drawer
- **What it shows:** Clicking any pin opens a drawer displaying agent name, telephone call button (`tel:...`), battery percentage, assigned customer list, and a "Dispatch Work to this Agent" CTA button.
- **Frontend:** [`frontend/src/components/MapView.tsx:L560-L680`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/MapView.tsx#L560-L680)

---

## 4. Field Agents Directory & Onboarding (`/agents`)

### 4.1 Field Agents Table & Status Badges
- **What it shows:** Complete administrative roster of field agents. Columns: Code, Name & Initials, Contact (Phone/Email), Territory, Duty Status (`active`, `break`, `off_duty`), Workload (`X / Y visits`), Battery, and Actions.
- **Frontend:** [`frontend/src/app/agents/page.tsx:L1-L320`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/agents/page.tsx)
- **API Endpoint:** `GET /api/v1/agents`
- **Backend Handler:** [`backend/app/api/v1/agents.py:L155-L225`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agents.py#L155-L225)
- **Data Source:** Table `agents` joined with `profiles`.

---

### 4.2 "+ Add Field Agent" Modal
- **What it shows:** Form to provision a new field agent with full name, email, phone number, initial territory assignment, and temporary password.
- **Frontend:** [`frontend/src/components/CreateAgentModal.tsx:L1-L280`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/CreateAgentModal.tsx)
- **API Endpoint:** `POST /api/v1/agents`
- **Backend Handler:** [`backend/app/api/v1/agents.py:L231-L350`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agents.py#L231-L350) (`create_agent`)
- **Data Source:** Creates record in `profiles` (role: `'agent'`) and `agents` (auto-generates `agent_code` sequence `AGT-XXX`).
- **Calculation / Logic:**
  - Generates next unique `agent_code` via:
    $$\text{Next Code} = \text{"AGT-" } + \text{LPAD}(\text{MAX}(\text{id}) + 1, 3, \text{'0'})$$
  - Hashes password or provisions user through Supabase Admin Auth API.
- **Libraries Used:** `pydantic` request validation, `asyncpg` transaction.

---

## 5. Smart Work Dispatch & Geocoding Modal (`AssignWorkModal`)

### 5.1 Customer Address Lookup & Autocomplete
- **What it shows:** Live predictive search box where an admin types a customer site or landmark (e.g., `"Phoenix Marketcity, Kurla"`), returning geocoded candidates with street, city, state, postal code, latitude, and longitude.
- **Frontend:** [`frontend/src/components/AssignWorkModal.tsx`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/AssignWorkModal.tsx) using [`PhotonAutocompleteInput.tsx`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/PhotonAutocompleteInput.tsx) and [`GooglePlacesAutocompleteInput.tsx`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/GooglePlacesAutocompleteInput.tsx).
- **API Endpoint:** `GET /api/v1/visits/geocode?address={query}&country=India`
- **Backend Handler:** [`backend/app/api/v1/visits.py:L110-L165`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/visits.py#L110-L165) (`geocode_dispatch_address`)
- **Data Source:** OpenStreetMap Nominatim Geocoding API (`https://nominatim.openstreetmap.org/search`) with in-memory LRU TTL caching (`_geocode_cache`).
- **Calculation / Logic:**
  - Cleans and normalizes address query (e.g. replaces `"near X"` with `", X"`).
  - Checks if query hash exists in cache with timestamp $< 10 \text{ minutes}$.
  - Calls Nominatim with bounded parameters (`format=jsonv2`, `countrycodes=in`, `limit=5`).
  - Extracts `lat`, `lon`, `display_name`, `boundingbox`.
- **Libraries Used:** `httpx` (async HTTP client), Python `re` for regex parsing.

---

### 5.2 Interactive Pin Confirmation Map (`DispatchLocationMap`)
- **What it shows:** Miniature Leaflet map that centers on the geocoded address. The dispatcher can drag the marker to fine-tune the exact building entrance.
- **Frontend:** [`frontend/src/components/DispatchLocationMap.tsx:L1-L180`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/DispatchLocationMap.tsx)
- **API Endpoint:** (On marker drag end) `GET /api/v1/visits/reverse-geocode?latitude={lat}&longitude={lng}`
- **Backend Handler:** [`backend/app/api/v1/visits.py:L166-L220`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/visits.py#L166-L220) (`reverse_geocode_coordinates`)
- **Calculation / Logic:**
  - Converts dragged marker coordinate $(\phi, \lambda)$ into a human-readable street address via Nominatim reverse lookup.
- **Libraries Used:** Leaflet 1.9.4 drag event listener (`marker.on('dragend', ...)`).

---

### 5.3 Agent Proximity Recommendation Engine
- **What it shows:** Ranked list of field agents sorted from closest to farthest from the selected customer address, with real-time distance in kilometers (e.g., `"Marcus Vance — 2.4 km away"`).
- **Frontend:** [`frontend/src/components/AssignWorkModal.tsx:L280-L360`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/AssignWorkModal.tsx#L280-L360)
- **Calculation / Logic (Haversine Great-Circle Distance):**
  Given customer coordinate $(\phi_1, \lambda_1)$ and agent coordinate $(\phi_2, \lambda_2)$:
  $$\Delta \phi = \text{radians}(\phi_2 - \phi_1), \quad \Delta \lambda = \text{radians}(\lambda_2 - \lambda_1)$$
  $$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\text{radians}(\phi_1)) \cdot \cos(\text{radians}(\phi_2)) \cdot \sin^2\left(\frac{\Delta \lambda}{2}\right)$$
  $$c = 2 \cdot \text{atan2}(\sqrt{a}, \sqrt{1 - a})$$
  $$d = R \cdot c \quad \text{where } R = 6,371,000 \text{ meters}$$
  *Real Number Example:*
  Customer in Bandra (`19.0596, 72.8295`), Agent in Kurla (`19.0726, 72.8795`):
  Calculates distance $d \approx 5,420\text{ meters } (5.4\text{ km})$. Agents are sorted ascending by $d$.
- **Libraries Used:** JavaScript math utilities and backend Python `math.radians`, `math.sin`, `math.atan2`.

---

### 5.4 Dispatch Submission ("Dispatch & Save")
- **What it shows:** Button that submits the complete appointment: Customer creation/linkage, visit creation with scheduled time and priority, agent assignment, and PostGIS geometry point creation.
- **Frontend:** [`frontend/src/components/AssignWorkModal.tsx:L450-L520`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/AssignWorkModal.tsx#L450-L520)
- **API Endpoint:** `POST /api/v1/visits/dispatch`
- **Backend Handler:** [`backend/app/api/v1/visits.py:L334-L450`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/visits.py#L334-L450) (`dispatch_customer_visit`)
- **Data Source:** Inserts row into `customers` (or links existing), inserts row into `leads`, inserts row into `assignments`, and inserts row into `visits`.
- **Calculation / Logic:**
  - Converts coordinates to PostGIS geometry:
    $$\text{location} = \text{ST\_SetSRID}(\text{ST\_MakePoint}(\text{longitude}, \text{latitude}), 4326)$$
  - Auto-increments visit code: `VST-` + unique sequential token.
  - Generates initial order index:
    $$\text{order\_index} = \text{MAX}(\text{order\_index of agent today}) + 1$$
- **Libraries Used:** `GeoAlchemy2` (`WKTElement`), `SQLAlchemy` transaction management.

---

## 6. Live Agent Tracking & Breadcrumb History (`/tracking`)

### 6.1 Real-Time Breadcrumb Polyline Map
- **What it shows:** Continuous road trail visualizing the historic travel path taken by an agent throughout the day, showing points where the agent stopped, sped up, or checked in.
- **Frontend:** [`frontend/src/app/tracking/page.tsx:L1-L350`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/tracking/page.tsx)
- **API Endpoint:** `GET /api/v1/agents/{agent_id}` and `GET /api/v1/agents`
- **Backend Handler:** [`backend/app/api/v1/agents.py:L403-L460`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agents.py#L403-L460) (`get_agent_by_id`)
- **Data Source:** Table `agent_locations` (`latitude`, `longitude`, `recorded_at`, `gps_accuracy`, `battery_level`).
- **Calculation / Logic:**
  - Sorts coordinates chronologically by `recorded_at ASC`.
  - Connects points using Leaflet `L.polyline` with terracotta-styled stroke (`#B76E52`).
  - Highlights verified customer check-in stops along the polyline using green checkmark markers.
- **Libraries Used:** `Leaflet 1.9.4` (`L.polyline`, `L.circleMarker`).

---

## 7. Admin Route Optimization & Sequencing (`/routes`)

### 7.1 Road Route Map Display (`AgentRoadRouteMap`)
- **What it shows:** Road network-accurate polyline tracing the exact driving route between an agent's current location and all scheduled stops, adhering to one-way streets, bridges, and turns.
- **Frontend:** [`frontend/src/app/routes/page.tsx`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/routes/page.tsx) rendering [`AgentRoadRouteMap.tsx:L1-L320`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/agent/AgentRoadRouteMap.tsx)
- **API Endpoint:** `POST /api/v1/visits/route/optimize`
- **Backend Handler:** [`backend/app/api/v1/visits.py:L238-L308`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/visits.py#L238-L308) (`optimize_admin_route`)
- **Data Source:** Table `visits` and OSRM (Open Source Routing Machine).

---

### 7.2 "Optimize Route" Sequencing Algorithm
- **What it shows:** Button that solves the Traveling Salesperson Problem (TSP) to reorder customer stops for minimum total drive time.
- **Frontend:** [`frontend/src/app/routes/page.tsx:L180-L240`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/routes/page.tsx#L180-L240)
- **API Endpoint:** `POST /api/v1/visits/route/optimize`
- **Backend Handler:** [`backend/app/api/v1/visits.py:L255-L298`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/visits.py#L255-L298)
- **Algorithm & Mathematical Logic (Greedy Heuristic with OSRM Duration Matrix):**
  1. Compiles coordinates: $[(\text{origin}_{\text{lng}}, \text{origin}_{\text{lat}}), (V_{1\text{lng}}, V_{1\text{lat}}), \dots, (V_{n\text{lng}}, V_{n\text{lat}})]$.
  2. Queries OSRM Table API:
     $$\text{GET } \text{/table/v1/driving/} \lambda_0,\phi_0;\lambda_1,\phi_1;\dots;\lambda_n,\phi_n?annotations=duration$$
     Returns an $(N+1) \times (N+1)$ matrix $M$ where $M[i][j]$ is road travel duration in seconds from stop $i$ to stop $j$.
  3. **Pinning Rule:** If an appointment is currently `in_progress`, it is pinned as Stop #1.
  4. **Iterative Nearest Neighbor Selection:**
     - Starting from current stop index $i = 0$ (Agent's origin):
       $$j^* = \arg\min_{j \in \text{Unvisited}} M[i][j]$$
     - Append stop $j^*$ to the sequence, set $i = j^*$, and remove $j^*$ from unvisited set.
     - Repeat until all stops are sequenced.
  5. Queries OSRM Route API for full GeoJSON road geometry over the ordered sequence:
     $$\text{GET } \text{/route/v1/driving/} \dots?overview=full\&geometries=geojson$$
  *Real Number Example:*
  Agent at Point A. Stop 1 is 45 mins away in heavy traffic; Stop 2 is 8 mins away; Stop 3 is 12 mins from Stop 2.
  Optimization sequences: $\text{Agent} \rightarrow \text{Stop 2} \rightarrow \text{Stop 3} \rightarrow \text{Stop 1}$.
  Total driving time drops from 85 mins down to 34 mins (60% savings).
- **Libraries Used:** `httpx` for async OSRM API calls, Python list comprehension.

---

### 7.3 Manual Stop Reordering & "Save Route"
- **What it shows:** Up/Down arrow buttons next to each customer stop allowing a manager to manually reorder stops, followed by a "Save Route Order" button.
- **Frontend:** [`frontend/src/app/routes/page.tsx:L250-L280`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/routes/page.tsx#L250-L280)
- **API Endpoint:** `PUT /api/v1/visits/route/order`
- **Backend Handler:** [`backend/app/api/v1/visits.py:L309-L333`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/visits.py#L309-L333) (`update_route_order`)
- **Calculation / Logic:** Iterates through list of visit UUIDs:
  $$\text{visits}[k].\text{order\_index} = k + 1 \quad \text{for } k \in [0, N-1]$$
  Commits updated order indices to PostgreSQL.

---

## 8. Field Agent Mobile Portal: Control Dashboard (`/agent/dashboard`)

### 8.1 On-Duty / Off-Duty Toggle Switch
- **What it shows:** Header toggle button switching agent status between `On Duty` (green) and `Off Duty` (neutral beige).
- **Frontend:** [`frontend/src/components/agent/AgentLayout.tsx:L120-L150`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/agent/AgentLayout.tsx#L120-L150)
- **API Endpoint:** `PATCH /api/v1/agent/duty`
- **Backend Handler:** [`backend/app/api/v1/agent.py:L723-L748`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agent.py#L723-L748) (`update_agent_duty_status`)
- **Data Source:** Table `agents`, column `status` (`'active'` vs `'off_duty'`).

---

### 8.2 Next Visit Focus Card (`NextVisitCard`)
- **What it shows:** Prominent priority card displaying the agent's very next appointment: Customer Name, Company, Address, Scheduled Time, Priority Badge, Distance from current GPS position, and action buttons.
- **Frontend:** [`frontend/src/components/agent/NextVisitCard.tsx:L1-L320`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/agent/NextVisitCard.tsx)
- **API Endpoint:** `GET /api/v1/agent/dashboard`
- **Backend Handler:** [`backend/app/api/v1/agent.py:L316-L440`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agent.py#L316-L440) (`get_agent_dashboard`)
- **Calculation / Logic:**
  - Queries active visits for the authenticated agent for today ordered by `order_index ASC`.
  - Filters:
    $$\text{next\_visit} = \text{FIRST}(\text{status} \in (\text{'in\_progress'}, \text{'pending'}, \text{'delayed'}))$$
  - Computes live Haversine distance between device GPS and customer coordinates.

---

### 8.3 "Navigate" Button (Google Maps Deep Link)
- **What it shows:** Navigation button with compass icon.
- **Frontend:** [`frontend/src/components/agent/NextVisitCard.tsx:L210-L225`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/agent/NextVisitCard.tsx#L210-L225)
- **Calculation / Logic:**
  Generates universal mobile navigation URI:
  ```typescript
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${customer.latitude},${customer.longitude}&travelmode=driving`;
  ```
  Launches Google Maps or Apple Maps app directly on Android / iOS.

---

### 8.4 Today's Workload Metrics (Completed, Remaining, Distance, Today Rate)
- **What it shows:** 4 small metric tiles showing:
  - `Completed`: Number of completed appointments today.
  - `Remaining`: Unfinished visits queued.
  - `Est. Distance`: Estimated remaining driving kilometers.
  - `Rate`: Percentage completion.
- **Frontend:** [`frontend/src/app/agent/dashboard/page.tsx:L90-L160`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/agent/dashboard/page.tsx#L90-L160)
- **API Endpoint:** `GET /api/v1/agent/dashboard`
- **Backend Handler:** [`backend/app/api/v1/agent.py:L402-L435`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agent.py#L402-L435)
- **Calculation / Logic:**
  $$\text{Total} = \text{Completed} + \text{Remaining}$$
  $$\text{Rate} = \text{ROUND}\left(\frac{\text{Completed}}{\text{Total}} \times 100, 1\right) \quad (\text{or } 0.0\% \text{ if Total} = 0)$$

---

## 9. Field Agent Mobile Portal: My Visits & Geofence Execution (`/agent/visits`)

### 9.1 Status Filter Tabs
- **What it shows:** Segmented filter buttons: `All`, `Pending`, `In Progress`, `Completed`.
- **Frontend:** [`frontend/src/app/agent/visits/page.tsx:L75-L105`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/agent/visits/page.tsx#L75-L105)
- **Calculation / Logic:** Client-side state filter over `visits` array from `AgentContext`.

---

### 9.2 Geofence Check-in Trigger & Modal (`VisitGeofenceCheckIn`)
- **What it shows:** "Check In" button on an active visit card. Opens a verification modal checking if the agent is physically at the customer's doorstep.
- **Frontend:** [`frontend/src/components/agent/VisitGeofenceCheckIn.tsx:L1-L180`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/agent/VisitGeofenceCheckIn.tsx)
- **API Endpoint:** `PATCH /api/v1/agent/visits/{visit_id}/status` with body `{"status": "in_progress"}`
- **Backend Handler:** [`backend/app/api/v1/agent.py:L623-L720`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agent.py#L623-L720) (`update_agent_visit_status`)
- **Backend Validation & Geofence Calculation (`_verify_visit_geofence`):**
  1. Fetches latest GPS coordinates $(\phi_A, \lambda_A)$ for the agent from `agent_locations`.
  2. Fetches customer coordinates $(\phi_C, \lambda_C)$ from `customers`.
  3. Computes Haversine distance $D_{\text{meters}}$ via `_distance_meters` ([`agent.py:L37-L49`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agent.py#L37-L49)).
  4. **Policy Enforcement:**
     $$\text{Threshold} = \text{settings.GEOFENCE\_RADIUS\_METERS} \quad (\text{default: } 100\text{ meters})$$
     - If $D_{\text{meters}} > 100\text{m}$, rejects with **HTTP 409 Conflict**:
       *"You are not under 100m. You are 342m away from the customer's location."*
     - If $D_{\text{meters}} \le 100\text{m}$, permits check-in and logs event in `visit_location_logs`.
  *Real Number Example:*
  Agent checks in at 68m from the customer location. $68 \le 100$, check-in approved, status becomes `in_progress`.

---

### 9.3 Complete Visit Modal (`CompleteVisitModal`)
- **What it shows:** Form to complete an appointment containing:
  - HTML5 Signature Pad: Customer signs with finger/stylus on canvas.
  - Photo Attachment: Upload site completion proof photo.
  - Completion Notes Textarea: Agent types outcome summary.
  - "Submit & Sign Off" button.
- **Frontend:** [`frontend/src/components/agent/CompleteVisitModal.tsx:L1-L260`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/agent/CompleteVisitModal.tsx)
- **API Endpoint:** `PATCH /api/v1/agent/visits/{visit_id}/status` with body `{"status": "completed", "completion_notes": "..."}`
- **Backend Handler:** [`backend/app/api/v1/agent.py:L688-L720`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agent.py#L688-L720)
- **Calculation / Logic:**
  - Sets `visit.status = 'completed'`.
  - Sets `visit.completed_time = func.now()`.
  - Inserts row into `visit_location_logs` with `event_type = 'completion'`, saving accuracy and final coordinates.

---

## 10. Field Agent Mobile Portal: Turn-by-Turn Route Navigation (`/agent/routes`)

### 10.1 Agent Route Map
- **What it shows:** Full-width map showing today's driving sequence for the logged-in agent with road polylines and numbered stop flags (1, 2, 3...).
- **Frontend:** [`frontend/src/app/agent/routes/page.tsx`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/agent/routes/page.tsx)
- **API Endpoint:** `GET /api/v1/agent/routes/today` and `GET /api/v1/agent/routes/geometry`
- **Backend Handler:** [`backend/app/api/v1/agent.py:L170-L191`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agent.py#L170-L191) and [`agent.py:L238-L274`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agent.py#L238-L274)

---

### 10.2 Agent Self-Optimization Preview ("Optimize My Route")
- **What it shows:** Button allowing a field agent to preview an optimized sequence for remaining pending stops based on live traffic/road durations from OSRM.
- **Frontend:** [`frontend/src/app/agent/routes/page.tsx:L95-L135`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/agent/routes/page.tsx#L95-L135)
- **API Endpoint:** `POST /api/v1/agent/routes/optimize`
- **Backend Handler:** [`backend/app/api/v1/agent.py:L193-L236`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agent.py#L193-L236) (`optimize_today_agent_route`)
- **Calculation / Logic:**
  - Evaluates origin: Uses agent's latest high-accuracy GPS fix.
  - Queries OSRM road travel duration table.
  - Keeps currently `in_progress` visit at index 0.
  - Greedy-sequences uncompleted stops and returns preview ordered IDs without mutating database records.

---

## 11. Field Agent Mobile Portal: Historical Visit Audit (`/agent/history`)

### 11.1 Metrics Banner
- **What it shows:** 3 summary blocks:
  1. `Total Completed`: Total completed records count (`{allCompleted.length} Records`).
  2. `Status`: Live sync badge (`Synchronized` / `Demo Mode`).
  3. `Avg GPS Accuracy`: Accuracy metric (`±13.2m`).
- **Frontend:** [`frontend/src/app/agent/history/page.tsx:L85-L103`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/agent/history/page.tsx#L85-L103)
- **API Endpoint:** `GET /api/v1/agent/visit-history`
- **Backend Handler:** [`backend/app/api/v1/agent.py:L567-L620`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agent.py#L567-L620) (`get_agent_visit_history`)
- **Data Source:** Table `visits` (`WHERE agent_id = current_agent AND status = 'completed'`).

---

### 11.2 Historical Visit Search & Audit Cards
- **What it shows:** Live search input filtering completed records by customer name, address, or completion notes. Each card displays customer name, completed timestamp, address, completion notes snippet, and `GPS geofence verified` badge.
- **Frontend:** [`frontend/src/app/agent/history/page.tsx:L105-L180`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/agent/history/page.tsx#L105-L180)
- **Calculation / Logic:**
  $$\text{Matches} = \text{customer.name} \supset Q \lor \text{address} \supset Q \lor \text{completion\_notes} \supset Q$$

---

## 12. Field Agent Mobile Portal: Profile & GPS Diagnostics (`/agent/profile`)

### 12.1 Live GPS Telemetry Diagnostic Card (`AgentLocationSection`)
- **What it shows:** Real-time hardware telemetry:
  - Exact coordinates: Latitude and Longitude to 4 decimal places.
  - Accuracy circle: `±12m accuracy`.
  - Battery gauge: Device battery level percentage.
  - Source: `Hardware GPS (W3C Geolocation)`.
  - "Sync Location Now" button.
- **Frontend:** [`frontend/src/components/agent/AgentLocationSection.tsx:L1-L150`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/agent/AgentLocationSection.tsx)
- **API Endpoint:** `PATCH /api/v1/agent/me/location`
- **Backend Handler:** [`backend/app/api/v1/agent.py:L750-L800`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/agent.py#L750-L800) (`update_agent_location`)
- **Data Source:** Table `agents` (`current_latitude`, `current_longitude`, `last_location_update`) and table `agent_locations` (historical breadcrumb row).
- **Calculation / Logic:**
  - Browser executes `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true })`.
  - Sends payload `{"latitude": lat, "longitude": lng, "gps_accuracy": acc, "battery_level": bat}`.
  - Backend creates a PostGIS spatial geometry point:
    $$\text{location} = \text{WKTElement}(\text{"POINT(" } + \text{lng} + \text{" " } + \text{lat} + \text{")"}, \text{srid}=4326)$$
  - Sets `last_location_update = func.now()`.

---

## 13. System Administration & Operational Policies (`/settings`)

### 13.1 Operational Threshold Controls
- **What it shows:** Admin configuration inputs for:
  - `Geofence Radius (meters)`: Maximum allowable distance from site to approve check-in (default: 100m).
  - `Location Stale Threshold (seconds)`: Age after which GPS readings are marked stale (default: 300s).
  - `Max Acceptable GPS Accuracy (meters)`: Worst-case GPS accuracy tolerated for planning (default: 750m).
- **Frontend:** [`frontend/src/app/settings/page.tsx:L1-L220`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/app/settings/page.tsx)
- **Backend Reference:** [`backend/app/config.py:L84-L90`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/config.py#L84-L90)
  ```python
  GEOFENCE_RADIUS_METERS: float = 100.0
  LOCATION_STALE_THRESHOLD_SECONDS: int = 300
  MAX_ACCEPTABLE_GPS_ACCURACY_METERS: float = 750.0
  ```

---

## 14. Authentication & Role-Based Access Control (`/login`, `/signup`)

### 14.1 Portal Authentication Form (`PortalAuthForm`)
- **What it shows:** Clean tabbed sign-in form for administrators and field agents with email, password, and session persistence.
- **Frontend:** [`frontend/src/components/PortalAuthForm.tsx:L1-L160`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/frontend/src/components/PortalAuthForm.tsx)
- **API Endpoint:** Supabase Auth `supabase.auth.signInWithPassword()` followed by `GET /api/v1/auth/me`.
- **Backend Handler:** [`backend/app/api/v1/auth.py:L193-L215`](file:///c:/Users/Anil/Desktop/Projects/FOS%20agent/FOS_agent/backend/app/api/v1/auth.py#L193-L215) (`get_current_user_profile`)
- **Calculation / Logic:**
  - Decodes Supabase JWT claims (`sub`, `email`, `role`).
  - Matches `profiles.id == JWT.sub`.
  - Directs `role == 'admin'` $\rightarrow$ `/admin/dashboard`.
  - Directs `role == 'agent'` $\rightarrow$ `/agent/dashboard`.

---

## 15. Master Calculation & Formula Reference

| Metric / Feature | Mathematical Formula | Real Number Example | Primary Library |
| :--- | :--- | :--- | :--- |
| **Haversine Distance** | $d = 2R \arcsin\left(\sqrt{\sin^2\frac{\Delta\phi}{2} + \cos\phi_1\cos\phi_2\sin^2\frac{\Delta\lambda}{2}}\right)$ | $\text{Bandra to Kurla} = 5,420\text{ meters}$ | Python `math` / JS `Math` |
| **Geofence Policy** | $\text{Is Verified} \iff d(\text{Agent}, \text{Customer}) \le 100\text{m}$ | $68\text{m} \le 100\text{m} \rightarrow \text{PASSED}$ | PostGIS / Python `agent.py` |
| **Completion Rate** | $\text{Rate} = \left(\frac{\text{Completed Visits}}{\text{Scheduled Visits}}\right) \times 100$ | $\frac{8}{10} \times 100 = 80.0\%$ | PostgreSQL `func.count` |
| **Avg GPS Accuracy** | $\text{Avg} = \frac{\sum \text{accuracy\_meters}}{N}$ | $\frac{12 + 14 + 16}{3} = \pm 14.0\text{m}$ | PostgreSQL `func.avg` |
| **Greedy TSP Routing** | $j^* = \arg\min_{j \in \text{Unvisited}} \text{OSRM\_Duration}(i, j)$ | Selects 8 min stop over 45 min stop | OSRM Table API + `httpx` |
| **GPS Freshness** | $\text{Is Live} \iff (T_{\text{now}} - T_{\text{update}}) \le 300\text{s}$ | $120\text{s} \le 300\text{s} \rightarrow \text{Pulsing Green}$ | JavaScript `Date.now()` |
| **Battery Gauge Color** | $\ge 50\% \rightarrow \text{Green}, 20-49\% \rightarrow \text{Amber}, <20\% \rightarrow \text{Red}$ | $78\% \rightarrow \text{Emerald Green}$ | Tailwind CSS classes |

---

## 16. Complete Technical Stack Summary

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide React Icons.
- **Mapping & GIS:** Leaflet 1.9.4, OpenStreetMap Carto Tiles, OpenStreetMap Nominatim Geocoding, OSRM Road Routing Engine.
- **Backend Framework:** FastAPI (Python 3.11+), Pydantic V2, Uvicorn, HTTPX Async.
- **Database & Spatial:** PostgreSQL 15+, PostGIS Spatial Engine, SQLAlchemy 2.0 Asyncio, GeoAlchemy2, Alembic Migrations.
- **Security & Identity:** Supabase Auth (JWT ES256/RS256 verification), Role-Based Access Control (`require_admin`, `require_agent`).

*(End of Feature Map — Ready for executive review and operational audit.)*
