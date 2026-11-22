"use client";
// TEMPORARY design preview — delete this folder.
import React, { useState } from "react";
import AgentRoadRouteMap from "@/components/agent/AgentRoadRouteMap";

const origin = { latitude: 19.219, longitude: 73.1401 };
const dest = { id: "v1", customer_name: "Ganesh Patil", customer_address: "Chinchpada Road General Store, Kalyan East", customer_phone: "+91 98200 00000", customer_latitude: 19.2262, customer_longitude: 73.1452, status: "pending", order_index: 1 };
const geometry: [number, number][] = [[73.1401,19.219],[73.1408,19.2201],[73.1415,19.2215],[73.1432,19.2222],[73.1440,19.2240],[73.1448,19.2255],[73.1452,19.2262]];
const legs: any = [{ distance: 1180, duration: 420, steps: [
  { distance: 210, name: "Chinchpada Road", maneuver: { type: "depart", modifier: "straight", location: [73.1401,19.219], instruction: "Head north on Chinchpada Road" } },
  { distance: 350, name: "Amrai Road", maneuver: { type: "turn", modifier: "right", location: [73.1415,19.2215], instruction: "Turn right onto Amrai Road" } },
  { distance: 420, name: "Station Road", maneuver: { type: "turn", modifier: "left", location: [73.1432,19.2222], instruction: "Turn left onto Station Road" } },
  { distance: 0, name: "", maneuver: { type: "arrive", location: [73.1452,19.2262], instruction: "Arrive at Ganesh Patil" } },
]}];

export default function Preview() {
  const [nav, setNav] = useState(false);
  return (
    <div className="p-4">
      <AgentRoadRouteMap origin={origin} stops={[dest]} geometry={geometry} singleDestinationMode activeDestinationStop={dest}
        selectedStopId="v1" legs={legs} isNavigating={nav} onStartNavigation={() => setNav(true)} onStopNavigation={() => setNav(false)}
        onCheckIn={() => new Promise((r) => setTimeout(r, 1500))} />
    </div>
  );
}
