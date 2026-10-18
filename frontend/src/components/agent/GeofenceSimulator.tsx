"use client";

import React, { useState } from "react";
import { AgentVisit } from "@/types/agent";
import { useAgent } from "@/context/AgentContext";
import {
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Compass,
  CheckCircle2,
  Lock,
  Sliders,
  RotateCcw,
  Sparkles,
} from "lucide-react";

interface GeofenceSimulatorProps {
  visit: AgentVisit;
  onCheckInSuccess?: () => void;
  compact?: boolean;
}

export default function GeofenceSimulator({
  visit,
  onCheckInSuccess,
  compact = false,
}: GeofenceSimulatorProps) {
  const { checkInVisit, updateMockDistance, isOnDuty } = useAgent();
  const [distance, setDistance] = useState(visit.mockDistanceMeters);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const isWithinGeofence = distance <= 100;
  const isAlreadyCheckedIn = visit.geofenceVerified || visit.status === "in_progress" || visit.status === "completed";

  const handleDistanceChange = (newDist: number) => {
    setDistance(newDist);
    updateMockDistance(visit.id, newDist);
  };

  const handleCheckIn = () => {
    if (!isWithinGeofence || isAlreadyCheckedIn) return;
    setIsCheckingIn(true);
    setTimeout(() => {
      const res = checkInVisit(visit.id);
      setIsCheckingIn(false);
      if (res.success && onCheckInSuccess) {
        onCheckInSuccess();
      }
    }, 600);
  };

  return (
    <div className="rounded-2xl bg-beige-card border border-beige-border p-4 sm:p-5 shadow-xs space-y-4">
      {/* Geofence Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              isAlreadyCheckedIn
                ? "bg-beige-olive-subtle text-beige-olive"
                : isWithinGeofence
                ? "bg-beige-olive-subtle text-beige-olive"
                : "bg-beige-terracotta-subtle text-beige-terracotta"
            }`}
          >
            {isAlreadyCheckedIn ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Compass className="w-4 h-4" />
            )}
          </div>
          <div>
            <h4 className="text-xs font-bold text-beige-text flex items-center gap-1.5">
              100-Metre Geofence Verification
              <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-beige-sand text-beige-muted border border-beige-border">
                Frontend Simulation
              </span>
            </h4>
            <p className="text-[11px] text-beige-muted">
              {visit.customerName} • Policy radius: 100m
            </p>
          </div>
        </div>

        {/* Distance Pill */}
        <div
          className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-colors ${
            isWithinGeofence
              ? "bg-beige-olive-subtle text-beige-olive border-beige-olive/30"
              : "bg-beige-terracotta-subtle text-beige-terracotta border-beige-terracotta/30"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isWithinGeofence ? "bg-beige-olive animate-pulse" : "bg-beige-terracotta"
            }`}
          />
          <span>{distance} m away</span>
        </div>
      </div>

      {/* Visual Radar / Simulation Canvas */}
      <div className="relative h-44 rounded-xl bg-[#EBE4D5] border border-beige-border overflow-hidden flex items-center justify-center">
        {/* Background Grid Pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#777064" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* 100m Geofence Boundary (Center is Customer) */}
        <div className="relative flex items-center justify-center">
          {/* Geofence Outer Wave */}
          <div
            className={`absolute w-36 h-36 rounded-full border-2 transition-all duration-300 ${
              isWithinGeofence
                ? "border-beige-olive/50 bg-beige-olive/10 animate-ping opacity-25"
                : "border-beige-terracotta/40 bg-beige-terracotta/5"
            }`}
          />
          {/* Geofence Boundary Ring */}
          <div
            className={`w-36 h-36 rounded-full border-2 border-dashed flex items-center justify-center transition-colors duration-300 ${
              isWithinGeofence
                ? "border-beige-olive bg-beige-olive/15"
                : "border-beige-terracotta/60 bg-beige-terracotta/10"
            }`}
          >
            <span className="absolute -top-3 px-2 py-0.5 rounded-full text-[9px] font-bold bg-beige-card text-beige-muted border border-beige-border">
              100m Radius
            </span>
          </div>

          {/* Customer Target Marker (Center) */}
          <div className="absolute z-10 flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-beige-terracotta text-white flex items-center justify-center shadow-md">
              <MapPin className="w-4 h-4 fill-white text-beige-terracotta" />
            </div>
            <span className="text-[9px] font-bold text-beige-text bg-beige-card/90 px-1 rounded mt-0.5 whitespace-nowrap shadow-xs">
              Customer Site
            </span>
          </div>

          {/* Agent Marker (Simulated position based on distance) */}
          {/* At distance <= 100, agent is within circle (radius ~65px). At 300m, agent is outside */}
          {(() => {
            const visualOffset = Math.min(100, Math.max(15, (distance / 150) * 60));
            // Position agent relative to customer
            return (
              <div
                className="absolute z-20 transition-all duration-300 flex flex-col items-center"
                style={{
                  transform: `translate(${visualOffset}px, -${visualOffset * 0.7}px)`,
                }}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 border-white transition-colors ${
                    isWithinGeofence
                      ? "bg-beige-olive text-white animate-bounce"
                      : "bg-beige-text text-white"
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-beige-card text-beige-text border border-beige-border mt-0.5 shadow-xs whitespace-nowrap">
                  Agent ({distance}m)
                </span>
              </div>
            );
          })()}
        </div>

        {/* Status Overlay Badge */}
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] pointer-events-none">
          <span className="px-2 py-0.5 rounded-md bg-beige-card/90 backdrop-blur-xs text-beige-muted border border-beige-border">
            Coords: {visit.coordinates.lat.toFixed(4)}, {visit.coordinates.lng.toFixed(4)}
          </span>
          <span
            className={`px-2 py-0.5 rounded-md font-bold backdrop-blur-xs border ${
              isWithinGeofence
                ? "bg-beige-olive-subtle/95 text-beige-olive border-beige-olive/30"
                : "bg-beige-terracotta-subtle/95 text-beige-terracotta border-beige-terracotta/30"
            }`}
          >
            {isWithinGeofence ? "✓ Inside Geofence" : "✕ Outside Permitted Radius"}
          </span>
        </div>
      </div>

      {/* Interactive Simulation Controls */}
      <div className="p-3 rounded-xl bg-beige-sand/50 border border-beige-border space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-beige-text flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-beige-muted" />
            Simulate Mock Distance
          </span>
          <span className="font-mono text-[11px] text-beige-muted">
            Current: <strong className="text-beige-text">{distance} meters</strong>
          </span>
        </div>

        {/* Range Slider */}
        <div className="space-y-1">
          <input
            type="range"
            min="10"
            max="400"
            step="5"
            value={distance}
            disabled={isAlreadyCheckedIn}
            onChange={(e) => handleDistanceChange(Number(e.target.value))}
            className="w-full accent-beige-terracotta h-1.5 bg-beige-border rounded-lg cursor-pointer disabled:opacity-50"
          />
          <div className="flex justify-between text-[10px] text-beige-muted">
            <span>10m (At Door)</span>
            <span className="text-beige-olive font-bold">100m Threshold</span>
            <span>400m (Away)</span>
          </div>
        </div>

        {/* Quick Presets */}
        {!isAlreadyCheckedIn && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => handleDistanceChange(35)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
                distance === 35
                  ? "bg-beige-olive text-white border-beige-olive"
                  : "bg-beige-card text-beige-text border-beige-border hover:bg-beige-sand"
              }`}
            >
              At Gate (35m)
            </button>
            <button
              type="button"
              onClick={() => handleDistanceChange(85)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
                distance === 85
                  ? "bg-beige-olive text-white border-beige-olive"
                  : "bg-beige-card text-beige-text border-beige-border hover:bg-beige-sand"
              }`}
            >
              In Parking (85m)
            </button>
            <button
              type="button"
              onClick={() => handleDistanceChange(280)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
                distance === 280
                  ? "bg-beige-terracotta text-white border-beige-terracotta"
                  : "bg-beige-card text-beige-text border-beige-border hover:bg-beige-sand"
              }`}
            >
              In Traffic (280m)
            </button>
            <button
              type="button"
              onClick={() => handleDistanceChange(visit.mockDistanceMeters)}
              className="px-2 py-1 rounded-lg text-[11px] text-beige-muted border border-beige-border hover:bg-beige-sand ml-auto flex items-center gap-1"
              title="Reset initial distance"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Geofence Status Messages & Action Button */}
      {isAlreadyCheckedIn ? (
        <div className="p-3 rounded-xl bg-beige-olive-subtle border border-beige-olive/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-beige-olive shrink-0" />
            <div>
              <p className="text-xs font-bold text-beige-olive">
                Check-in Verified via 100m Geofence
              </p>
              <p className="text-[11px] text-beige-muted">
                {visit.checkInTime ? `Checked in at ${visit.checkInTime}` : "Verified"} • Accuracy ±{visit.accuracyMeters || 12}m
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-beige-olive px-2.5 py-1 rounded-full bg-white/70 border border-beige-olive/30">
            Active On-Site
          </span>
        </div>
      ) : isWithinGeofence ? (
        <div className="space-y-2.5">
          <div className="p-2.5 rounded-xl bg-beige-olive-subtle/80 border border-beige-olive/30 text-xs text-beige-olive flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Permitted for Check-In! </span>
              <span>
                Mock location is within the 100-metre threshold ({distance}m away). You may now record your arrival.
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCheckIn}
            disabled={isCheckingIn || !isOnDuty}
            className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold bg-beige-olive hover:bg-beige-olive-light text-white shadow-md transition flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50"
          >
            {isCheckingIn ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Verifying Geofence & Recording Check-In...
              </>
            ) : !isOnDuty ? (
              <>
                <Lock className="w-4 h-4" />
                Must be On Duty to Check In
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Confirm Geofenced Check-In ({distance}m)
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="p-3 rounded-xl bg-[#FDF2F0] border border-beige-terracotta/30 text-xs text-beige-terracotta flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-beige-terracotta" />
            <div className="space-y-0.5">
              <p className="font-bold">Outside Permitted 100m Geofence Radius</p>
              <p className="text-[11px] text-beige-muted">
                Your simulated position is <strong>{distance} metres</strong> from {visit.customerName}. FOS policy enforces check-in only within 100 metres of the customer premises.
              </p>
              <p className="text-[10px] text-beige-muted italic pt-0.5">
                Tip: Use the slider or click &ldquo;At Gate (35m)&rdquo; above to simulate arriving inside the geofence.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled
            className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-beige-sand text-beige-muted border border-beige-border cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4 text-beige-muted" />
            Check-In Locked (Outside 100m Radius)
          </button>
        </div>
      )}
    </div>
  );
}
