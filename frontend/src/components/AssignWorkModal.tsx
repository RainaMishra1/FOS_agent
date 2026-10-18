"use client";

import React, { useState } from "react";
import { Agent, Customer } from "@/types";
import { mockAgents, mockCustomers } from "@/lib/mockData";
import { X, Check, Calendar, Clock, AlertCircle } from "lucide-react";

interface AssignWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedAgent?: Agent | null;
  onSuccess?: (message: string) => void;
}

export default function AssignWorkModal({
  isOpen,
  onClose,
  preselectedAgent,
  onSuccess,
}: AssignWorkModalProps) {
  const [selectedAgentId, setSelectedAgentId] = useState(preselectedAgent?.id || mockAgents[0].id);
  const [selectedCustomerId, setSelectedCustomerId] = useState(mockCustomers[0].id);
  const [timeSlot, setTimeSlot] = useState("02:30 PM");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("high");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate fast mock API dispatch
    setTimeout(() => {
      setIsSubmitting(false);
      const agent = mockAgents.find((a) => a.id === selectedAgentId);
      const customer = mockCustomers.find((c) => c.id === selectedCustomerId);
      const msg = `Successfully assigned ${customer?.name} to ${agent?.name} for ${timeSlot}.`;
      setFeedback(msg);
      if (onSuccess) onSuccess(msg);
      setTimeout(() => {
        setFeedback(null);
        onClose();
      }, 1500);
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-beige-card border border-beige-border shadow-2xl overflow-hidden p-6">
        <div className="flex items-center justify-between pb-4 border-b border-beige-border">
          <div>
            <h3 className="text-lg font-bold text-beige-text">Assign Field Task</h3>
            <p className="text-xs text-beige-muted mt-0.5">
              Dispatch customer visit to field agent with geofence verification
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedback ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-beige-olive-subtle text-beige-olive mx-auto flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-beige-text">Task Dispatched!</h4>
            <p className="text-xs text-beige-muted">{feedback}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="py-4 space-y-4">
            {/* Field Agent Selection */}
            <div>
              <label className="block text-xs font-semibold text-beige-text mb-1.5">
                Select Field Agent *
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text focus:outline-none focus:border-beige-terracotta"
              >
                {mockAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.territory}) - {a.status.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Stop Selection */}
            <div>
              <label className="block text-xs font-semibold text-beige-text mb-1.5">
                Customer Stop / Lead *
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text focus:outline-none focus:border-beige-terracotta"
              >
                {mockCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} - {c.address.split(",")[0]}
                  </option>
                ))}
              </select>
            </div>

            {/* Time Slot & Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-beige-text mb-1.5">
                  Scheduled Time *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={timeSlot}
                    onChange={(e) => setTimeSlot(e.target.value)}
                    placeholder="e.g. 02:30 PM"
                    className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text focus:outline-none focus:border-beige-terracotta"
                    required
                  />
                  <Clock className="w-3.5 h-3.5 text-beige-muted absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-beige-text mb-1.5">
                  Priority *
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-2 text-beige-text focus:outline-none focus:border-beige-terracotta"
                >
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-beige-text mb-1.5">
                Visit Notes & Special Instructions
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Gate code, key contact person, or compliance checklist..."
                rows={2}
                className="w-full text-xs rounded-xl bg-beige-bg border border-beige-border p-3 text-beige-text focus:outline-none focus:border-beige-terracotta resize-none"
              />
            </div>

            <div className="p-2.5 rounded-xl bg-beige-sand/50 border border-beige-border/80 text-[11px] text-beige-muted flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-beige-terracotta shrink-0 mt-0.5" />
              <span>
                Task dispatch will notify the agent's mobile terminal and enforce server-side 100m geofence check-in.
              </span>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-beige-border/80">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-beige-muted hover:text-beige-text hover:bg-beige-sand transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-sm transition disabled:opacity-50"
              >
                {isSubmitting ? "Dispatching..." : "Confirm & Dispatch"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
