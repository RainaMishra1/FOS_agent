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

    return {
        "DATABASE_URL_diagnosis": db_report,
        "DIRECT_URL_diagnosis": direct_report,
        "likely_root_cause": root_cause,
        "recommended_action": action,
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
