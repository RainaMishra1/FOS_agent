import uuid
from datetime import date, datetime, timezone, timedelta
from sqlalchemy import select, func, text, or_
from geoalchemy2.elements import WKTElement

from app.db.session import async_session_factory
from app.models.profile import Profile
from app.models.agent import Agent
from app.models.customer import Customer
from app.models.lead import Lead
from app.models.assignment import Assignment
from app.models.visit import Visit

ADMIN_PROFILE_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
AGENT_1_PROFILE_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")

SEED_AGENTS = [
    {
        "agent_code": "AGT-101",
        "name": "Marcus Vance",
        "email": "agent1@fos-system.internal",
        "phone": "+91 98450 11234",
        "status": "active",
        "territory": "North Tech Corridor",
        "address": "Sterling Towers, Residency Rd, Bengaluru",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "battery_level": 88,
        "location_source": "gps",
    },
    {
        "agent_code": "AGT-102",
        "name": "Elena Rostova",
        "email": "elena.r@fos.internal",
        "phone": "+91 98450 22345",
        "status": "active",
        "territory": "Central Business District",
        "address": "108 Brigade Road, Bengaluru",
        "latitude": 12.9789,
        "longitude": 77.6045,
        "battery_level": 94,
        "location_source": "gps",
    },
    {
        "agent_code": "AGT-103",
        "name": "Devon Brooks",
        "email": "devon.b@fos.internal",
        "phone": "+91 98450 33456",
        "status": "busy",
        "territory": "West Industrial Zone",
        "address": "Rajajinagar Industrial Suburb, Bengaluru",
        "latitude": 12.9611,
        "longitude": 77.5755,
        "battery_level": 62,
        "location_source": "gps",
    },
    {
        "agent_code": "AGT-104",
        "name": "Priya Sharma",
        "email": "priya.s@fos.internal",
        "phone": "+91 98450 44567",
        "status": "active",
        "territory": "South Metro",
        "address": "80 Feet Rd, Koramangala, Bengaluru",
        "latitude": 12.9352,
        "longitude": 77.6245,
        "battery_level": 79,
        "location_source": "gps",
    },
    {
        "agent_code": "AGT-105",
        "name": "Karan Mehta",
        "email": "karan.m@fos.internal",
        "phone": "+91 98450 55678",
        "status": "break",
        "territory": "East Commercial Hub",
        "address": "Indiranagar 100ft Rd, Bengaluru",
        "latitude": 12.9856,
        "longitude": 77.6432,
        "battery_level": 45,
        "location_source": "gps",
    },
    {
        "agent_code": "AGT-106",
        "name": "Sarah Jenkins",
        "email": "sarah.j@fos.internal",
        "phone": "+91 98450 66789",
        "status": "inactive",
        "territory": "North Tech Corridor",
        "address": "Hebbal Outer Ring Rd, Bengaluru",
        "latitude": 12.9912,
        "longitude": 77.5891,
        "battery_level": 31,
        "location_source": "admin_provided",
    },
    {
        "agent_code": "AGT-107",
        "name": "Arjun Nambiar",
        "email": "arjun.n@fos.internal",
        "phone": "+91 98450 77890",
        "status": "active",
        "territory": "South Metro",
        "address": "BTM Layout 2nd Stage, Bengaluru",
        "latitude": 12.9224,
        "longitude": 77.6189,
        "battery_level": 82,
        "location_source": "gps",
    },
    {
        "agent_code": "AGT-108",
        "name": "Chloe Dupont",
        "email": "chloe.d@fos.internal",
        "phone": "+91 98450 88901",
        "status": "active",
        "territory": "Central Business District",
        "address": "UB City, Vittal Mallya Rd, Bengaluru",
        "latitude": 12.9734,
        "longitude": 77.6121,
        "battery_level": 71,
        "location_source": "gps",
    },
    {
        "agent_code": "AGT-122",
        "name": "Malavya Mankar",
        "email": "malavya@fos.internal",
        "phone": "+91 98450 54321",
        "status": "active",
        "territory": "Mumbai Zone",
        "address": "Navi Mumbai, Mumbai",
        "latitude": 19.0330,
        "longitude": 73.0297,
        "battery_level": 90,
        "location_source": "gps",
    },
]

SEED_CUSTOMERS = [
    {
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
        "agent_code": "AGT-101",
    },
    {
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
        "agent_code": "AGT-102",
    },
    {
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
        "agent_code": "AGT-103",
    },
    {
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
        "agent_code": "AGT-104",
    },
    {
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
        "agent_code": "AGT-107",
    },
    {
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
        "agent_code": "AGT-108",
    },
    {
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
        "agent_code": "AGT-105",
    },
    {
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
        "agent_code": "AGT-101",
    },
    {
        "customer_code": "CUST-409",
        "name": "Nexus Health Systems",
        "company": "Nexus Care Group",
        "contact_person": "Dr. Rajesh Gupta (Medical Director)",
        "email": "ops@nexushealth.in",
        "phone": "+91 80 4330 1122",
        "address": "12 Hosur Main Road, Madiwala",
        "city": "Bengaluru",
        "latitude": 12.9172,
        "longitude": 77.6228,
        "notes": "Medical diagnostic equipment routine inspection.",
        "lead_code": "LEAD-8860",
        "lead_priority": "high",
        "agent_code": "AGT-106",
    },
    {
        "customer_code": "CUST-410",
        "name": "Indira Retail Mart",
        "company": "Indira Hypermarkets Ltd",
        "contact_person": "Mr. Pradeep Kumar (Branch Head)",
        "email": "branch12@indiraretail.com",
        "phone": "+91 80 2520 9988",
        "address": "100 Ft Road, HAL 2nd Stage, Indiranagar",
        "city": "Bengaluru",
        "latitude": 12.9784,
        "longitude": 77.6408,
        "notes": "Store POS integration and quarterly audit.",
        "lead_code": "LEAD-8865",
        "lead_priority": "medium",
        "agent_code": "AGT-105",
    },
    {
        "customer_code": "CUST-411",
        "name": "Aura FinTech Solutions",
        "company": "Aura Global Ltd",
        "contact_person": "Ms. Sangeeta Nair (Compliance Lead)",
        "email": "compliance@auraglobal.io",
        "phone": "+91 80 4911 3344",
        "address": "Prestige Tech Park, Outer Ring Road",
        "city": "Bengaluru",
        "latitude": 12.9372,
        "longitude": 77.6912,
        "notes": "Annual hardware security audit and sign-off.",
        "lead_code": "LEAD-8870",
        "lead_priority": "high",
        "agent_code": "AGT-106",
    },
    {
        "customer_code": "CUST-412",
        "name": "Brigade Tech Ventures",
        "company": "Brigade Enterprises",
        "contact_person": "Mr. Anand Murthy (Operations Chief)",
        "email": "anand.m@brigadetech.in",
        "phone": "+91 80 4115 6677",
        "address": "Brigade Gateway, Malleshwaram",
        "city": "Bengaluru",
        "latitude": 12.9865,
        "longitude": 77.5568,
        "notes": "Tenant access clearance and kiosk inspection.",
        "lead_code": "LEAD-8875",
        "lead_priority": "medium",
        "agent_code": "AGT-102",
    },
    {
        "customer_code": "CUST-413",
        "name": "Zenith Cloud Hub",
        "company": "Zenith Systems Ltd",
        "contact_person": "Ms. Pooja Hegde (Site Manager)",
        "email": "ops@zenithcloud.in",
        "phone": "+91 80 4600 2211",
        "address": "Phase 1, Electronic City",
        "city": "Bengaluru",
        "latitude": 12.8452,
        "longitude": 77.6602,
        "notes": "Backup power unit inspection.",
        "lead_code": "LEAD-8880",
        "lead_priority": "low",
        "agent_code": "AGT-103",
    },
    {
        "customer_code": "CUST-414",
        "name": "Koramangala Dental Studio",
        "company": "Dental Care Network",
        "contact_person": "Dr. Rohan Mathew",
        "email": "contact@koralental.com",
        "phone": "+91 80 2553 4400",
        "address": "5th Block, Koramangala",
        "city": "Bengaluru",
        "latitude": 12.9348,
        "longitude": 77.6200,
        "notes": "Medical billing kiosk maintenance and verification.",
        "lead_code": "LEAD-8885",
        "lead_priority": "medium",
        "agent_code": "AGT-104",
    },
    {
        "customer_code": "CUST-415",
        "name": "South Point Logistics",
        "company": "South Point Cargo Ltd",
        "contact_person": "Mr. Farhan Akhtar",
        "email": "farhan@southpointcargo.com",
        "phone": "+91 80 2678 9911",
        "address": "JP Nagar 3rd Phase, Ring Road",
        "city": "Bengaluru",
        "latitude": 12.9090,
        "longitude": 77.5950,
        "notes": "Fleet tracking unit tag verification.",
        "lead_code": "LEAD-8890",
        "lead_priority": "high",
        "agent_code": "AGT-107",
    },
    {
        "customer_code": "CUST-416",
        "name": "Metro Square Plaza",
        "company": "Metro Retail Corp",
        "contact_person": "Ms. Divya Ramesh",
        "email": "divya@metrosquare.in",
        "phone": "+91 80 4120 7788",
        "address": "MG Road Metro Plaza, Level 2",
        "city": "Bengaluru",
        "latitude": 12.9755,
        "longitude": 77.6070,
        "notes": "Floor plan beacon survey and check-in.",
        "lead_code": "LEAD-8895",
        "lead_priority": "medium",
        "agent_code": "AGT-108",
    },
]


async def run_seed():
    async with async_session_factory() as session:
        try:
            # 1. Admin Profile
            admin_stmt = select(Profile).where(Profile.email == "admin@fos-system.internal")
            admin_prof = (await session.execute(admin_stmt)).scalars().first()
            if not admin_prof:
                admin_prof = Profile(
                    id=ADMIN_PROFILE_ID,
                    full_name="Anil Ops (Admin)",
                    email="admin@fos-system.internal",
                    role="admin",
                    phone="+91 80 5000 0001",
                )
                session.add(admin_prof)
                await session.flush()

            # 2. Upsert Agents
            agent_map = {}
            for item in SEED_AGENTS:
                ag_stmt = select(Agent).where(Agent.agent_code == item["agent_code"])
                ag = (await session.execute(ag_stmt)).scalars().first()

                pt_wkt = f"POINT({item['longitude']} {item['latitude']})"

                if not ag:
                    # Find or create profile
                    prof_stmt = select(Profile).where(Profile.email == item["email"])
                    prof = (await session.execute(prof_stmt)).scalars().first()
                    if not prof:
                        prof = Profile(
                            id=uuid.uuid4(),
                            full_name=item["name"],
                            email=item["email"],
                            role="agent",
                            phone=item["phone"],
                        )
                        session.add(prof)
                        await session.flush()

                    ag = Agent(
                        id=uuid.uuid4(),
                        profile_id=prof.id,
                        agent_code=item["agent_code"],
                        status=item["status"],
                        territory=item["territory"],
                        address=item["address"],
                        location_source=item["location_source"],
                        current_latitude=item["latitude"],
                        current_longitude=item["longitude"],
                        current_location=WKTElement(pt_wkt, srid=4326),
                        battery_level=item["battery_level"],
                        last_location_update=datetime.now(timezone.utc) - timedelta(minutes=5),
                    )
                    session.add(ag)
                    await session.flush()
                else:
                    ag.status = item["status"]
                    ag.territory = item["territory"]
                    ag.address = item["address"]
                    ag.location_source = item["location_source"]
                    ag.current_latitude = item["latitude"]
                    ag.current_longitude = item["longitude"]
                    ag.battery_level = item["battery_level"]
                    ag.current_location = WKTElement(pt_wkt, srid=4326)
                    ag.last_location_update = datetime.now(timezone.utc) - timedelta(minutes=5)

                agent_map[item["agent_code"]] = ag

            # 3. Upsert Customers
            today = datetime.now(timezone.utc).date()
            for c_data in SEED_CUSTOMERS:
                cust_stmt = select(Customer).where(Customer.customer_code == c_data["customer_code"])
                cust = (await session.execute(cust_stmt)).scalars().first()
                cust_pt = f"POINT({c_data['longitude']} {c_data['latitude']})"

                if not cust:
                    cust = Customer(
                        id=uuid.uuid4(),
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
                else:
                    cust.name = c_data["name"]
                    cust.company = c_data["company"]
                    cust.contact_person = c_data["contact_person"]
                    cust.email = c_data["email"]
                    cust.phone = c_data["phone"]
                    cust.address = c_data["address"]
                    cust.latitude = c_data["latitude"]
                    cust.longitude = c_data["longitude"]
                    cust.location = WKTElement(cust_pt, srid=4326)

                assigned_agent = agent_map.get(c_data.get("agent_code"))

                # 4. Upsert Lead
                lead_stmt = select(Lead).where(Lead.customer_id == cust.id)
                lead = (await session.execute(lead_stmt)).scalars().first()
                if not lead:
                    lead = Lead(
                        id=uuid.uuid4(),
                        lead_code=c_data["lead_code"],
                        customer_id=cust.id,
                        assigned_agent_id=assigned_agent.id if assigned_agent else None,
                        priority=c_data["lead_priority"],
                        assignment_status="assigned" if assigned_agent else "pending",
                        notes=c_data["notes"],
                    )
                    session.add(lead)
                    await session.flush()
                else:
                    lead.assigned_agent_id = assigned_agent.id if assigned_agent else None
                    lead.priority = c_data["lead_priority"]
                    lead.assignment_status = "assigned" if assigned_agent else "pending"

                # 5. Upsert Assignment & Visit if assigned
                if assigned_agent:
                    asn_stmt = select(Assignment).where(Assignment.lead_id == lead.id)
                    asn = (await session.execute(asn_stmt)).scalars().first()
                    asn_code = f"ASN-{c_data['customer_code'].replace('CUST-', '')}"
                    if not asn:
                        asn = Assignment(
                            id=uuid.uuid4(),
                            assignment_code=asn_code,
                            lead_id=lead.id,
                            agent_id=assigned_agent.id,
                            assigned_by_id=admin_prof.id,
                            scheduled_date=today,
                            scheduled_time="10:30 AM",
                            status="active" if c_data["customer_code"] in ("CUST-401", "CUST-403", "CUST-411") else "assigned",
                            notes=c_data["notes"],
                        )
                        session.add(asn)
                    else:
                        asn.agent_id = assigned_agent.id
                        asn.scheduled_date = today
                        asn.status = "active" if c_data["customer_code"] in ("CUST-401", "CUST-403", "CUST-411") else "assigned"

                    # Scheduled Visit for Today
                    vst_code = f"VST-{c_data['customer_code'].replace('CUST-', '')}"
                    vst_stmt = select(Visit).where(or_(Visit.visit_code == vst_code, Visit.customer_id == cust.id))
                    vst = (await session.execute(vst_stmt)).scalars().first()
                    status_val = "in_progress" if c_data["customer_code"] in ("CUST-401", "CUST-411") else (
                        "completed" if c_data["customer_code"] in ("CUST-404", "CUST-408", "CUST-412", "CUST-413", "CUST-415", "CUST-416") else "pending"
                    )
                    if not vst:
                        vst = Visit(
                            id=uuid.uuid4(),
                            visit_code=vst_code,
                            customer_id=cust.id,
                            agent_id=assigned_agent.id,
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
                    else:
                        vst.scheduled_date = today
                        vst.agent_id = assigned_agent.id
                        vst.status = status_val
                        vst.geofence_verified = (status_val == "completed")
                        vst.purpose = c_data["notes"] or "Field customer verification & inspection."
                        if status_val == "in_progress":
                            vst.check_in_time = datetime.now(timezone.utc) - timedelta(minutes=20)
                            vst.completed_time = None
                        elif status_val == "completed":
                            vst.check_in_time = datetime.now(timezone.utc) - timedelta(hours=2)
                            vst.completed_time = datetime.now(timezone.utc) - timedelta(hours=1)
                            vst.completion_notes = vst.completion_notes or "Field inspection and verification completed."
                        else:
                            vst.check_in_time = None
                            vst.completed_time = None

            # Roll forward any other pending/in-progress visits to today so they never evaporate
            await session.execute(
                text("UPDATE visits SET scheduled_date = :today WHERE scheduled_date < :today AND status IN ('pending', 'in_progress', 'delayed')"),
                {"today": today}
            )
            await session.execute(
                text("UPDATE assignments SET scheduled_date = :today WHERE scheduled_date < :today AND status IN ('assigned', 'active')"),
                {"today": today}
            )

            await session.commit()

            # Final verify counts
            total_ag = (await session.scalar(select(func.count(Agent.id)))) or 0
            total_cust = (await session.scalar(select(func.count(Customer.id)))) or 0
            total_vst = (await session.scalar(select(func.count(Visit.id)))) or 0
            total_asn = (await session.scalar(select(func.count(Assignment.id)))) or 0

            return {
                "status": "seeded_successfully",
                "total_agents": total_ag,
                "total_customers": total_cust,
                "total_visits": total_vst,
                "total_assignments": total_asn,
            }
        except Exception as exc:
            await session.rollback()
            return {"status": "error", "error": str(exc)}
