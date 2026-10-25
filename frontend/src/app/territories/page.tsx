"use client";

import React, { useState, useMemo } from "react";
import { useOperations } from "@/context/OperationsContext";
import { Territory } from "@/types";
import {
  Layers,
  Plus,
  Users,
  Building2,
  MapPin,
  CheckCircle2,
  X,
  Edit2,
  Compass,
  AlertCircle,
} from "lucide-react";

export default function TerritoriesPage() {
  const { agents, customers } = useOperations();

  const liveTerritories: Territory[] = useMemo(() => {
    const territoryMap = new Map<string, { agents: string[]; count: number }>();
    agents.forEach((ag) => {
      const terr = ag.territory || "Central Operations";
      const existing = territoryMap.get(terr) || { agents: [], count: 0 };
      existing.agents.push(ag.name);
      existing.count += ag.assignedTasks || 1;
      territoryMap.set(terr, existing);
    });

    if (territoryMap.size === 0) {
      return [
        {
          id: "TER-01",
          name: "Central Business District",
          region: "Metro Central",
          assignedAgents: ["Marcus Vance", "Elena Rostova"],
          customerCount: 8,
          activeVisits: 3,
          color: "#687653",
          center: { lat: 12.9716, lng: 77.5946 },
        },
        {
          id: "TER-02",
          name: "North Tech Corridor",
          region: "Tech Corridor",
          assignedAgents: ["Marcus Vance", "Sarah Jenkins"],
          customerCount: 6,
          activeVisits: 2,
          color: "#B76E52",
          center: { lat: 12.9815, lng: 77.608 },
        },
        {
          id: "TER-03",
          name: "South Metro",
          region: "Metro South",
          assignedAgents: ["Priya Sharma", "Arjun Nambiar"],
          customerCount: 10,
          activeVisits: 4,
          color: "#C48A3F",
          center: { lat: 12.9352, lng: 77.6245 },
        },
      ];
    }

    const colors = ["#687653", "#B76E52", "#C48A3F", "#4A6B82", "#7A5A85", "#5C7C64"];
    return Array.from(territoryMap.entries()).map(([name, data], idx) => ({
      id: `TER-0${idx + 1}`,
      name,
      region: "Metro Operations",
      assignedAgents: data.agents,
      customerCount: customers.filter((c) => c.address?.includes(name) || true).length || data.agents.length * 3,
      activeVisits: data.count,
      color: colors[idx % colors.length],
      center: { lat: 12.9716 + idx * 0.015, lng: 77.5946 + idx * 0.015 },
    }));
  }, [agents, customers]);

  const [customTerritories, setCustomTerritories] = useState<Territory[]>([]);
  const territories = customTerritories.length > 0 ? customTerritories : liveTerritories;
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);

  const activeSelectedTerritory = selectedTerritory || territories[0] || null;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTerritory, setEditTerritory] = useState<Partial<Territory>>({
    name: "",
    region: "Metro Central",
    color: "#687653",
  });
  const [notification, setNotification] = useState<string | null>(null);

  const handleSaveTerritory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTerritory.name) return;

    if (editTerritory.id) {
      // Edit existing
      setTerritories((prev) =>
        prev.map((t) => (t.id === editTerritory.id ? ({ ...t, ...editTerritory } as Territory) : t))
      );
      setNotification(`Territory "${editTerritory.name}" updated successfully.`);
    } else {
      // Create new
      const newT: Territory = {
        id: `TER-${String(territories.length + 1).padStart(2, "0")}`,
        name: editTerritory.name,
        region: editTerritory.region || "Metro Central",
        assignedAgents: ["Marcus Vance"],
        customerCount: 12,
        activeVisits: 3,
        color: editTerritory.color || "#687653",
        center: { lat: 12.97, lng: 77.6 },
      };
      setTerritories((prev) => [...prev, newT]);
      setNotification(`New Territory "${newT.name}" created.`);
    }

    setIsModalOpen(false);
    setTimeout(() => setNotification(null), 3000);
  };

  const openCreateModal = () => {
    setEditTerritory({
      name: "",
      region: "Metro North",
      color: "#687653",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (t: Territory) => {
    setEditTerritory(t);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-beige-border/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
              Territory & Zone Management
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-beige-sand text-beige-muted text-xs font-semibold border border-beige-border">
              Illustrative Boundaries
            </span>
          </div>
          <p className="text-xs text-beige-muted mt-0.5">
            Geographic clustering, agent allocation quotas, and customer workload balancing.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-sm flex items-center gap-1.5 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Define Territory</span>
        </button>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="p-3.5 rounded-xl bg-beige-olive-subtle border border-beige-olive/40 text-xs font-medium text-beige-olive flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-beige-olive hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content: Territory Cards & Interactive Visual Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Territory Cards (6 Cols) */}
        <div className="lg:col-span-6 space-y-3">
          <h3 className="text-xs font-bold text-beige-muted uppercase tracking-wider">
            Active Geographic Corridors ({territories.length})
          </h3>

          <div className="space-y-3">
            {territories.map((t) => {
              const isSelected = selectedTerritory?.id === t.id;

              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTerritory(t)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
                    isSelected
                      ? "bg-beige-card border-beige-terracotta/60 ring-2 ring-beige-terracotta/20"
                      : "bg-beige-card/70 hover:bg-beige-card border-beige-border"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-10 rounded-full shrink-0"
                        style={{ backgroundColor: t.color }}
                      />
                      <div>
                        <h4 className="font-bold text-sm text-beige-text">{t.name}</h4>
                        <span className="text-xs text-beige-muted">{t.region} • {t.id}</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(t);
                      }}
                      className="p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
                      title="Edit Territory"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Territory Details Grid */}
                  <div className="mt-4 pt-3 border-t border-beige-border/60 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-beige-muted block">Assigned Agents</span>
                      <span className="font-bold text-beige-text mt-0.5 block">{t.assignedAgents.length}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-beige-muted block">Customers</span>
                      <span className="font-bold text-beige-text mt-0.5 block">{t.customerCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-beige-muted block">Active Visits</span>
                      <span className="font-bold text-beige-olive mt-0.5 block">{t.activeVisits}</span>
                    </div>
                  </div>

                  {/* Agents list tag */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {t.assignedAgents.map((ag) => (
                      <span
                        key={ag}
                        className="px-2 py-0.5 rounded-md bg-beige-sand text-beige-text text-[10px] font-medium"
                      >
                        {ag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Territory Visual Zone Map (6 Cols) */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-beige-muted uppercase tracking-wider">
              Territory Zone Visualizer
            </h3>
            <span className="text-[10px] text-beige-muted bg-beige-card px-2 py-0.5 rounded-md border border-beige-border">
              PostGIS polygon overlay simulation
            </span>
          </div>

          <div className="relative w-full h-[520px] rounded-2xl bg-[#EBE4D5] border border-beige-border overflow-hidden p-6 flex flex-col justify-between">
            <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="terGrid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#E3DAC9" strokeWidth="0.8" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#terGrid)" />

              {/* Render territory zones */}
              {territories.map((t, idx) => {
                const centers = [
                  { cx: "48%", cy: "45%", r: "22%" },
                  { cx: "35%", cy: "22%", r: "18%" },
                  { cx: "65%", cy: "68%", r: "24%" },
                  { cx: "22%", cy: "55%", r: "16%" },
                  { cx: "78%", cy: "35%", r: "18%" },
                ];
                const c = centers[idx % centers.length];
                const isSelected = selectedTerritory ? selectedTerritory.id === t.id : idx === 0;

                return (
                  <g key={t.id} className="cursor-pointer" onClick={() => setSelectedTerritory(t)}>
                    <circle
                      cx={c.cx}
                      cy={c.cy}
                      r={c.r}
                      fill={t.color}
                      fillOpacity={isSelected ? "0.28" : "0.14"}
                      stroke={t.color}
                      strokeWidth={isSelected ? "3" : "1.8"}
                      strokeDasharray={isSelected ? "none" : "5,3"}
                    />
                    <text
                      x={c.cx}
                      y={c.cy}
                      textAnchor="middle"
                      fill={t.color}
                      fontSize="12"
                      fontWeight="bold"
                    >
                      {t.name.split(" ")[0]}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Selected Territory Banner */}
            {(selectedTerritory || territories[0]) && (
              <div className="z-10 p-4 rounded-xl bg-beige-card/95 backdrop-blur-md border border-beige-border shadow-md max-w-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: (selectedTerritory || territories[0])?.color }}
                  />
                  <h4 className="font-bold text-xs text-beige-text">{(selectedTerritory || territories[0])?.name}</h4>
                </div>
                <p className="text-[11px] text-beige-muted">
                  Region: {(selectedTerritory || territories[0])?.region} • {(selectedTerritory || territories[0])?.customerCount} accounts covered by{" "}
                  {(selectedTerritory || territories[0])?.assignedAgents?.join(", ")}.
                </p>
              </div>
            )}

            <div className="z-10 text-[11px] text-beige-muted bg-beige-card/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-beige-border flex items-center gap-1.5 self-start">
              <AlertCircle className="w-3.5 h-3.5 text-beige-muted shrink-0" />
              <span>Full GeoJSON boundaries and polygon queries link to PostGIS in Phase 4.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Define / Edit Territory Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl bg-beige-card border border-beige-border shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-beige-border">
              <h3 className="font-bold text-sm text-beige-text">
                {editTerritory.id ? "Edit Territory" : "Define New Territory"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-beige-muted hover:text-beige-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTerritory} className="py-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-beige-text mb-1">Territory Name *</label>
                <input
                  type="text"
                  value={editTerritory.name}
                  onChange={(e) => setEditTerritory({ ...editTerritory, name: e.target.value })}
                  placeholder="e.g. North Suburbs & Tech Park"
                  required
                  className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text focus:outline-none focus:border-beige-terracotta"
                />
              </div>

              <div>
                <label className="block font-semibold text-beige-text mb-1">Region Category</label>
                <select
                  value={editTerritory.region}
                  onChange={(e) => setEditTerritory({ ...editTerritory, region: e.target.value })}
                  className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text focus:outline-none focus:border-beige-terracotta"
                >
                  <option value="Metro Central">Metro Central</option>
                  <option value="Metro North">Metro North</option>
                  <option value="Metro South">Metro South</option>
                  <option value="Industrial Outer">Industrial Outer</option>
                  <option value="Commercial Zone">Commercial Zone</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-beige-text mb-1">Territory Marker Color</label>
                <div className="flex items-center gap-3">
                  {["#687653", "#B76E52", "#C48A3F", "#7D8C65", "#A05A44"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditTerritory({ ...editTerritory, color: c })}
                      className={`w-7 h-7 rounded-full border-2 transition ${
                        editTerritory.color === c ? "border-beige-text scale-110 shadow-sm" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-beige-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-beige-muted hover:text-beige-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white"
                >
                  Save Territory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
