"use client";

import React, { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISS_KEY = "fos-install-dismissed-at";
const DISMISS_DAYS = 7;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function recentlyDismissed() {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    Boolean((navigator as any).standalone)
  );
}

/** "Install FOS Agent" card: Android/desktop use the browser prompt, iPhone gets Add-to-Home-Screen steps. */
export default function InstallAppBanner() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
      setHidden(false);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    if (isIos && isSafari) {
      setShowIosHint(true);
      setHidden(false);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    setDeferred(null);
    if (choice?.outcome === "accepted") setHidden(true);
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#CDE1D2] bg-white p-3 shadow-2xs">
      <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-beige-text">Install FOS Agent</p>
        {showIosHint && !deferred ? (
          <p className="text-[11px] text-beige-muted">
            Tap <Share className="inline h-3 w-3 -mt-0.5" /> Share, then <b>Add to Home Screen</b>.
          </p>
        ) : (
          <p className="text-[11px] text-beige-muted">Open it from your home screen, full-screen like an app.</p>
        )}
      </div>
      {deferred && (
        <button
          type="button"
          onClick={install}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#1E3F35] px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-full p-1.5 text-beige-muted hover:bg-beige-sand cursor-pointer"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
