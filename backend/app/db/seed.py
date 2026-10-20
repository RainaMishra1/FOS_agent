import uuid
from datetime import date, datetime, timezone, timedelta
from sqlalchemy import select, func, text, or_
from geoalchemy2.elements import WKTElement

from app.db.session import async_session_factory as AsyncSessionLocal
from app.models.profile import Profile
from app.models.agent import Agent
from app.models.customer import Customer
from app.models.lead import Lead
from app.models.assignment import Assignment
from app.models.visit import Visit


ADMIN_PROFILE_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
AGENT_1_PROFILE_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
AGENT_1_ID = uuid.UUID("00000000-0000-0000-0000-000000000010")


REAL_AGENTS = [
    {
        "agent_id": uuid.UUID("00000000-0000-0000-0000-000000000010"),
        "profile_id": AGENT_1_PROFILE_ID,
        "name": "Marcus Vance",
        "email": "agent1@fos-system.internal",
        "phone": "+91 98450 11234",
        "agent_code": "AGT-101",
        "status": "active",
        "territory": "North Tech Corridor",
        "address": "Sterling Towers, Residency Rd, Bengaluru",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "battery_level": 88,
        "location_source": "gps",
    },
    {
        "agent_id": uuid.UUID("00000000-0000-0000-0000-000000000011"),
        "profile_id": uuid.UUID("00000000-0000-0000-0000-000000000003"),
        "name": "Elena Rostova",
        "email": "elena.r@fos.internal",
        "phone": "+91 98450 22345",
        "agent_code": "AGT-102",
        "status": "active",
        "territory": "Central Business District",
        "address": "108 Brigade Road, Bengaluru",
        "latitude": 12.9789,
        "longitude": 77.6045,
        "battery_level": 94,
        "location_source": "gps",
    },
    {
        "agent_id": uuid.UUID("00000000-0000-0000-0000-000000000012"),
        "profile_id": uuid.UUID("00000000-0000-0000-0000-000000000004"),
        "name": "Devon Brooks",
        "email": "devon.b@fos.internal",
        "phone": "+91 98450 33456",
        "agent_code": "AGT-103",
        "status": "busy",
        "territory": "West Industrial Zone",
        "address": "Rajajinagar Industrial Suburb, Bengaluru",
        "latitude": 12.9611,
        "longitude": 77.5755,
        "battery_level": 62,
        "location_source": "gps",
    },
    {
        "agent_id": uuid.UUID("00000000-0000-0000-0000-000000000013"),
        "profile_id": uuid.UUID("00000000-0000-0000-0000-000000000005"),
        "name": "Priya Sharma",
        "email": "priya.s@fos.internal",
        "phone": "+91 98450 44567",
        "agent_code": "AGT-104",
        "status": "active",
        "territory": "South Metro",
        "address": "80 Feet Rd, Koramangala, Bengaluru",
        "latitude": 12.9352,
        "longitude": 77.6245,
        "battery_level": 79,
        "location_source": "gps",
    },
    {
        "agent_id": uuid.UUID("00000000-0000-0000-0000-000000000014"),
        "profile_id": uuid.UUID("00000000-0000-0000-0000-000000000006"),
        "name": "Karan Mehta",
        "email": "karan.m@fos.internal",
        "phone": "+91 98450 55678",
        "agent_code": "AGT-105",
        "status": "break",
        "territory": "East Commercial Hub",
        "address": "Indiranagar 100ft Rd, Bengaluru",
        "latitude": 12.9856,
        "longitude": 77.6432,
        "battery_level": 45,
        "location_source": "gps",
    },
    {
        "agent_id": uuid.UUID("00000000-0000-0000-0000-000000000015"),
        "profile_id": uuid.UUID("00000000-0000-0000-0000-000000000007"),
        "name": "Sarah Jenkins",
        "email": "sarah.j@fos.internal",
        "phone": "+91 98450 66789",
        "agent_code": "AGT-106",
        "status": "inactive",
        "territory": "North Tech Corridor",
        "address": "Hebbal Outer Ring Rd, Bengaluru",
        "latitude": 12.9912,
        "longitude": 77.5891,
        "battery_level": 31,
        "location_source": "admin_provided",
    },
    {
        "agent_id": uuid.UUID("00000000-0000-0000-0000-000000000016"),
        "profile_id": uuid.UUID("00000000-0000-0000-0000-000000000008"),
        "name": "Arjun Nambiar",
        "email": "arjun.n@fos.internal",
        "phone": "+91 98450 77890",
        "agent_code": "AGT-107",
        "status": "active",
        "territory": "South Metro",
        "address": "BTM Layout 2nd Stage, Bengaluru",
        "latitude": 12.9224,
        "longitude": 77.6189,
        "battery_level": 82,
        "location_source": "gps",
    },
    {
        "agent_id": uuid.UUID("00000000-0000-0000-0000-000000000017"),
        "profile_id": uuid.UUID("00000000-0000-0000-0000-000000000009"),
        "name": "Chloe Dupont",
        "email": "chloe.d@fos.internal",
        "phone": "+91 98450 88901",
        "agent_code": "AGT-108",
        "status": "active",
        "territory": "Central Business District",
        "address": "UB City, Vittal Mallya Rd, Bengaluru",
        "latitude": 12.9734,
        "longitude": 77.6121,
        "battery_level": 71,
        "location_source": "gps",
    },
]


REAL_CUSTOMERS = [
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000101"),
        "customer_code": "CUST-401",
        "name": "Sterling Towers Corporate",
        "company": "Sterling Holdings Ltd.",
        "contact_person": "Mr. Rajeshwar Pillai (Facilities Director)",
        "email": "facilities@sterlingtowers.com",
        "phone": "+91 80 4110 5500",
        "address": "44 Residency Road, Central Block",
        "city": "Bengaluru",
        "latitude": 12.9720,
        "longitude": 77.5950,
        "notes": "Requires visitor badge at Gate 2. Key contact: Mr. R. Pillai.",
        "lead_code": "LEAD-8821",
        "lead_priority": "high",
        "assigned_agent_id": uuid.UUID("00000000-0000-0000-0000-000000000010"),
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000102"),
        "customer_code": "CUST-402",
        "name": "Prime Health Diagnostics",
        "company": "Prime Healthcare Network",
        "contact_person": "Dr. Anita Deshmukh (Lab Director)",
        "email": "admin@primehealth.org",
        "phone": "+91 80 4122 8899",
        "address": "108 Brigade Road, 2nd Floor",
        "city": "Bengaluru",
        "latitude": 12.9792,
        "longitude": 77.6048,
        "notes": "Equipment inspection and verification protocol.",
        "lead_code": "LEAD-8824",
        "lead_priority": "high",
        "assigned_agent_id": uuid.UUID("00000000-0000-0000-0000-000000000011"),
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000103"),
        "customer_code": "CUST-403",
        "name": "Horizon Logistics Hub",
        "company": "Horizon Express Freight",
        "contact_person": "Mr. Sandeep Rao (Operations Mgr)",
        "email": "dispatch@horizonlogistics.in",
        "phone": "+91 80 2340 7711",
        "address": "Plot 18, Industrial Suburb, Rajajinagar",
        "city": "Bengaluru",
        "latitude": 12.9615,
        "longitude": 77.5758,
        "notes": "Warehouse delivery gate 4. Security clearance required.",
        "lead_code": "LEAD-8830",
        "lead_priority": "medium",
        "assigned_agent_id": uuid.UUID("00000000-0000-0000-0000-000000000012"),
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000104"),
        "customer_code": "CUST-404",
        "name": "Vertex Retail flagship",
        "company": "Vertex Consumer Brands",
        "contact_person": "Ms. Neha Kapoor (Store Manager)",
        "email": "storeops@vertexretail.com",
        "phone": "+91 80 4991 2233",
        "address": "80 Feet Road, Koramangala 4th Block",
        "city": "Bengaluru",
        "latitude": 12.9355,
        "longitude": 77.6248,
        "notes": "POS terminal audit completed with store manager.",
        "lead_code": "LEAD-8835",
        "lead_priority": "medium",
        "assigned_agent_id": uuid.UUID("00000000-0000-0000-0000-000000000013"),
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000105"),
        "customer_code": "CUST-405",
        "name": "Zenith Diagnostics Lab",
        "company": "Zenith Healthcare Ltd",
        "contact_person": "Dr. K. Srinivas (Clinical Chief)",
        "email": "support@zenithlab.in",
        "phone": "+91 80 4221 0033",
        "address": "BTM Layout 2nd Stage, Ring Road",
        "city": "Bengaluru",
        "latitude": 12.9228,
        "longitude": 77.6192,
        "notes": "Urgent contract renewal signature required today.",
        "lead_code": "LEAD-8841",
        "lead_priority": "high",
        "assigned_agent_id": uuid.UUID("00000000-0000-0000-0000-000000000016"),
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000106"),
        "customer_code": "CUST-406",
        "name": "BlueStone Capital Partners",
        "company": "BlueStone Financial Advisory",
        "contact_person": "Ms. Radhika Menon (VP Compliance)",
        "email": "compliance@bluestonecap.com",
        "phone": "+91 80 4550 9900",
        "address": "UB City, Vittal Mallya Road, Level 8",
        "city": "Bengaluru",
        "latitude": 12.9738,
        "longitude": 77.6125,
        "notes": "Executive compliance check. Photo ID required at reception.",
        "lead_code": "LEAD-8845",
        "lead_priority": "high",
        "assigned_agent_id": uuid.UUID("00000000-0000-0000-0000-000000000017"),
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000107"),
        "customer_code": "CUST-407",
        "name": "Kalyan Textiles Outlet",
        "company": "Kalyan Retailers Pvt",
        "contact_person": "Mr. V. Kalyan",
        "email": "manager@kalyantextiles.com",
        "phone": "+91 80 2661 4455",
        "address": "Commercial Street, Tasker Town",
        "city": "Bengaluru",
        "latitude": 12.9815,
        "longitude": 77.6080,
        "notes": "Field stock verification and counter survey.",
        "lead_code": "LEAD-8850",
        "lead_priority": "low",
        "assigned_agent_id": None,
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000108"),
        "customer_code": "CUST-408",
        "name": "Innovate AI Labs",
        "company": "Innovate Intelligence Corp",
        "contact_person": "Mr. Gaurav Sen (Security Officer)",
        "email": "security@innovateai.io",
        "phone": "+91 80 6100 8900",
        "address": "EcoSpace Business Park, Bellandur",
        "city": "Bengaluru",
        "latitude": 12.9298,
        "longitude": 77.6848,
        "notes": "Hardware biometric verification and server rack tag.",
        "lead_code": "LEAD-8855",
        "lead_priority": "medium",
        "assigned_agent_id": uuid.UUID("00000000-0000-0000-0000-000000000010"),
    },
]


async def seed_database_if_needed():
    """
    Seeds initial operational data (agents, profiles, customers, leads, visits, assignments)
    into PostgreSQL if agents table is empty. Idempotent and safe.
    """
    async with AsyncSessionLocal() as session:
        try:
            # Never rewrite or augment an operational database that already has
            # agent records. In particular, preserve saved coordinates and history.
            existing_agent_count = await session.scalar(select(func.count(Agent.id))) or 0
            if existing_agent_count > 0:
                await session.rollback()
                return {"status": "skipped_existing_agents", "agent_count": existing_agent_count}

            # 1. Seed or ensure Admin Profile exists only for an explicitly seeded empty DB.
            admin_prof = await session.get(Profile, ADMIN_PROFILE_ID)
            if not admin_prof:
                admin_prof = Profile(
                    id=ADMIN_PROFILE_ID,
                    full_name="Anil Ops (Admin)",
                    email="admin@fos-system.internal",
                    role="admin",
                    phone="+91 80 5000 0001",
                )
                session.add(admin_prof)

            # 3. Seed Agents and their Profiles
            agent_map = {}
            for ag_data in REAL_AGENTS:
                existing_p = await session.get(Profile, ag_data["profile_id"])
                if not existing_p:
                    existing_p = Profile(
                        id=ag_data["profile_id"],
                        full_name=ag_data["name"],
                        email=ag_data["email"],
                        role="agent",
                        phone=ag_data["phone"],
                    )
                    session.add(existing_p)

                ag_stmt = select(Agent).where(or_(Agent.id == ag_data["agent_id"], Agent.agent_code == ag_data["agent_code"]))
                existing_ag = (await session.execute(ag_stmt)).scalars().first()
                if existing_ag:
                    existing_ag.status = ag_data["status"]
                    existing_ag.territory = ag_data["territory"]
                    existing_ag.address = ag_data["address"]
                    existing_ag.location_source = ag_data["location_source"]
                    existing_ag.current_latitude = ag_data["latitude"]
                    existing_ag.current_longitude = ag_data["longitude"]
                    existing_ag.battery_level = ag_data["battery_level"]
                    existing_ag.current_location = WKTElement(f"POINT({ag_data['longitude']} {ag_data['latitude']})", srid=4326)
                    existing_ag.last_location_update = datetime.now(timezone.utc) - timedelta(minutes=5)
                else:
                    pt_wkt = f"POINT({ag_data['longitude']} {ag_data['latitude']})"
                    existing_ag = Agent(
                        id=ag_data["agent_id"],
                        profile_id=ag_data["profile_id"],
                        agent_code=ag_data["agent_code"],
                        status=ag_data["status"],
                        territory=ag_data["territory"],
                        address=ag_data["address"],
                        location_source=ag_data["location_source"],
                        current_latitude=ag_data["latitude"],
                        current_longitude=ag_data["longitude"],
                        current_location=WKTElement(pt_wkt, srid=4326),
                        battery_level=ag_data["battery_level"],
                        last_location_update=datetime.now(timezone.utc) - timedelta(minutes=5),
                    )
                    session.add(existing_ag)
                agent_map[ag_data["agent_code"]] = existing_ag

            await session.flush()

            # 4. Seed Customers & Leads
            today = datetime.now(timezone.utc).date()
            for c_data in REAL_CUSTOMERS:
                c_stmt = select(Customer).where(or_(Customer.id == c_data["id"], Customer.customer_code == c_data["customer_code"]))
                cust = (await session.execute(c_stmt)).scalars().first()
                if not cust:
                    cust_pt = f"POINT({c_data['longitude']} {c_data['latitude']})"
                    cust = Customer(
                        id=c_data["id"],
                        customer_code=c_data["customer_code"],
                        name=c_data["name"],
                        company=c_data["company"],
                        contact_person=c_data["contact_person"],
                        email=c_data["email"],
                        phone=c_data["phone"],
                        address=c_data["address"],
                        city=c_data["city"],
                        latitude=c_data["latitude"],
                        longitude=c_data["longitude"],
                        location=WKTElement(cust_pt, srid=4326),
                        notes=c_data["notes"],
                    )
                    session.add(cust)
                    await session.flush()

                # Associated Lead
                lead_stmt = select(Lead).where(Lead.customer_id == cust.id)
                lead_res = await session.execute(lead_stmt)
                lead = lead_res.scalars().first()
                if not lead:
                    lead = Lead(
                        id=uuid.uuid4(),
                        lead_code=c_data["lead_code"],
                        customer_id=cust.id,
                        assigned_agent_id=c_data["assigned_agent_id"],
                        priority=c_data["lead_priority"],
                        assignment_status="assigned" if c_data["assigned_agent_id"] else "pending",
                        notes=c_data["notes"],
                    )
                    session.add(lead)
                    await session.flush()

                # If assigned to an agent, create Assignment & Visit
                agent_code_lookup = {
                    "CUST-401": "AGT-101",
                    "CUST-402": "AGT-102",
                    "CUST-403": "AGT-103",
                    "CUST-404": "AGT-104",
                    "CUST-405": "AGT-107",
                    "CUST-406": "AGT-108",
                    "CUST-408": "AGT-101",
                }
                assigned_agent = agent_map.get(agent_code_lookup.get(c_data["customer_code"]))
                assigned_agent_id = assigned_agent.id if assigned_agent else c_data["assigned_agent_id"]

                if assigned_agent_id:
                    lead.assigned_agent_id = assigned_agent_id
                    asn_stmt = select(Assignment).where(Assignment.lead_id == lead.id)
                    asn = (await session.execute(asn_stmt)).scalars().first()
                    if not asn:
                        asn = Assignment(
                            id=uuid.uuid4(),
                            assignment_code=f"ASN-{c_data['customer_code'].replace('CUST-', '')}",
                            lead_id=lead.id,
                            agent_id=assigned_agent_id,
                            assigned_by_id=ADMIN_PROFILE_ID,
                            scheduled_date=today,
                            scheduled_time="10:30 AM",
                            status="active" if c_data["customer_code"] in ("CUST-401", "CUST-403") else "assigned",
                            notes=c_data["notes"],
                        )
                        session.add(asn)

                    # Scheduled Visit
                    vst_stmt = select(Visit).where(Visit.customer_id == cust.id, Visit.scheduled_date == today)
                    vst = (await session.execute(vst_stmt)).scalars().first()
                    if not vst:
                        status_val = "in_progress" if c_data["customer_code"] == "CUST-401" else (
                            "completed" if c_data["customer_code"] == "CUST-404" else "pending"
                        )
                        vst = Visit(
                            id=uuid.uuid4(),
                            visit_code=f"VST-{c_data['customer_code'].replace('CUST-', '')}",
                            customer_id=cust.id,
                            agent_id=assigned_agent_id,
                            scheduled_date=today,
                            scheduled_time="11:00 AM",
                            status=status_val,
                            geofence_verified=(status_val == "completed"),
                            order_index=1,
                            estimated_duration_minutes=45,
                            purpose=c_data["notes"] or "Field customer verification & inspection.",
                        )
                        if status_val == "in_progress":
                            vst.check_in_time = datetime.now(timezone.utc) - timedelta(minutes=20)
                        elif status_val == "completed":
                            vst.check_in_time = datetime.now(timezone.utc) - timedelta(hours=2)
                            vst.completed_time = datetime.now(timezone.utc) - timedelta(hours=1)
                            vst.completion_notes = "POS terminal audit completed with store manager."
                        session.add(vst)

            await session.commit()
            return {"status": "seeded_successfully", "agent_count": len(REAL_AGENTS), "customer_count": len(REAL_CUSTOMERS)}

        except Exception as exc:
            await session.rollback()
            return {"status": "error", "error": str(exc)}
