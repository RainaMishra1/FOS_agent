"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminNotification, fetchAdminNotifications } from "@/lib/api";

const SEEN_KEY = "fos-admin-alerts-seen-at";
const POLL_MS = 30000;

function readSeenAt(): number {
  try {
    const value = window.localStorage.getItem(SEEN_KEY);
    if (value) return Number(value) || 0;
    // First time on this device: only the last 24 hours count as new.
    return Date.now() - 24 * 3600 * 1000;
  } catch {
    return 0;
  }
}

export function notificationText(item: AdminNotification) {
  return item.kind === "completed"
    ? `${item.agent_name} completed ${item.customer_name}`
    : `${item.agent_name} started ${item.customer_name}`;
}

/**
 * Polls agent check-ins / completions every 30 s (only while the tab is visible).
 * New ones raise `onArrive` (pop-up) and, if allowed, a browser notification.
 */
export function useAdminNotifications(token: string | null | undefined, onArrive: (items: AdminNotification[]) => void) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const [error, setError] = useState(false);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  useEffect(() => {
    setSeenAt(readSeenAt());
    if (typeof window !== "undefined" && "Notification" in window) setPermission(Notification.permission);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await fetchAdminNotifications(token);
      setError(false);
      setItems(result.items);
      const known = knownIdsRef.current;
      if (known) {
        const fresh = result.items.filter((item) => !known.has(item.id));
        if (fresh.length) {
          onArriveRef.current(fresh);
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
            fresh.slice(0, 3).forEach((item) => {
              try {
                new Notification("FOS", { body: notificationText(item), tag: item.id, icon: "/icons/icon-192.png" });
              } catch {
                // some browsers only allow notifications from a service worker
              }
            });
          }
        }
      }
      knownIdsRef.current = new Set(result.items.map((item) => item.id));
    } catch {
      setError(true);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" || ("Notification" in window && Notification.permission === "granted")) void load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, load]);

  const markSeen = useCallback(() => {
    const now = Date.now();
    setSeenAt(now);
    try {
      window.localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      // ignore
    }
  }, []);

  const enableDesktopAlerts = useCallback(async () => {
    if (!("Notification" in window)) return;
    setPermission(await Notification.requestPermission());
  }, []);

  const unread = items.filter((item) => new Date(item.at).getTime() > seenAt).length;
  return { items, unread, seenAt, error, markSeen, permission, enableDesktopAlerts, reload: load };
}
