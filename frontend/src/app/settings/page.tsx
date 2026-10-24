"use client";

import React, { useState } from "react";
import { initialSettings } from "@/lib/mockData";
import { SystemSettings } from "@/types";
import {
  Settings,
  ShieldCheck,
  Building,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Radio,
  Compass,
} from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>(initialSettings);
  const [saveToast, setSaveToast] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div className="pb-2 border-b border-beige-border/80">
        <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
          System Configuration & Geofence Rules
        </h2>
        <p className="text-xs text-beige-muted mt-0.5">
          Enterprise operational parameters, GPS verification boundaries, and dispatch rules.
        </p>
      </div>

      {saveToast && (
        <div className="p-3.5 rounded-xl bg-beige-olive-subtle border border-beige-olive/40 text-xs font-medium text-beige-olive flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Configuration saved to local application state. (UI demonstration mode active).</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Organization Profile */}
        <div className="p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-beige-border">
            <Building className="w-4 h-4 text-beige-terracotta" />
            <h3 className="font-bold text-sm text-beige-text">Organization Profile</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-beige-text mb-1">
                Organization / Company Name
              </label>
              <input
                type="text"
                value={settings.orgName}
                onChange={(e) => setSettings({ ...settings, orgName: e.target.value })}
                className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text focus:outline-none focus:border-beige-terracotta"
              />
            </div>

            <div>
              <label className="block font-semibold text-beige-text mb-1">
                Operational Support Email
              </label>
              <input
                type="email"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text focus:outline-none focus:border-beige-terracotta"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-beige-text mb-1">
                Primary Operating Timezone
              </label>
              <select
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text focus:outline-none focus:border-beige-terracotta"
              >
                <option value="UTC+05:30 (Asia/Kolkata)">Asia/Kolkata (IST - UTC+05:30)</option>
                <option value="UTC+10:00 (Australia/Sydney)">Australia/Sydney (AEST - UTC+10:00)</option>
                <option value="UTC-05:00 (America/New_York)">America/New_York (EST - UTC-05:00)</option>
                <option value="UTC+00:00 (Europe/London)">Europe/London (GMT - UTC+00:00)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Geofence & Location Thresholds */}
        <div className="p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-beige-border">
            <Compass className="w-4 h-4 text-beige-olive" />
            <h3 className="font-bold text-sm text-beige-text">Geofence & Precision Verification</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Geofence Radius */}
            <div>
              <label className="block font-semibold text-beige-text mb-1">
                Geofence Radius (Meters)
              </label>
              <input
                type="number"
                min="700"
                max="800"
                value={settings.geofenceRadiusMeters}
                onChange={(e) =>
                  setSettings({ ...settings, geofenceRadiusMeters: Number(e.target.value) })
                }
                className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text font-mono focus:outline-none focus:border-beige-terracotta"
              />
              <span className="text-[10px] text-beige-muted mt-1 block">
                Server enforcement is currently set to 750m.
              </span>
            </div>

            {/* Max Acceptable GPS Accuracy */}
            <div>
              <label className="block font-semibold text-beige-text mb-1">
                Max GPS Inaccuracy (Meters)
              </label>
              <input
                type="number"
                min="10"
                max="200"
                value={settings.maxGpsAccuracyMeters}
                onChange={(e) =>
                  setSettings({ ...settings, maxGpsAccuracyMeters: Number(e.target.value) })
                }
                className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text font-mono focus:outline-none focus:border-beige-terracotta"
              />
              <span className="text-[10px] text-beige-muted mt-1 block">
                Check-in rejects fixes with reported uncertainty &gt; 100m.
              </span>
            </div>

            {/* Location Freshness Threshold */}
            <div>
              <label className="block font-semibold text-beige-text mb-1">
                Stale GPS Threshold (Seconds)
              </label>
              <input
                type="number"
                min="60"
                max="1800"
                value={settings.locationStaleThresholdSeconds}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    locationStaleThresholdSeconds: Number(e.target.value),
                  })
                }
                className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text font-mono focus:outline-none focus:border-beige-terracotta"
              />
              <span className="text-[10px] text-beige-muted mt-1 block">
                Flags agent stale after 300s (5m).
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Enforcement & Automation Policies */}
        <div className="p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-beige-border">
            <ShieldCheck className="w-4 h-4 text-beige-amber" />
            <h3 className="font-bold text-sm text-beige-text">Operational Automation</h3>
          </div>

          <div className="space-y-3 text-xs">
            <label className="flex items-center justify-between p-3 rounded-xl bg-beige-bg border border-beige-border cursor-pointer hover:bg-beige-sand/40 transition">
              <div>
                <span className="font-semibold text-beige-text block">
                  Mandatory Geofence Check-in Enforcement
                </span>
                <span className="text-[11px] text-beige-muted">
                  Requires fresh mobile GPS coordinates within 750m of the saved customer pin to check in or complete a visit.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.enforceGeofenceCheckin}
                onChange={(e) =>
                  setSettings({ ...settings, enforceGeofenceCheckin: e.target.checked })
                }
                className="w-4 h-4 rounded text-beige-terracotta focus:ring-beige-terracotta accent-[#B76E52]"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-beige-bg border border-beige-border cursor-pointer hover:bg-beige-sand/40 transition">
              <div>
                <span className="font-semibold text-beige-text block">
                  Automated Nearest-Agent Queue Dispatch
                </span>
                <span className="text-[11px] text-beige-muted">
                  Calculates straight-line PostGIS distance to suggest closest available field rep.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.autoDispatchEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, autoDispatchEnabled: e.target.checked })
                }
                className="w-4 h-4 rounded text-beige-terracotta focus:ring-beige-terracotta accent-[#B76E52]"
              />
            </label>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-xs text-beige-muted">
            <AlertCircle className="w-4 h-4 text-beige-muted shrink-0" />
            <span>Updates local UI state only. Database values remain preserved.</span>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-sm flex items-center gap-2 transition"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
}
