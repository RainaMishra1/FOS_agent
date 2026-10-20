"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { updateAgentLocation } from "@/lib/api";
import { AlertCircle, CheckCircle2, Loader2, MapPin, ShieldCheck } from "lucide-react";

type PermissionState = "checking" | "prompt" | "granted" | "denied" | "unsupported";
const LOCATION_INTERVAL_MS = 60_000;

export default function AgentLocationSection() {
  const { session } = useAuth();
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

  useEffect(() => { sessionTokenRef.current = session?.access_token; }, [session?.access_token]);

  const stopTracking = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (mountedRef.current) setTracking(false);
  }, []);

  const requestAndSyncLocation = useCallback(() => {
    if (!navigator.geolocation || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const token = sessionTokenRef.current;
          if (!token) throw new Error("Your secure session is unavailable. Sign in again to sync location.");
          await updateAgentLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            gps_accuracy: position.coords.accuracy,
            location_source: "gps",
          }, token);
          if (mountedRef.current) {
            setPermission("granted");
            setLastSync(new Date());
            setMessage("");
          }
        } catch (error) {
          if (mountedRef.current) setMessage(error instanceof Error ? error.message : "Location could not be synced. It will retry in one minute.");
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
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
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
          if (!token) throw new Error("Your secure session is unavailable. Sign in again to sync location.");
          await updateAgentLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            gps_accuracy: position.coords.accuracy,
            location_source: "gps",
          }, token);
          if (!mountedRef.current) return;
          setPermission("granted");
          setLastSync(new Date());
          setTracking(true);
          setRequesting(false);
          setMessage("");
          timerRef.current = setInterval(requestAndSyncLocation, LOCATION_INTERVAL_MS);
        } catch (error) {
          if (mountedRef.current) {
            setRequesting(false);
            setMessage(error instanceof Error ? error.message : "Could not sync your first location. Try again.");
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
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
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

  return (
    <section className="rounded-2xl border border-beige-border bg-beige-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-beige-terracotta-subtle text-beige-terracotta"><MapPin className="h-4 w-4" /></div>
          <div>
            <h3 className="text-sm font-bold text-beige-text">Automatic location sharing</h3>
            <p className="mt-1 text-xs text-beige-muted">With your permission, FOS saves your GPS location once per minute while this dashboard is open. Coordinates and maps are hidden here.</p>
          </div>
        </div>
        {tracking ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-beige-olive/30 bg-beige-olive-subtle px-2.5 py-1.5 text-[11px] font-bold text-beige-olive"><ShieldCheck className="h-3.5 w-3.5" /><span>Location sharing on</span></span>
        ) : canEnable ? (
          <button type="button" onClick={startTracking} disabled={requesting || permission === "checking"} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-beige-terracotta px-4 py-2.5 text-xs font-bold text-white hover:bg-beige-terracotta/90 disabled:opacity-50">
            {requesting || permission === "checking" ? <><Loader2 className="h-4 w-4 animate-spin" />Checking location…</> : <><MapPin className="h-4 w-4" />Allow location</>}
          </button>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-beige-border bg-beige-sand px-2.5 py-1.5 text-[11px] font-semibold text-beige-muted"><AlertCircle className="h-3.5 w-3.5" /><span>{permission === "denied" ? "Location not allowed" : "Location unavailable"}</span></span>
        )}
      </div>
      {message && <p role="status" className="mt-3 rounded-xl border border-beige-border bg-beige-sand/50 p-3 text-xs text-beige-muted">{message}</p>}
      {tracking && <p className="mt-3 flex items-center gap-1.5 text-[11px] text-beige-muted"><CheckCircle2 className="h-3.5 w-3.5 text-beige-olive" />{lastSync ? `Last location sync: ${lastSync.toLocaleTimeString()}. Next update in about one minute.` : "Waiting for the first location update…"}</p>}
      <p className="mt-2 text-[10px] text-beige-muted">Location is optional for dashboard access. You can turn it off any time in your browser’s site settings.</p>
    </section>
  );
}
