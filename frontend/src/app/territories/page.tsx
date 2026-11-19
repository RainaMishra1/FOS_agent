"use client";

import React, { useMemo, useState } from "react";
import { useOperations } from "@/context/OperationsContext";
import { Layers, Users, MapPin, AlertCircle } from "lucide-react";

const territoryColors = ["#687653", "#B76E52", "#C48A3F", "#4A6B82", "#7A5A85", "#5C7C64"];

export default function TerritoriesPage() {
  const { agents } = useOperations();
  const [selectedTerritory, setSelectedTerritory] = useState<string | null>(null);

  const territories = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const agent of agents) {
      const name = agent.territory?.trim() || "Unassigned";
      const names = grouped.get(name) || [];
      names.push(agent.name);
      grouped.set(name, names);
    }
    return Array.from(grouped.entries()).map(([name, assignedAgents], index) => ({
      name,
      assignedAgents,
      color: territoryColors[index % territoryColors.length],
    }));
  }, [agents]);

  const activeTerritory = territories.find((territory) => territory.name === selectedTerritory) || territories[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-beige-border/80 pb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">Territory Overview</h2>
          <span className="rounded-full border border-beige-border bg-beige-sand px-2.5 py-0.5 text-xs font-semibold text-beige-muted">
            Agent records
          </span>
        </div>
        <p className="text-xs text-beige-muted">
          Groups reflect the territory recorded on each field agent. Boundary editing and customer coverage are not available yet.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="space-y-3 lg:col-span-7">
          <h3 className="text-xs font-bold uppercase tracking-wider text-beige-muted">Agent Groups ({territories.length})</h3>
          {territories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-beige-border bg-beige-card p-8 text-center text-sm text-beige-muted">
              No agent territory records are available.
            </div>
          ) : (
            <div className="space-y-3">
              {territories.map((territory) => (
                <button
                  key={territory.name}
                  type="button"
                  onClick={() => setSelectedTerritory(territory.name)}
                  className={`w-full rounded-2xl border p-4 text-left shadow-xs transition ${
                    activeTerritory?.name === territory.name
                      ? "border-beige-terracotta/60 bg-beige-card ring-2 ring-beige-terracotta/20"
                      : "border-beige-border bg-beige-card/70 hover:bg-beige-card"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="h-10 w-1.5 rounded-full" style={{ backgroundColor: territory.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-beige-text">{territory.name}</span>
                      <span className="mt-1 flex items-center gap-1 text-xs text-beige-muted">
                        <Users className="h-3.5 w-3.5" /> {territory.assignedAgents.length} agent{territory.assignedAgents.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <Layers className="h-4 w-4 text-beige-muted" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3 lg:col-span-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-beige-muted">Selected Group</h3>
          <div className="min-h-48 rounded-2xl border border-beige-border bg-beige-card p-5">
            {activeTerritory ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <MapPin className="h-4 w-4" style={{ color: activeTerritory.color }} />
                  <h4 className="text-sm font-bold text-beige-text">{activeTerritory.name}</h4>
                </div>
                {activeTerritory.assignedAgents.length ? (
                  <ul className="space-y-2">
                    {activeTerritory.assignedAgents.map((name) => (
                      <li key={name} className="rounded-lg bg-beige-bg px-3 py-2 text-xs text-beige-text">{name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-beige-muted">No agents are assigned to this group.</p>
                )}
              </>
            ) : (
              <div className="flex min-h-36 items-center justify-center text-center text-sm text-beige-muted">
                Select a group to see its agents.
              </div>
            )}
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-beige-border bg-beige-sand/60 p-3 text-xs text-beige-muted">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Territory polygons, customer counts, and map boundaries require a backend territory model.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
