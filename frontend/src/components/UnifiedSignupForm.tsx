"use client";

import { FormEvent, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Compass,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  User,
  ShieldCheck,
  UserRound,
  KeyRound,
  BadgeCheck,
  ArrowRight,
} from "lucide-react";
import { UserRole } from "@/types";
import { getApiBaseUrl } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";

const API_BASE_URL = getApiBaseUrl();

export default function UnifiedSignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = searchParams.get("role") === "admin" ? "admin" : "agent";

  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  // Sync role if query param changes
  useEffect(() => {
    const roleParam = searchParams.get("role");
    if (roleParam === "admin" || roleParam === "agent") {
      setSelectedRole(roleParam);
    }
  }, [searchParams]);

  const isAdmin = selectedRole === "admin";
  const roleTitle = isAdmin ? "Operations Admin" : "Field Agent";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setMessage("Password must contain at least 8 characters.");
      return;
    }
    if (!secretKey.trim()) {
      setMessage(`${roleTitle} registration secret key is required.`);
      return;
    }
    if (!isAdmin && !employeeId.trim()) {
      setMessage("Employee ID is required for Field Agent registration.");
      return;
    }

    setBusy(true);

    try {
      let registered = false;

      // 1. Attempt server-side API registration with FastAPI backend
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(`${API_BASE_URL}/auth/signup/${selectedRole}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: fullName.trim(),
            email: email.trim(),
            password,
            secret_key: secretKey.trim(),
            ...(isAdmin ? {} : { employee_id: employeeId.trim() }),
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          registered = true;
        } else {
          const data = await response.json().catch(() => ({}));
          if (response.status === 409 || response.status === 403 || response.status === 422 || response.status === 404) {
            throw new Error(data.detail || "Unable to register account. Please check your credentials.");
          }
        }
      } catch (err: any) {
        if (err.message && !err.message.includes("fetch") && !err.message.includes("abort")) {
          throw err;
        }
      }

      // 2. Direct Supabase registration fallback if backend is offline
      if (!registered) {
        const { data: sbData, error: sbError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              role: selectedRole,
              employee_id: employeeId.trim(),
            },
          },
        });
        if (sbError && !sbError.message.toLowerCase().includes("already registered")) {
          throw new Error(sbError.message);
        }

        // Ensure SQL database has the profile with the selected role
        try {
          const authUid = sbData?.user?.id;
          await supabase.from("profiles").upsert(
            {
              ...(authUid ? { auth_user_id: authUid } : {}),
              email: email.trim().toLowerCase(),
              full_name: fullName.trim(),
              role: selectedRole,
            },
            { onConflict: "email" }
          );
        } catch {}
      }

      // Clear any previous stale session from storage
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("fos_local_user");
          localStorage.removeItem("fos_local_session");
          localStorage.removeItem("fos_local_profile");
        }
      } catch {}

      setSuccess(true);
      setMessage(`Account created successfully as ${roleTitle}! Redirecting to login…`);
      setPassword("");
      setConfirmPassword("");
      setSecretKey("");
      window.setTimeout(() => {
        router.push("/login");
      }, 1200);
    } catch (error: any) {
      setMessage(error instanceof Error ? error.message : "Unable to create account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full px-3.5 py-2.5 rounded-xl bg-beige-sand/50 border border-beige-border text-xs text-beige-text placeholder-beige-muted focus:outline-none focus:border-[#1E3F35]";

  return (
    <main className="min-h-screen bg-beige-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        {/* Brand Header */}
        <header className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#1E3F35] text-white flex items-center justify-center shadow-md">
            <Compass className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-beige-text">FOS Enterprise</h1>
          <p className="text-xs text-beige-muted">Account Registration</p>
        </header>

        {/* Card */}
        <section className="bg-beige-card border border-beige-border rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
          <div>
            <h2 className="text-lg font-bold text-beige-text">Create Account</h2>
            <p className="text-xs text-beige-muted mt-0.5">
              Select your role below to configure your account.
            </p>
          </div>

          {/* ROLE SELECTOR: Agent vs Admin */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-beige-text">Choose Your Account Role</label>
            <div className="grid grid-cols-2 p-1 bg-beige-sand/70 rounded-2xl border border-beige-border">
              <button
                type="button"
                onClick={() => {
                  setSelectedRole("agent");
                  setMessage("");
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !isAdmin
                    ? "bg-[#1E3F35] text-white shadow-sm"
                    : "text-beige-muted hover:text-beige-text"
                }`}
              >
                <UserRound className="w-4 h-4 shrink-0" />
                <span>Field Agent</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedRole("admin");
                  setMessage("");
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isAdmin
                    ? "bg-[#1E3F35] text-white shadow-sm"
                    : "text-beige-muted hover:text-beige-text"
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Admin</span>
              </button>
            </div>
          </div>

          {/* Role Description Notice */}
          <div className="p-3 rounded-xl bg-beige-sand/50 border border-beige-border text-[11px] text-beige-muted flex gap-2">
            <BadgeCheck className="w-4 h-4 text-[#1E3F35] shrink-0 mt-0.5" />
            <span>
              {isAdmin
                ? "Admin role provides central operations dispatching, agent live tracking, and full management controls."
                : "Field Agent role provides assigned customer visits, route maps, mobile tracking, and verification updates."}
            </span>
          </div>

          {/* Status Message */}
          {message && (
            <div
              role={success ? "status" : "alert"}
              className={`p-3 rounded-xl border text-xs flex gap-2 ${
                success
                  ? "bg-[#EAF2EC] border-[#1E3F35]/30 text-[#1E3F35]"
                  : "bg-beige-sand border-beige-terracotta/30 text-beige-terracotta"
              }`}
            >
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
          )}

          {/* Signup Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <label className="block text-xs font-semibold text-beige-text">
              Full Name
              <div className="relative mt-1.5">
                <User className="absolute left-3 top-3 w-4 h-4 text-beige-muted" />
                <input
                  className={`${inputClass} pl-10`}
                  required
                  maxLength={255}
                  autoComplete="name"
                  placeholder="e.g. John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            </label>

            <label className="block text-xs font-semibold text-beige-text">
              Work Email
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-beige-muted" />
                <input
                  className={`${inputClass} pl-10`}
                  required
                  type="email"
                  autoComplete="email"
                  placeholder="name@organization.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>

            {/* Field Agent: Employee ID is required */}
            {!isAdmin && (
              <label className="block text-xs font-semibold text-beige-text">
                Employee ID / Agent Code
                <input
                  className={`${inputClass} mt-1.5`}
                  required
                  maxLength={50}
                  autoComplete="off"
                  placeholder="e.g. AGT-MUM-01"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                />
                <span className="text-[10px] text-beige-muted mt-1 block">
                  Must match your provisioned agent profile record in FOS.
                </span>
              </label>
            )}

            {/* Registration Secret Key */}
            <label className="block text-xs font-semibold text-beige-text">
              <div className="flex items-center justify-between">
                <span>{roleTitle} Registration Key</span>
                <button
                  type="button"
                  onClick={() => setSecretKey(isAdmin ? "ADMIN" : "AGENT")}
                  className="text-[10px] text-[#1E3F35] font-normal hover:underline cursor-pointer"
                >
                  Use default key ({isAdmin ? "ADMIN" : "AGENT"})
                </button>
              </div>
              <div className="relative mt-1.5">
                <KeyRound className="absolute left-3 top-3 w-4 h-4 text-beige-muted" />
                <input
                  className={`${inputClass} pl-10`}
                  required
                  type="password"
                  autoComplete="off"
                  placeholder={`Authorized ${roleTitle.toLowerCase()} secret key`}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
              </div>
            </label>

            {/* Password */}
            <label className="block text-xs font-semibold text-beige-text">
              Password
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-beige-muted" />
                <input
                  className={`${inputClass} pl-10 pr-10`}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-2.5 text-beige-muted hover:text-beige-text cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            {/* Confirm Password */}
            <label className="block text-xs font-semibold text-beige-text">
              Confirm Password
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-beige-muted" />
                <input
                  className={`${inputClass} pl-10`}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={busy || success}
              className="w-full mt-2 py-2.5 rounded-xl bg-[#1E3F35] hover:bg-[#162F27] text-white text-xs font-bold flex justify-center items-center gap-2 transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-sm"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registering {roleTitle}…</span>
                </>
              ) : (
                <>
                  <span>Create {roleTitle} Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Switch to Login */}
          <div className="border-t border-beige-border pt-4 text-center text-xs text-beige-muted space-y-2">
            <p>
              Already have an account?{" "}
              <Link href="/login" className="text-[#1E3F35] font-bold hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
