import Link from "next/link";
import { Compass, ShieldCheck, UserRound, ArrowRight } from "lucide-react";

export default function PortalSelectionPage() {
  return <main className="min-h-screen bg-beige-bg flex items-center justify-center px-4 py-12">
    <div className="w-full max-w-4xl space-y-10">
      <header className="text-center space-y-2"><div className="mx-auto w-14 h-14 rounded-2xl bg-beige-terracotta text-white flex items-center justify-center shadow-md"><Compass className="w-7 h-7" /></div><h1 className="text-3xl font-bold tracking-tight text-beige-text">FOS Enterprise</h1><p className="text-sm text-beige-muted">Field Operations &amp; Agent Management System</p></header>
      <div className="grid md:grid-cols-2 gap-5">
        <section className="bg-beige-card border border-beige-border rounded-3xl p-7 shadow-sm flex flex-col">
          <div className="w-11 h-11 rounded-xl bg-beige-terracotta/10 text-beige-terracotta flex items-center justify-center"><ShieldCheck className="w-6 h-6" /></div><h2 className="mt-5 text-xl font-bold text-beige-text">Admin Portal</h2><p className="mt-2 text-sm leading-relaxed text-beige-muted">Manage field agents, customers, assignments, and operations.</p>
          <div className="mt-7 space-y-3"><Link href="/admin/login" className="w-full py-3 px-4 rounded-xl bg-beige-terracotta text-white text-sm font-bold flex justify-center items-center gap-2">Admin Login <ArrowRight className="w-4 h-4" /></Link><Link href="/admin/signup" className="block text-center text-sm font-semibold text-beige-terracotta hover:underline">Admin Sign Up</Link><p className="text-[11px] text-beige-muted text-center">Registration requires an authorized secret key; production emails must be approved.</p></div>
        </section>
        <section className="bg-beige-card border border-beige-border rounded-3xl p-7 shadow-sm flex flex-col">
          <div className="w-11 h-11 rounded-xl bg-beige-olive/10 text-beige-olive flex items-center justify-center"><UserRound className="w-6 h-6" /></div><h2 className="mt-5 text-xl font-bold text-beige-text">Field Agent Portal</h2><p className="mt-2 text-sm leading-relaxed text-beige-muted">Access assigned visits, routes, profile, and GPS tracking.</p>
          <div className="mt-7 space-y-3"><Link href="/agent/login" className="w-full py-3 px-4 rounded-xl bg-beige-terracotta text-white text-sm font-bold flex justify-center items-center gap-2">Agent Login <ArrowRight className="w-4 h-4" /></Link><Link href="/agent/signup" className="block text-center text-sm font-semibold text-beige-terracotta hover:underline">Agent Sign Up / Account Activation</Link><p className="text-[11px] text-beige-muted text-center">An existing employee record, work email, and authorized key are required.</p></div>
        </section>
      </div>
      <p className="text-center text-xs text-beige-muted">Secure sign-in with Supabase Auth and server-verified FOS roles.</p>
    </div>
  </main>;
}
