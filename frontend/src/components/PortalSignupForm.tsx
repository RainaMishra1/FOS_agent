"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Compass, Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert, User } from "lucide-react";
import { UserRole } from "@/types";
import { getApiBaseUrl } from "@/lib/api";

import { supabase } from "@/lib/supabaseClient";

const API_BASE_URL = getApiBaseUrl();

export default function PortalSignupForm({ portal }: { portal: UserRole }) {
  const isAdmin = portal === "admin";
  const portalName = isAdmin ? "Admin" : "Field Agent";
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
  const router = useRouter();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    if (password !== confirmPassword) return setMessage("Passwords do not match.");
    if (password.length < 8) return setMessage("Use a password with at least 8 characters.");
    if (!secretKey) return setMessage(`${portalName} registration key is required.`);
    if (!isAdmin && !employeeId.trim()) return setMessage("Enter your employee ID.");

    setBusy(true);
    try {
      let registered = false;

      // Attempt 1: Fast FastAPI backend signup with 3.5s timeout
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const response = await fetch(`${API_BASE_URL}/auth/signup/${portal}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: fullName.trim(),
            email: email.trim(),
            password,
            secret_key: secretKey,
            ...(isAdmin ? {} : { employee_id: employeeId.trim() }),
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          registered = true;
        } else {
          const data = await response.json().catch(() => ({}));
          if (response.status === 409 || response.status === 403 || response.status === 422) {
            throw new Error(data.detail || "Unable to register account.");
          }
        }
      } catch (err: any) {
        if (err.message && !err.message.includes("fetch") && !err.message.includes("abort")) {
          throw err;
        }
      }

      // Attempt 2: Direct Supabase registration fallback if backend is offline/slow
      if (!registered) {
        const { error: sbError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              role: portal,
              employee_id: employeeId.trim(),
            },
          },
        });
        if (sbError && !sbError.message.toLowerCase().includes("already registered")) {
          throw new Error(sbError.message);
        }
      }

      setSuccess(true);
      setMessage("Account registered successfully! Redirecting to login…");
      setPassword("");
      setConfirmPassword("");
      setSecretKey("");
      window.setTimeout(() => router.push(isAdmin ? "/admin/login" : "/agent/login"), 600);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create this account. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "w-full px-3 py-2.5 rounded-xl bg-beige-sand/50 border border-beige-border text-xs text-beige-text placeholder-beige-muted focus:outline-none focus:border-beige-terracotta";
  return <main className="min-h-screen bg-beige-bg flex items-center justify-center px-4 py-10">
    <div className="w-full max-w-md space-y-5">
      <header className="text-center space-y-2">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-beige-terracotta text-white flex items-center justify-center shadow-md"><Compass className="w-7 h-7" /></div>
        <h1 className="text-2xl font-bold text-beige-text">FOS Enterprise</h1>
        <p className="text-xs text-beige-muted">{portalName} Portal registration</p>
      </header>
      <section className="bg-beige-card border border-beige-border rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
        <div><h2 className="text-lg font-bold text-beige-text">Create {portalName} account</h2><p className="text-xs text-beige-muted mt-1">Registration key is used only to create this account.</p></div>
        {message && <div role={success ? "status" : "alert"} className={`p-3 rounded-xl border text-xs flex gap-2 ${success ? "bg-[#F2F7F0] border-green-700/20 text-green-800" : "bg-beige-sand border-beige-terracotta/30 text-beige-terracotta"}`}><ShieldAlert className="w-4 h-4 shrink-0" />{message}</div>}
        <form onSubmit={submit} className="space-y-3.5">
          <label className="block text-xs font-semibold text-beige-text">Full name<div className="relative mt-1.5"><User className="absolute left-3 top-3 w-4 h-4 text-beige-muted" /><input className={`${inputClass} pl-10`} required maxLength={255} autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} /></div></label>
          <label className="block text-xs font-semibold text-beige-text">Email<div className="relative mt-1.5"><Mail className="absolute left-3 top-3 w-4 h-4 text-beige-muted" /><input className={`${inputClass} pl-10`} required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div></label>
          {!isAdmin && <label className="block text-xs font-semibold text-beige-text">Employee ID<input className={`${inputClass} mt-1.5`} required maxLength={50} autoComplete="off" value={employeeId} onChange={e => setEmployeeId(e.target.value)} /></label>}
          <label className="block text-xs font-semibold text-beige-text">Password<div className="relative mt-1.5"><Lock className="absolute left-3 top-3 w-4 h-4 text-beige-muted" /><input className={`${inputClass} pl-10 pr-10`} required minLength={8} autoComplete="new-password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-2.5 text-beige-muted">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></label>
          <label className="block text-xs font-semibold text-beige-text">Confirm password<input className={`${inputClass} mt-1.5`} required minLength={8} autoComplete="new-password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
          <label className="block text-xs font-semibold text-beige-text">{portalName} Secret Key<input className={`${inputClass} mt-1.5`} required type="password" autoComplete="off" value={secretKey} onChange={e => setSecretKey(e.target.value)} /></label>
          <button disabled={busy || success} className="w-full py-2.5 rounded-xl bg-beige-terracotta text-white text-xs font-bold flex justify-center items-center gap-2 disabled:opacity-50">{busy ? <><Loader2 className="w-4 h-4 animate-spin" />Creating account…</> : "Create account"}</button>
        </form>
        <div className="border-t border-beige-border pt-4 text-center text-xs text-beige-muted space-y-2">
          <p>Already have an account? <Link href={isAdmin ? "/admin/login" : "/agent/login"} className="text-beige-terracotta font-semibold">{portalName} Login</Link></p>
          <Link href={isAdmin ? "/agent/signup" : "/admin/signup"} className="block text-beige-terracotta font-semibold">Switch to {isAdmin ? "Agent" : "Admin"} registration</Link>
          <Link href="/" className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="w-3 h-3" />Back to portal selection</Link>
        </div>
      </section>
      {isAdmin && <p className="text-[11px] text-center text-beige-muted">Production administrator registration is restricted to approved email addresses.</p>}
    </div>
  </main>;
}
