"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiErrorMessage, fetchOperatingSettings, OperatingSettings } from "@/lib/api";
import { Gauge, LogOut, Mail, MapPinned, Phone, Route, ShieldCheck, Timer } from "lucide-react";

export default function AdminProfilePage() {
  const { profile, user, session, signOut } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<OperatingSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    let cancelled = false;
    fetchOperatingSettings(session.access_token)
      .then((data) => !cancelled && setSettings(data))
      .catch((err) => !cancelled && setSettingsError(apiErrorMessage(err, "Could not load settings.")));
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const name = profile?.full_name || "Admin";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const email = profile?.email || user?.email || "";

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const settingRows = settings
    ? [
        { icon: MapPinned, label: "Check-in radius", value: `${settings.check_in_radius_meters} m` },
        { icon: Gauge, label: "GPS accuracy needed", value: `${settings.max_gps_accuracy_meters} m or better` },
        { icon: Timer, label: "Location expires after", value: `${Math.round(settings.location_timeout_seconds / 60)} min` },
        { icon: Route, label: "Routing", value: `${settings.routing_provider}${settings.live_traffic ? " · live traffic" : ""}` },
      ]
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Account */}
      <section className="relative overflow-hidden rounded-3xl bg-white border border-[#E3E2EE] p-5 md:p-6">
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#F1F0F8] animate-floaty" />
        <div className="relative flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-2xl bg-[#393185] text-white text-xl font-extrabold flex items-center justify-center">
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-[#16151F] truncate">{name}</h2>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#E6F4EC] px-2.5 py-0.5 text-xs font-bold text-[#00843E]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin
            </span>
          </div>
        </div>
        <div className="relative mt-5 grid gap-2 sm:grid-cols-2">
          {email && (
            <div className="flex items-center gap-3 rounded-2xl bg-[#F5F5FA] px-4 py-3">
              <Mail className="h-4 w-4 text-[#62607A]" />
              <span className="min-w-0">
                <span className="block text-xs text-[#62607A]">Email</span>
                <span className="block text-sm font-semibold truncate">{email}</span>
              </span>
            </div>
          )}
          {profile?.phone && (
            <div className="flex items-center gap-3 rounded-2xl bg-[#F5F5FA] px-4 py-3">
              <Phone className="h-4 w-4 text-[#62607A]" />
              <span className="min-w-0">
                <span className="block text-xs text-[#62607A]">Phone</span>
                <span className="block text-sm font-semibold truncate">{profile.phone}</span>
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Settings (read-only: these are the values the server enforces) */}
      <section className="space-y-2">
        <h3 className="text-base font-bold text-[#16151F]">Settings</h3>
        <div className="rounded-2xl bg-white border border-[#E3E2EE] divide-y divide-[#E3E2EE] overflow-hidden">
          {settingRows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F1F0F8] text-[#393185]">
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm text-[#62607A]">{label}</span>
              <span className="text-sm font-bold text-[#16151F] text-right">{value}</span>
            </div>
          ))}
          {!settings && !settingsError && (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 rounded bg-[#F1F0F8] animate-pulse" />
              ))}
            </div>
          )}
          {settingsError && <p className="p-4 text-sm text-red-700">{settingsError}</p>}
        </div>
      </section>

      <button
        type="button"
        onClick={handleSignOut}
        className="w-full sm:w-auto h-12 px-6 rounded-2xl bg-white border border-red-200 text-[#9E3F3F] text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-50 transition cursor-pointer"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </button>
    </div>
  );
}
