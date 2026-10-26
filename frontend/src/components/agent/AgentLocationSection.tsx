"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAgent } from "@/context/AgentContext";
import { supabase } from "@/lib/supabaseClient";
import { updateAgentLocation } from "@/lib/api";
import { Compass, Loader2, Navigation, Radio } from "lucide-react";

export default function AgentLocationSection() {
  const { session } = useAuth();
  const { currentAgent, isOnDuty } = useAgent();
  const [tracking, setTracking] = useState(false);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(() => {
    if (currentAgent?.currentCoordinates?.lat && currentAgent?.currentCoordinates?.lng) {
      return {
        lat: currentAgent.currentCoordinates.lat,
        lng: currentAgent.currentCoordinates.lng,
      };
    }
    return null;
  });

  const watchIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const sessionTokenRef = useRef(session?.access_token);
  const currentAgentRef = useRef(currentAgent);
  const isOnDutyRef = useRef(isOnDuty);

  useEffect(() => { sessionTokenRef.current = session?.access_token; }, [session?.access_token]);
  useEffect(() => { currentAgentRef.current = currentAgent; }, [currentAgent]);
  useEffect(() => { isOnDutyRef.current = isOnDuty; }, [isOnDuty]);

  // Sync coordinates directly to Supabase and backend
  const syncLocation = useCallback(async (lat: number, lng: number, accuracy?: number) => {
    if (!isOnDutyRef.current) return;

    // 1. Update component live state
    if (mountedRef.current) {
      setLiveCoords({ lat, lng, accuracy });
      setTracking(true);
    }

    // 2. Sync to Supabase agents table
    try {
      const code = currentAgentRef.current?.dbId || currentAgentRef.current?.id || currentAgentRef.current?.agentCode;
      if (code) {
        await supabase
          .from("agents")
          .update({
            current_latitude: lat,
            current_longitude: lng,
            last_location_update: new Date().toISOString(),
          })
          .or(`agent_code.eq.${code},id.eq.${code}`);
      }
    } catch {
      // ignore
    }

    // 3. Sync to FastAPI backend if available
    const token = sessionTokenRef.current;
    if (token) {
      try {
        await updateAgentLocation({
          latitude: lat,
          longitude: lng,
          gps_accuracy: accuracy,
          location_source: "gps",
        }, token);
      } catch {
        // ignore
      }
    }
  }, []);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (mountedRef.current) setTracking(false);
  }, []);

  const startWatching = useCallback(() => {
    if (!isOnDutyRef.current) {
      stopWatching();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    // Immediately fetch initial fix
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isOnDutyRef.current) return;
        void syncLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 }
    );

    // Watch live location continuously
    if (watchIdRef.current === null) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (!isOnDutyRef.current) return;
          void syncLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 }
      );
    }
  }, [stopWatching, syncLocation]);

  // When duty status changes: start watching if on duty, stop immediately if off duty
  useEffect(() => {
    if (!isOnDuty) {
      stopWatching();
    } else {
      startWatching();
    }
  }, [isOnDuty, stopWatching, startWatching]);

  useEffect(() => {
    mountedRef.current = true;
    if (isOnDutyRef.current) {
      startWatching();
    }

    return () => {
      mountedRef.current = false;
      stopWatching();
    };
  }, [startWatching, stopWatching]);

  return (
    <section className="rounded-2xl border border-[#E6DFD3] bg-white p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Icon and Real-Time Lat/Long */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF2EC] text-[#1E3F35] shadow-2xs">
            <Navigation className="h-5 w-5 text-[#1E3F35]" />
            {isOnDuty && tracking && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-beige-text">Live GPS Location</h3>
              {isOnDuty && tracking ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>LIVE</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF3E7] text-[#9E6924] border border-[#F0E4D0]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9E6924]" />
                  <span>{!isOnDuty ? "Paused • Off Duty" : "Locating"}</span>
                </span>
              )}
            </div>

            {/* Live Coordinates Display */}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              {isOnDuty ? (
                liveCoords ? (
                  <>
                    <span className="font-mono font-semibold text-[#1E3F35] bg-[#EAF2EC] px-2.5 py-1 rounded-lg border border-[#CDE1D2]">
                      Lat: {liveCoords.lat.toFixed(5)}°
                    </span>
                    <span className="font-mono font-semibold text-[#1E3F35] bg-[#EAF2EC] px-2.5 py-1 rounded-lg border border-[#CDE1D2]">
                      Long: {liveCoords.lng.toFixed(5)}°
                    </span>
                    {liveCoords.accuracy ? (
                      <span className="text-[11px] text-beige-muted">
                        ±{Math.round(liveCoords.accuracy)}m accuracy
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-beige-muted flex items-center gap-1.5 py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1E3F35]" />
                    Acquiring live coordinates…
                  </span>
                )
              ) : (
                <span className="text-xs text-[#9E6924] py-0.5">
                  Location tracking is paused while you are off duty.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Status Badge */}
        <div className="shrink-0 flex items-center">
          {isOnDuty ? (
            <span className="inline-flex items-center gap-2 rounded-xl border border-[#CDE1D2] bg-[#EAF2EC] px-4 py-2.5 text-xs font-bold text-[#1E3F35] shadow-2xs">
              <Radio className="h-4 w-4 text-emerald-600 animate-pulse" />
              <span>Live Tracking Active</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#F0E4D0] bg-[#FAF3E7] px-3.5 py-2 text-xs font-semibold text-[#9E6924]">
              <Compass className="h-4 w-4 text-[#9E6924]" />
              <span>Off Duty (Paused)</span>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
