"use client";
// TEMPORARY design preview with a real Ola Maps route — delete this folder.
import React, { useEffect, useMemo, useState } from "react";
import AgentRoadRouteMap from "@/components/agent/AgentRoadRouteMap";
import type { RoadRouteData, TravelMode } from "@/lib/api";
import carRoute from "./ola_car.json";
import walkRoute from "./ola_walk.json";

const dest = { id: "v1", customer_name: "Ganesh Patil", customer_address: "Chinchpada Road General Store, Kalyan East", customer_phone: "+91 98200 00000", customer_latitude: 19.22601, customer_longitude: 73.14523, status: "pending", order_index: 1 };

export default function Preview() {
  const [nav, setNav] = useState(false);
  const [mode, setMode] = useState<TravelMode>("car");
  const route = (mode === "walk" ? walkRoute : carRoute) as unknown as RoadRouteData;
  const geometry = (route.geometry?.coordinates || []) as [number, number][];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!nav) { setI(0); return; }
    const t = setInterval(() => setI((v) => Math.min(v + 1, geometry.length - 1)), 700);
    return () => clearInterval(t);
  }, [nav, geometry.length]);
  const origin = useMemo(() => ({ latitude: geometry[i][1], longitude: geometry[i][0] }), [i, geometry]);
  (globalThis as any).__simIndex = i;
  return (
    <div className="p-4">
      <AgentRoadRouteMap origin={origin} stops={[dest]} geometry={geometry} singleDestinationMode activeDestinationStop={dest}
        selectedStopId="v1" legs={route.legs} isNavigating={nav} onStartNavigation={() => setNav(true)} onStopNavigation={() => setNav(false)}
        trafficAware={Boolean(route.traffic_aware)} trafficSpeedIntervals={route.traffic_speed_intervals || []}
        travelMode={mode} onTravelModeChange={setMode}
        modeEstimates={{ car: { distance_meters: 2418, duration_seconds: 529, estimated: false }, bike: { distance_meters: 2418, duration_seconds: 509, estimated: false }, walk: { distance_meters: 1578, duration_seconds: 947, estimated: false } }}
        gpsSpeedMps={nav ? 38 : null}
        onReroute={() => console.log("reroute requested")}
        onCheckIn={() => new Promise((r) => setTimeout(r, 1500))} />
    </div>
  );
}
