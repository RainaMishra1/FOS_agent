"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createAgent, AgentApiItem, ApiError } from "@/lib/api";
import LocationPickerMap from "./LocationPickerMap";
import {
  X,
  UserPlus,
  Mail,
  User,
  Phone,
  BadgeCheck,
  MapPin,
  Activity,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Home,
  Compass,
} from "lucide-react";

interface CreateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newAgent: AgentApiItem) => void;
}

export default function CreateAgentModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateAgentModalProps) {
  const { session } = useAuth();

  const [formData, setFormData] = useState({
    auth_user_id: "",
    name: "",
    email: "",
    phone: "",
    agent_code: "",
    status: "active",
    territory: "",
    address: "",
    latitude: "",
    longitude: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const validate = () => {
    const errs: Record<string, string> = {};

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      errs.name = "Full name must be at least 2 characters.";
    }

    const emailRegex = /^[\w\.\+\-]+@[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-\.]+$/;
    if (!formData.email.trim()) {
      errs.email = "Work email address is required.";
    } else if (!emailRegex.test(formData.email.trim())) {
      errs.email = "Please enter a valid email address.";
    }

    if (!formData.agent_code.trim() || formData.agent_code.trim().length < 2) {
      errs.agent_code = "Employee ID must be at least 2 characters (e.g. AGT-105).";
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(formData.auth_user_id.trim())) {
      errs.auth_user_id = "Enter the UUID of the Supabase Auth user invited for this email.";
    }

    if (formData.phone && formData.phone.trim().length > 0) {
      const phoneDigits = formData.phone.replace(/[\s\-\(\)\+]/g, "");
      if (phoneDigits.length < 7) {
        errs.phone = "Phone number is too short.";
      }
    }

    // Coordinate validation
    const hasLat = formData.latitude.trim() !== "";
    const hasLng = formData.longitude.trim() !== "";

    if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
      errs.coordinates = "Both latitude and longitude must be provided together, or both omitted.";
    } else if (hasLat && hasLng) {
      const latNum = parseFloat(formData.latitude);
      const lngNum = parseFloat(formData.longitude);

      if (isNaN(latNum) || isNaN(lngNum)) {
        errs.coordinates = "Coordinates must be valid decimal numbers.";
      } else {
        if (latNum < -90 || latNum > 90) {
          errs.latitude = "Latitude must be between -90 and 90.";
        }
        if (lngNum < -180 || lngNum > 180) {
          errs.longitude = "Longitude must be between -180 and 180.";
        }
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "agent_code" ? value.toUpperCase() : value,
    }));

    if (errors[name] || errors.coordinates) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        delete next.coordinates;
        return next;
      });
    }
    if (apiError) setApiError(null);
  };

  const handleMapLocationChange = (
    lat: number | null,
    lng: number | null,
    suggestedAddress?: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      latitude: lat !== null ? lat.toString() : "",
      longitude: lng !== null ? lng.toString() : "",
      address: suggestedAddress && !prev.address ? suggestedAddress : prev.address,
    }));

    setErrors((prev) => {
      const next = { ...prev };
      delete next.latitude;
      delete next.longitude;
      delete next.coordinates;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const lat = formData.latitude.trim() ? parseFloat(formData.latitude) : null;
      const lng = formData.longitude.trim() ? parseFloat(formData.longitude) : null;

      const created = await createAgent(
        {
          auth_user_id: formData.auth_user_id.trim(),
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim() || null,
          agent_code: formData.agent_code.trim().toUpperCase(),
          status: formData.status,
          territory: formData.territory.trim() || null,
          address: formData.address.trim() || null,
          latitude: lat,
          longitude: lng,
        },
        session?.access_token
      );

      setSuccessMessage(
        `Agent ${created.name} (${created.agent_code || "Active"}) registered successfully in database.`
      );

      setTimeout(() => {
        onSuccess(created);
        onClose();
        // Reset form
        setFormData({
          auth_user_id: "",
          name: "",
          email: "",
          phone: "",
          agent_code: "",
          status: "active",
          territory: "",
          address: "",
          latitude: "",
          longitude: "",
        });
        setSuccessMessage(null);
      }, 900);
    } catch (err: any) {
      console.error("Agent creation failed:", err);
      let msg = "Failed to create agent record.";
      if (err instanceof ApiError) {
        if (err.status === 409) {
          msg = err.detail || "An agent with this employee ID or email already exists.";
        } else if (err.status === 403) {
          msg = "Administrative privileges required to register field agents.";
        } else if (err.status === 422) {
          msg = err.detail || "Validation error: Check that all fields and coordinates meet requirements.";
        } else {
          msg = err.detail || err.message || msg;
        }
      } else if (err?.message) {
        msg = err.message;
      }
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedLat = formData.latitude.trim() ? parseFloat(formData.latitude) : null;
  const parsedLng = formData.longitude.trim() ? parseFloat(formData.longitude) : null;
  const validCoordsForMap =
    parsedLat !== null &&
    parsedLng !== null &&
    !isNaN(parsedLat) &&
    !isNaN(parsedLng) &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-beige-card border border-beige-border shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-beige-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-beige-terracotta/10 text-beige-terracotta flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-beige-text">
                Add Field Representative
              </h3>
              <p className="text-xs text-beige-muted mt-0.5">
                Register a new field agent in PostgreSQL with optional hub location &amp; coordinates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand transition disabled:opacity-50"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Success State */}
          {successMessage ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-beige-olive-subtle text-beige-olive mx-auto flex items-center justify-center animate-in zoom-in-75 duration-300">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-beige-text">Agent Created!</h4>
              <p className="text-xs text-beige-muted max-w-xs mx-auto">{successMessage}</p>
            </div>
          ) : (
            <form id="create-agent-form" onSubmit={handleSubmit} className="space-y-4">
              {/* Global API Error Alert */}
              {apiError && (
                <div className="p-3 rounded-xl bg-beige-sand border border-beige-terracotta/40 text-beige-terracotta text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold block">Creation Error</span>
                    <span>{apiError}</span>
                  </div>
                </div>
              )}

              {/* Row 1: Full Name & Employee ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-beige-text mb-1">
                    Full Name <span className="text-beige-terracotta">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      name="name"
                      required
                      placeholder="e.g. Vikram Sharma"
                      value={formData.name}
                      onChange={handleChange}
                      disabled={isSubmitting}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl bg-beige-bg text-xs text-beige-text placeholder-beige-muted border ${
                        errors.name ? "border-beige-terracotta" : "border-beige-border"
                      } focus:outline-none focus:border-beige-terracotta transition`}
                    />
                  </div>
                  {errors.name && (
                    <p className="text-[11px] text-beige-terracotta mt-1">{errors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-beige-text mb-1">
                    Employee ID / Code <span className="text-beige-terracotta">*</span>
                  </label>
                  <div className="relative">
                    <BadgeCheck className="w-4 h-4 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      name="agent_code"
                      required
                      placeholder="e.g. AGT-105"
                      value={formData.agent_code}
                      onChange={handleChange}
                      disabled={isSubmitting}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl bg-beige-bg text-xs font-mono font-medium text-beige-text placeholder-beige-muted border ${
                        errors.agent_code ? "border-beige-terracotta" : "border-beige-border"
                      } focus:outline-none focus:border-beige-terracotta transition`}
                    />
                  </div>
                  {errors.agent_code && (
                    <p className="text-[11px] text-beige-terracotta mt-1">{errors.agent_code}</p>
                  )}
                </div>
              </div>

          <div>
            <label className="block text-xs font-semibold text-beige-text mb-1">Invited Supabase Auth user UUID <span className="text-beige-terracotta">*</span></label>
            <input type="text" name="auth_user_id" required placeholder="UUID from the invited Auth user" value={formData.auth_user_id} onChange={handleChange} disabled={isSubmitting} className={`w-full px-3 py-2 rounded-xl bg-beige-bg text-xs font-mono text-beige-text placeholder-beige-muted border ${errors.auth_user_id ? "border-beige-terracotta" : "border-beige-border"} focus:outline-none focus:border-beige-terracotta transition`} />
            <p className="text-[10px] text-beige-muted mt-1">Invite the user in Supabase Auth first, then paste that user’s ID. FOS links the Profile and Agent to this ID.</p>
            {errors.auth_user_id && <p className="text-[11px] text-beige-terracotta mt-1">{errors.auth_user_id}</p>}
          </div>

          {/* Row 2: Work Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-beige-text mb-1">
                    Work Email <span className="text-beige-terracotta">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="agent@company.com"
                      value={formData.email}
                      onChange={handleChange}
                      disabled={isSubmitting}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl bg-beige-bg text-xs text-beige-text placeholder-beige-muted border ${
                        errors.email ? "border-beige-terracotta" : "border-beige-border"
                      } focus:outline-none focus:border-beige-terracotta transition`}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-[11px] text-beige-terracotta mt-1">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-beige-text mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="tel"
                      name="phone"
                      placeholder="+91 98765 43210"
                      value={formData.phone}
                      onChange={handleChange}
                      disabled={isSubmitting}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl bg-beige-bg text-xs text-beige-text placeholder-beige-muted border ${
                        errors.phone ? "border-beige-terracotta" : "border-beige-border"
                      } focus:outline-none focus:border-beige-terracotta transition`}
                    />
                  </div>
                  {errors.phone && (
                    <p className="text-[11px] text-beige-terracotta mt-1">{errors.phone}</p>
                  )}
                </div>
              </div>

              {/* Row 3: Status & Territory */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-beige-text mb-1">
                    Initial Status
                  </label>
                  <div className="relative">
                    <Activity className="w-4 h-4 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-beige-bg text-xs text-beige-text border border-beige-border focus:outline-none focus:border-beige-terracotta transition"
                    >
                      <option value="active">Active (On Duty)</option>
                      <option value="busy">Busy (In Meeting / En Route)</option>
                      <option value="break">On Break</option>
                      <option value="inactive">Inactive (Off Duty)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-beige-text mb-1">
                    Operational Territory
                  </label>
                  <div className="relative">
                    <Compass className="w-4 h-4 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      name="territory"
                      placeholder="e.g. Koramangala Zone"
                      value={formData.territory}
                      onChange={handleChange}
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-beige-bg text-xs text-beige-text placeholder-beige-muted border border-beige-border focus:outline-none focus:border-beige-terracotta transition"
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Base Physical Address */}
              <div>
                <label className="block text-xs font-semibold text-beige-text mb-1">
                  Base Address / Operating Hub (Optional)
                </label>
                <div className="relative">
                  <Home className="w-4 h-4 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    name="address"
                    placeholder="e.g. 100 Feet Rd, Indiranagar, Bengaluru"
                    value={formData.address}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-beige-bg text-xs text-beige-text placeholder-beige-muted border border-beige-border focus:outline-none focus:border-beige-terracotta transition"
                  />
                </div>
              </div>

              {/* Section 5: Map-based Coordinate Selection */}
              <div className="p-3.5 rounded-xl bg-beige-sand/30 border border-beige-border space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1 border-b border-beige-border/60">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-beige-terracotta" />
                    <span className="text-xs font-bold text-beige-text">
                      Geographic Location (Optional)
                    </span>
                  </div>
                  <span className="text-[10px] text-beige-muted font-medium">
                    Admin-provided static location • Live GPS received upon agent device check-in
                  </span>
                </div>

                {/* Leaflet Interactive Map */}
                <LocationPickerMap
                  latitude={validCoordsForMap ? parsedLat : null}
                  longitude={validCoordsForMap ? parsedLng : null}
                  address={formData.address}
                  onChange={handleMapLocationChange}
                  height="h-52"
                />

                {/* Manual Coordinate Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-beige-text mb-1">
                      Latitude (-90 to 90)
                    </label>
                    <input
                      type="text"
                      name="latitude"
                      placeholder="e.g. 12.971598"
                      value={formData.latitude}
                      onChange={handleChange}
                      disabled={isSubmitting}
                      className={`w-full px-3 py-1.5 rounded-xl bg-beige-bg text-xs font-mono text-beige-text placeholder-beige-muted border ${
                        errors.latitude || errors.coordinates
                          ? "border-beige-terracotta"
                          : "border-beige-border"
                      } focus:outline-none focus:border-beige-terracotta transition`}
                    />
                    {errors.latitude && (
                      <p className="text-[10px] text-beige-terracotta mt-0.5">{errors.latitude}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-beige-text mb-1">
                      Longitude (-180 to 180)
                    </label>
                    <input
                      type="text"
                      name="longitude"
                      placeholder="e.g. 77.594566"
                      value={formData.longitude}
                      onChange={handleChange}
                      disabled={isSubmitting}
                      className={`w-full px-3 py-1.5 rounded-xl bg-beige-bg text-xs font-mono text-beige-text placeholder-beige-muted border ${
                        errors.longitude || errors.coordinates
                          ? "border-beige-terracotta"
                          : "border-beige-border"
                      } focus:outline-none focus:border-beige-terracotta transition`}
                    />
                    {errors.longitude && (
                      <p className="text-[10px] text-beige-terracotta mt-0.5">{errors.longitude}</p>
                    )}
                  </div>
                </div>

                {errors.coordinates && (
                  <p className="text-[11px] text-beige-terracotta font-medium bg-beige-sand p-2 rounded-lg border border-beige-terracotta/40">
                    {errors.coordinates}
                  </p>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        {!successMessage && (
          <div className="p-4 sm:p-5 border-t border-beige-border bg-beige-sand/20 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-beige-muted hover:text-beige-text hover:bg-beige-sand transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-agent-form"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta/90 text-white shadow-sm flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving to Database...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Save Field Agent</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
