"use client";

import { useEffect, useState } from "react";
import {
  fetchHealth,
  fetchDatabaseHealth,
  HealthResponse,
  DatabaseHealthResponse,
} from "@/lib/api";
import { CheckCircle2, XCircle, RefreshCw, Server, Database, Globe } from "lucide-react";

export default function HealthChecker() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [dbData, setDbData] = useState<DatabaseHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const res = await fetchHealth();
      const end = performance.now();
      setLatency(Math.round(end - start));
      setData(res);

      // Probe Phase 2 Database & PostGIS status
      try {
        const dbRes = await fetchDatabaseHealth();
        setDbData(dbRes);
      } catch (dbErr: any) {
        setDbData(null);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to reach backend API");
      setData(null);
      setDbData(null);
      setLatency(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="w-full max-w-xl mx-auto p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Backend API Health</h3>
            <p className="text-xs text-slate-500">FastAPI Service Status</p>
          </div>
        </div>
        <button
          onClick={checkHealth}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && !data && !error && (
        <div className="py-8 text-center text-sm text-slate-500">
          Probing backend endpoint...
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-red-800">Connection Failed</h4>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
              <p className="text-xs text-slate-500 mt-2">
                Ensure the FastAPI backend is running on{" "}
                <code className="bg-red-100/60 px-1 py-0.5 rounded font-mono text-[11px]">
                  http://localhost:8000
                </code>
              </p>
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 border border-emerald-100">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-900 capitalize">
                {data.status}
              </span>
            </div>
            {latency !== null && (
              <span className="text-xs font-mono text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                {latency} ms
              </span>
            )}
          </div>

          {/* Phase 2: Database & PostGIS status */}
          {dbData && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className={`p-3 rounded-lg border ${dbData.database_connected ? "bg-emerald-50/60 border-emerald-100 text-emerald-900" : "bg-amber-50/60 border-amber-100 text-amber-900"}`}>
                  <div className="flex items-center gap-1.5 font-medium mb-1">
                    <Database className="w-3.5 h-3.5" />
                    <span>Database</span>
                  </div>
                  <span className="text-[11px]">
                    {dbData.database_connected ? "Connected (SQLAlchemy 2.x)" : "Not connected"}
                  </span>
                </div>
                <div className={`p-3 rounded-lg border ${dbData.postgis_enabled ? "bg-emerald-50/60 border-emerald-100 text-emerald-900" : "bg-amber-50/60 border-amber-100 text-amber-900"}`}>
                  <div className="flex items-center gap-1.5 font-medium mb-1">
                    <Globe className="w-3.5 h-3.5" />
                    <span>PostGIS</span>
                  </div>
                  <span className="text-[11px]">
                    {dbData.postgis_enabled ? `Enabled (v${dbData.postgis_version || "ready"})` : "Not verified"}
                  </span>
                </div>
              </div>
              {!dbData.database_connected && dbData.error && (
                <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-800">
                  <span className="font-medium">Connectivity Check: </span>
                  <span>{dbData.error}</span>
                </div>
              )}
            </div>
          )}


          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50">
              <span className="text-slate-400 block mb-0.5">Project</span>
              <span className="font-medium text-slate-700">{data.project}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <span className="text-slate-400 block mb-0.5">Version</span>
              <span className="font-medium text-slate-700 font-mono">v{data.version}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <span className="text-slate-400 block mb-0.5">Environment</span>
              <span className="font-medium text-slate-700 capitalize">{data.environment}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <span className="text-slate-400 block mb-0.5">Server Timestamp</span>
              <span className="font-mono text-[11px] text-slate-600 truncate block">
                {data.timestamp}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

