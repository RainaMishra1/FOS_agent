"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass, Eye, EyeOff, Lock, Mail, ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types";
import { supabase } from "@/lib/supabaseClient";

export default function PortalAuthForm({ portal }: { portal: UserRole }) {
  const router = useRouter();
  const { signIn, signOut, role, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isAdmin = portal === "admin";
  const title = isAdmin ? "Admin Login" : "Agent Login";
  const home = isAdmin ? "/admin/dashboard" : "/agent/dashboard";

  useEffect(() => {
    if (!isLoading && isAuthenticated && role) {
      router.replace(role === "admin" ? "/admin/dashboard" : "/agent/dashboard");
    }
  }, [home, isAuthenticated, isLoading, portal, role, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!email.trim() || !password) return setMessage("Enter your work email and password.");
    setBusy(true);
    const result = await signIn(email.trim(), password);
    if (result.error) {
      setMessage(result.error.message);
    } else if (result.role !== portal) {
      await signOut();
      setMessage(`This account is not authorized for the ${isAdmin ? "Admin" : "Field Agent"} Portal. Choose the portal assigned to your account.`);
    } else if (portal === "agent" && !result.profile?.agent_id) {
      await signOut();
      setMessage("Your agent account is not fully provisioned. Contact your administrator to link your Profile and Agent records.");
    } else {
      router.replace(home);
    }
    setBusy(false);
  }

  async function resetPassword() {
    setMessage("");
    if (!email.trim()) return setMessage("Enter your work email first to receive a password reset link.");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setMessage(error ? error.message : "If an account exists for that email, a password reset link has been sent.");
    setBusy(false);
  }

  return <main className="min-h-screen bg-beige-bg flex items-center justify-center px-4 py-12">
    <div className="w-full max-w-md space-y-6">
      <header className="text-center space-y-2">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-beige-terracotta text-white flex items-center justify-center shadow-md"><Compass className="w-7 h-7" /></div>
        <h1 className="text-2xl font-bold text-beige-text">FOS Enterprise</h1>
        <p className="text-xs text-beige-muted">{isAdmin ? "Administrator Portal" : "Field Agent Portal"}</p>
      </header>
      <section className="bg-beige-card border border-beige-border rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div><h2 className="text-lg font-bold text-beige-text">{title}</h2><p className="text-xs text-beige-muted mt-1">Sign in with your provisioned FOS account.</p></div>
        {message && <div role="status" className="p-3 rounded-xl bg-beige-sand border border-beige-terracotta/30 text-beige-terracotta text-xs flex gap-2"><ShieldAlert className="w-4 h-4 shrink-0" />{message}</div>}
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-semibold text-beige-text">Work email<div className="relative mt-1.5"><Mail className="absolute left-3 top-3 w-4 h-4 text-beige-muted" /><input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-beige-sand/50 border border-beige-border text-xs" placeholder="name@organization.com" /></div></label>
          <label className="block text-xs font-semibold text-beige-text">Password<div className="relative mt-1.5"><Lock className="absolute left-3 top-3 w-4 h-4 text-beige-muted" /><input required minLength={1} type={visible ? "text" : "password"} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-beige-sand/50 border border-beige-border text-xs" placeholder="Your password" /><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)} className="absolute right-3 top-2.5 text-beige-muted">{visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></label>
          <button disabled={busy || isLoading} className="w-full py-2.5 rounded-xl bg-beige-terracotta text-white text-xs font-bold flex justify-center items-center gap-2 disabled:opacity-50">{busy ? <><Loader2 className="w-4 h-4 animate-spin" />Please wait…</> : "Sign in"}</button>
        </form>
        <button type="button" disabled={busy} onClick={resetPassword} className="text-xs text-beige-terracotta hover:underline">Forgot password?</button>
        <div className="border-t border-beige-border pt-4 text-center text-xs text-beige-muted space-y-2">
          {isAdmin ? <p>New administrator accounts require an authorized registration key. <Link href="/admin/signup" className="text-beige-terracotta font-semibold">Admin sign up</Link></p> : <p>Agent signup requires your existing employee ID and the authorized registration key. <Link href="/agent/signup" className="text-beige-terracotta font-semibold">Create or activate account</Link></p>}
          <Link href={isAdmin ? "/agent/login" : "/admin/login"} className="block text-beige-terracotta font-semibold">Switch to {isAdmin ? "Agent" : "Admin"} Portal</Link>
          <Link href="/" className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="w-3 h-3" />Back to portal selection</Link>
        </div>
      </section>
    </div>
  </main>;
}
