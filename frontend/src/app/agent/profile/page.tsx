"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAgent } from "@/context/AgentContext";
import { useAuth } from "@/context/AuthContext";
import {
  User,
  Power,
  Battery,
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  Clock,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Smartphone,
  HardDrive,
  Compass,
  CheckCircle2,
  AlertTriangle,
  LogOut,
} from "lucide-react";


export default function AgentProfilePage() {
  const {
    currentAgent,
    availableAgents,
    switchAgent,
    isOnDuty,
    toggleDuty,
    resetDemoData,
    stats,
    isLiveBackend,
  } = useAgent();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [supportRequested, setSupportRequested] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push("/agent/login");
  };

  const handleSupport = () => {
    setSupportRequested(true);
    setTimeout(() => setSupportRequested(false), 3000);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-beige-text">Agent Profile &amp; Settings</h2>
            {isLiveBackend && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-beige-olive/15 text-beige-olive border border-beige-olive/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-beige-olive animate-pulse" />
                Live Backend
              </span>
            )}
          </div>
          <p className="text-xs text-beige-muted">
            Manage your field presence, operational duty status, and device diagnostics.
          </p>
        </div>
      </div>

      {/* Main Agent Identity Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-beige-terracotta text-white font-bold text-xl flex items-center justify-center shadow-sm">
                {currentAgent.initials}
              </div>
              <span
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                  isOnDuty ? "bg-beige-olive animate-pulse" : "bg-beige-muted"
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-beige-text">
                  {currentAgent.name}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-beige-sand text-beige-muted border border-beige-border">
                  {currentAgent.id}
                </span>
              </div>
              <p className="text-xs text-beige-muted">{currentAgent.role}</p>
              <p className="text-[11px] text-beige-muted flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-beige-terracotta" />
                <span>{currentAgent.territory}</span>
              </p>
            </div>
          </div>

          {/* On Duty / Off Duty Main Switch */}
          <button
            type="button"
            onClick={toggleDuty}
            className={`py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border shadow-xs ${
              isOnDuty
                ? "bg-beige-olive text-white border-beige-olive hover:bg-beige-olive-light"
                : "bg-beige-sand text-beige-muted border-beige-border hover:bg-beige-border"
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isOnDuty ? "Status: ON DUTY" : "Status: OFF DUTY"}</span>
          </button>
        </div>

        {/* Contact Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-beige-border/60 text-xs">
          <div className="p-2.5 rounded-xl bg-beige-sand/40 border border-beige-border/60 flex items-center gap-2.5">
            <Phone className="w-4 h-4 text-beige-muted shrink-0" />
            <div>
              <span className="text-[10px] text-beige-muted block">Direct Phone</span>
              <strong className="text-beige-text font-mono">{currentAgent.phone}</strong>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-beige-sand/40 border border-beige-border/60 flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-beige-muted shrink-0" />
            <div>
              <span className="text-[10px] text-beige-muted block">Corporate Email</span>
              <strong className="text-beige-text">{currentAgent.email}</strong>
            </div>
          </div>
        </div>

        {/* Identity & Session Info */}
        {isLiveBackend ? (
          <div className="p-3 rounded-xl bg-beige-olive/10 border border-beige-olive/30 text-xs space-y-1">
            <div className="flex items-center justify-between text-beige-olive font-bold text-[11px]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Field Agent Identity (Server Enforced)
              </span>
              <span>Role: Agent</span>
            </div>
            <p className="text-[11px] text-beige-muted">
              Authenticated via verified token. All visit schedules, customer records, and GPS logs are strictly scoped to Agent ID <code className="font-mono text-beige-text">{currentAgent.id}</code> on the backend.
            </p>
          </div>
        ) : (
          /* Agent Switcher Dropdown (Demo Mode Only) */
          <div className="p-3 rounded-xl bg-beige-sand/30 border border-beige-border space-y-1.5">
            <label className="text-xs font-bold text-beige-text flex items-center justify-between">
              <span>Switch Agent Profile (Demo Mode)</span>
              <span className="text-[10px] text-beige-muted font-normal">Multi-agent testing</span>
            </label>
            <select
              value={currentAgent.id}
              onChange={(e) => switchAgent(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl bg-beige-card border border-beige-border text-beige-text focus:outline-hidden focus:ring-2 focus:ring-beige-terracotta/40"
            >
              {availableAgents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} ({ag.id}) — {ag.territory}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Field Diagnostics & Device Stats */}
      <div className="p-4 sm:p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-3">
        <h3 className="text-xs font-bold text-beige-text uppercase tracking-wider flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5 text-beige-muted" />
          Device Telemetry &amp; Field Diagnostics
        </h3>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-3 rounded-xl bg-beige-sand/30 border border-beige-border space-y-1">
            <div className="flex items-center justify-between text-beige-muted">
              <span className="text-[10px]">Battery Health</span>
              <Battery className="w-3.5 h-3.5 text-beige-olive" />
            </div>
            <strong className="text-sm font-bold text-beige-text">
              {currentAgent.batteryLevel}% Charged
            </strong>
            <p className="text-[10px] text-beige-muted">Normal power mode</p>
          </div>

          <div className="p-3 rounded-xl bg-beige-sand/30 border border-beige-border space-y-1">
            <div className="flex items-center justify-between text-beige-muted">
              <span className="text-[10px]">Geofence Accuracy</span>
              <ShieldCheck className="w-3.5 h-3.5 text-beige-olive" />
            </div>
            <strong className="text-sm font-bold text-beige-text">
              750m Enforced
            </strong>
            <p className="text-[10px] text-beige-olive font-medium">GPS Simulation Active</p>
          </div>

          <div className="p-3 rounded-xl bg-beige-sand/30 border border-beige-border space-y-1">
            <div className="flex items-center justify-between text-beige-muted">
              <span className="text-[10px]">Shift Hours</span>
              <Clock className="w-3.5 h-3.5 text-beige-muted" />
            </div>
            <strong className="text-xs font-bold text-beige-text">
              {currentAgent.shiftHours}
            </strong>
            <p className="text-[10px] text-beige-muted">Standard 8h shift</p>
          </div>

          <div className="p-3 rounded-xl bg-beige-sand/30 border border-beige-border space-y-1">
            <div className="flex items-center justify-between text-beige-muted">
              <span className="text-[10px]">Offline Cache</span>
              <HardDrive className="w-3.5 h-3.5 text-beige-muted" />
            </div>
            <strong className="text-xs font-bold text-beige-text">
              14 Stops Cached
            </strong>
            <p className="text-[10px] text-beige-olive font-medium">Synced &bull; Ready</p>
          </div>
        </div>
      </div>

      {/* Support & Admin Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <button
          type="button"
          onClick={handleSupport}
          className="p-3.5 rounded-2xl bg-beige-card hover:bg-beige-sand/60 border border-beige-border text-beige-text transition shadow-2xs flex items-center justify-between text-left"
        >
          <div>
            <span className="font-bold block">Contact Dispatch Desk</span>
            <span className="text-[11px] text-beige-muted">
              {supportRequested ? "Alert sent to central operations..." : "Request manager assistance"}
            </span>
          </div>
          <Phone className="w-4 h-4 text-beige-olive" />
        </button>

        <Link
          href="/"
          className="p-3.5 rounded-2xl bg-beige-card hover:bg-beige-sand/60 border border-beige-border text-beige-text transition shadow-2xs flex items-center justify-between text-left group"
        >
          <div>
            <span className="font-bold block">Open Admin Console</span>
            <span className="text-[11px] text-beige-muted">
              Switch back to desktop operations
            </span>
          </div>
          <ExternalLink className="w-4 h-4 text-beige-terracotta group-hover:translate-x-0.5 transition" />
        </Link>
      </div>

      {/* Reset State Button & Sign Out */}
      <div className="pt-2 space-y-2">
        <button
          type="button"
          onClick={resetDemoData}
          className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold bg-beige-sand hover:bg-beige-border text-beige-muted hover:text-beige-text border border-beige-border transition flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Demo Data &amp; Reset Mock Distances</span>
        </button>

        <button
          type="button"
          onClick={handleSignOut}
          className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-[#FDF2F0] hover:bg-beige-terracotta hover:text-white text-beige-terracotta border border-beige-terracotta/30 transition flex items-center justify-center gap-2 shadow-2xs"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out of Mobile Portal</span>
        </button>
      </div>
    </div>
  );
}

