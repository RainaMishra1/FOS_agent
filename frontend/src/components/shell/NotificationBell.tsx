"use client";

import React from "react";
import Link from "next/link";
import { Bell, CheckCircle2, PlayCircle } from "lucide-react";
import type { AdminNotification } from "@/lib/api";
import { notificationText } from "@/hooks/useAdminNotifications";

export function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function NotificationIcon({ kind }: { kind: AdminNotification["kind"] }) {
  return kind === "completed" ? (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E6F4EC] text-[#00843E]">
      <CheckCircle2 className="h-5 w-5" />
    </span>
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F0F8] text-[#393185]">
      <PlayCircle className="h-5 w-5" />
    </span>
  );
}

interface NotificationBellProps {
  items: AdminNotification[];
  unread: number;
  seenAt: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  permission: NotificationPermission | "unsupported";
  onEnableDesktop: () => void;
  light?: boolean;
}

export default function NotificationBell({ items, unread, seenAt, open, onToggle, onClose, permission, onEnableDesktop, light = false }: NotificationBellProps) {
  return (
    <div className="relative z-30">
      <button
        onClick={onToggle}
        className={`relative h-10 w-10 rounded-full flex items-center justify-center transition cursor-pointer ${light ? "text-white hover:bg-white/10" : "text-[#16151F] hover:bg-[#F1F0F8]"}`}
        aria-label={unread ? `Alerts, ${unread} new` : "Alerts"}
      >
        <Bell className={`w-5 h-5 ${unread ? "origin-top animate-[ring_1.2s_ease-in-out_1]" : ""}`} key={unread} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#00843E] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 rounded-2xl bg-white border border-[#E3E2EE] shadow-xl text-sm text-[#16151F] animate-rise overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E3E2EE]">
            <span className="font-bold">Alerts</span>
            {permission === "default" && (
              <button onClick={onEnableDesktop} className="text-xs font-semibold text-[#393185] hover:underline cursor-pointer">
                Turn on desktop alerts
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-[#E3E2EE]">
            {items.length === 0 && <div className="py-8 text-center text-[#62607A]">No alerts</div>}
            {items.map((item) => {
              const isNew = new Date(item.at).getTime() > seenAt;
              return (
                <Link
                  key={item.id}
                  href="/view"
                  onClick={onClose}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-[#F7F7FB] transition ${isNew ? "bg-[#F7F7FB]" : ""}`}
                >
                  <NotificationIcon kind={item.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug">
                      <span className="font-bold">{item.agent_name}</span> {item.kind === "completed" ? "completed" : "started"}{" "}
                      <span className="font-semibold">{item.customer_name}</span>
                    </span>
                    <span className="block text-xs text-[#62607A] mt-0.5">
                      {timeAgo(item.at)}
                      {item.visit_code ? ` · ${item.visit_code}` : ""}
                    </span>
                  </span>
                  {isNew && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#00843E]" aria-label="New" />}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function NotificationToasts({ toasts, onDismiss }: { toasts: AdminNotification[]; onDismiss: (id: string) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed right-3 left-3 sm:left-auto sm:w-96 z-[9999] space-y-2" style={{ top: "max(env(safe-area-inset-top), 12px)" }} role="status">
      {toasts.map((item) => (
        <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-white border border-[#E3E2EE] shadow-xl px-4 py-3 animate-rise">
          <NotificationIcon kind={item.kind} />
          <span className="min-w-0 flex-1 text-sm">{notificationText(item)}</span>
          <button onClick={() => onDismiss(item.id)} className="text-xs font-semibold text-[#62607A] hover:text-[#16151F] cursor-pointer" aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
