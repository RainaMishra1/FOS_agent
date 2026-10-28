"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAgent } from "@/context/AgentContext";
import { useAuth } from "@/context/AuthContext";
import {
  Compass,
  LayoutDashboard,
  CalendarCheck,
  Route,
  History,
  User,
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
  LogOut,
  Loader2,
} from "lucide-react";

interface AgentLayoutProps {
  children: React.ReactNode;
}

export default function AgentLayout({ children }: AgentLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentAgent, isOnDuty, toggleDuty, stats, notification, clearNotification } = useAgent();
  const { user, profile, role, isAuthenticated, isLoading, signOut } = useAuth();
  const isAgentAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/agent/login" || pathname === "/agent/signup";

  // Route protection for Field Agent Portal
  useEffect(() => {
    if (isAgentAuthPage) return;
    if (!isLoading && (!isAuthenticated || !profile || (role !== "agent" && role !== "admin"))) {
      const redirectParam = pathname ? `?redirectTo=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${redirectParam}`);
    }
  }, [isLoading, isAuthenticated, isAgentAuthPage, profile, role, pathname, router]);

  if (isAgentAuthPage) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-beige-bg flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-[#1E3F35] text-white flex items-center justify-center animate-pulse shadow-md mb-3">
          <Compass className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-beige-text">Verifying Field Agent Session...</p>
        <span className="text-[10px] text-beige-muted mt-1">Authenticating with Supabase Auth</span>
      </div>
    );
  }

  if (!isAuthenticated || !profile || (role !== "agent" && role !== "admin")) {
    return (
      <div className="min-h-screen bg-beige-bg flex flex-col items-center justify-center p-4">
        <Loader2 className="w-6 h-6 text-[#1E3F35] animate-spin mb-2" />
        <p className="text-xs text-beige-muted">Redirecting to login...</p>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const agentName = profile?.full_name || currentAgent.name;
  const agentInitials = agentName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navItems = [
    { name: "Dashboard", href: "/agent/dashboard", icon: LayoutDashboard },
    { name: "My Visits", href: "/agent/visits", icon: CalendarCheck, badge: stats.todayRemaining || 0 },
    { name: "My Routes", href: "/agent/routes", icon: Route },
    { name: "Visit History", href: "/agent/history", icon: History },
    { name: "My Profile", href: "/agent/profile", icon: User },
  ];

  const currentDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="min-h-screen bg-[#F5F2EB] text-beige-text flex flex-col md:flex-row antialiased selection:bg-[#1E3F35] selection:text-white">
      {/* Toast Notification Banner */}
      {notification && (
        <div className="fixed top-4 left-4 right-4 z-[9999] max-w-md mx-auto animate-in slide-in-from-top duration-200">
          <div
            className={`p-3 rounded-2xl shadow-xl border flex items-center justify-between gap-3 text-xs backdrop-blur-md ${
              notification.type === "success"
                ? "bg-white/95 border-[#CDE1D2] text-[#1E3F35]"
                : notification.type === "error"
                ? "bg-white/95 border-red-300 text-red-700"
                : "bg-white/95 border-[#E6DFD3] text-beige-text"
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-[#1E3F35] shrink-0" />
              ) : notification.type === "error" ? (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-beige-muted shrink-0" />
              )}
              <span className="font-medium text-beige-text">
                {typeof notification.message === "string"
                  ? notification.message
                  : typeof notification.message === "object" && notification.message !== null
                  ? (notification.message as any).msg || JSON.stringify(notification.message)
                  : String(notification.message)}
              </span>
            </div>
            <button
              onClick={clearNotification}
              className="p-1 rounded-lg hover:bg-beige-sand text-beige-muted"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar (hidden on mobile, visible on md+) */}
      <aside className="hidden md:flex flex-col justify-between w-64 bg-[#F4EFE6] border-r border-[#E6DFD3] p-4 sticky top-0 h-screen shrink-0 overflow-y-auto">
        <div className="space-y-5">
          {/* Brand Header */}
          <div className="pb-3 border-b border-[#E6DFD3]/80">
            <Link href="/agent/dashboard" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#1E3F35] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-sm tracking-tight text-beige-text block">
                  FOS Agent
                </span>
                <span className="text-[10px] text-beige-muted block">Field Operations System</span>
              </div>
            </Link>
          </div>

          {/* Agent Profile Card */}
          <div className="p-3.5 rounded-2xl bg-white border border-[#E6DFD3] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-[#1E3F35] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                  {agentInitials}
                </div>
                <div className="truncate">
                  <span className="font-bold text-xs text-beige-text block leading-tight truncate">
                    {agentName}
                  </span>
                  <span className="text-[10px] text-beige-muted block">
                    Agent ID: {profile?.agent_code || currentAgent.agentCode || (profile?.id ? profile.id.slice(0, 8) : "Active")}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-beige-muted shrink-0" />
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-[#E6DFD3]/60">
              <button
                type="button"
                onClick={toggleDuty}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                  isOnDuty
                    ? "bg-[#EAF2EC] text-[#1E3F35] border border-[#CDE1D2]"
                    : "bg-[#FAF3E7] text-[#9E6924] border border-[#F0E4D0]"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isOnDuty ? "bg-[#1E3F35]" : "bg-[#9E6924]"}`} />
                <span>{isOnDuty ? "On Duty" : "Off Duty"}</span>
              </button>
              <span className="text-xs text-beige-muted font-medium">Field Agent</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition group ${
                    isActive
                      ? "bg-[#EAF2EC] text-[#1E3F35] font-bold shadow-2xs before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-[#1E3F35] before:rounded-r"
                      : "text-beige-muted hover:text-beige-text hover:bg-[#EAE4D9]/60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 transition ${
                        isActive ? "text-[#1E3F35]" : "text-beige-muted group-hover:text-beige-text"
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>

                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="w-5 h-5 rounded-full bg-[#1E3F35] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Desktop Sidebar Footer: Device & Location Card */}
        <div className="pt-4 space-y-3">
          <div className="p-3.5 rounded-2xl bg-white border border-[#E6DFD3] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-beige-text">Device & Location</span>
              <ChevronRight className="w-3.5 h-3.5 text-beige-muted" />
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-beige-muted">
                <ShieldCheck className="w-4 h-4 text-beige-muted" />
                <span className="text-[11px]">Geofence Status</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#1E3F35]" />
                <span className="text-[11px] font-semibold text-[#1E3F35]">Within Active Zone</span>
                <ChevronRight className="w-3 h-3 text-beige-muted" />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 bg-[#F5F2EB]/90 backdrop-blur-md border-b border-[#E6DFD3] px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#EAF2EC] text-[#1E3F35] flex items-center justify-center font-bold text-xs shadow-2xs">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm text-beige-text block leading-tight">
                FOS Mobile
              </span>
              <span className="text-[11px] text-beige-muted block">
                Field Operations • {currentAgent.territory.split("(")[0].trim() || "Mumbai"}
              </span>
            </div>
          </div>

          {/* Right Header: Verified Agent Badge + Date + Duty Toggle + Logout */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Logged-in Agent Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#E6DFD3] text-xs font-semibold text-beige-text shadow-2xs">
              <User className="w-3.5 h-3.5 text-[#1E3F35] shrink-0" />
              <span className="font-bold text-xs text-beige-text truncate max-w-[130px] sm:max-w-none">
                {agentName} ({profile?.agent_code || currentAgent.agentCode || (profile?.id ? profile.id.slice(0, 8) : "Active")})
              </span>
            </div>

            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#E6DFD3] text-xs font-medium text-beige-text shadow-2xs">
              <CalendarCheck className="w-3.5 h-3.5 text-beige-muted" />
              <span>{currentDate}</span>
            </div>

            {/* Duty Status Pill Dropdown */}
            <button
              type="button"
              onClick={toggleDuty}
              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition shadow-2xs cursor-pointer ${
                isOnDuty
                  ? "bg-[#EAF2EC] text-[#1E3F35] border-[#CDE1D2] hover:bg-[#DFEDE2]"
                  : "bg-[#FAF3E7] text-[#9E6924] border-[#F0E4D0] hover:bg-[#F5ECD9]"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnDuty ? "bg-[#1E3F35]" : "bg-[#9E6924]"
                }`}
              />
              <span>{isOnDuty ? "On Duty" : "Off Duty"}</span>
              <span className="text-[10px] opacity-70">▾</span>
            </button>

            {/* Sign Out Button */}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-beige-sand border border-[#E6DFD3] text-xs font-semibold text-beige-text hover:text-red-700 transition shadow-2xs cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 md:pb-10">
          {children}
        </main>

        {/* Mobile Fixed Bottom Navigation Bar (md:hidden) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E6DFD3] px-2 py-1.5 shadow-[0_-4px_12px_rgba(48,45,40,0.05)]">
          <div className="flex items-center justify-around">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition relative min-w-[56px] ${
                    isActive
                      ? "text-[#1E3F35] font-bold"
                      : "text-beige-muted hover:text-beige-text"
                  }`}
                >
                  <div className="relative">
                    <Icon className="w-5 h-5" />
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="absolute -top-1 -right-2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#1E3F35] text-white leading-tight">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] mt-0.5 tracking-tight">
                    {item.name.replace("My ", "")}
                  </span>
                  {isActive && (
                    <span className="w-1 h-1 rounded-full bg-[#1E3F35] mt-0.5" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
