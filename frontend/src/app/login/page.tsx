"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  Compass,
  Lock,
  Mail,
  ArrowRight,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams?.get("redirectTo");

  const { signIn, isAuthenticated, role, isLoading: authLoading, error: authError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already authenticated, redirect to appropriate portal
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      if (redirectTo) {
        router.push(redirectTo);
      } else if (role === "admin") {
        router.push("/");
      } else if (role === "agent") {
        router.push("/agent/dashboard");
      } else {
        router.push("/");
      }
    }
  }, [isAuthenticated, authLoading, role, redirectTo, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    setIsSubmitting(true);

    const { error, role: resolvedRole } = await signIn(email.trim(), password);

    if (error) {
      setErrorMessage(error.message || "Invalid email or password.");
      setIsSubmitting(false);
      return;
    }

    // Redirect based on role or requested route
    setIsSubmitting(false);
    if (redirectTo) {
      router.push(redirectTo);
    } else if (resolvedRole === "admin") {
      router.push("/");
    } else if (resolvedRole === "agent") {
      router.push("/agent/dashboard");
    } else {
      router.push("/");
    }
  };

  const fillQuickCredentials = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-beige-bg flex flex-col justify-center items-center px-4 py-12 selection:bg-beige-terracotta selection:text-white">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-beige-terracotta text-white shadow-md mx-auto">
            <Compass className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-beige-text">
            FOS Enterprise
          </h1>
          <p className="text-xs text-beige-muted">
            Field Operations & Agent Management System
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-beige-card border border-beige-border rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-beige-text">Sign In</h2>
            <p className="text-xs text-beige-muted">
              Enter your Supabase credentials to access your operations dashboard.
            </p>
          </div>

          {/* Error Message Alert */}
          {(errorMessage || authError) && (
            <div className="p-3.5 rounded-2xl bg-[#FDF2F0] border border-beige-terracotta/30 text-beige-terracotta text-xs space-y-2 animate-in fade-in duration-150">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold block">Authentication Failed</span>
                  <span>{errorMessage || authError}</span>
                </div>
              </div>

              {(errorMessage?.toLowerCase().includes("invalid login credentials") ||
                errorMessage?.toLowerCase().includes("not provisioned") ||
                authError?.toLowerCase().includes("invalid login credentials")) && (
                <div className="mt-1.5 pt-2 border-t border-beige-terracotta/20 text-[11px] text-beige-text bg-white/70 p-2.5 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-beige-terracotta">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Supabase Auth Setup Required</span>
                  </div>
                  <p className="text-[11px] text-beige-muted leading-relaxed">
                    Test accounts must be provisioned in your Supabase Auth project before signing in. FOS uses verified Supabase Auth tokens and does not fabricate mock sessions.
                  </p>
                  <div className="text-[10px] text-beige-muted space-y-1 bg-beige-sand/40 p-2 rounded-lg border border-beige-border/60">
                    <p>1. Open <strong>Supabase Dashboard &gt; Authentication &gt; Users</strong>.</p>
                    <p>2. Create the user with the work email and password.</p>
                    <p>3. Field agent operational records are linked server-side by an Administrator in <strong>FOS &gt; Field Agents</strong>.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email-input"
                className="block text-xs font-semibold text-beige-text"
              >
                Work Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-beige-muted">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email-input"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="name@organization.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-beige-sand/50 border border-beige-border text-beige-text placeholder-beige-muted/60 text-xs focus:outline-none focus:ring-2 focus:ring-beige-terracotta/40 focus:border-beige-terracotta transition"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password-input"
                  className="block text-xs font-semibold text-beige-text"
                >
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-beige-muted">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password-input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-beige-sand/50 border border-beige-border text-beige-text placeholder-beige-muted/60 text-xs focus:outline-none focus:ring-2 focus:ring-beige-terracotta/40 focus:border-beige-terracotta transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-beige-muted hover:text-beige-text"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || authLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-beige-terracotta hover:bg-beige-terracotta/90 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to FOS</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Role-based Guidance & Quick Demo Autofill */}
          <div className="pt-4 border-t border-beige-border/80 space-y-3">
            <span className="text-[11px] font-bold text-beige-text block">
              Quick Test Sign-In
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  fillQuickCredentials("admin@fos-system.internal", "AdminSecure123!")
                }
                className="p-2.5 rounded-xl border border-beige-border bg-beige-sand/40 hover:bg-beige-sand text-left transition space-y-1"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-beige-text">
                  <ShieldCheck className="w-3.5 h-3.5 text-beige-terracotta" />
                  <span>Admin Portal</span>
                </div>
                <span className="text-[10px] text-beige-muted block truncate">
                  admin@fos-system.internal
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  fillQuickCredentials("agent1@fos-system.internal", "AgentPass123!")
                }
                className="p-2.5 rounded-xl border border-beige-border bg-beige-sand/40 hover:bg-beige-sand text-left transition space-y-1"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-beige-text">
                  <UserCheck className="w-3.5 h-3.5 text-beige-olive" />
                  <span>Field Agent</span>
                </div>
                <span className="text-[10px] text-beige-muted block truncate">
                  agent1@fos-system.internal
                </span>
              </button>
            </div>
            <p className="text-[10px] text-beige-muted leading-relaxed">
              Role permissions are strictly verified server-side. Admins are redirected to the Control Center, and Field Agents to the Mobile Portal.
            </p>
          </div>
        </div>

        {/* Security badge footer */}
        <div className="text-center text-[11px] text-beige-muted flex items-center justify-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-beige-olive" />
          <span>Secured via Supabase Auth & JWT Verification</span>
        </div>
      </div>
    </div>
  );
}
