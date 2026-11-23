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
  UserCircle,
  Menu,
  X,
  Bell,
  Calendar,
  Search,
  Loader2,
  Smartphone,
  ShieldCheck,
  MapPin,
  Layers,
  ClipboardCheck,
  Hexagon,
} from "lucide-react";
import HealthChecker from "./HealthChecker";
import BrandMark from "./shell/BrandMark";
import NotificationBell, { NotificationToasts } from "./shell/NotificationBell";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import type { AdminNotification } from "@/lib/api";
import PageBand from "./shell/PageBand";
import { useAuth } from "@/context/AuthContext";
import { useOperations } from "@/context/OperationsContext";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, role, isAuthenticated, isLoading, signOut, session } = useAuth();
  const { agents, loadAgents } = useOperations();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [toasts, setToasts] = useState<AdminNotification[]>([]);
  const alerts = useAdminNotifications(role === "admin" ? session?.access_token : null, (fresh) => {
    setToasts((current) => [...fresh.slice(0, 3), ...current].slice(0, 3));
    fresh.slice(0, 3).forEach((item) => {
      setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== item.id)), 7000);
    });
  });
  const toggleAlerts = () => {
    setShowNotifications((open) => !open);
    alerts.markSeen();
  };
  const [globalSearch, setGlobalSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const agentSearchLoadedRef = React.useRef(false);

  useEffect(() => {
    if (isSearchOpen && !agentSearchLoadedRef.current) {
      agentSearchLoadedRef.current = true;
      if (agents.length === 0) void loadAgents();
    }
  }, [isSearchOpen, agents.length, loadAgents]);

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

  const isAdminAccount = role === "admin";

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
      <div className="min-h-screen bg-[#F5F5FA] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-[#393185] text-white flex items-center justify-center animate-pulse shadow-md mb-3">
          <Compass className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-sm font-semibold text-[#16151F]">Loading…</p>
      </div>
    );
  }

  // If not authenticated or non-admin, render brief placeholder
  if (!isAuthenticated || !profile || !isAdminAccount) {
    return (
      <div className="min-h-screen bg-[#F5F5FA] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-6 h-6 text-[#393185] animate-spin mb-2" />
        <p className="text-xs text-[#62607A]">Opening…</p>
      </div>
    );
  }

  // Strictly use EXISTING tabs only
  const navItems = [
    { name: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Live Operations Map", href: "/map", icon: Map },
    { name: "Field Agents", href: "/agents", icon: Users },
    { name: "Agent Live Tracking", href: "/tracking", icon: Navigation },
    { name: "Dispatch View", href: "/view", icon: Hexagon },
    { name: "Territories", href: "/territories", icon: Layers },
    { name: "Lead Approvals", href: "/leads", icon: ClipboardCheck },
  ];
  // Settings live on the Profile page (opened from the avatar menu, or the phone menu).
  const profileItem = { name: "Profile", href: "/profile", icon: UserCircle };

  const currentDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());


  const displayName = profile?.full_name || (isAdminAccount ? "Operations Admin" : "Field Agent");
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "FA";

  const isActive = (href: string) => pathname === href || Boolean(pathname?.startsWith(href + "/"));
  const pageTitle = [...navItems, profileItem].find((item) => isActive(item.href))?.name ?? "FOS";
  const mobileTabs = [navItems[0], navItems[1], navItems[2], navItems[6]].filter(Boolean);

  const searchBox = (
    <div className="relative w-full">
      <Search className="w-4 h-4 text-[#7B7991] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={globalSearch}
        onChange={(e) => {
          setGlobalSearch(e.target.value);
          setIsSearchOpen(true);
        }}
        onFocus={() => setIsSearchOpen(true)}
        placeholder="Search agents"
        className="w-full h-10 pl-10 pr-4 rounded-full bg-[#F1F0F8] border border-transparent text-sm text-[#16151F] placeholder-[#7B7991] focus:outline-none focus:bg-white focus:border-[#393185] transition"
      />
      {isSearchOpen && (
        <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-white border border-[#E3E2EE] shadow-2xl p-2 z-50 animate-rise max-h-80 overflow-y-auto">
          {matchingAgents.length === 0 ? (
            <div className="py-4 text-center text-sm text-[#62607A]">No agents found</div>
          ) : (
            matchingAgents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => {
                  setIsSearchOpen(false);
                  setGlobalSearch(agent.name);
                  router.push(`/tracking?agentId=${agent.id}`);
                }}
                className="w-full p-2 rounded-xl hover:bg-[#F1F0F8] transition flex items-center gap-2.5 text-left cursor-pointer"
              >
                <span className="w-8 h-8 rounded-full bg-[#393185] text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {agent.initials || agent.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-sm text-[#16151F] truncate">{agent.name}</span>
                  {agent.territory && <span className="block text-xs text-[#62607A] truncate">{agent.territory}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5FA] text-[#16151F] antialiased font-sans">
      <NotificationToasts toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      {/* Close floating menus when clicking elsewhere */}
      {(isSearchOpen || showUserMenu || showNotifications) && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => {
            setIsSearchOpen(false);
            setShowUserMenu(false);
            setShowNotifications(false);
          }}
        />
      )}

      {/* ── Desktop: black strip ─────────────────────────── */}
      <div className="hidden lg:block bg-black text-white/90 text-xs">
        <div className="mx-auto flex h-9 max-w-[1600px] items-center justify-end gap-6 px-8">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#00A651]" />
            {currentDate}
          </span>
          <Link href="/agent/dashboard" className="flex items-center gap-1.5 hover:text-white">
            <Smartphone className="w-3.5 h-3.5 text-[#00A651]" />
            Agent app
          </Link>
          <button onClick={() => setShowHealthModal(true)} className="flex items-center gap-1.5 hover:text-white cursor-pointer">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00A651]" />
            System status
          </button>
        </div>
      </div>

      {/* ── Desktop: white header with navigation ─────────── */}
      <header className="hidden lg:block sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#E3E2EE] shadow-[0_4px_20px_-12px_rgba(57,49,133,.25)]">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-6 px-8">
          <Link href="/admin/dashboard" aria-label="Overview" className="shrink-0">
            <BrandMark />
          </Link>
          <nav className="flex h-full items-stretch gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Main">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`nav-link flex items-center whitespace-nowrap px-3 text-sm transition ${
                    active ? "font-bold text-[#393185]" : "font-medium text-[#45435A] hover:text-[#393185]"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="relative z-30 w-56 xl:w-72">{searchBox}</div>

            <NotificationBell
              items={alerts.items}
              unread={alerts.unread}
              seenAt={alerts.seenAt}
              open={showNotifications}
              onToggle={toggleAlerts}
              onClose={() => setShowNotifications(false)}
              permission={alerts.permission}
              onEnableDesktop={alerts.enableDesktopAlerts}
            />

            {/* Avatar opens Profile; Log out is at the end of that page. */}
            <Link
              href="/profile"
              aria-label="Profile"
              className={`relative z-30 flex items-center rounded-full p-1 transition hover:bg-[#F1F0F8] ${isActive("/profile") ? "ring-2 ring-[#393185]/30" : ""}`}
            >
              <span className="w-8 h-8 rounded-full bg-[#393185] text-white flex items-center justify-center font-bold text-xs">{initials}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Phone/tablet: indigo app bar ─────────────────── */}
      <header
        className="lg:hidden sticky top-0 z-30 bg-[#393185] text-white px-4 pb-3 flex items-center gap-3 shadow-md"
        style={{ paddingTop: "max(env(safe-area-inset-top), 10px)" }}
      >
        <BrandMark size={30} withText={false} light />
        <h1 key={pageTitle} className="flex-1 text-lg font-bold tracking-tight truncate animate-rise">{pageTitle}</h1>
        <NotificationBell
          items={alerts.items}
          unread={alerts.unread}
          seenAt={alerts.seenAt}
          open={showNotifications}
          onToggle={toggleAlerts}
          onClose={() => setShowNotifications(false)}
          permission={alerts.permission}
          onEnableDesktop={alerts.enableDesktopAlerts}
          light
        />
        <button onClick={() => setMobileMenuOpen(true)} className="p-2 -mr-2 rounded-full hover:bg-white/10" aria-label="Menu">
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Phone menu sheet */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40 animate-in fade-in duration-150" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 animate-rise"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#E3E2EE]" />
            <div className="mb-3">{searchBox}</div>
            <nav className="grid grid-cols-2 gap-2">
              {[...navItems, profileItem].map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 rounded-2xl px-3 py-3 text-sm ${active ? "bg-[#393185] text-white font-bold" : "bg-[#F5F5FA] text-[#16151F] font-medium"}`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </Link>
                );
              })}
            </nav>
            <button
              onClick={() => { setMobileMenuOpen(false); setShowHealthModal(true); }}
              className="mt-3 h-11 w-full rounded-2xl border border-[#E3E2EE] text-sm font-semibold"
            >
              System status
            </button>
          </div>
        </div>
      )}

      {/* ── Desktop: indigo title band ─────────────────────── */}
      <div className="hidden lg:block">
        <PageBand title={pageTitle} compact />
      </div>

      <main className="relative mx-auto w-full max-w-[1600px] px-3 pt-3 pb-24 sm:px-5 lg:-mt-10 lg:px-8 lg:pb-12 lg:pt-0">
        <div className="lg:rounded-3xl lg:bg-[#F5F5FA] lg:p-6 lg:shadow-[0_20px_50px_-30px_rgba(22,21,31,.45)]">
          <div key={pathname} className="page-rise">{children}</div>
        </div>
      </main>

      {/* ── Phone/tablet: bottom tabs ─────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E3E2EE] shadow-[0_-6px_20px_-10px_rgba(57,49,133,.25)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Main"
      >
        <div className="grid grid-cols-5">
          {mobileTabs.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[58px] ${active ? "text-[#393185]" : "text-[#7B7991]"}`}
              >
                <span className={`flex items-center justify-center h-7 w-11 rounded-full transition-all duration-200 ${active ? "bg-[#393185] text-white scale-105" : ""}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className={`text-[10px] leading-tight truncate max-w-full px-1 ${active ? "font-bold" : "font-medium"}`}>{item.name.split(" ")[0]}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[58px] text-[#7B7991]"
          >
            <span className="flex items-center justify-center h-7 w-11 rounded-full">
              <Menu className="w-5 h-5" />
            </span>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Backend Health Check Modal */}
      {showHealthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-2xl bg-white border border-[#E3E2EE] shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E2EE] mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#393185]" />
                <h3 className="font-bold text-sm text-[#16151F]">Backend Infrastructure Monitor</h3>
              </div>
              <button
                onClick={() => setShowHealthModal(false)}
                className="p-1 rounded-lg text-[#62607A] hover:text-[#16151F] hover:bg-[#F5F5FA]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <HealthChecker />
            <div className="mt-4 pt-3 border-t border-[#E3E2EE] text-center">
              <button
                onClick={() => setShowHealthModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#00843E] text-white hover:bg-[#006F34] transition"
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
