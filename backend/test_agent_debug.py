import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        # 1. Test root
        r0 = await client.get("http://localhost:8000/")
        print("Root:", r0.status_code)

        # 2. Test GET /api/v1/agent/dashboard with dev token
        # The dev token is for agent1@fos-system.internal (sub: 00000000-0000-0000-0000-000000000002)
        from tests.test_auth import create_test_token
        agent_token = create_test_token("00000000-0000-0000-0000-000000000002")

        r1 = await client.get(
            "http://localhost:8000/api/v1/agent/dashboard",
            headers={"Authorization": f"Bearer {agent_token}"}
        )
        print("Dashboard status:", r1.status_code)
        if r1.status_code != 200:
            print("Dashboard error:", r1.text)
        else:
            print("Dashboard success:", r1.json().keys())

        # 3. Test GET /api/v1/agent/me
        r2 = await client.get(
            "http://localhost:8000/api/v1/agent/me",
            headers={"Authorization": f"Bearer {agent_token}"}
        )
        print("Me status:", r2.status_code)
        if r2.status_code != 200:
            print("Me error:", r2.text)

        # 4. Test PATCH /api/v1/agent/duty
        r3 = await client.patch(
            "http://localhost:8000/api/v1/agent/duty",
            json={"status": "off_duty"},
            headers={"Authorization": f"Bearer {agent_token}"}
        )
        print("Duty status:", r3.status_code)
        if r3.status_code != 200:
            print("Duty error:", r3.text)

if __name__ == "__main__":
    asyncio.run(main())
