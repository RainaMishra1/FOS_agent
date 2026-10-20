"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAgent } from "@/context/AgentContext";
import { updateAgentLocation } from "@/lib/api";
import {
  MapPin,
  Compass,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Crosshair,
  Lock,
  Layers,
  Info,
} from "lucide-react";

interface AgentLocationSectionProps {
  onLocationSaved?: () => void;
}

export default function AgentLocationSection({ onLocationSaved }: AgentLocationSectionProps) {
  const { session } = useAuth();
  const { currentAgent, refreshAgentData } = useAgent();

  // Coordinate and input state
  const [latitudeInput, setLatitudeInput] = useState<string>("");
  const [longitudeInput, setLongitudeInput] = useState<string>("");
  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);

  // Provenance & GPS telemetry state
  const [locationSource, setLocationSource] = useState<"gps" | "manual" | "saved" | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [captureTime, setCaptureTime] = useState<string | null>(null);

  // Operation state
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Persistence state
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<{ message: string; timestamp: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Leaflet map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [isLeafletReady, setIsLeafletReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // 1. Initialize from currentAgent database records when loaded
  useEffect(() => {
    if (currentAgent.currentCoordinates) {
      const lat = currentAgent.currentCoordinates.lat;
      const lng = currentAgent.currentCoordinates.lng;
      if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
        setCurrentLat(lat);
        setCurrentLng(lng);
        setLatitudeInput(lat.toString());
        setLongitudeInput(lng.toString());
        setLocationSource("saved");
      }
    }
  }, [currentAgent.currentCoordinates]);

  // 2. Dynamic client-side Leaflet loader
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ((window as any).L) {
      setIsLeafletReady(true);
      return;
    }

    try {
      // CSS
      if (!document.getElementById("leaflet-cdn-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-cdn-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.crossOrigin = "";
        document.head.appendChild(link);
      }

      // JS
      if (!document.getElementById("leaflet-cdn-js")) {
        const script = document.createElement("script");
        script.id = "leaflet-cdn-js";
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.crossOrigin = "";
        script.onload = () => setIsLeafletReady(true);
        script.onerror = () => setMapError("Unable to load Leaflet map tiles library.");
        document.body.appendChild(script);
      } else {
        const existing = document.getElementById("leaflet-cdn-js");
        existing?.addEventListener("load", () => setIsLeafletReady(true));
      }
    } catch (e: any) {
      setMapError("Map initialization failed: " + e.message);
    }
  }, []);

  // 3. Helper to create marker icon
  const createMarkerIcon = useCallback((L: any, isGps: boolean) => {
    const bgColor = isGps ? "#5B7052" : "#C86D51"; // Olive for GPS, terracotta for manual
    return L.divIcon({
      className: "custom-agent-loc-marker",
      html: `
        <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
          <div style="
            width: 30px;
            height: 30px;
            background: ${bgColor};
            border: 2.5px solid #FFFFFF;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 4px 10px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="
              width: 10px;
              height: 10px;
              background: #FFFFFF;
              border-radius: 50%;
              transform: rotate(45deg);
            "></div>
          </div>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -34],
    });
  }, []);

  // 4. Initialize and update Leaflet Map
  useEffect(() => {
    if (!isLeafletReady || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const defaultCenter = [
      currentLat ?? 12.9716,
      currentLng ?? 77.5946,
    ];
    const initialZoom = currentLat && currentLng ? 15 : 12;

    if (!mapInstanceRef.current) {
      try {
        const map = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView(defaultCenter, initialZoom);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap contributors",
        }).addTo(map);

        L.control.zoom({ position: "bottomright" }).addTo(map);
        mapInstanceRef.current = map;
      } catch (err: any) {
        console.error("Leaflet init error:", err);
        setMapError("Failed to initialize map container.");
      }
    }

    const map = mapInstanceRef.current;
    if (!map) return;

    if (currentLat !== null && currentLng !== null) {
      const isGps = locationSource === "gps";
      const icon = createMarkerIcon(L, isGps);

      if (!markerRef.current) {
        const marker = L.marker([currentLat, currentLng], { icon }).addTo(map);
        marker.bindPopup(
          `<b>${isGps ? "Verified GPS Position" : "Agent Location"}</b><br/>Lat: ${currentLat.toFixed(6)}<br/>Lng: ${currentLng.toFixed(6)}`
        );
        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng([currentLat, currentLng]);
        markerRef.current.setIcon(icon);
        markerRef.current.getPopup()?.setContent(
          `<b>${isGps ? "Verified GPS Position" : "Agent Location"}</b><br/>Lat: ${currentLat.toFixed(6)}<br/>Lng: ${currentLng.toFixed(6)}`
        );
      }
    }
  }, [isLeafletReady, currentLat, currentLng, locationSource, createMarkerIcon]);

  // Center Map Control
  const handleCenterMap = () => {
    if (!mapInstanceRef.current || currentLat === null || currentLng === null) return;
    mapInstanceRef.current.setView([currentLat, currentLng], 15, { animate: true });
  };

  // 5. Detect GPS Location (Triggered strictly on user click)
  const handleDetectLocation = () => {
    setGeoError(null);
    setSaveSuccess(null);
    setSaveError(null);

    if (typeof window === "undefined" || !navigator.geolocation) {
      setGeoError("Geolocation is not supported by your current browser.");
      return;
    }

    setIsDetecting(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = parseFloat(position.coords.latitude.toFixed(6));
        const lng = parseFloat(position.coords.longitude.toFixed(6));
        const acc = Math.round(position.coords.accuracy);

        setLatitudeInput(lat.toString());
        setLongitudeInput(lng.toString());
        setCurrentLat(lat);
        setCurrentLng(lng);
        setGpsAccuracy(acc);
        setCaptureTime(new Date().toLocaleTimeString());
        setLocationSource("gps");
        setValidationError(null);
        setIsDetecting(false);

        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], 16, { animate: true });
        }
      },
      (error) => {
        setIsDetecting(false);
        let message = "Unable to retrieve GPS coordinates.";
        if (error.code === error.PERMISSION_DENIED) {
          message = "Location permission denied. Please allow location access in your browser or enter coordinates manually below.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = "Location information is unavailable from your device GPS sensors. You may enter coordinates manually.";
        } else if (error.code === error.TIMEOUT) {
          message = "GPS location request timed out. Please retry or enter coordinates manually.";
        }
        setGeoError(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  // 6. Manual Coordinate Input Handlers with Strict Validation
  const handleManualCoordinateChange = (field: "lat" | "lng", value: string) => {
    setSaveSuccess(null);
    setSaveError(null);
    setLocationSource("manual");
    setGpsAccuracy(null); // Manual entries CANNOT have verified GPS accuracy

    const newLatStr = field === "lat" ? value : latitudeInput;
    const newLngStr = field === "lng" ? value : longitudeInput;

    if (field === "lat") setLatitudeInput(value);
    if (field === "lng") setLongitudeInput(value);

    // Validate both coordinates
    const latNum = parseFloat(newLatStr);
    const lngNum = parseFloat(newLngStr);

    if (!newLatStr.trim() || !newLngStr.trim()) {
      setValidationError("Both Latitude and Longitude are required together.");
      setCurrentLat(null);
      setCurrentLng(null);
      return;
    }

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setValidationError("Latitude must be a valid number between -90.0 and 90.0 degrees.");
      setCurrentLat(null);
      setCurrentLng(null);
      return;
    }

    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setValidationError("Longitude must be a valid number between -180.0 and 180.0 degrees.");
      setCurrentLat(null);
      setCurrentLng(null);
      return;
    }

    // Valid manual coordinates
    setValidationError(null);
    setCurrentLat(latNum);
    setCurrentLng(lngNum);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([latNum, lngNum], mapInstanceRef.current.getZoom(), { animate: true });
    }
  };

  // 7. Save Location to FastAPI Backend
  const handleSaveLocation = async () => {
    if (currentLat === null || currentLng === null) {
      setValidationError("Please detect or enter valid coordinates before saving.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const source = locationSource === "gps" ? "gps" : "manual";

    try {
      const updatedAgent = await updateAgentLocation(
        {
          latitude: currentLat,
          longitude: currentLng,
          location_source: source,
          gps_accuracy: source === "gps" ? gpsAccuracy : null,
          battery_level: currentAgent.batteryLevel || 85,
        },
        session?.access_token
      );

      const savedTime = new Date().toLocaleTimeString();
      setSaveSuccess({
        message: `Location successfully persisted as ${source === "gps" ? "GPS-verified" : "manual entry"}.`,
        timestamp: savedTime,
      });
      setLocationSource(source);

      // Refresh AgentContext state from server
      await refreshAgentData(false);

      if (onLocationSaved) {
        onLocationSaved();
      }
    } catch (err: any) {
      console.error("Save location error:", err);
      const detail = err?.detail || err?.message || "Failed to persist location to backend service.";
      setSaveError(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-beige-card border border-beige-border p-4 sm:p-6 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-beige-border">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-beige-text flex items-center gap-2">
            <Compass className="w-4 h-4 text-beige-terracotta" />
            <span>Agent Location &amp; GPS Telemetry</span>
          </h3>
          <p className="text-xs text-beige-muted mt-0.5">
            Detect real-time GPS coordinates via browser geolocation or update location manually.
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2 shrink-0">
          {locationSource === "gps" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-beige-olive-subtle border border-beige-olive/30 text-beige-olive text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-beige-olive animate-pulse" />
              <span>GPS Detected • {gpsAccuracy ? `±${gpsAccuracy}m` : "Verified"}</span>
            </span>
          )}

          {locationSource === "manual" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-beige-sand border border-beige-border text-beige-text text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-beige-terracotta" />
              <span>Manual Entry • Unverified</span>
            </span>
          )}

          {locationSource === "saved" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-beige-sand/60 border border-beige-border text-beige-muted text-[11px] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-beige-olive" />
              <span>Server Synced</span>
            </span>
          )}
        </div>
      </div>

      {/* Geolocation Notice / HTTPS Requirement Alert */}
      <div className="p-3 rounded-xl bg-beige-sand/40 border border-beige-border text-[11px] text-beige-muted flex items-start gap-2.5">
        <Info className="w-4 h-4 text-beige-terracotta shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-beige-text">Browser Geolocation Notice: </span>
          GPS auto-detection requires explicit browser permission. In production, geolocation is strictly restricted to secure <strong>HTTPS</strong> domains. If permission is denied or unavailable, use the manual fallback below.
        </div>
      </div>

      {/* Error Banners */}
      {geoError && (
        <div className="p-3.5 rounded-xl bg-[#FDF2F0] border border-beige-terracotta/30 text-beige-terracotta text-xs flex items-start justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Geolocation Request Failed</span>
              <p className="mt-0.5 leading-relaxed">{geoError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDetectLocation}
            className="px-2.5 py-1 rounded-lg bg-beige-terracotta text-white font-bold text-[11px] hover:bg-beige-terracotta/90 transition shrink-0"
          >
            Retry GPS
          </button>
        </div>
      )}

      {saveError && (
        <div className="p-3 rounded-xl bg-[#FDF2F0] border border-beige-terracotta/30 text-beige-terracotta text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-3 rounded-xl bg-beige-olive-subtle border border-beige-olive/30 text-beige-olive text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            {saveSuccess.message} <strong>(Saved at {saveSuccess.timestamp})</strong>
          </span>
        </div>
      )}

      {/* Primary Action Button: Detect My Location */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <button
          type="button"
          onClick={handleDetectLocation}
          disabled={isDetecting || isSaving}
          className="flex-1 py-3 px-5 rounded-xl bg-beige-terracotta hover:bg-beige-terracotta/90 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDetecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Acquiring Device GPS Signal...</span>
            </>
          ) : (
            <>
              <Crosshair className="w-4 h-4" />
              <span>Detect My Location</span>
            </>
          )}
        </button>

        {locationSource === "manual" && (
          <button
            type="button"
            onClick={handleDetectLocation}
            className="py-3 px-4 rounded-xl bg-beige-sand hover:bg-beige-sand/80 border border-beige-border text-beige-text font-bold text-xs transition flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Switch to GPS Detection</span>
          </button>
        )}
      </div>

      {/* Coordinate Display & Manual Editable Fields */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-beige-text">
            Operational Coordinates
          </label>
          <span className="text-[10px] text-beige-muted">
            Editable for manual adjustment (-90° to 90°, -180° to 180°)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Latitude */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-beige-muted">Latitude</span>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                placeholder="e.g. 12.971600"
                value={latitudeInput}
                onChange={(e) => handleManualCoordinateChange("lat", e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-beige-sand/50 border border-beige-border text-beige-text text-xs font-mono placeholder-beige-muted/50 focus:outline-none focus:ring-2 focus:ring-beige-terracotta/40 focus:border-beige-terracotta transition"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-beige-muted pointer-events-none">
                °N / °S
              </span>
            </div>
          </div>

          {/* Longitude */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-beige-muted">Longitude</span>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                placeholder="e.g. 77.594600"
                value={longitudeInput}
                onChange={(e) => handleManualCoordinateChange("lng", e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-beige-sand/50 border border-beige-border text-beige-text text-xs font-mono placeholder-beige-muted/50 focus:outline-none focus:ring-2 focus:ring-beige-terracotta/40 focus:border-beige-terracotta transition"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-beige-muted pointer-events-none">
                °E / °W
              </span>
            </div>
          </div>
        </div>

        {/* Validation Warning */}
        {validationError && (
          <p className="text-[11px] text-beige-terracotta font-medium flex items-center gap-1.5 animate-in fade-in">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{validationError}</span>
          </p>
        )}

        {/* GPS Metres Accuracy & Capture Time readout */}
        {locationSource === "gps" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-xl bg-beige-olive-subtle/50 border border-beige-olive/20 text-xs">
            <div>
              <span className="text-[10px] text-beige-muted block">GPS Accuracy</span>
              <span className="font-bold text-beige-olive text-xs">
                ±{gpsAccuracy ?? 0} metres
              </span>
            </div>
            <div>
              <span className="text-[10px] text-beige-muted block">Capture Timestamp</span>
              <span className="font-bold text-beige-text text-xs">
                {captureTime || "Just now"}
              </span>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-[10px] text-beige-muted block">Verification Status</span>
              <span className="font-bold text-beige-olive text-xs flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>GPS Detected</span>
              </span>
            </div>
          </div>
        )}

        {locationSource === "manual" && (
          <div className="p-2.5 rounded-xl bg-beige-sand/50 border border-beige-border text-xs flex items-center justify-between">
            <span className="text-[11px] text-beige-muted">
              Source: <strong>Manual Entry</strong> (Unverified GPS)
            </span>
            <span className="text-[10px] font-semibold text-beige-terracotta bg-beige-terracotta-subtle px-2 py-0.5 rounded-md border border-beige-terracotta/20">
              Excluded from Auto-Geofence
            </span>
          </div>
        )}
      </div>

      {/* Live Map Preview */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-beige-text">Live Map Preview</span>
            {currentLat !== null && currentLng !== null && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-beige-sand text-beige-text border border-beige-border">
                {currentLat.toFixed(5)}, {currentLng.toFixed(5)}
              </span>
            )}
          </div>

          {currentLat !== null && currentLng !== null && (
            <button
              type="button"
              onClick={handleCenterMap}
              className="text-[11px] font-bold text-beige-terracotta hover:underline flex items-center gap-1"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Center Marker</span>
            </button>
          )}
        </div>

        {/* Map Container */}
        <div className="relative w-full h-56 rounded-2xl bg-[#EBE4D5] border border-beige-border overflow-hidden shadow-2xs">
          {mapError ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
              <AlertTriangle className="w-6 h-6 text-beige-terracotta mb-2" />
              <p className="text-xs font-bold text-beige-text">Map Preview Unavailable</p>
              <p className="text-[10px] text-beige-muted mt-0.5">{mapError}</p>
            </div>
          ) : !currentLat || !currentLng ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-beige-sand/30">
              <MapPin className="w-7 h-7 text-beige-muted/60 mb-2" />
              <p className="text-xs font-bold text-beige-text">No Coordinates Selected</p>
              <p className="text-[11px] text-beige-muted max-w-xs mt-0.5">
                Click &quot;Detect My Location&quot; or enter coordinates above to preview your location on OpenStreetMap.
              </p>
            </div>
          ) : (
            <div ref={mapContainerRef} className="w-full h-full z-10" />
          )}
        </div>
      </div>

      {/* Save Action & Clarification Notice */}
      <div className="pt-2 border-t border-beige-border space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-[11px] text-beige-muted">
            <span className="font-semibold text-beige-text">Real GPS Readiness: </span>
            This action registers your verified initial coordinates. Continuous background GPS tracking is left for subsequent real-time streaming phases.
          </div>

          <button
            type="button"
            onClick={handleSaveLocation}
            disabled={isSaving || currentLat === null || currentLng === null || Boolean(validationError)}
            className="py-2.5 px-5 rounded-xl bg-beige-olive hover:bg-beige-olive-light text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Persisting to Database...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Location to Server</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
