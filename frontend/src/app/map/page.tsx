"use client";

import React, { useState } from "react";
import MapView from "@/components/MapView";
import { mockAgents, mockCustomers, mockTerritories } from "@/lib/mockData";
import { Agent, Customer } from "@/types";
import AssignWorkModal from "@/components/AssignWorkModal";
import StatusBadge from "@/components/StatusBadge";
import {
  Compass,
  Layers,
  Filter,
  Plus,
  Radio,
  MapPin,
  Clock,
  Battery,
  Phone,
  Shield,
  ArrowRight,
} from "lucide-react";

export default function LiveMapPage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(mockAgents[0]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
              Live Operations Map
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-beige-sand text-beige-muted text-xs font-semibold border border-beige-border">
              Demo Simulation
            </span>
          </div>
          <p className="text-xs text-beige-muted mt-0.5">
            Geographic field distribution, customer visit stops, and territory corridors.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-sm flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Dispatch to Location</span>
          </button>
        </div>
      </div>

      {/* Operational Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-beige-card border border-beige-border flex items-center gap-3">
          <div className="p-2 rounded-lg bg-beige-olive-subtle text-beige-olive">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Active Agents</span>
            <span className="font-bold text-sm text-beige-text">18 / 24 On Shift</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-beige-card border border-beige-border flex items-center gap-3">
          <div className="p-2 rounded-lg bg-beige-terracotta-subtle text-beige-terracotta">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Customer Stops</span>
            <span className="font-bold text-sm text-beige-text">{mockCustomers.length} Scheduled</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-beige-card border border-beige-border flex items-center gap-3">
          <div className="p-2 rounded-lg bg-beige-amber-subtle text-beige-amber">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Territories</span>
            <span className="font-bold text-sm text-beige-text">{mockTerritories.length} Active Corridors</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-beige-card border border-beige-border flex items-center gap-3">
          <div className="p-2 rounded-lg bg-beige-sand text-beige-text">
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
          setSelectedCustomer(null);
        }}
        onSelectCustomer={(cust) => {
          setSelectedCustomer(cust);
          setSelectedAgent(null);
        }}
      />

      {/* Task Dispatch Modal */}
      <AssignWorkModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        preselectedAgent={selectedAgent}
      />
    </div>
  );
}
