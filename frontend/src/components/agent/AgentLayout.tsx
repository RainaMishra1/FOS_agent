"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAgent } from "@/context/AgentContext";
import DutyToggleButton from "@/components/agent/DutyToggleButton";
import InstallAppBanner from "@/components/agent/InstallAppBanner";
import LocationPrompt from "@/components/agent/LocationPrompt";
import BrandMark from "@/components/shell/BrandMark";
import PageBand from "@/components/shell/PageBand";
import { useAuth } from "@/context/AuthContext";
import {
  Compass,
  LayoutDashboard,
  CalendarCheck,
  Route,
  History,
  User,
  ClipboardList,
  Power,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Sparkles,
  X,
  Bell,
  CheckCircle2,
  AlertCircle,
  Info,
  Loader2,
  ChevronLeft,
} from "lucide-react";

interface AgentLayoutProps {
  children: React.ReactNode;
}

export default function AgentLayout({ children }: AgentLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentAgent, isOnDuty, toggleDuty, stats, notification, clearNotification } = useAgent();
  const { profile, role, isAuthenticated, isLoading, signOut } = useAuth();
  const isAgentAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/agent/login" || pathname === "/agent/signup";

  // Route protection for Field Agent Portal
  const isAdminUser = role === "admin";

  useEffect(() => {
    if (isAgentAuthPage) return;

    if (!isLoading) {
      if (!isAuthenticated || !profile) {
        const redirectParam = pathname ? `?redirectTo=${encodeURIComponent(pathname)}` : "";
        router.replace(`/login${redirectParam}`);
        return;
      }

      // If user is Admin, strictly redirect to Operations Admin Portal
      if (isAdminUser) {
        router.replace("/admin/dashboard");
        return;
      }

      if (role !== "agent") {
        router.replace("/login");
      }
    }
  }, [isLoading, isAuthenticated, isAgentAuthPage, profile, role, isAdminUser, pathname, router]);

  if (isAgentAuthPage) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-beige-bg flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-[#00843E] text-white flex items-center justify-center animate-pulse shadow-md mb-3">
          <Compass className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-sm font-semibold text-beige-text">Loading…</p>
      </div>
    );
  }

  if (isAdminUser) {
    return (
      <div className="min-h-screen bg-beige-bg flex flex-col items-center justify-center p-4">
        <Loader2 className="w-6 h-6 text-[#393185] animate-spin mb-2" />
        <p className="text-xs text-beige-muted">Opening admin…</p>
      </div>
    );
  }

  if (!isAuthenticated || !profile || role !== "agent") {
    return (
      <div className="min-h-screen bg-beige-bg flex flex-col items-center justify-center p-4">
        <Loader2 className="w-6 h-6 text-[#393185] animate-spin mb-2" />
        <p className="text-xs text-beige-muted">Opening sign-in…</p>
      </div>
    );
  }


  const agentName = profile?.full_name || currentAgent.name;
  const agentInitials = agentName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navItems = [
    { name: "Home", href: "/agent/dashboard", icon: LayoutDashboard },
    { name: "Visits", href: "/agent/visits", icon: CalendarCheck, badge: stats.todayRemaining || 0 },
    { name: "Routes", href: "/agent/routes", icon: Route },
    { name: "Leads", href: "/agent/leads", icon: ClipboardList },
    { name: "History", href: "/agent/history", icon: History },
    { name: "Profile", href: "/agent/profile", icon: User },
  ];

  const currentDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  const today = currentDate;
  const agentCode = profile?.agent_code || currentAgent.agentCode || "";
  const sidebarItems = navItems;
  // Phone: 5 tabs; History is reached from Profile.
  const tabItems = navItems.filter((item) => item.href !== "/agent/history");
  const isActive = (href: string) => pathname === href || (href !== "/agent/dashboard" && Boolean(pathname?.startsWith(href + "/")));
  const isSubPage = Boolean(pathname?.startsWith("/agent/visits/"));
  const pageTitle = isSubPage ? "Visit" : navItems.find((item) => isActive(item.href))?.name ?? "FOS";

  return (
    <div className="min-h-screen bg-[#F5F5FA] text-beige-text antialiased selection:bg-[#393185] selection:text-white">
      {/* Toast */}
      {notification && (
        <div
          className="fixed left-3 right-3 z-[9999] max-w-md mx-auto animate-in slide-in-from-top duration-200"
          style={{ top: "max(env(safe-area-inset-top), 12px)" }}
        >
          <div
            className={`p-3 rounded-2xl shadow-xl border flex items-center justify-between gap-3 text-sm bg-white ${
              notification.type === "success" ? "border-[#B7E1C8] text-[#006F34]" : notification.type === "error" ? "border-red-300 text-red-700" : "border-[#E3E2EE] text-beige-text"
            }`}
            role="status"
          >
            <div className="flex items-center gap-2">
              {notification.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : notification.type === "error" ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <Info className="w-4 h-4 shrink-0" />
              )}
              <span className="font-medium">
                {typeof notification.message === "string"
                  ? notification.message
                  : typeof notification.message === "object" && notification.message !== null
                  ? (notification.message as any).msg || JSON.stringify(notification.message)
                  : String(notification.message)}
              </span>
            </div>
            <button onClick={clearNotification} className="p-1 rounded-lg hover:bg-[#F1F0F8] text-beige-muted" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Desktop: black strip ─────────────────────────── */}
      <div className="hidden md:block bg-black text-white/90 text-xs">
        <div className="mx-auto flex h-9 max-w-[1400px] items-center justify-end gap-6 px-10">
          <span>{today}</span>
          {/* Name opens Profile; Log out is at the end of that page. */}
          <Link href="/agent/profile" className="flex items-center gap-1.5 hover:text-white">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#00843E] text-[9px] font-bold">{agentInitials}</span>
            {agentName}
            {agentCode && <span className="text-white/50">· {agentCode}</span>}
          </Link>
        </div>
      </div>

      {/* ── Desktop: white header with navigation ─────────── */}
      <header className="hidden md:block sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#E3E2EE] shadow-[0_4px_20px_-12px_rgba(57,49,133,.25)]">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-8 px-10">
          <Link href="/agent/dashboard" aria-label="Home">
            <BrandMark />
          </Link>
          <nav className="flex h-full items-stretch gap-1" aria-label="Main">
            {sidebarItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`nav-link flex items-center gap-1.5 px-3 text-sm transition ${active ? "font-bold text-[#393185]" : "font-medium text-[#45435A] hover:text-[#393185]"}`}
                >
                  {item.name}
                  {"badge" in item && item.badge ? (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#00843E] text-white text-[11px] font-bold flex items-center justify-center">{item.badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <DutyToggleButton size="md" />
          </div>
        </div>
      </header>

      {/* ── Phone: indigo app bar ─────────────────────────── */}
      <header
        className="md:hidden sticky top-0 z-30 bg-[#393185] text-white px-4 pb-3 flex items-center justify-between gap-3 shadow-md"
        style={{ paddingTop: "max(env(safe-area-inset-top), 10px)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isSubPage ? (
            <button onClick={() => router.back()} className="-ml-1 p-1.5 rounded-full hover:bg-white/10" aria-label="Back">
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <BrandMark size={30} withText={false} light />
          )}
          <h1 key={pageTitle} className="text-lg font-bold tracking-tight truncate animate-rise">{pageTitle}</h1>
        </div>
        <DutyToggleButton size="sm" className="!bg-white/10 !text-white !border-white/25" />
      </header>

      {/* ── Desktop: indigo title band ─────────────────────── */}
      <div className="hidden md:block">
        <PageBand title={pageTitle} />
      </div>

      <main className="relative mx-auto w-full max-w-[1400px] px-4 pt-4 pb-28 md:-mt-12 md:px-10 md:pb-12 md:pt-0">
        <div className="md:rounded-3xl md:bg-[#F5F5FA] md:p-6 md:shadow-[0_20px_50px_-30px_rgba(22,21,31,.45)]">
          <LocationPrompt />
          <div className="md:hidden">
            <InstallAppBanner />
          </div>
          <div key={pathname} className="page-rise">{children}</div>
        </div>
      </main>

      {/* ── Phone: bottom tabs ─────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E3E2EE] shadow-[0_-6px_20px_-10px_rgba(57,49,133,.25)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Main"
      >
        <div className="grid grid-cols-5">
          {tabItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[58px] px-0.5 transition ${active ? "text-[#393185]" : "text-[#7B7991]"}`}
                aria-current={active ? "page" : undefined}
              >
                <span className={`relative flex items-center justify-center h-7 w-11 rounded-full transition-all duration-200 ${active ? "bg-[#393185] text-white scale-105" : ""}`}>
                  <Icon className="w-5 h-5" />
                  {"badge" in item && item.badge ? (
                    <span className="absolute -top-1 right-0.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold bg-[#00843E] text-white flex items-center justify-center ring-2 ring-white">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                <span className={`text-[10px] leading-tight ${active ? "font-bold" : "font-medium"}`}>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
