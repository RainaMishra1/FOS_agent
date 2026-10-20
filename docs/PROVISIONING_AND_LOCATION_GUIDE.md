# FOS Enterprise: Real Agent Login & GPS Location Workflow

## 1. Authentication & Role-Based Access Control (Part A)

### Overview
FOS Enterprise authenticates all users strictly through **Supabase Auth** tokens and enforces role-based access control via FastAPI backend verification against the PostgreSQL database.

### Quick Test Accounts Inspection
- The quick test buttons on the login screen pre-fill standard credentials (`admin@fos-system.internal` and `agent1@fos-system.internal`).
- Quick test accounts **are not hardcoded or mocked in the frontend**. If a quick test user is not yet created in the Supabase Auth project, Supabase returns `Invalid login credentials`.
- The application displays a clear setup message explaining that the user must be provisioned in the Supabase Auth dashboard or via the admin CLI.
- No secrets, JWT secrets, or service-role keys are ever exposed in client-side code.

### Secure Provisioning Workflow
To securely provision new Administrators or Field Agents without exposing credentials:

#### Option 1: Using the Backend Provisioning CLI
Run the secure server-side provisioning script:
```bash
# Provision a Field Agent linked to Profile and Agent records
python backend/scripts/provision_account.py \
  --email agent1@fos-system.internal \
  --password "YourSecurePassword123!" \
  --name "Marcus Vance" \
  --role agent \
  --code AGT-101 \
  --territory "Koramangala Zone"

# Provision an Administrator
python backend/scripts/provision_account.py \
  --email admin@fos-system.internal \
  --password "AdminSecurePassword123!" \
  --name "Operations Admin" \
  --role admin
```

#### Option 2: Using the Supabase Dashboard & FOS Admin UI
1. **Create Supabase Auth User**: Open **Supabase Dashboard > Authentication > Users > Add User**. Create the user with the work email and password.
2. **Link Agent in FOS**: Log in as an Administrator in FOS, navigate to **Field Agents**, and click **Add New Agent**. Enter the same email, agent code, and territory. FOS creates and links the `Profile` and `Agent` records in the database.

### Role Redirection & Route Isolation
- Upon successful authentication, the frontend invokes `GET /api/v1/auth/me` with the verified Bearer token.
- **Administrators (`role="admin"`)** are redirected to the Operations Overview (`/`).
- **Field Agents (`role="agent"`)** are redirected to the Mobile Agent Portal (`/agent/dashboard`).
- **Strict Route & API Isolation**:
  - `AppShell.tsx` detects if an authenticated user with `role="agent"` accesses admin pages (`/`, `/agents`, `/map`, `/customers`, etc.) and immediately redirects to `/agent/dashboard`.
  - All admin backend routes enforce `require_admin`. Even if an agent manipulates frontend code, FastAPI responds with `403 Forbidden`.

---

## 2. Agent GPS Auto-Detection & Location Workflow (Part B)

### Location Section Features (`AgentLocationSection.tsx`)
1. **Detect My Location**:
   - Geolocation permission is requested **only** after the agent clicks "Detect My Location".
   - Uses `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true`, `timeout: 15000`, and `maximumAge: 0`.
   - Displays detected latitude and longitude as editable fields.
   - Displays GPS accuracy in metres (e.g. `±12m`), capture timestamp, and a `GPS Detected` status badge.
   - Clarifies that HTTPS is required in production and browser permission must be granted.

2. **Manual Fallback**:
   - If location access is denied or unavailable, agents can enter coordinates manually.
   - Live validation ensures latitude is between -90.0 and 90.0, and longitude is between -180.0 and 180.0.
   - Both coordinates are required together.
   - Clearly labeled as `Manual Entry • Unverified`.
   - A button is provided to easily switch back or retry automatic GPS detection.

3. **Live Leaflet Map Preview**:
   - Renders OpenStreetMap tiles with custom markers.
   - The pin dynamically updates when coordinates change (via GPS auto-detection or manual editing).
   - Exact latitude and longitude are formatted and displayed.
   - Includes a "Center Marker" button to focus the viewport.
   - Gracefully handles offline or network failures.

4. **Location Persistence (`PATCH /api/v1/agent/me/location`)**:
   - Derives agent identity strictly from the verified JWT token (`current_user.agent`).
   - Server validates coordinate bounds (-90 to 90, -180 to 180).
   - Stores `location_source` as `gps` or `manual`.
   - Manual entries force `gps_accuracy = None` so they never masquerade as GPS readings.
   - Logs breadcrumb telemetry to `agent_locations` table.
   - Shows confirmation banner only after persistence is verified by the backend.
   - On page reload, the database coordinates and sync status are retrieved and displayed.

5. **Security & Geofencing**:
   - All location endpoints are authenticated and restricted to `require_agent`.
   - In `PATCH /api/v1/agent/visits/{visit_id}/status`, `geofence_verified` requires `agent.location_source == "gps"`.
   - Manual coordinates are saved for operational reference, but **never** satisfy server-side geofencing.

6. **Continuous Tracking Readiness**:
   - Initial detection is kept explicitly separate from continuous tracking.
   - The UI clearly indicates that continuous background tracking is inactive, maintaining architectural readiness for subsequent real-time streaming phases.
