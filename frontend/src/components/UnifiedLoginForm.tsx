"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Compass,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Loader2,
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { getApiBaseUrl } from "@/lib/api";

const API_BASE_URL = getApiBaseUrl();

export default function UnifiedLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  const { signIn, role, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resetSent, setResetSent] = useState(false);

  // Auto-redirect if already signed in
  useEffect(() => {
    if (!isLoading && isAuthenticated && role) {
      if (redirectTo && redirectTo.startsWith("/") && !redirectTo.includes("/login") && !redirectTo.includes("/signup")) {
        router.replace(redirectTo);
      } else {
        router.replace(role === "admin" ? "/admin/dashboard" : "/agent/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, role, redirectTo, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!email.trim() || !password) {
      setMessage("Please enter both your work email and password.");
      return;
    }

    setBusy(true);

    try {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        setMessage(result.error.message || "Invalid credentials. Please verify and try again.");
      } else {
        let resolvedRole = result.role;
        // Verify from database if not already admin
        if (resolvedRole !== "admin") {
          try {
            const roleRes = await fetch(`${API_BASE_URL}/auth/email-role?email=${encodeURIComponent(email.trim())}`);
            if (roleRes.ok) {
              const rData = await roleRes.json();
              if (rData.role === "admin") {
                resolvedRole = "admin";
              }
            }
          } catch {}
        }
        if (!resolvedRole) {
          resolvedRole = email.toLowerCase().includes("admin") ? "admin" : "agent";
        }

        if (redirectTo && redirectTo.startsWith("/") && !redirectTo.includes("/login") && !redirectTo.includes("/signup")) {
          router.replace(redirectTo);
        } else {
          router.replace(resolvedRole === "admin" ? "/admin/dashboard" : "/agent/dashboard");
        }
      }
    } catch (err: any) {
      setMessage(err?.message || "Failed to sign in. Please check your network connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    setMessage("");
    setResetSent(false);
    if (!email.trim()) {
      setMessage("Please enter your work email in the field above to receive a password reset link.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) {
        setMessage(error.message);
      } else {
        setResetSent(true);
        setMessage("Password reset email sent! Check your inbox.");
      }
    } catch (err: any) {
      setMessage(err?.message || "Could not send password reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-beige-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <header className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#1E3F35] text-white flex items-center justify-center shadow-md">
            <Compass className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-beige-text">FOS Enterprise</h1>
          <p className="text-xs text-beige-muted">Field Operations &amp; Agent Management Portal</p>
        </header>

        {/* Card */}
        <section className="bg-beige-card border border-beige-border rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
          <div>
            <h2 className="text-lg font-bold text-beige-text">Sign In</h2>
            <p className="text-xs text-beige-muted mt-1">
              Enter your work email and password. Your account automatically opens your assigned dashboard (Admin or Agent).
            </p>
          </div>

          {/* Feedback message */}
          {message && (
            <div
              role="status"
              className={`p-3 rounded-xl border text-xs flex gap-2 ${
                resetSent
                  ? "bg-[#EAF2EC] border-[#1E3F35]/20 text-[#1E3F35]"
                  : "bg-beige-sand border-beige-terracotta/30 text-beige-terracotta"
              }`}
            >
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-xs font-semibold text-beige-text">
              Work Email
              <div className="relative mt-1.5">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-beige-muted" />
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-beige-sand/50 border border-beige-border text-xs text-beige-text placeholder-beige-muted focus:outline-none focus:border-[#1E3F35]"
                  placeholder="name@organization.com"
                />
              </div>
            </label>

            <label className="block text-xs font-semibold text-beige-text">
              Password
              <div className="relative mt-1.5">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-beige-muted" />
                <input
                  required
                  minLength={1}
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-beige-sand/50 border border-beige-border text-xs text-beige-text placeholder-beige-muted focus:outline-none focus:border-[#1E3F35]"
                  placeholder="Your password"
                />
                <button
                  type="button"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible(!visible)}
                  className="absolute right-3 top-2.5 text-beige-muted hover:text-beige-text cursor-pointer"
                >
                  {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-[#1E3F35] hover:bg-[#162F27] text-white text-xs font-bold flex justify-center items-center gap-2 transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-sm"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Credential Helpers */}
          <div className="pt-2 border-t border-beige-border space-y-2">
            <span className="text-[11px] font-semibold text-beige-muted block text-center">Quick Demo Accounts</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setEmail("rishabmishra075@gmail.com");
                  setPassword("Rishabh@2007");
                }}
                className="py-2 px-2.5 rounded-xl bg-[#EAF2EC] hover:bg-[#D8E9DC] text-[#1E3F35] text-[11px] font-semibold border border-[#CDE1D2] transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Fill Admin (Raina)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail("rainamishra00023@gmail.com");
                  setPassword("Raina@23");
                }}
                className="py-2 px-2.5 rounded-xl bg-beige-sand/70 hover:bg-beige-sand text-beige-text text-[11px] font-semibold border border-beige-border transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 shrink-0 text-[#1E3F35]" />
                <span>Fill Agent (Rishabh)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={handleResetPassword}
              className="text-xs text-[#1E3F35] hover:underline cursor-pointer"
            >
              Forgot password?
            </button>
          </div>

          {/* Signup Switcher */}
          <div className="border-t border-beige-border pt-4 text-center text-xs text-beige-muted space-y-2">
            <p>
              Don&apos;t have an account yet?{" "}
              <Link href="/signup" className="text-[#1E3F35] font-bold hover:underline">
                Create an account
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
