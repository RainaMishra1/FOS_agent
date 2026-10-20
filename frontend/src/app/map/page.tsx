"use client";

import React, { useState, useEffect, useCallback } from "react";
import MapView from "@/components/MapView";
import { useAuth } from "@/context/AuthContext";
import { fetchAgents, AgentApiItem } from "@/lib/api";
import AssignWorkModal from "@/components/AssignWorkModal";
import {
  Compass,
  Layers,
  Plus,
  Radio,
  MapPin,
  Clock,
  Battery,
  Shield,
  Users,
} from "lucide-react";

export default function LiveMapPage() {
  const { session, isAuthenticated } = useAuth();
  const [agents, setAgents] = useState<AgentApiItem[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentApiItem | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchAgents(session?.access_token, { limit: 100 });
      setAgents(res.items);
    } catch (err) {
      console.warn("Failed to load map highlights:", err);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, loadData]);

  const locatedAgents = agents.filter(
    (a) => a.current_latitude !== null && a.current_longitude !== null
  );
  const activeAgents = agents.filter((a) => a.status === "active");
  const unlocatedAgents = agents.filter(
    (a) => a.current_latitude === null || a.current_longitude === null
  );

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-beige-border/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
              Live Operations Map
            </h2>
            <span className="px-2.5 py-0.5 rounded-md bg-beige-sand text-beige-text text-xs font-semibold border border-beige-border font-mono">
              Live Backend
            </span>
          </div>
          <p className="text-xs text-beige-muted mt-0.5">
            Geographic field distribution, agent coordinates, operational hubs, and geofence coverage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta/90 text-white shadow-sm flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Dispatch to Location</span>
          </button>
        </div>
      </div>

      {/* Operational Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-beige-card border border-beige-border flex items-center gap-3 shadow-2xs">
          <div className="p-2 rounded-lg bg-beige-olive-subtle text-beige-olive">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Active On Duty</span>
            <span className="font-bold text-sm text-beige-text">
              {isLoading ? "..." : `${activeAgents.length} / ${agents.length} Representatives`}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-beige-card border border-beige-border flex items-center gap-3 shadow-2xs">
          <div className="p-2 rounded-lg bg-beige-terracotta/10 text-beige-terracotta">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Located Pins</span>
            <span className="font-bold text-sm text-beige-text">
              {isLoading ? "..." : `${locatedAgents.length} Mapped on Canvas`}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-beige-card border border-beige-border flex items-center gap-3 shadow-2xs">
          <div className="p-2 rounded-lg bg-beige-sand text-beige-text">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Unlocated Hubs</span>
            <span className="font-bold text-sm text-beige-text">
              {isLoading ? "..." : `${unlocatedAgents.length} Pending Location`}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-beige-card border border-beige-border flex items-center gap-3 shadow-2xs">
          <div className="p-2 rounded-lg bg-beige-olive-subtle text-beige-olive">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Geofence Radius</span>
            <span className="font-bold text-sm text-beige-text">100m Enforced</span>
          </div>
        </div>
      </div>

      {/* Full Map Canvas */}
      <MapView
        height="h-[650px]"
        isFullPage
        onSelectAgent={(agent) => {
          setSelectedAgent(agent);
        }}
      />

      {/* Task Dispatch Modal */}
      <AssignWorkModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        preselectedAgent={selectedAgent as any}
      />
    </div>
  );
}
