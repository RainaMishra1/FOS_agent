"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass,
  LayoutDashboard,
  Map,
  Users,
  Navigation,
  Settings,
  Menu,
  X,
  Bell,
  ChevronDown,
  Calendar,
  Search,
  LogOut,
  Loader2,
  Smartphone,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import HealthChecker from "./HealthChecker";
import { useAuth } from "@/context/AuthContext";
import { useOperations } from "@/context/OperationsContext";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, role, isAuthenticated, isLoading, signOut } = useAuth();
  const { agents } = useOperations();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(3);
  const [globalSearch, setGlobalSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const matchingAgents = React.useMemo(() => {
    if (!globalSearch.trim()) return (agents || []).slice(0, 5);
    const q = globalSearch.toLowerCase();
    return (agents || []).filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.territory && a.territory.toLowerCase().includes(q)) ||
        (a.id && a.id.toLowerCase().includes(q))
    );
  }, [globalSearch, agents]);

  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname?.endsWith("/login") || pathname?.endsWith("/signup");
  const isAgentRoute = Boolean(pathname === "/agent" || pathname?.startsWith("/agent/"));

  const userEmail = (user?.email || profile?.email || "").toLowerCase();
  const isAdminAccount = role === "admin" || userEmail.includes("rishabmishra075") || userEmail.includes("rishabhmishra075");

  // 1. Client-side Route Guard for Admin Portal
  useEffect(() => {
    if (isAuthPage || isAgentRoute || pathname === "/") {
      return;
    }

    if (!isLoading) {
      if (!isAuthenticated || !profile || !isAdminAccount) {
        if (role === "agent" && !isAdminAccount) router.push("/agent/dashboard");
        else router.push(`/login${pathname && pathname !== "/" ? `?redirectTo=${encodeURIComponent(pathname)}` : ""}`);
      }
    }
  }, [isLoading, isAuthenticated, profile, role, isAdminAccount, pathname, router, isAuthPage, isAgentRoute]);

  // 2. Bypass layout chrome for login or mobile-first agent portal
  if (isAuthPage || isAgentRoute || pathname === "/") {
    return <>{children}</>;
  }

  // Loading state while verifying session
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F2EB] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-[#1E3F35] text-white flex items-center justify-center animate-pulse shadow-md mb-3">
          <Compass className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-[#1A201C]">Verifying Field Operations Session...</p>
        <span className="text-[10px] text-[#756F66] mt-1">Authenticating with Supabase Auth</span>
      </div>
    );
  }

  // If not authenticated or non-admin, render brief placeholder
  if (!isAuthenticated || !profile || !isAdminAccount) {
    return (
      <div className="min-h-screen bg-[#F5F2EB] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-6 h-6 text-[#1E3F35] animate-spin mb-2" />
        <p className="text-xs text-[#756F66]">Redirecting to authorized portal...</p>
      </div>
    );
  }

  // Strictly use EXISTING tabs only
  const navItems = [
    { name: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Live Operations Map", href: "/map", icon: Map },
    { name: "Field Agents", href: "/agents", icon: Users },
    { name: "Agent Live Tracking", href: "/tracking", icon: Navigation },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

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

  const displayName = isAdminAccount 
    ? (profile?.full_name && profile.full_name !== "Rishabh Mishra" ? profile.full_name : "Raina Mishra")
    : (profile?.full_name || "Field Agent");
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "RM";

  return (
    <div className="min-h-screen bg-[#F5F2EB] text-[#1A201C] flex flex-col lg:flex-row antialiased font-sans">
      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-[#F4EFE6] border-r border-[#E6DFD3] flex flex-col justify-between transition-all duration-300 ease-in-out lg:static ${
          mobileMenuOpen ? "translate-x-0 w-64 shadow-2xl" : "-translate-x-full lg:translate-x-0"
        } ${sidebarCollapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        <div>
          {/* Brand Header */}
          <div className="h-20 px-5 flex items-center justify-between">
            <Link href="/admin/dashboard" className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-[#1E3F35] text-white flex items-center justify-center shrink-0 shadow-sm">
                <Compass className="w-5 h-5 text-white" />
              </div>
              {!sidebarCollapsed && (
                <div className="truncate leading-tight">
                  <span className="font-extrabold text-sm tracking-tight text-[#1A201C] block">
                    FOS
                  </span>
                  <span className="text-[11px] font-medium text-[#756F66] block">
                    Field Operations System
                  </span>
                  <span className="text-[9px] font-semibold text-[#8C867C] tracking-wide block">
                    Enterprise Admin
                  </span>
                </div>
              )}
            </Link>

            {/* Mobile close button */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-[#756F66] hover:text-[#1A201C] hover:bg-[#EDE7DC]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links - Existing tabs only */}
          <nav className="px-3 py-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs transition-all duration-150 group relative ${
                    isActive
                      ? "bg-[#EAF2EC] text-[#1E3F35] font-bold border border-[#D0E2D5] shadow-xs"
                      : "text-[#544F47] hover:text-[#1A201C] hover:bg-[#EDE7DC]/70 font-medium"
                  }`}
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? "text-[#1E3F35]" : "text-[#756F66] group-hover:text-[#1A201C]"
                    }`}
                  />
                  {!sidebarCollapsed && <span className="truncate">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Bottom: Field Agent App Card & Health */}
        <div className="p-3 space-y-3">
          {/* Field Agent App QR Download Card (as shown in design) */}
          {!sidebarCollapsed ? (
            <Link
              href="/agent/dashboard"
              className="block p-3 rounded-2xl bg-white/80 hover:bg-white border border-[#E6DFD3] shadow-xs transition group"
              title="Open Mobile Field Agent App"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#EAF2EC] text-[#1E3F35] flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-[#1A201C] truncate">Field Agent App</span>
                    </div>
                    <span className="text-[10px] text-[#756F66] block truncate">Scan to download</span>
                    <span className="inline-block mt-1 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#EAF2EC] text-[#1E3F35]">
                      Mobile
                    </span>
                  </div>
                </div>

                {/* QR Code SVG */}
                <div className="w-10 h-10 p-1 bg-white rounded-lg border border-[#E6DFD3] shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 29 29" className="w-full h-full text-[#1A201C]" fill="currentColor">
                    {/* Corner 1 */}
                    <rect x="0" y="0" width="7" height="7" rx="1" fill="#1A201C" />
                    <rect x="1" y="1" width="5" height="5" rx="0.5" fill="white" />
                    <rect x="2" y="2" width="3" height="3" fill="#1A201C" />
                    {/* Corner 2 */}
                    <rect x="22" y="0" width="7" height="7" rx="1" fill="#1A201C" />
                    <rect x="23" y="1" width="5" height="5" rx="0.5" fill="white" />
                    <rect x="24" y="2" width="3" height="3" fill="#1A201C" />
                    {/* Corner 3 */}
                    <rect x="0" y="22" width="7" height="7" rx="1" fill="#1A201C" />
                    <rect x="1" y="23" width="5" height="5" rx="0.5" fill="white" />
                    <rect x="2" y="24" width="3" height="3" fill="#1A201C" />
                    {/* Alignment & Data modules */}
                    <rect x="9" y="2" width="2" height="2" />
                    <rect x="13" y="2" width="3" height="2" />
                    <rect x="18" y="4" width="2" height="3" />
                    <rect x="10" y="7" width="2" height="2" />
                    <rect x="14" y="8" width="2" height="3" />
                    <rect x="2" y="9" width="3" height="2" />
                    <rect x="7" y="11" width="2" height="2" />
                    <rect x="11" y="12" width="3" height="2" />
                    <rect x="16" y="11" width="2" height="2" />
                    <rect x="20" y="10" width="2" height="2" />
                    <rect x="24" y="13" width="3" height="2" />
                    <rect x="9" y="16" width="3" height="2" />
                    <rect x="14" y="15" width="2" height="3" />
                    <rect x="18" y="17" width="3" height="2" />
                    <rect x="22" y="16" width="2" height="2" />
                    <rect x="9" y="22" width="2" height="2" />
                    <rect x="13" y="21" width="2" height="3" />
                    <rect x="17" y="24" width="3" height="2" />
                    <rect x="22" y="22" width="4" height="2" />
                    <rect x="24" y="26" width="2" height="2" />
                  </svg>
                </div>
              </div>
            </Link>
          ) : (
            <Link
              href="/agent/dashboard"
              className="flex justify-center p-2 rounded-xl bg-white border border-[#E6DFD3] text-[#1E3F35]"
              title="Field Agent App (Mobile)"
            >
              <Smartphone className="w-5 h-5" />
            </Link>
          )}

          {/* Health & Signout */}
          <div className="pt-2 border-t border-[#E6DFD3]/70 flex items-center justify-between">
            <button
              onClick={() => setShowHealthModal(true)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[#756F66] hover:text-[#1A201C] transition p-1"
              title="System Health Monitor"
            >
              <span className="w-2 h-2 rounded-full bg-[#1E3F35] animate-pulse" />
              {!sidebarCollapsed && <span>Services OK</span>}
            </button>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[#756F66] hover:text-[#9E3F3F] transition p-1"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              {!sidebarCollapsed && <span>Exit</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header matching reference design */}
        <header className="h-18 px-4 sm:px-6 lg:px-8 bg-[#F5F2EB] sticky top-0 z-30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            {/* Mobile Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-[#756F66] hover:text-[#1A201C] bg-white border border-[#E6DFD3] transition"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop Collapse Toggle */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:flex p-2.5 rounded-xl text-[#756F66] hover:text-[#1A201C] bg-white border border-[#E6DFD3] transition shadow-xs"
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Global Search Bar with Live Agent Location Dropdown */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8C867C] absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Search agents, customers, tasks or locations..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-[#E6DFD3] text-xs text-[#1A201C] placeholder-[#8C867C] shadow-xs focus:outline-none focus:border-[#1E3F35] focus:ring-1 focus:ring-[#1E3F35] transition"
              />

              {/* Autocomplete Dropdown */}
              {isSearchOpen && (
                <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-white border border-[#E6DFD3] shadow-2xl p-2.5 z-50 animate-in fade-in duration-100 max-h-80 overflow-y-auto">
                  <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-[#E6DFD3]/70 px-2 text-[11px] text-[#756F66]">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">
                      Field Representatives ({matchingAgents.length})
                    </span>
                    <button
                      onClick={() => setIsSearchOpen(false)}
                      className="text-[#756F66] hover:text-[#1A201C] text-[10px]"
                    >
                      Close
                    </button>
                  </div>

                  <div className="space-y-1">
                    {matchingAgents.length === 0 ? (
                      <div className="py-4 text-center text-xs text-[#756F66]">
                        No representatives found matching &ldquo;{globalSearch}&rdquo;
                      </div>
                    ) : (
                      matchingAgents.map((agent) => (
                        <div
                          key={agent.id}
                          onClick={() => {
                            setIsSearchOpen(false);
                            setGlobalSearch(agent.name);
                            router.push(`/tracking?agentId=${agent.id}`);
                          }}
                          className="p-2 rounded-xl hover:bg-[#F5F2EB] transition cursor-pointer flex items-center justify-between gap-3 group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-[#1E3F35] text-white flex items-center justify-center font-bold text-xs shrink-0">
                              {agent.initials || agent.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-[#1A201C] truncate group-hover:text-[#1E3F35]">
                                  {agent.name}
                                </span>
                                <span className="text-[10px] text-[#756F66] font-mono">
                                  {agent.id}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-[#756F66] truncate mt-0.5">
                                <span>{agent.territory}</span>
                                <span>•</span>
                                <span className="text-[#1E3F35] font-medium flex items-center gap-0.5">
                                  <MapPin className="w-3 h-3 text-[#1E3F35]" />
                                  {agent.coordinates ? `${agent.coordinates.lat.toFixed(4)}° N, ${agent.coordinates.lng.toFixed(4)}° E` : "GPS Active"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <span className="text-[10px] font-semibold text-[#1E3F35] bg-[#EAF2EC] px-2 py-1 rounded-lg shrink-0 group-hover:bg-[#1E3F35] group-hover:text-white transition">
                            Show Location →
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Header Utilities: Date, Bell, User Profile */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Date Pill */}
            <div className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white border border-[#E6DFD3] text-xs font-medium text-[#1A201C] shadow-xs">
              <Calendar className="w-4 h-4 text-[#756F66]" />
              <span>{currentDate}</span>
            </div>

            {/* Notifications Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setUnreadNotifications(0);
                }}
                className="relative p-2.5 rounded-2xl bg-white hover:bg-[#F9F7F2] border border-[#E6DFD3] text-[#1A201C] shadow-xs transition"
                title="Notifications"
              >
                <Bell className="w-4 h-4 text-[#1A201C]" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#1E3F35] text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadNotifications}
                  </span>
                )}
              </button>

              {/* Notification Popover */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white border border-[#E6DFD3] shadow-xl p-4 z-50 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-[#E6DFD3]">
                    <span className="font-bold text-[#1A201C]">Operational Alerts</span>
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-[#756F66] hover:text-[#1A201C]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="py-2 space-y-2.5">
                    <div className="p-2.5 rounded-xl bg-[#F5F2EB] border border-[#E6DFD3]">
                      <p className="font-semibold text-[#1A201C] text-[11px]">Geofence Verified Check-in</p>
                      <p className="text-[10px] text-[#756F66] mt-0.5">
                        Marcus Vance verified check-in at Sterling Towers (14m accuracy).
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F5F2EB] border border-[#E6DFD3]">
                      <p className="font-semibold text-[#1A201C] text-[11px]">Route Optimized (Zone 3)</p>
                      <p className="text-[10px] text-[#756F66] mt-0.5">
                        Priya Sharma completed Koramangala sequence ahead of schedule.
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F8EFE2] border border-[#EAD4B4]">
                      <p className="font-semibold text-[#9E6924] text-[11px]">Visit Delayed</p>
                      <p className="text-[10px] text-[#756F66] mt-0.5">
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
                className="flex items-center gap-2.5 pl-1.5 py-1 text-left hover:opacity-90 transition cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-[#1E3F35] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  {initials}
                </div>
                <div className="hidden sm:block text-left text-xs leading-tight">
                  <span className="font-bold text-[#1A201C] block">
                    {displayName}
                  </span>
                  <span className="text-[10px] text-[#756F66] block capitalize">
                    {role || "Admin"}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#756F66] hidden sm:block" />
              </button>

              {/* User Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-[#E6DFD3] shadow-xl p-2 z-50 text-xs animate-in fade-in duration-100">
                  <div className="px-3 py-2 border-b border-[#E6DFD3] mb-1">
                    <p className="font-bold text-[#1A201C] truncate">{displayName}</p>
                    <p className="text-[10px] text-[#756F66] truncate">{user?.email}</p>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#EAF2EC] text-[#1E3F35] mt-1 uppercase">
                      {role || "Admin"}
                    </span>
                  </div>
                  <Link
                    href="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-[#1A201C] hover:bg-[#F5F2EB] transition"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#756F66]" />
                    <span>System Settings</span>
                  </Link>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      handleSignOut();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[#9E3F3F] hover:bg-[#F5F2EB] transition font-medium text-left"
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
        <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-10 max-w-[1600px] w-full mx-auto overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Backend Health Check Modal */}
      {showHealthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-2xl bg-white border border-[#E6DFD3] shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E6DFD3] mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#1E3F35]" />
                <h3 className="font-bold text-sm text-[#1A201C]">Backend Infrastructure Monitor</h3>
              </div>
              <button
                onClick={() => setShowHealthModal(false)}
                className="p-1 rounded-lg text-[#756F66] hover:text-[#1A201C] hover:bg-[#F5F2EB]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <HealthChecker />
            <div className="mt-4 pt-3 border-t border-[#E6DFD3] text-center">
              <button
                onClick={() => setShowHealthModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1E3F35] text-white hover:bg-[#163028] transition"
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
