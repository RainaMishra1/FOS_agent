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
  Users,
  MapPin,
  BarChart3,
  Check,
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
  const [keepSignedIn, setKeepSignedIn] = useState(true);
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
        const cleanEmail = email.trim().toLowerCase();
        const isExplicitAdmin = cleanEmail.includes("rishabmishra075") || cleanEmail.includes("rishabhmishra075") || cleanEmail.includes("admin");
        const isExplicitAgent = cleanEmail.includes("rainamishra00023");

        let resolvedRole = isExplicitAdmin ? "admin" : isExplicitAgent ? "agent" : result.role;
        // Verify from database if not already admin
        if (!isExplicitAdmin && resolvedRole !== "admin") {
          try {
            const roleRes = await fetch(`${API_BASE_URL}/auth/email-role?email=${encodeURIComponent(cleanEmail)}`);
            if (roleRes.ok) {
              const text = await roleRes.text();
              if (text && text.trim()) {
                try {
                  const rData = JSON.parse(text);
                  if (rData.role === "admin") {
                    resolvedRole = "admin";
                  }
                } catch {}
              }
            }
          } catch {}
        }
        if (!resolvedRole) {
          resolvedRole = isExplicitAdmin ? "admin" : "agent";
        }

        if (resolvedRole === "admin") {
          if (redirectTo && redirectTo.startsWith("/admin") && !redirectTo.includes("/login") && !redirectTo.includes("/signup")) {
            router.replace(redirectTo);
          } else {
            router.replace("/admin/dashboard");
          }
        } else {
          if (redirectTo && redirectTo.startsWith("/agent") && !redirectTo.includes("/login") && !redirectTo.includes("/signup")) {
            router.replace(redirectTo);
          } else {
            router.replace("/agent/dashboard");
          }
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
    <main className="min-h-screen bg-[#F6F4EE] flex items-center justify-center p-4 sm:p-6 lg:p-12 relative overflow-hidden">
      {/* Decorative background glows */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#E5F0E8]/50 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#EFE8DC]/60 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center relative z-10">
        {/* Left Column: Brand, Value Proposition & Feature Highlights */}
        <section className="lg:col-span-7 flex flex-col justify-between space-y-8 py-2">
          {/* Top Brand Bar */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1E3F35] flex items-center justify-center text-white shadow-xs">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#1A201C] leading-none">FOS Enterprise</h2>
              <p className="text-[11px] sm:text-xs text-[#756F66] mt-0.5">Field Operations &amp; Agent Management Portal</p>
            </div>
          </div>

          {/* Headline & Subtitle */}
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#1A201C] tracking-tight leading-[1.12]">
              Smarter<br />
              Field Operations,<br />
              <span className="text-[#1E3F35]">Greater Impact</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#615B52] max-w-lg leading-relaxed">
              Manage agents, track field visits, and streamline operations — all in one unified platform.
            </p>
          </div>

          {/* 3 Highlight Features */}
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#E5F0E8] flex items-center justify-center text-[#1E3F35] shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#1A201C]">Manage Field Agents</h3>
                <p className="text-[11px] sm:text-xs text-[#756F66]">Assign tasks and monitor real-time activity</p>
              </div>
            </div>

            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#E5F0E8] flex items-center justify-center text-[#1E3F35] shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#1A201C]">Track Field Visits</h3>
                <p className="text-[11px] sm:text-xs text-[#756F66]">Live location, geofencing and visit verification</p>
              </div>
            </div>

            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#E5F0E8] flex items-center justify-center text-[#1E3F35] shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#1A201C]">Insights &amp; Reports</h3>
                <p className="text-[11px] sm:text-xs text-[#756F66]">Get actionable insights to improve performance</p>
              </div>
            </div>
          </div>

          {/* Scenic Landscape Illustration */}
          <div className="hidden sm:block pt-2">
            <svg
              viewBox="0 0 520 90"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full max-w-lg opacity-80"
              aria-hidden="true"
            >
              {/* Sun */}
              <circle cx="340" cy="40" r="22" fill="#EADFC9" opacity="0.6" />
              {/* Distant Hills */}
              <path
                d="M0 70 Q 130 35 260 55 T 520 50 L 520 90 L 0 90 Z"
                fill="#DDE5D9"
                opacity="0.7"
              />
              {/* Middle Hills */}
              <path
                d="M0 65 Q 180 40 360 62 T 520 60 L 520 90 L 0 90 Z"
                fill="#C3D6C5"
                opacity="0.8"
              />
              {/* Front Hill with Road */}
              <path
                d="M0 72 Q 100 58 200 70 T 520 75 L 520 90 L 0 90 Z"
                fill="#9DBB9F"
              />
              {/* Road strip */}
              <path
                d="M60 90 Q 130 75 190 85 T 320 90"
                stroke="#EFE8DC"
                strokeWidth="4"
                strokeDasharray="6 4"
                fill="none"
              />
              {/* Vehicle */}
              <rect x="135" y="70" width="18" height="10" rx="3" fill="#1E3F35" />
              <circle cx="139" cy="80" r="2.5" fill="#1A201C" />
              <circle cx="149" cy="80" r="2.5" fill="#1A201C" />
            </svg>
          </div>
        </section>

        {/* Right Column: Clean Login Card */}
        <section className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#E6DFD3] p-7 sm:p-9 shadow-lg space-y-5">
            {/* Compass Icon */}
            <div className="mx-auto w-12 h-12 rounded-2xl bg-[#1E3F35] flex items-center justify-center text-white shadow-xs">
              <Compass className="w-6 h-6" />
            </div>

            {/* Header Titles */}
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold text-[#1A201C] tracking-tight">Welcome Back</h2>
              <p className="text-xs text-[#756F66]">Sign in to your FOS Enterprise account</p>
            </div>

            {/* Feedback Message */}
            {message && (
              <div
                role="status"
                className={`p-3 rounded-xl border text-xs flex gap-2 ${
                  resetSent
                    ? "bg-[#EAF2EC] border-[#1E3F35]/20 text-[#1E3F35]"
                    : "bg-[#FAF3E7] border-[#E8C9B0] text-[#8A4A28]"
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{message}</span>
              </div>
            )}

            {/* Direct Login Form - No Role Division */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="login-email">
                  Work Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-[#8A857C]" />
                  <input
                    id="login-email"
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] text-xs sm:text-sm text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#1E3F35] transition"
                    placeholder="name@organization.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="login-password">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-[#8A857C]" />
                  <input
                    id="login-password"
                    required
                    minLength={1}
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] text-xs sm:text-sm text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#1E3F35] transition"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    onClick={() => setVisible(!visible)}
                    className="absolute right-3.5 top-2.5 text-[#8A857C] hover:text-[#1A201C] transition cursor-pointer"
                  >
                    {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Checkbox and Forgot Password Row */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="flex items-center gap-2 cursor-pointer text-[#423E3A] select-none">
                  <input
                    type="checkbox"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#1E3F35]"
                  />
                  <span>Keep me signed in</span>
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleResetPassword}
                  className="font-medium text-[#1E3F35] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 rounded-xl bg-[#1E3F35] hover:bg-[#162F27] text-white text-xs sm:text-sm font-bold flex justify-center items-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-xs"
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

            {/* Divider */}
            <div className="relative flex items-center justify-center pt-2">
              <div className="border-t border-[#E6DFD3] w-full" />
              <span className="bg-white px-3 text-[11px] font-semibold text-[#8A857C] absolute uppercase tracking-wider">
                OR
              </span>
            </div>

            {/* Signup Link */}
            <p className="text-center text-xs text-[#756F66] pt-1">
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
