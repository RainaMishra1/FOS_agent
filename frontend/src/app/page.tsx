import HealthChecker from "@/components/HealthChecker";
import {
  MapPin,
  Route,
  ShieldCheck,
  Compass,
  Users,
  Smartphone,
  ChevronRight,
  Activity,
} from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight text-lg">
                FOS<span className="text-indigo-600">Agent</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Operations Control
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Phase 1 Shell Active
            </div>
          </div>
        </div>
      </header>

      {/* Hero & System Overview */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Location-Based Field Agent{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
              Management System
            </span>
          </h1>
          <p className="mt-4 text-slate-600 text-base sm:text-lg leading-relaxed">
            Real-time geospatial agent tracking, geofenced 100m customer visit
            verification, intelligent route optimization, and geographic territory
            management.
          </p>
        </div>

        {/* Live Backend Health Checker Component */}
        <div className="mb-14">
          <HealthChecker />
        </div>

        {/* Role Portal Preview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-16">
          {/* Admin Dashboard Card */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition group">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 group-hover:scale-105 transition">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Admin Operations Portal
            </h3>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              Real-time map of field agents, nearest-agent lead dispatching,
              territory allocation, and failed check-in audit trails.
            </p>
            <div className="inline-flex items-center text-xs font-semibold text-indigo-600 group-hover:text-indigo-700">
              Configured in Phase 3 & 5 <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </div>

          {/* Agent Dashboard Card */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition group">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-105 transition">
              <Smartphone className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Field Agent Mobile Dashboard
            </h3>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              Mobile-first shift control, live location sharing, optimized stop
              sequencing, and GPS-verified 100m check-ins.
            </p>
            <div className="inline-flex items-center text-xs font-semibold text-emerald-600 group-hover:text-emerald-700">
              Configured in Phase 3 & 4 <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </div>
          </div>
        </div>

        {/* Core Architectural Pillars */}
        <div className="border-t border-slate-200 pt-10">
          <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400 mb-8">
            Core Implementation Pillars
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-5 rounded-xl bg-white/60 border border-slate-200/80">
              <MapPin className="w-5 h-5 text-indigo-600 mb-2" />
              <h4 className="font-semibold text-slate-900 text-sm">
                Nearest-Agent Assignment
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                PostGIS distance queries matching on-shift capacity without ML overhead.
              </p>
            </div>
            <div className="p-5 rounded-xl bg-white/60 border border-slate-200/80">
              <Route className="w-5 h-5 text-indigo-600 mb-2" />
              <h4 className="font-semibold text-slate-900 text-sm">
                Route Optimization
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                OSRM road routing coupled with Google OR-Tools multi-stop TSP solver.
              </p>
            </div>
            <div className="p-5 rounded-xl bg-white/60 border border-slate-200/80">
              <ShieldCheck className="w-5 h-5 text-indigo-600 mb-2" />
              <h4 className="font-semibold text-slate-900 text-sm">
                GPS Geofence Verification
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Server-side 100m boundary validation with tamper-resistant audit logs.
              </p>
            </div>
            <div className="p-5 rounded-xl bg-white/60 border border-slate-200/80">
              <Activity className="w-5 h-5 text-indigo-600 mb-2" />
              <h4 className="font-semibold text-slate-900 text-sm">
                Territory Management
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Geographic clustering and balanced territory allocation for agents.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
          FOS Agent Management System • Phase 1: Project Setup & Health Verification Complete
        </div>
      </footer>
    </main>
  );
}
