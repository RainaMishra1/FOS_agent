"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAgent } from "@/context/AgentContext";
import { useAuth } from "@/context/AuthContext";
import { ChevronRight, History, LogOut, Mail, MapPin, Phone, RefreshCw } from "lucide-react";

export default function AgentProfilePage() {
  const { currentAgent, isLoading, refreshAgentData } = useAgent();
  const { profile, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const name = profile?.full_name || currentAgent.name;
  const code = profile?.agent_code || currentAgent.agentCode;
  const phone = profile?.phone || currentAgent.phone;
  const email = profile?.email || currentAgent.email;
  const area = profile?.territory || currentAgent.territory;
  const rows = [
    phone && { icon: Phone, label: "Phone", value: phone, href: `tel:${phone.replace(/[^\d+]/g, "")}` },
    email && { icon: Mail, label: "Email", value: email, href: `mailto:${email}` },
    area && { icon: MapPin, label: "Area", value: area },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string; href?: string }[];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-4 rounded-3xl bg-white border border-[#E3E2EE] p-5">
        <div className="w-16 h-16 rounded-2xl bg-[#393185] text-white font-extrabold text-xl flex items-center justify-center shrink-0">
          {currentAgent.initials}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight text-[#16151F] truncate">{name}</h2>
          {code && <p className="text-sm text-[#62607A]">{code}</p>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-2xl bg-white border border-[#E3E2EE] divide-y divide-[#E3E2EE]">
          {rows.map(({ icon: Icon, label, value, href }) => {
            const content = (
              <>
                <Icon className="w-5 h-5 text-[#62607A] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-[#62607A]">{label}</span>
                  <span className="block text-sm font-semibold text-[#16151F] truncate">{value}</span>
                </span>
              </>
            );
            return href ? (
              <a key={label} href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#F7F7FB]">
                {content}
              </a>
            ) : (
              <div key={label} className="flex items-center gap-3 px-4 py-3.5">
                {content}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl bg-white border border-[#E3E2EE] divide-y divide-[#E3E2EE]">
        <Link href="/agent/history" className="flex items-center gap-3 px-4 py-4 hover:bg-[#F7F7FB]">
          <History className="w-5 h-5 text-[#393185]" />
          <span className="flex-1 text-sm font-semibold">Visit history</span>
          <ChevronRight className="w-4 h-4 text-[#9A98AE]" />
        </Link>
        <button
          type="button"
          onClick={() => void refreshAgentData(true)}
          disabled={isLoading}
          className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-[#F7F7FB] cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-5 h-5 text-[#393185] ${isLoading ? "animate-spin" : ""}`} />
          <span className="flex-1 text-sm font-semibold">Refresh data</span>
        </button>
      </div>

      <button
        type="button"
        onClick={handleSignOut}
        className="w-full h-12 rounded-2xl bg-white border border-red-200 text-[#9E3F3F] text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-50 transition cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        Log out
      </button>
    </div>
  );
}
