"use client";
// TEMPORARY design preview — delete this folder.
import React, { useEffect, useMemo, useState } from "react";
import AgentRoadRouteMap from "@/components/agent/AgentRoadRouteMap";
import type { TravelMode } from "@/lib/api";

const dest = { id: "v1", customer_name: "Ganesh Patil", customer_address: "Chinchpada Road General Store, Kalyan East", customer_phone: "+91 98200 00000", customer_latitude: 19.2262, customer_longitude: 73.1452, status: "pending", order_index: 1 };
const corners: [number, number][] = [[73.1401,19.219],[73.1415,19.2215],[73.1432,19.2222],[73.1452,19.2262]];
// densify so the simulated car moves smoothly
const geometry: [number, number][] = corners.flatMap((c, i) => {
  if (i === corners.length - 1) return [c];
  const n = corners[i + 1];
  return Array.from({ length: 10 }, (_, k) => [c[0] + ((n[0] - c[0]) * k) / 10, c[1] + ((n[1] - c[1]) * k) / 10] as [number, number]);
});
const legs: any = [{ distance: 1180, duration: 420, steps: [
  { distance: 310, name: "Chinchpada Road", maneuver: { type: "depart", location: [73.1401,19.219] } },
  { distance: 190, name: "Amrai Road", maneuver: { type: "turn", modifier: "right", location: [73.1415,19.2215] } },
  { distance: 480, name: "", maneuver: { type: "turn", modifier: "left", location: [73.1432,19.2222] } },
  { distance: 0, name: "", maneuver: { type: "arrive", location: [73.1452,19.2262] } },
]}];

export default function Preview() {
  const [nav, setNav] = useState(false);
  const [mode, setMode] = useState<TravelMode>("car");
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!nav) { setI(0); return; }
    const t = setInterval(() => setI((v) => Math.min(v + 1, geometry.length - 1)), 1200);
    return () => clearInterval(t);
  }, [nav]);
  const origin = useMemo(() => ({ latitude: geometry[i][1] + 0.00004, longitude: geometry[i][0] + 0.00003 }), [i]);
  (globalThis as any).__simIndex = i;
  return (
    <div className="p-4">
      <AgentRoadRouteMap origin={origin} stops={[dest]} geometry={geometry} singleDestinationMode activeDestinationStop={dest}
        selectedStopId="v1" legs={legs} isNavigating={nav} onStartNavigation={() => setNav(true)} onStopNavigation={() => setNav(false)}
        travelMode={mode} onTravelModeChange={setMode}
        modeEstimates={{ car: { distance_meters: 1180, duration_seconds: 420, estimated: false }, bike: { distance_meters: 1180, duration_seconds: 357, estimated: true }, walk: { distance_meters: 1270, duration_seconds: 1016, estimated: false } }}
        gpsSpeedMps={nav ? 8.3 : null} gpsHeading={null}
        onReroute={() => console.log("reroute requested")}
        onCheckIn={() => new Promise((r) => setTimeout(r, 1500))} />
    </div>
  );
}
