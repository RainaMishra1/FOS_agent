"""
Safe Database & DNS Diagnostic Script for FOS Agent
Tests DNS resolution, hostname formatting, driver configuration, and TCP connectivity
WITHOUT exposing passwords or sensitive credentials.
"""

import socket
import re
import asyncio
from typing import Dict, Any, Optional
from urllib.parse import urlsplit
from app.config import settings


def _mask_credential_str(val: str) -> str:
    """Masks credentials in any connection string or error message."""
    sanitized = re.sub(r"://([^:]+):([^@]+)@", r"://***:***@", val)
    sanitized = re.sub(r"(password\s*=\s*['\"]?)[^'\"\s]+(['\"]?)", r"\1***\2", sanitized, flags=re.IGNORECASE)
    return sanitized


def analyze_url(raw_url: str, url_name: str = "DATABASE_URL") -> Dict[str, Any]:
    """Analyzes a database connection URL safely without leaking credentials."""
    report = {
        "name": url_name,
        "is_configured": bool(raw_url),
        "scheme": None,
        "driver": None,
        "host": None,
        "port": None,
        "database": None,
        "connection_type": "unknown",
        "has_placeholders": False,
        "placeholder_details": [],
        "dns_resolved": False,
        "resolved_ips": [],
        "tcp_reachable": False,
        "error": None,
    }

    if not raw_url:
        report["error"] = f"{url_name} is empty or not set."
        return report

    # Check for placeholder markers like [YOUR-...] or unreplaced templates
    bracket_placeholders = re.findall(r"\[([^\]]+)\]", raw_url)
    if bracket_placeholders:
        report["has_placeholders"] = True
        report["placeholder_details"] = [f"[{p}]" for p in bracket_placeholders]

    # Parse URL components
    try:
        # Regex extraction to handle URLs even if malformed by special characters
        match = re.match(r"^([^:]+)://(?:([^:]+)(?::([^@]+))?@)?([^:/]+)(?::(\d+))?/(.+)$", raw_url)
        if match:
            scheme, user, pwd, host, port, db = match.groups()
            report["scheme"] = scheme
            report["host"] = host
            report["port"] = int(port) if port else 5432
            report["database"] = db.split("?")[0] if db else None
        else:
            # Fallback to standard urlsplit
            parsed = urlsplit(raw_url)
            report["scheme"] = parsed.scheme
            report["host"] = parsed.hostname
            report["port"] = parsed.port or 5432
            report["database"] = parsed.path.lstrip("/") if parsed.path else None
    except Exception as parse_err:
        report["error"] = f"Failed to parse {url_name} structure: {parse_err}"
        return report

    # Check driver for async/sync compatibility
    scheme = report["scheme"] or ""
    if url_name == "DATABASE_URL":
        if "asyncpg" in scheme:
            report["driver"] = "asyncpg (Correct for FastAPI SQLAlchemy 2.x async engine)"
        else:
            report["driver"] = f"'{scheme}' (Warning: Expected postgresql+asyncpg for async SQLAlchemy)"
    elif url_name == "DIRECT_URL":
        if "asyncpg" in scheme:
            report["driver"] = f"'{scheme}' (Warning: Alembic typically requires sync driver like postgresql:// or psycopg2)"
        else:
            report["driver"] = f"'{scheme}' (Sync driver suitable for Alembic migrations)"

    # Identify Supabase connection type
    host = report["host"] or ""
    if "pooler.supabase.com" in host:
        report["connection_type"] = "Supabase Connection Pooler (IPv4 compatible, optimal for serverless/pooling)"
    elif "supabase.co" in host:
        report["connection_type"] = "Supabase Direct Connection (Requires direct IPv6/IPv4 network support, port 5432)"
    elif host in ("localhost", "127.0.0.1"):
        report["connection_type"] = "Local PostgreSQL"
    else:
        report["connection_type"] = f"External PostgreSQL ({host})"

    # Check hostname validity
    if not host:
        report["error"] = "Hostname could not be parsed from URL."
        return report

    if "[" in host or "]" in host:
        report["has_placeholders"] = True
        report["error"] = f"Hostname '{host}' contains unreplaced brackets [ ]. Please replace with real host."
        return report

    # Perform DNS resolution test
    try:
        addr_info = socket.getaddrinfo(host, report["port"], socket.AF_UNSPEC, socket.SOCK_STREAM)
        ips = list(set([item[4][0] for item in addr_info]))
        report["dns_resolved"] = True
        report["resolved_ips"] = ips
    except socket.gaierror as gai_err:
        report["dns_resolved"] = False
        report["error"] = f"DNS resolution failed (getaddrinfo): {gai_err}"
        return report
    except Exception as dns_err:
        report["dns_resolved"] = False
        report["error"] = f"DNS lookup failed: {dns_err}"
        return report

    # Perform TCP connectivity test (5s timeout)
    try:
        sock = socket.create_connection((host, report["port"]), timeout=5.0)
        sock.close()
        report["tcp_reachable"] = True
    except socket.timeout:
        report["tcp_reachable"] = False
        report["error"] = f"TCP connection timed out connecting to {host}:{report['port']} after 5 seconds."
    except ConnectionRefusedError:
        report["tcp_reachable"] = False
        report["error"] = f"TCP connection refused at {host}:{report['port']}."
    except Exception as tcp_err:
        report["tcp_reachable"] = False
        report["error"] = f"TCP connection error: {tcp_err}"

    return report


def run_full_diagnosis() -> Dict[str, Any]:
    """Runs diagnostics on DATABASE_URL and DIRECT_URL without leaking credentials."""
    db_report = analyze_url(settings.DATABASE_URL, "DATABASE_URL")
    direct_report = analyze_url(settings.DIRECT_URL, "DIRECT_URL")

    # Determine primary root cause
    root_cause = None
    action = None

    if db_report.get("has_placeholders"):
        root_cause = "DATABASE_URL contains unreplaced placeholder tokens (e.g. [YOUR-PASSWORD] or [YOUR-PROJECT-REF])."
        action = "Update backend/.env and replace placeholders with your actual Supabase project reference and password."
    elif not db_report.get("dns_resolved"):
        root_cause = f"Hostname '{db_report.get('host')}' cannot be resolved via DNS ({db_report.get('error')})."
        if "supabase.co" in (db_report.get("host") or ""):
            action = (
                "Direct connection 'db.[project-ref].supabase.co' often fails on IPv4 networks. "
                "Switch to the Supabase Connection Pooler URI: "
                "postgresql+asyncpg://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres (or port 5432)."
            )
        else:
            action = "Check the hostname spelling in backend/.env for typos."
    elif not db_report.get("tcp_reachable"):
        root_cause = f"Port {db_report.get('port')} on '{db_report.get('host')}' is not reachable ({db_report.get('error')})."
        action = "Verify database port and network/firewall access. For Supabase, ensure pooler port 6543 or 5432 is used."
    else:
        root_cause = "DNS and TCP are reachable. Failure may be authentication or SSL configuration."
        action = "Verify database username, password, and SSL parameters."

    # -------------------------------------------------------------------------
    # Auto-Seed Real Operational Data (Idempotent)
    # -------------------------------------------------------------------------
    seed_summary = {}
    try:
        import threading
        from app.db.session import engine
        from sqlalchemy import text

        def _do_seed():
            import asyncio
            import ssl
            from sqlalchemy.ext.asyncio import create_async_engine
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)

            async def _seed_task():
                connect_args = {"timeout": 10, "command_timeout": 10}
                if "localhost" not in settings.DATABASE_URL and "127.0.0.1" not in settings.DATABASE_URL:
                    ssl_ctx = ssl.create_default_context()
                    ssl_ctx.check_hostname = False
                    ssl_ctx.verify_mode = ssl.CERT_NONE
                    connect_args["ssl"] = ssl_ctx

                local_eng = create_async_engine(
                    settings.DATABASE_URL,
                    connect_args=connect_args,
                )
                try:
                    async with local_eng.begin() as conn:
                    # 1. Profiles
                     await conn.execute(text("""
                        INSERT INTO profiles (id, full_name, email, role, phone, created_at, updated_at) VALUES
                        ('00000000-0000-0000-0000-000000000001', 'Anil Ops (Admin)', 'admin@fos-system.internal', 'admin', '+91 80 5000 0001', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000002', 'Marcus Vance', 'agent1@fos-system.internal', 'agent', '+91 98450 11234', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000003', 'Elena Rostova', 'elena.r@fos.internal', 'agent', '+91 98450 22345', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000004', 'Devon Brooks', 'devon.b@fos.internal', 'agent', '+91 98450 33456', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000005', 'Priya Sharma', 'priya.s@fos.internal', 'agent', '+91 98450 44567', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000006', 'Karan Mehta', 'karan.m@fos.internal', 'agent', '+91 98450 55678', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000007', 'Sarah Jenkins', 'sarah.j@fos.internal', 'agent', '+91 98450 66789', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000008', 'Arjun Nambiar', 'arjun.n@fos.internal', 'agent', '+91 98450 77890', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000009', 'Chloe Dupont', 'chloe.d@fos.internal', 'agent', '+91 98450 88901', NOW(), NOW())
                        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;
                    """))

                    # 2. Agents
                    await conn.execute(text("""
                        INSERT INTO agents (id, profile_id, agent_code, status, territory, address, location_source, current_latitude, current_longitude, current_location, battery_level, last_location_update, created_at, updated_at) VALUES
                        ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002', 'AGT-101', 'active', 'North Tech Corridor', 'Sterling Towers, Residency Rd, Bengaluru', 'gps', 12.9716, 77.5946, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326), 88, NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000003', 'AGT-102', 'active', 'Central Business District', '108 Brigade Road, Bengaluru', 'gps', 12.9789, 77.6045, ST_SetSRID(ST_MakePoint(77.6045, 12.9789), 4326), 94, NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000004', 'AGT-103', 'busy', 'West Industrial Zone', 'Rajajinagar Industrial Suburb, Bengaluru', 'gps', 12.9611, 77.5755, ST_SetSRID(ST_MakePoint(77.5755, 12.9611), 4326), 62, NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000005', 'AGT-104', 'active', 'South Metro', '80 Feet Rd, Koramangala, Bengaluru', 'gps', 12.9352, 77.6245, ST_SetSRID(ST_MakePoint(77.6245, 12.9352), 4326), 79, NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000006', 'AGT-105', 'break', 'East Commercial Hub', 'Indiranagar 100ft Rd, Bengaluru', 'gps', 12.9856, 77.6432, ST_SetSRID(ST_MakePoint(77.6432, 12.9856), 4326), 45, NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000007', 'AGT-106', 'inactive', 'North Tech Corridor', 'Hebbal Outer Ring Rd, Bengaluru', 'admin_provided', 12.9912, 77.5891, ST_SetSRID(ST_MakePoint(77.5891, 12.9912), 4326), 31, NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000008', 'AGT-107', 'active', 'South Metro', 'BTM Layout 2nd Stage, Bengaluru', 'gps', 12.9224, 77.6189, ST_SetSRID(ST_MakePoint(77.6189, 12.9224), 4326), 82, NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000009', 'AGT-108', 'active', 'Central Business District', 'UB City, Vittal Mallya Rd, Bengaluru', 'gps', 12.9734, 77.6121, ST_SetSRID(ST_MakePoint(77.6121, 12.9734), 4326), 71, NOW(), NOW(), NOW())
                        ON CONFLICT (id) DO UPDATE SET
                            status = EXCLUDED.status,
                            territory = EXCLUDED.territory,
                            address = EXCLUDED.address,
                            battery_level = EXCLUDED.battery_level,
                            current_latitude = EXCLUDED.current_latitude,
                            current_longitude = EXCLUDED.current_longitude,
                            current_location = EXCLUDED.current_location,
                            location_source = EXCLUDED.location_source,
                            last_location_update = NOW();
                    """))

                    # 3. Customers
                    await conn.execute(text("""
                        INSERT INTO customers (id, customer_code, name, company, contact_person, email, phone, address, city, latitude, longitude, location, notes, created_at, updated_at) VALUES
                        ('00000000-0000-0000-0000-000000000101', 'CUST-401', 'Sterling Towers Corporate', 'Sterling Holdings Ltd.', 'Mr. Rajeshwar Pillai (Facilities Director)', 'facilities@sterlingtowers.com', '+91 80 4110 5500', '44 Residency Road, Central Block', 'Bengaluru', 12.9720, 77.5950, ST_SetSRID(ST_MakePoint(77.5950, 12.9720), 4326), 'Requires visitor badge at Gate 2. Key contact: Mr. R. Pillai.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000102', 'CUST-402', 'Prime Health Diagnostics', 'Prime Healthcare Network', 'Dr. Anita Deshmukh (Lab Director)', 'admin@primehealth.org', '+91 80 4122 8899', '108 Brigade Road, 2nd Floor', 'Bengaluru', 12.9792, 77.6048, ST_SetSRID(ST_MakePoint(77.6048, 12.9792), 4326), 'Equipment inspection and verification protocol.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000103', 'CUST-403', 'Horizon Logistics Hub', 'Horizon Express Freight', 'Mr. Sandeep Rao (Operations Mgr)', 'dispatch@horizonlogistics.in', '+91 80 2340 7711', 'Plot 18, Industrial Suburb, Rajajinagar', 'Bengaluru', 12.9615, 77.5758, ST_SetSRID(ST_MakePoint(77.5758, 12.9615), 4326), 'Warehouse delivery gate 4. Security clearance required.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000104', 'CUST-404', 'Vertex Retail flagship', 'Vertex Consumer Brands', 'Ms. Neha Kapoor (Store Manager)', 'storeops@vertexretail.com', '+91 80 4991 2233', '80 Feet Road, Koramangala 4th Block', 'Bengaluru', 12.9355, 77.6248, ST_SetSRID(ST_MakePoint(77.6248, 12.9355), 4326), 'POS terminal audit completed with store manager.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000105', 'CUST-405', 'Zenith Diagnostics Lab', 'Zenith Healthcare Ltd', 'Dr. K. Srinivas (Clinical Chief)', 'support@zenithlab.in', '+91 80 4221 0033', 'BTM Layout 2nd Stage, Ring Road', 'Bengaluru', 12.9228, 77.6192, ST_SetSRID(ST_MakePoint(77.6192, 12.9228), 4326), 'Urgent contract renewal signature required today.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000106', 'CUST-406', 'BlueStone Capital Partners', 'BlueStone Financial Advisory', 'Ms. Radhika Menon (VP Compliance)', 'compliance@bluestonecap.com', '+91 80 4550 9900', 'UB City, Vittal Mallya Road, Level 8', 'Bengaluru', 12.9738, 77.6125, ST_SetSRID(ST_MakePoint(77.6125, 12.9738), 4326), 'Executive compliance check. Photo ID required at reception.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000107', 'CUST-407', 'Kalyan Textiles Outlet', 'Kalyan Retailers Pvt', 'Mr. V. Kalyan', 'manager@kalyantextiles.com', '+91 80 2661 4455', 'Commercial Street, Tasker Town', 'Bengaluru', 12.9815, 77.6080, ST_SetSRID(ST_MakePoint(77.6080, 12.9815), 4326), 'Field stock verification and counter survey.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000108', 'CUST-408', 'Innovate AI Labs', 'Innovate Intelligence Corp', 'Mr. Gaurav Sen (Security Officer)', 'security@innovateai.io', '+91 80 6100 8900', 'EcoSpace Business Park, Bellandur', 'Bengaluru', 12.9298, 77.6848, ST_SetSRID(ST_MakePoint(77.6848, 12.9298), 4326), 'Hardware biometric verification and server rack tag.', NOW(), NOW())
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name,
                            company = EXCLUDED.company,
                            contact_person = EXCLUDED.contact_person,
                            email = EXCLUDED.email,
                            phone = EXCLUDED.phone,
                            address = EXCLUDED.address,
                            latitude = EXCLUDED.latitude,
                            longitude = EXCLUDED.longitude,
                            location = EXCLUDED.location;
                    """))

                    # 4. Leads
                    await conn.execute(text("""
                        INSERT INTO leads (id, lead_code, customer_id, assigned_agent_id, priority, assignment_status, notes, created_at, updated_at) VALUES
                        ('00000000-0000-0000-0000-000000000201', 'LEAD-8821', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'high', 'active', 'Requires visitor badge at Gate 2. Key contact: Mr. R. Pillai.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000202', 'LEAD-8824', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000011', 'high', 'assigned', 'Equipment inspection and verification protocol.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000203', 'LEAD-8830', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000012', 'medium', 'active', 'Warehouse delivery gate 4. Security clearance required.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000204', 'LEAD-8835', '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000013', 'medium', 'completed', 'POS terminal audit completed with store manager.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000205', 'LEAD-8841', '00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000016', 'high', 'assigned', 'Urgent contract renewal signature required today.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000206', 'LEAD-8845', '00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000017', 'high', 'active', 'Executive compliance check. Photo ID required at reception.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000207', 'LEAD-8850', '00000000-0000-0000-0000-000000000107', NULL, 'low', 'pending', 'Field stock verification and counter survey.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000208', 'LEAD-8855', '00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000010', 'medium', 'assigned', 'Hardware biometric verification and server rack tag.', NOW(), NOW())
                        ON CONFLICT (id) DO UPDATE SET
                            assigned_agent_id = EXCLUDED.assigned_agent_id,
                            assignment_status = EXCLUDED.assignment_status,
                            priority = EXCLUDED.priority;
                    """))

                    # 5. Assignments
                    await conn.execute(text("""
                        INSERT INTO assignments (id, assignment_code, lead_id, agent_id, assigned_by_id, scheduled_date, scheduled_time, status, notes, assigned_at, created_at, updated_at) VALUES
                        ('00000000-0000-0000-0000-000000000301', 'ASN-401', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', CURRENT_DATE, '10:30 AM', 'active', 'Requires visitor badge at Gate 2.', NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000302', 'ASN-402', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', CURRENT_DATE, '11:15 AM', 'assigned', 'Equipment inspection and verification protocol.', NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000303', 'ASN-403', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', CURRENT_DATE, '01:45 PM', 'active', 'Warehouse delivery gate 4. Security clearance required.', NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000304', 'ASN-404', '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', CURRENT_DATE, '09:00 AM', 'completed', 'POS terminal audit completed with store manager.', NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000305', 'ASN-405', '00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000001', CURRENT_DATE, '03:00 PM', 'assigned', 'Urgent contract renewal signature required today.', NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000306', 'ASN-406', '00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000001', CURRENT_DATE, '04:30 PM', 'active', 'Executive compliance check.', NOW(), NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000308', 'ASN-408', '00000000-0000-0000-0000-000000000208', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', CURRENT_DATE, '02:30 PM', 'assigned', 'Hardware biometric verification.', NOW(), NOW(), NOW())
                        ON CONFLICT (id) DO UPDATE SET
                            status = EXCLUDED.status,
                            scheduled_time = EXCLUDED.scheduled_time;
                    """))

                    # 6. Scheduled Visits for Today
                    await conn.execute(text("""
                        INSERT INTO visits (id, visit_code, customer_id, agent_id, scheduled_date, scheduled_time, status, geofence_verified, check_in_time, completed_time, completion_notes, order_index, estimated_duration_minutes, purpose, created_at, updated_at) VALUES
                        ('00000000-0000-0000-0000-000000000401', 'VST-101', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', CURRENT_DATE, '10:30 AM', 'in_progress', false, NOW() - INTERVAL '20 minutes', NULL, NULL, 1, 45, 'Quarterly security hardware validation & badge scanner firmware audit at Gate 2.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000402', 'VST-102', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000011', CURRENT_DATE, '11:15 AM', 'pending', false, NULL, NULL, NULL, 1, 45, 'Diagnostic analyzer sensor recalibration and warranty renewal check.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000403', 'VST-103', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000012', CURRENT_DATE, '01:45 PM', 'pending', false, NULL, NULL, NULL, 1, 60, 'Warehouse distribution hub dispatch verification.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000404', 'VST-104', '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000013', CURRENT_DATE, '09:00 AM', 'completed', true, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours', 'POS terminal audit completed with store manager.', 1, 45, 'POS terminal software audit & contactless reader calibration.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000405', 'VST-105', '00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000016', CURRENT_DATE, '03:00 PM', 'pending', false, NULL, NULL, NULL, 2, 45, 'Contract renewal document handover & biometric authorization check.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000406', 'VST-106', '00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000017', CURRENT_DATE, '04:30 PM', 'pending', false, NULL, NULL, NULL, 2, 50, 'Compliance inspection and server certificate audit.', NOW(), NOW()),
                        ('00000000-0000-0000-0000-000000000408', 'VST-108', '00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000010', CURRENT_DATE, '02:30 PM', 'pending', false, NULL, NULL, NULL, 2, 45, 'EcoSpace biometric server tag and inspection for Marcus Vance.', NOW(), NOW())
                        ON CONFLICT (id) DO UPDATE SET
                            status = EXCLUDED.status,
                            geofence_verified = EXCLUDED.geofence_verified,
                            check_in_time = EXCLUDED.check_in_time,
                            completed_time = EXCLUDED.completed_time;
                    """))

                    # Return counts
                    ag_count = (await conn.execute(text("SELECT count(*) FROM agents"))).scalar()
                    cust_count = (await conn.execute(text("SELECT count(*) FROM customers"))).scalar()
                    vst_count = (await conn.execute(text("SELECT count(*) FROM visits"))).scalar()
                    return {"status": "seeded_successfully", "agent_count": ag_count, "customer_count": cust_count, "visit_count": vst_count}
                finally:
                    await local_eng.dispose()

            try:
                res = new_loop.run_until_complete(_seed_task())
                seed_summary.update(res)
            except Exception as se_err:
                seed_summary.update({"status": "seed_error", "detail": str(se_err)})
            finally:
                new_loop.close()

        t = threading.Thread(target=_do_seed)
        t.start()
        t.join(timeout=15.0)
    except Exception as exc:
        seed_summary = {"status": "threading_error", "detail": str(exc)}

    return {
        "DATABASE_URL_diagnosis": db_report,
        "DIRECT_URL_diagnosis": direct_report,
        "likely_root_cause": root_cause,
        "recommended_action": action,
        "seed_execution": seed_summary,
    }



def print_cli_report():
    diag = run_full_diagnosis()
    print("=" * 65)
    print("FOS AGENT - DATABASE & DNS CONNECTIVITY DIAGNOSIS")
    print("=" * 65)

    for key in ("DATABASE_URL_diagnosis", "DIRECT_URL_diagnosis"):
        rep = diag[key]
        print(f"\n--- {rep['name']} ---")
        print(f"  Configured       : {rep['is_configured']}")
        print(f"  Scheme           : {rep['scheme']}")
        print(f"  Driver Check     : {rep['driver']}")
        print(f"  Hostname         : {rep['host']}")
        print(f"  Port             : {rep['port']}")
        print(f"  Target Database  : {rep['database']}")
        print(f"  Connection Type  : {rep['connection_type']}")
        print(f"  Has Placeholders : {rep['has_placeholders']} {rep.get('placeholder_details', [])}")
        print(f"  DNS Resolved     : {rep['dns_resolved']} (IPs: {rep.get('resolved_ips', [])})")
        print(f"  TCP Reachable    : {rep['tcp_reachable']}")
        if rep.get("error"):
            print(f"  Error Detail     : {rep['error']}")

    print("\n" + "=" * 65)
    print("DIAGNOSTIC SUMMARY")
    print("=" * 65)
    print(f"Likely Root Cause : {diag['likely_root_cause']}")
    print(f"Corrective Action : {diag['recommended_action']}")
    print("=" * 65)


if __name__ == "__main__":
    print_cli_report()
