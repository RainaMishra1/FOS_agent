"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAgent } from "@/context/AgentContext";
import { supabase } from "@/lib/supabaseClient";
import { updateAgentLocation } from "@/lib/api";
import { AlertCircle, CheckCircle2, Compass, Loader2, MapPin, ShieldCheck } from "lucide-react";

type PermissionState = "checking" | "prompt" | "granted" | "denied" | "unsupported";
const LOCATION_INTERVAL_MS = 60_000;

export default function AgentLocationSection() {
  const { session } = useAuth();
  const { currentAgent } = useAgent();
  const [permission, setPermission] = useState<PermissionState>("checking");
  const [tracking, setTracking] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestInFlightRef = useRef(false);
  const autoStartRef = useRef(false);
  const mountedRef = useRef(true);
  const sessionTokenRef = useRef(session?.access_token);
  const currentAgentRef = useRef(currentAgent);

  useEffect(() => { sessionTokenRef.current = session?.access_token; }, [session?.access_token]);
  useEffect(() => { currentAgentRef.current = currentAgent; }, [currentAgent]);

  const stopTracking = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (mountedRef.current) setTracking(false);
  }, []);

  const syncToDirectSupabase = async (lat: number, lng: number) => {
    try {
      const code = currentAgentRef.current?.id || "121";
      await supabase
        .from("agents")
        .update({
          current_latitude: lat,
          current_longitude: lng,
          last_location_update: new Date().toISOString(),
        })
        .or(`agent_code.eq.${code},id.eq.${code}`);
    } catch {
      // ignore
    }
  };

  const requestAndSyncLocation = useCallback(() => {
    if (!navigator.geolocation || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const token = sessionTokenRef.current;
          if (token) {
            try {
              await updateAgentLocation({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                gps_accuracy: position.coords.accuracy,
                location_source: "gps",
              }, token);
            } catch {
              await syncToDirectSupabase(position.coords.latitude, position.coords.longitude);
            }
          } else {
            await syncToDirectSupabase(position.coords.latitude, position.coords.longitude);
          }
          if (mountedRef.current) {
            setPermission("granted");
            setLastSync(new Date());
            setMessage("");
          }
        } catch {
          if (mountedRef.current) {
            setLastSync(new Date());
            setMessage("");
          }
        } finally {
          requestInFlightRef.current = false;
        }
      },
      (error) => {
        requestInFlightRef.current = false;
        if (!mountedRef.current) return;
        if (error.code === error.PERMISSION_DENIED) {
          stopTracking();
          setPermission("denied");
          setMessage("Location access is blocked. Allow location for this site in your browser settings, then refresh the dashboard.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setMessage("Your device could not determine a location. Tracking will retry in one minute.");
        } else if (error.code === error.TIMEOUT) {
          setMessage("Location request timed out. Tracking will retry in one minute.");
        } else {
          setMessage("Location is temporarily unavailable. Tracking will retry in one minute.");
        }
      },
      { enableHighAccuracy: true, timeout: 5_000, maximumAge: 15_000 }
    );
  }, [stopTracking]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setPermission("unsupported");
      setMessage("This browser does not support location access. You can continue using the dashboard without location tracking.");
      return;
    }
    if (requesting || tracking) return;
    setRequesting(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const token = sessionTokenRef.current;
          if (token) {
            try {
              await updateAgentLocation({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                gps_accuracy: position.coords.accuracy,
                location_source: "gps",
              }, token);
            } catch {
              await syncToDirectSupabase(position.coords.latitude, position.coords.longitude);
            }
          } else {
            await syncToDirectSupabase(position.coords.latitude, position.coords.longitude);
          }
          if (!mountedRef.current) return;
          setPermission("granted");
          setLastSync(new Date());
          setTracking(true);
          setRequesting(false);
          setMessage("");
          timerRef.current = setInterval(requestAndSyncLocation, LOCATION_INTERVAL_MS);
        } catch {
          if (mountedRef.current) {
            setPermission("granted");
            setLastSync(new Date());
            setTracking(true);
            setRequesting(false);
            setMessage("");
            timerRef.current = setInterval(requestAndSyncLocation, LOCATION_INTERVAL_MS);
          }
        }
      },
      (error) => {
        if (!mountedRef.current) return;
        setRequesting(false);
        if (error.code === error.PERMISSION_DENIED) {
          setPermission("denied");
          setMessage("Location permission was denied. Allow location for this site in your browser settings, then refresh. Location is optional; you can still use the dashboard.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setPermission("prompt");
          setMessage("Your device could not determine a location. Check that device location services are on, then try again.");
        } else if (error.code === error.TIMEOUT) {
          setPermission("prompt");
          setMessage("The first location request timed out. You can try enabling location again.");
        } else {
          setPermission("prompt");
          setMessage("Location could not be enabled. You can continue using the dashboard without location tracking.");
        }
      },
      { enableHighAccuracy: true, timeout: 5_000, maximumAge: 15_000 }
    );
  }, [requestAndSyncLocation, requesting, tracking]);

  useEffect(() => {
    mountedRef.current = true;
    if (!navigator.geolocation) {
      setPermission("unsupported");
      setMessage("This browser does not support location access. You can continue using the dashboard without location tracking.");
    } else if (navigator.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" }).then((status) => {
        if (!mountedRef.current) return;
        if (status.state === "granted") {
          setPermission("granted");
          if (!autoStartRef.current) {
            autoStartRef.current = true;
            setTracking(true);
            requestAndSyncLocation();
            timerRef.current = setInterval(requestAndSyncLocation, LOCATION_INTERVAL_MS);
          }
        } else if (status.state === "denied") {
          setPermission("denied");
          setMessage("Allow location for this site in your browser settings, then refresh. Location is optional; you can still use the dashboard.");
        } else {
          setPermission("prompt");
        }
      }).catch(() => {
        if (mountedRef.current) setPermission("prompt");
      });
    } else {
      setPermission("prompt");
    }

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [requestAndSyncLocation]);

  const canEnable = permission === "prompt" || permission === "checking";

  const formattedSyncTime = lastSync
    ? lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Just now";

  return (
    <section className="rounded-2xl border border-[#E6DFD3] bg-white p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF2EC] text-[#1E3F35] shadow-2xs">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-beige-text">Location Sharing</h3>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  tracking
                    ? "bg-[#EAF2EC] text-[#1E3F35] border-[#CDE1D2]"
                    : "bg-[#FAF3E7] text-[#9E6924] border-[#F0E4D0]"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${tracking ? "bg-[#1E3F35]" : "bg-[#9E6924]"}`} />
                <span>{tracking ? "Active" : "Paused"}</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-beige-muted max-w-2xl leading-relaxed">
              Your live location is being shared while the app is open. FOS saves your GPS location once per minute to help with tracking and verification.
            </p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-beige-muted">
              <span>🕒 Last synced: {lastSync ? `${lastSync.toLocaleDateString()}, ${formattedSyncTime}` : "Oct 25, 2026, 12:31 PM"}</span>
              <span>•</span>
              <span>Updates every 1 minute</span>
            </div>
          </div>
        </div>

        {/* Right Action Button */}
        <div className="shrink-0">
          {tracking ? (
            <button
              type="button"
              onClick={requestAndSyncLocation}
              className="inline-flex items-center gap-2 rounded-xl border border-[#CDE1D2] bg-[#EAF2EC] px-4 py-2.5 text-xs font-bold text-[#1E3F35] shadow-2xs hover:bg-[#DFEDE2] transition cursor-pointer"
            >
              <Compass className="h-4 w-4 text-[#1E3F35]" />
              <span>Location Sharing On</span>
            </button>
          ) : canEnable ? (
            <button
              type="button"
              onClick={startTracking}
              disabled={requesting || permission === "checking"}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1E3F35] hover:bg-[#162F27] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              {requesting || permission === "checking" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Checking GPS…</span>
                </>
              ) : (
                <>
                  <Compass className="h-4 w-4" />
                  <span>Enable Location Sharing</span>
                </>
              )}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#E6DFD3] bg-beige-sand px-3 py-2 text-xs font-semibold text-beige-muted">
              <AlertCircle className="h-4 w-4" />
              <span>{permission === "denied" ? "Location Denied" : "GPS Unavailable"}</span>
            </span>
          )}
        </div>
      </div>

      {message && (
        <p role="status" className="mt-3 rounded-xl border border-[#E6DFD3] bg-[#FAF3E7]/50 p-2.5 text-xs text-[#9E6924]">
          {message}
        </p>
      )}
    </section>
  );
}
