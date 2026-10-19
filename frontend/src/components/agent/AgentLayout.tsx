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
  Battery,
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
  const { user, profile, isAuthenticated, isLoading, signOut } = useAuth();

  // Route protection for Field Agent Portal
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const redirectParam = pathname ? `?redirectTo=${encodeURIComponent(pathname)}` : "";
      router.push(`/login${redirectParam}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-beige-bg flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-beige-terracotta text-white flex items-center justify-center animate-pulse shadow-md mb-3">
          <Compass className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-beige-text">Verifying Field Agent Session...</p>
        <span className="text-[10px] text-beige-muted mt-1">Authenticating with Supabase Auth</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-beige-bg flex flex-col items-center justify-center p-4">
        <Loader2 className="w-6 h-6 text-beige-terracotta animate-spin mb-2" />
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
    { name: "My Dashboard", href: "/agent/dashboard", icon: LayoutDashboard },
    { name: "My Visits", href: "/agent/visits", icon: CalendarCheck, badge: stats.todayRemaining },
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
    <div className="min-h-screen bg-beige-bg text-beige-text flex flex-col md:flex-row antialiased selection:bg-beige-terracotta selection:text-white">
      {/* Toast Notification Banner */}
      {notification && (
        <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto animate-in slide-in-from-top duration-200">
          <div
            className={`p-3 rounded-2xl shadow-xl border flex items-center justify-between gap-3 text-xs backdrop-blur-md ${
              notification.type === "success"
                ? "bg-beige-card/95 border-beige-olive text-beige-olive"
                : notification.type === "error"
                ? "bg-[#FDF2F0]/95 border-beige-terracotta text-beige-terracotta"
                : "bg-beige-card/95 border-beige-border text-beige-text"
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-beige-olive shrink-0" />
              ) : notification.type === "error" ? (
                <AlertCircle className="w-4 h-4 text-beige-terracotta shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-beige-muted shrink-0" />
              )}
              <span className="font-medium text-beige-text">{notification.message}</span>
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
      <aside className="hidden md:flex flex-col justify-between w-64 bg-beige-sidebar border-r border-beige-border p-4 sticky top-0 h-screen shrink-0">
        <div className="space-y-6">
          {/* Brand & Mode Switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-3 border-b border-beige-border/80">
              <Link href="/agent/dashboard" className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-beige-terracotta text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-sm tracking-tight text-beige-text block">
                    FOS Agent
                  </span>
                  <span className="text-[10px] text-beige-muted block">Field Operations</span>
                </div>
              </Link>
            </div>

            {/* Quick Switch back to Admin Console if permitted */}
            {profile?.role === "admin" && (
              <Link
                href="/"
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-beige-card/70 hover:bg-beige-card border border-beige-border text-beige-muted hover:text-beige-text transition shadow-2xs group"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-beige-olive" />
                  Admin Console
                </span>
                <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
              </Link>
            )}
          </div>

          {/* Agent Duty Profile Card */}
          <div className="p-3 rounded-2xl bg-beige-card border border-beige-border shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-beige-olive text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    {agentInitials}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                      isOnDuty ? "bg-beige-olive" : "bg-beige-muted"
                    }`}
                  />
                </div>
                <div className="truncate">
                  <span className="font-bold text-xs text-beige-text block leading-tight truncate">
                    {agentName}
                  </span>
                  <span className="text-[10px] text-beige-muted block">{profile?.agent_code || currentAgent.id}</span>
                </div>
              </div>
            </div>

            {/* Duty Toggle Button */}
            <button
              type="button"
              onClick={toggleDuty}
              className={`w-full py-1.5 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border shadow-2xs ${
                isOnDuty
                  ? "bg-beige-olive-subtle text-beige-olive border-beige-olive/30 hover:bg-beige-olive/20"
                  : "bg-beige-sand text-beige-muted border-beige-border hover:bg-beige-border"
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isOnDuty ? "Status: ON DUTY" : "Status: OFF DUTY"}</span>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition group ${
                    isActive
                      ? "bg-beige-card text-beige-text font-bold shadow-xs border border-beige-border"
                      : "text-beige-muted hover:text-beige-text hover:bg-beige-sidebar-hover"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 transition ${
                        isActive ? "text-beige-terracotta" : "text-beige-muted group-hover:text-beige-text"
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>

                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-beige-terracotta text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Desktop Sidebar Footer with Sign Out */}
        <div className="pt-3 border-t border-beige-border/80 text-[11px] text-beige-muted space-y-2">
          <div className="flex items-center justify-between">
            <span>Battery: {currentAgent.batteryLevel}%</span>
            <Battery className="w-3.5 h-3.5 text-beige-olive" />
          </div>
          <div className="flex items-center justify-between">
            <span>Geofence: 100m Active</span>
            <ShieldCheck className="w-3.5 h-3.5 text-beige-olive" />
          </div>
          <button
            onClick={handleSignOut}
            className="w-full mt-2 flex items-center gap-2 p-2 rounded-xl text-xs text-beige-muted hover:text-beige-terracotta hover:bg-beige-card transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Sticky Header */}
        <header className="sticky top-0 z-30 bg-beige-card/95 backdrop-blur-md border-b border-beige-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link href="/agent/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-beige-terracotta text-white flex items-center justify-center font-bold text-xs shadow-xs">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-xs sm:text-sm text-beige-text block leading-tight">
                  FOS Mobile
                </span>
                <span className="text-[10px] text-beige-muted block">{currentDate}</span>
              </div>
            </Link>
          </div>

          {/* Right Header: On Duty Toggle + Sign Out */}
          <div className="flex items-center gap-2">
            {/* Duty Status Pill Toggle */}
            <button
              type="button"
              onClick={toggleDuty}
              className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border transition shadow-2xs ${
                isOnDuty
                  ? "bg-beige-olive-subtle text-beige-olive border-beige-olive/30"
                  : "bg-beige-sand text-beige-muted border-beige-border"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnDuty ? "bg-beige-olive animate-pulse" : "bg-beige-muted"
                }`}
              />
              <span>{isOnDuty ? "On Duty" : "Off Duty"}</span>
            </button>

            {/* Sign Out Button on Mobile */}
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-xl bg-beige-sand/60 hover:bg-beige-sand border border-beige-border text-beige-muted hover:text-beige-terracotta transition"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-4xl w-full mx-auto pb-24 md:pb-8">
          {children}
        </main>

        {/* Mobile Fixed Bottom Navigation Bar (md:hidden) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-beige-card/95 backdrop-blur-md border-t border-beige-border px-2 py-1.5 shadow-[0_-4px_12px_rgba(48,45,40,0.05)]">
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
                      ? "text-beige-terracotta font-bold"
                      : "text-beige-muted hover:text-beige-text"
                  }`}
                >
                  <div className="relative">
                    <Icon className="w-5 h-5" />
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="absolute -top-1 -right-2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-beige-terracotta text-white leading-tight">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] mt-0.5 tracking-tight">
                    {item.name.replace("My ", "")}
                  </span>
                  {isActive && (
                    <span className="w-1 h-1 rounded-full bg-beige-terracotta mt-0.5" />
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
