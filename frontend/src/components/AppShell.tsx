"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass,
  LayoutDashboard,
  Map,
  Users,
  Building2,
  CalendarCheck,
  Route,
  Layers,
  BarChart3,
  Settings,
  Menu,
  X,
  Bell,
  ChevronDown,
  Activity,
  CheckCircle2,
  ShieldCheck,
  Search,
  LogOut,
  Loader2,
} from "lucide-react";
import HealthChecker from "./HealthChecker";
import { useAuth } from "@/context/AuthContext";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, role, isAuthenticated, isLoading, signOut } = useAuth();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(3);

  const isLoginPage = pathname === "/login";
  const isAgentRoute = Boolean(pathname?.startsWith("/agent"));

  // 1. Client-side Route Guard for Admin Portal (called unconditionally for consistent hook execution)
  useEffect(() => {
    if (isLoginPage || isAgentRoute) {
      return;
    }

    if (!isLoading) {
      if (!isAuthenticated) {
        const redirectParam = pathname && pathname !== "/" ? `?redirectTo=${encodeURIComponent(pathname)}` : "";
        router.push(`/login${redirectParam}`);
      } else if (role === "agent") {
        // Field agents must not access the admin control center
        router.push("/agent/dashboard");
      }
    }
  }, [isLoading, isAuthenticated, role, pathname, router, isLoginPage, isAgentRoute]);

  // 2. Bypass layout chrome for login or mobile-first agent portal AFTER all hooks are called
  if (isLoginPage || isAgentRoute) {
    return <>{children}</>;
  }


  // Loading state while verifying Supabase session
  if (isLoading) {
    return (
      <div className="min-h-screen bg-beige-bg flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-beige-terracotta text-white flex items-center justify-center animate-pulse shadow-md mb-3">
          <Compass className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-beige-text">Verifying Field Operations Session...</p>
        <span className="text-[10px] text-beige-muted mt-1">Authenticating with Supabase Auth</span>
      </div>
    );
  }

  // If not authenticated or non-admin, render brief placeholder while redirect triggers
  if (!isAuthenticated || role === "agent") {
    return (
      <div className="min-h-screen bg-beige-bg flex flex-col items-center justify-center p-4">
        <Loader2 className="w-6 h-6 text-beige-terracotta animate-spin mb-2" />
        <p className="text-xs text-beige-muted">Redirecting to authorized portal...</p>
      </div>
    );
  }

  const navItems = [
    { name: "Overview", href: "/", icon: LayoutDashboard },
    { name: "Live Operations Map", href: "/map", icon: Map },
    { name: "Field Agents", href: "/agents", icon: Users },
    { name: "Customers & Leads", href: "/customers", icon: Building2 },
    { name: "Assignments", href: "/assignments", icon: CalendarCheck },
    { name: "Route Planning", href: "/routes", icon: Route },
    { name: "Territories", href: "/territories", icon: Layers },
    { name: "Reports & Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  const getPageTitle = () => {
    switch (pathname) {
      case "/":
        return "Operations Overview";
      case "/map":
        return "Live Operations Map";
      case "/agents":
        return "Field Agents";
      case "/customers":
        return "Customers & Leads";
      case "/assignments":
        return "Task Assignments";
      case "/routes":
        return "Route Planning & Optimization";
      case "/territories":
        return "Territory Management";
      case "/analytics":
        return "Reports & Analytics";
      case "/settings":
        return "System Settings";
      default:
        return "Field Operations";
    }
  };

  const currentDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Operations Admin";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-beige-bg text-beige-text flex flex-col lg:flex-row antialiased">
      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-beige-sidebar border-r border-beige-border flex flex-col justify-between transition-all duration-300 ease-in-out lg:static ${
          mobileMenuOpen ? "translate-x-0 w-64 shadow-2xl" : "-translate-x-full lg:translate-x-0"
        } ${sidebarCollapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        {/* Sidebar Brand Header */}
        <div>
          <div className="h-16 px-4 border-b border-beige-border/80 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-beige-terracotta text-white flex items-center justify-center shrink-0 shadow-sm">
                <Compass className="w-5 h-5" />
              </div>
              {!sidebarCollapsed && (
                <div className="truncate">
                  <span className="font-bold text-sm tracking-tight text-beige-text block">
                    FOS <span className="font-normal text-beige-muted text-xs">— Operations</span>
                  </span>
                  <span className="text-[10px] text-beige-muted uppercase tracking-wider block">
                    Enterprise Admin
                  </span>
                </div>
              )}
            </Link>

            {/* Mobile close button */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sidebar-hover"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 group relative ${
                    isActive
                      ? "bg-beige-card text-beige-text font-semibold shadow-[0_1px_3px_rgba(48,45,40,0.06)] border border-beige-border"
                      : "text-beige-muted hover:text-beige-text hover:bg-beige-sidebar-hover"
                  }`}
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? "text-beige-terracotta" : "text-beige-muted group-hover:text-beige-text"
                    }`}
                  />
                  {!sidebarCollapsed && <span className="truncate">{item.name}</span>}

                  {isActive && !sidebarCollapsed && (
                    <span className="w-1.5 h-1.5 rounded-full bg-beige-terracotta ml-auto" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Quick link to Mobile Agent App */}
          <div className="px-3 pb-2">
            <Link
              href="/agent/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold bg-beige-terracotta-subtle/80 text-beige-terracotta hover:bg-beige-terracotta hover:text-white transition-all duration-150 border border-beige-terracotta/30 shadow-xs group"
              title={sidebarCollapsed ? "Open Field Agent App" : undefined}
            >
              <Compass className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full">
                  <span>Field Agent App</span>
                  <span className="text-[10px] bg-beige-card/80 group-hover:bg-white/20 px-1.5 py-0.5 rounded font-mono">
                    Mobile
                  </span>
                </div>
              )}
            </Link>
          </div>
        </div>

        {/* Sidebar Footer & Backend Status */}
        <div className="p-3 border-t border-beige-border/80 space-y-2">
          <button
            onClick={() => setShowHealthModal(true)}
            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-beige-card/70 hover:bg-beige-card border border-beige-border text-xs text-left transition shadow-xs ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
            title="Inspect Backend Health & Phase 2 Database Status"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-beige-olive shrink-0 animate-pulse" />
            {!sidebarCollapsed && (
              <div className="truncate">
                <span className="font-semibold text-beige-text block text-[11px]">Backend Services</span>
                <span className="text-[10px] text-beige-muted">Auth & DB Active</span>
              </div>
            )}
          </button>

          {/* Sign Out Button in Sidebar */}
          <button
            onClick={handleSignOut}
            className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-xs text-beige-muted hover:text-beige-terracotta hover:bg-beige-card transition ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
            title="Sign Out of Session"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 px-4 sm:px-6 lg:px-8 bg-beige-card/90 backdrop-blur-md border-b border-beige-border sticky top-0 z-30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop Collapse Toggle */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex p-2 rounded-xl text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <Menu className="w-4 h-4" />
            </button>

            <div>
              <h1 className="text-base sm:text-lg font-bold text-beige-text tracking-tight flex items-center gap-2">
                {getPageTitle()}
              </h1>
              <span className="text-[11px] text-beige-muted hidden sm:inline-block">
                Field Operations & Agent Management System
              </span>
            </div>
          </div>

          {/* Right Header Utilities */}
          <div className="flex items-center gap-3">
            {/* Date Pill */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-beige-sand/60 border border-beige-border text-xs text-beige-muted">
              <span>{currentDate}</span>
            </div>

            {/* Notifications Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setUnreadNotifications(0);
                }}
                className="relative p-2 rounded-xl bg-beige-sand/60 hover:bg-beige-sand border border-beige-border text-beige-text transition"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-beige-terracotta text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadNotifications}
                  </span>
                )}
              </button>

              {/* Notification Popover */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-beige-card border border-beige-border shadow-xl p-4 z-50 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-beige-border">
                    <span className="font-bold text-beige-text">Operational Alerts</span>
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-beige-muted hover:text-beige-text"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="py-2 space-y-2.5">
                    <div className="p-2 rounded-xl bg-beige-sand/40 border border-beige-border/60">
                      <p className="font-semibold text-beige-text text-[11px]">Geofence Verified Check-in</p>
                      <p className="text-[10px] text-beige-muted mt-0.5">
                        Marcus Vance verified check-in at Sterling Towers (14m accuracy).
                      </p>
                    </div>
                    <div className="p-2 rounded-xl bg-beige-sand/40 border border-beige-border/60">
                      <p className="font-semibold text-beige-text text-[11px]">Route Optimized (Zone 3)</p>
                      <p className="text-[10px] text-beige-muted mt-0.5">
                        Priya Sharma completed Koramangala sequence ahead of schedule.
                      </p>
                    </div>
                    <div className="p-2 rounded-xl bg-beige-amber-subtle/60 border border-beige-amber/30">
                      <p className="font-semibold text-beige-amber text-[11px]">Visit Delayed</p>
                      <p className="text-[10px] text-beige-muted mt-0.5">
                        Aerospace Component Systems meeting pushed by 45 mins.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile & Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 pl-2 border-l border-beige-border/80 text-left hover:opacity-85 transition"
              >
                <div className="w-8 h-8 rounded-full bg-beige-olive text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  {initials}
                </div>
                <div className="hidden sm:block text-left text-xs">
                  <span className="font-semibold text-beige-text block leading-tight">
                    {displayName}
                  </span>
                  <span className="text-[10px] text-beige-muted block capitalize">
                    {role || "Administrator"}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-beige-muted hidden sm:block" />
              </button>

              {/* User Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-beige-card border border-beige-border shadow-xl p-2 z-50 text-xs animate-in fade-in duration-100">
                  <div className="px-3 py-2 border-b border-beige-border mb-1">
                    <p className="font-bold text-beige-text truncate">{displayName}</p>
                    <p className="text-[10px] text-beige-muted truncate">{user?.email}</p>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-beige-olive-subtle text-beige-olive mt-1 uppercase">
                      {role || "Admin"}
                    </span>
                  </div>
                  <Link
                    href="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-beige-text hover:bg-beige-sand transition"
                  >
                    <Settings className="w-3.5 h-3.5 text-beige-muted" />
                    <span>System Settings</span>
                  </Link>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      handleSignOut();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-beige-terracotta hover:bg-[#FDF2F0] transition font-medium text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Backend Health Check Modal */}
      {showHealthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-2xl bg-beige-card border border-beige-border shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-beige-border mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-beige-olive" />
                <h3 className="font-bold text-sm text-beige-text">Backend Infrastructure Monitor</h3>
              </div>
              <button
                onClick={() => setShowHealthModal(false)}
                className="p-1 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <HealthChecker />
            <div className="mt-4 pt-3 border-t border-beige-border text-center">
              <button
                onClick={() => setShowHealthModal(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-beige-sidebar hover:bg-beige-sidebar-hover text-beige-text"
              >
                Close Monitor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
