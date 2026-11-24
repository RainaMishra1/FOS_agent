"use client";

import React, { useEffect, useState } from "react";
import { MapPin, MapPinOff, RefreshCw } from "lucide-react";
import { useAgent } from "@/context/AgentContext";

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function isInstalledApp() {
  return window.matchMedia?.("(display-mode: standalone)").matches || Boolean((navigator as any).standalone);
}

/** Steps to unblock location, for the phone the agent is holding. */
function fixSteps(platform: Platform, installed: boolean): string[] {
  if (platform === "ios") {
    return [
      "Open Settings → Privacy & Security → Location Services and turn it on.",
      installed ? "Scroll to Safari Websites → choose While Using the App." : "Scroll to Safari Websites → choose While Using the App.",
      "Come back here and tap Try again.",
    ];
  }
  if (platform === "android") {
    return installed
      ? [
          "Open Chrome → ⋮ menu → Settings → Site settings → Location.",
          "Find fos-agent.vercel.app under Blocked → tap it → Allow.",
          "Phone Settings → Apps → Chrome → Permissions → Location → Allow.",
          "Turn on Location in quick settings, come back and tap Try again.",
        ]
      : [
          "Tap the icon left of the address bar → Permissions → Location → Allow.",
          "Phone Settings → Apps → Chrome → Permissions → Location → Allow.",
          "Turn on Location in quick settings, come back and tap Try again.",
        ];
  }
  return ["Click the icon left of the address bar → Location → Allow.", "Then click Try again."];
}

/** Shown at the top of the agent app whenever location isn't working. Hidden once it is. */
export default function LocationPrompt() {
  const { locationStatus, requestLocation } = useAgent();
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [installed, setInstalled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isInstalledApp());
  }, []);

  if (locationStatus === "granted" || locationStatus === "checking") return null;

  const ask = async () => {
    setBusy(true);
    await requestLocation();
    setBusy(false);
  };

  const blocked = locationStatus === "denied";
  const title =
    locationStatus === "prompt"
      ? "Allow location to check in and navigate"
      : blocked
      ? "Location is blocked"
      : locationStatus === "unavailable"
      ? "Turn on your phone's location"
      : locationStatus === "insecure"
      ? "Location needs the secure (https) app link"
      : "This browser can't share location";
  const canAsk = locationStatus === "prompt" || blocked || locationStatus === "unavailable";

  return (
    <div className={`mb-4 rounded-2xl border p-3.5 ${blocked ? "border-red-200 bg-red-50" : "border-[#E3E1F2] bg-white"}`} role="alert">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${blocked ? "bg-red-100 text-red-700" : "bg-[#F1F0F8] text-[#393185]"}`}>
          {blocked || locationStatus === "unavailable" ? <MapPinOff className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
        </span>
        <p className={`flex-1 text-sm font-bold ${blocked ? "text-red-800" : "text-[#16151F]"}`}>{title}</p>
        {canAsk && (
          <button
            type="button"
            onClick={ask}
            disabled={busy}
            className="h-10 shrink-0 rounded-xl bg-[#00843E] px-4 text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
          >
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
            {locationStatus === "prompt" ? "Allow" : "Try again"}
          </button>
        )}
      </div>
      {blocked && (
        <div className="mt-2 pl-[52px]">
          <button type="button" onClick={() => setShowSteps((v) => !v)} className="text-sm font-semibold text-red-800 underline cursor-pointer">
            {showSteps ? "Hide steps" : "How to allow it"}
          </button>
          {showSteps && (
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-red-900">
              {fixSteps(platform, installed).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
