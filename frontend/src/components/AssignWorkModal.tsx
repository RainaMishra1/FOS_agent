"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Agent } from "@/types";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  User,
  UserCheck,
  X,
} from "lucide-react";
import {
  AgentApiItem,
  AgentSuggestionResponse,
  ApiError,
  CustomerApiItem,
  GeocodeCandidate,
  createDispatchedVisit,
  fetchAgents,
  fetchCustomers,
  geocodeDispatchAddress,
  reverseGeocodeDispatchLocation,
  suggestAgentForLead,
} from "@/lib/api";
import DispatchLocationMap from "@/components/DispatchLocationMap";
import PhotonAutocompleteInput from "@/components/PhotonAutocompleteInput";
import { ParsedPhotonPlace, searchPhotonAddress } from "@/lib/photon";
import { useAuth } from "@/context/AuthContext";

interface AssignWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedAgent?: Agent | null;
  preselectedAgentId?: string;
  preselectedDate?: string;
  onSuccess?: (message: string) => void;
}

type LocationSource = "search" | "lookup" | "map" | "saved" | "manual";

interface LeadLocation {
  latitude: number;
  longitude: number;
  label: string;
  source: LocationSource;
}

const SOURCE_LABEL: Record<LocationSource, string> = {
  search: "Auto-fetched from address search",
  lookup: "Auto-fetched from address lookup",
  map: "Pin placed on map",
  saved: "Saved customer location",
  manual: "Entered manually",
};

const PURPOSES = ["Field inspection", "Sales visit", "Document collection", "Delivery", "Installation", "Service / repair", "Follow-up"];

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const to12Hour = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const formatKm = (meters: number) => `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;

const isValidPoint = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);

const inputClass =
  "w-full text-sm rounded-xl border border-[#E3E2EE] bg-[#FAFAFD] px-3.5 py-2.5 text-[#16151F] placeholder-[#9A98AE] focus:outline-none focus:border-[#393185] focus:bg-white transition disabled:opacity-60";
const labelClass = "block text-xs font-semibold text-[#16151F] mb-1.5";

function StepCard({
  step,
  title,
  hint,
  done,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#E3E2EE] bg-white p-4 sm:p-5 space-y-4 shadow-2xs">
      <header className="flex items-start gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            done ? "bg-[#393185] text-white" : "bg-[#EDECF5] text-[#4A3B2C]"
          }`}
        >
          {done ? <Check className="h-4 w-4" /> : step}
        </span>
        <div>
          <h3 className="text-sm font-bold text-[#16151F]">{title}</h3>
          {hint && <p className="text-[11px] text-[#62607A] mt-0.5">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export default function AssignWorkModal({
  isOpen,
  onClose,
  preselectedAgent,
  preselectedAgentId,
  preselectedDate,
  onSuccess,
}: AssignWorkModalProps) {
  const { session } = useAuth();
  const token = session?.access_token;

  // 1. Customer
  const [customerMode, setCustomerMode] = useState<"new" | "existing">("new");
  const [existingCustomers, setExistingCustomers] = useState<CustomerApiItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [contactPerson, setContactPerson] = useState("");

  // 2. Address & location
  const [searchText, setSearchText] = useState("");
  // Full address returned by the search or the map pin. Saved with the
  // coordinates and used as the geofence reference for check-in.
  const [locatedAddress, setLocatedAddress] = useState("");
  const [unitDetails, setUnitDetails] = useState(""); // flat / house no., floor, building
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [location, setLocation] = useState<LeadLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locateMessage, setLocateMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");

  // 3. Agent
  const [agents, setAgents] = useState<AgentApiItem[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentManuallyChosen, setAgentManuallyChosen] = useState(false);
  const [suggestion, setSuggestion] = useState<AgentSuggestionResponse | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  // 4. Visit
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [scheduledDate, setScheduledDate] = useState(today());
  const [scheduledTime, setScheduledTime] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // ---------------------------------------------------------------- reset
  const resetForm = useCallback(() => {
    setCustomerMode("new");
    setSelectedCustomerId("");
    setCustomerName("");
    setPhone("");
    setEmail("");
    setCompany("");
    setContactPerson("");
    setSearchText("");
    setLocatedAddress("");
    setUnitDetails("");
    setLandmark("");
    setCity("");
    setStateName("");
    setPostalCode("");
    setLocation(null);
    setLocateMessage(null);
    setCandidates([]);
    setShowManualCoords(false);
    setManualLat("");
    setManualLng("");
    setSuggestion(null);
    setSuggestionError(null);
    setPurpose(PURPOSES[0]);
    setPriority("medium");
    setScheduledTime("");
    setNotes("");
    setError(null);
    setFeedback(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    setScheduledDate(preselectedDate || today());
    setAgentManuallyChosen(false);
    setSelectedAgentId("");
  }, [isOpen, preselectedDate, preselectedAgent, preselectedAgentId, resetForm]);

  // ---------------------------------------------------------------- data
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setAgentsLoading(true);
    fetchAgents(token, { limit: 100 })
      .then((result) => {
        if (cancelled) return;
        const active = result.items.filter((agent) => agent.status === "active");
        setAgents(active);
        // No agent is selected until the customer's location is known.
        setSelectedAgentId("");
      })
      .catch(() => !cancelled && setAgents([]))
      .finally(() => !cancelled && setAgentsLoading(false));
    fetchCustomers(token, { limit: 100 })
      .then((result) => !cancelled && setExistingCustomers(result.items))
      .catch(() => !cancelled && setExistingCustomers([]));
    return () => {
      cancelled = true;
    };
  }, [isOpen, token, preselectedAgent, preselectedAgentId]);

  // ---------------------------------------------------------------- customer
  const chooseExistingCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const cust = existingCustomers.find((c) => c.id === customerId);
    if (!cust) return;
    setCustomerName(cust.name || "");
    setPhone(cust.phone || "");
    setEmail(cust.email || "");
    setCompany(cust.company || "");
    setContactPerson(cust.contact_person || "");
    setSearchText("");
    setLocatedAddress(cust.address || "");
    setUnitDetails("");
    setLandmark("");
    setCity(cust.city || "");
    setStateName("");
    setPostalCode((cust.city || "").match(/\b\d{6}\b/)?.[0] || "");
    setCandidates([]);
    if (cust.latitude != null && cust.longitude != null && isValidPoint(cust.latitude, cust.longitude)) {
      setLocation({ latitude: cust.latitude, longitude: cust.longitude, label: cust.address, source: "saved" });
      setLocateMessage(null);
    } else {
      setLocation(null);
      setLocateMessage("This customer has no saved location. Search the address below to fetch it.");
    }
  };

  const switchCustomerMode = (mode: "new" | "existing") => {
    setCustomerMode(mode);
    if (mode === "new") {
      setSelectedCustomerId("");
      setCustomerName("");
      setPhone("");
      setEmail("");
      setCompany("");
      setContactPerson("");
      setSearchText("");
      setLocatedAddress("");
      setUnitDetails("");
      setLandmark("");
      setCity("");
      setStateName("");
      setPostalCode("");
      setLocation(null);
      setLocateMessage(null);
    }
  };

  // ---------------------------------------------------------------- location
  const applyPlace = (place: ParsedPhotonPlace) => {
    const full = place.formattedAddress || place.label || place.name;
    setSearchText(full);
    setLocatedAddress(full);
    setCity(place.city || place.locality || "");
    setStateName(place.state || "");
    setPostalCode(place.postalCode || "");
    setLocation({
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.formattedAddress || place.name,
      source: "search",
    });
    setCandidates([]);
    setLocateMessage(null);
  };

  /** Fetch coordinates for whatever address text is typed (Photon first, then server lookup). */
  const locateTypedAddress = async () => {
    const query = [searchText, city, postalCode].filter((part) => part.trim()).join(", ");
    if (query.trim().length < 3) {
      setLocateMessage("Type an address, landmark or PIN code first.");
      return;
    }
    setIsLocating(true);
    setLocateMessage(null);
    setCandidates([]);
    try {
      const places = await searchPhotonAddress(query, { limit: 1 });
      if (places && places.length > 0) {
        const place = places[0];
        const full = place.formattedAddress || place.name || query;
        setLocation({ latitude: place.latitude, longitude: place.longitude, label: full, source: "lookup" });
        setLocatedAddress(full);
        if (!city && (place.city || place.locality)) setCity(place.city || place.locality);
        if (!stateName && place.state) setStateName(place.state);
        if (!postalCode && place.postalCode) setPostalCode(place.postalCode);
        return;
      }
      const result = await geocodeDispatchAddress(
        { address: searchText.trim() || query, locality: city.trim(), state: stateName.trim(), postal_code: postalCode.trim(), country: "India" },
        token
      );
      if (result.candidates.length === 1) {
        const c = result.candidates[0];
        setLocation({ latitude: c.latitude, longitude: c.longitude, label: c.display_name, source: "lookup" });
        setLocatedAddress(c.display_name);
      } else if (result.candidates.length > 1) {
        setCandidates(result.candidates);
        setLocateMessage("Several places match. Pick the right one below.");
      } else {
        setLocateMessage("No location found for this address. Click on the map to place the pin instead.");
      }
    } catch (err) {
      setLocateMessage(
        err instanceof ApiError ? err.detail || err.message : "Address lookup failed. Click on the map to place the pin instead."
      );
    } finally {
      setIsLocating(false);
    }
  };

  const handleMapPick = async (latitude: number, longitude: number) => {
    setLocation({ latitude, longitude, label: "Pin placed on map", source: "map" });
    setCandidates([]);
    setLocateMessage(null);
    try {
      const result = await reverseGeocodeDispatchLocation(latitude, longitude, token);
      setLocation((prev) =>
        prev && prev.latitude === latitude && prev.longitude === longitude ? { ...prev, label: result.display_name } : prev
      );
      setLocatedAddress(result.display_name);
      const parts = result.address || {};
      const pin = (parts as Record<string, string>).postcode;
      if (pin && /^\d{6}$/.test(pin)) setPostalCode(pin);
    } catch {
      // The pin is still valid without a readable address.
    }
  };

  const applyManualCoords = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isValidPoint(lat, lng)) {
      setLocateMessage("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
      return;
    }
    setLocation({ latitude: lat, longitude: lng, label: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, source: "manual" });
    if (!locatedAddress) setLocatedAddress(searchText.trim());
    setLocateMessage(null);
  };

  // ---------------------------------------------------------------- agent suggestion
  const leadLat = location?.latitude;
  const leadLng = location?.longitude;
  useEffect(() => {
    if (!isOpen || leadLat == null || leadLng == null || agents.length === 0) {
      setSuggestion(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSuggestionLoading(true);
      setSuggestionError(null);
      try {
        const result = await suggestAgentForLead(
          { latitude: leadLat, longitude: leadLng, scheduled_date: scheduledDate || undefined },
          token
        );
        if (cancelled) return;
        setSuggestion(result);
        const recommended = result.recommended_agent_id;
        if (!agentManuallyChosen) {
          const pageAgent = preselectedAgentId || preselectedAgent?.id;
          if (pageAgent && agents.some((a) => a.id === pageAgent)) setSelectedAgentId(pageAgent);
          else if (recommended && agents.some((a) => a.id === recommended)) setSelectedAgentId(recommended);
        }
      } catch (err) {
        if (cancelled) return;
        setSuggestion(null);
        setSuggestionError(err instanceof Error ? err.message : "Could not suggest an agent. Choose one manually.");
      } finally {
        if (!cancelled) setSuggestionLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, leadLat, leadLng, scheduledDate, agents, agentManuallyChosen, token, preselectedAgent, preselectedAgentId]);

  // Clear the agent again if the location is removed.
  useEffect(() => {
    if (!location) {
      setSelectedAgentId("");
      setAgentManuallyChosen(false);
    }
  }, [location]);

  const suggestionByAgent = useMemo(
    () => new Map((suggestion?.suggestions || []).map((item) => [item.agent_id, item])),
    [suggestion]
  );
  const recommendedId = suggestion?.recommended_agent_id || null;
  const recommended = recommendedId ? suggestionByAgent.get(recommendedId) : undefined;
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || null;

  // Saved address = admin's minor details + the located address (+ landmark).
  const fullAddress = [unitDetails.trim(), locatedAddress.trim()].filter(Boolean).join(", ") +
    (landmark.trim() ? ` (Landmark: ${landmark.trim()})` : "");

  // ---------------------------------------------------------------- submit
  const customerDone = customerName.trim().length > 0 && phone.trim().length >= 6;
  const locationDone = Boolean(location) && fullAddress.trim().length >= 5 && fullAddress.length <= 500 && city.trim().length > 0;
  const agentDone = Boolean(selectedAgentId);
  const visitDone = Boolean(scheduledDate);
  const canSubmit = customerDone && locationDone && agentDone && visitDone && !isSubmitting;

  const missing = [
    !customerDone && "customer name and phone",
    !location && "location (search the address)",
    location && fullAddress.trim().length < 5 && "full address",
    fullAddress.length > 500 && "a shorter address (500 characters max)",
    location && !city.trim() && "city",
    !agentDone && "agent",
  ].filter(Boolean) as string[];

  const persistedCity = () => {
    const parts: string[] = [];
    for (const part of [city, stateName, postalCode]) {
      const clean = part.trim();
      if (clean && !parts.some((p) => p.toLowerCase().includes(clean.toLowerCase()))) parts.push(clean);
    }
    return parts.join(", ");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !location) return;
    const cityValue = persistedCity();
    if (cityValue.length > 100) {
      setError("City, state and PIN together must be under 100 characters. Shorten the city field.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const combinedNotes = [purpose ? `Purpose: ${purpose}` : "", notes.trim()].filter(Boolean).join(" · ");
      const visit = await createDispatchedVisit(
        {
          customer_id: customerMode === "existing" && selectedCustomerId ? selectedCustomerId : undefined,
          agent_id: selectedAgentId,
          customer_name: customerName.trim(),
          company: company.trim() || undefined,
          contact_person: contactPerson.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: fullAddress.trim(),
          city: cityValue,
          latitude: location.latitude,
          longitude: location.longitude,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime ? to12Hour(scheduledTime) : "Anytime",
          priority,
          notes: combinedNotes || undefined,
        },
        token
      );
      const summary = `Visit ${visit.visit_code || visit.id.slice(0, 8)} for ${customerName.trim()} assigned to ${
        selectedAgent?.name || "the agent"
      } on ${scheduledDate}${scheduledTime ? ` at ${to12Hour(scheduledTime)}` : ""}.`;
      setFeedback(summary);
      onSuccess?.(summary);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.detail || err.message : err?.message || "Could not save the dispatch. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // ---------------------------------------------------------------- render
  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/40 backdrop-blur-xs px-3 py-6 sm:px-6 sm:py-8 flex justify-center items-start">
      <div className="w-full max-w-3xl rounded-3xl border border-[#E3E2EE] bg-[#FAF8F5] p-5 sm:p-8 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#E3E2EE] pb-4">
          <div>
            <button
              type="button"
              onClick={onClose}
              className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#393185] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
            </button>
            <h2 className="text-2xl font-bold text-[#16151F] tracking-tight">New Dispatch</h2>
            <p className="mt-1 text-xs text-[#62607A]">
              Add the customer, find their address on the map, and the agent who owns that territory is picked for you.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dispatch"
            className="rounded-xl border border-[#E3E2EE] bg-white p-2 text-[#62607A] hover:text-[#16151F] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {feedback ? (
          <div className="rounded-3xl border border-[#E3E2EE] bg-white p-10 text-center shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F0F8] text-[#393185]">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#16151F]">Dispatch created</h3>
            <p className="mt-2 text-sm text-[#62607A]">{feedback}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setAgentManuallyChosen(false);
                  setSelectedAgentId("");
                }}
                className="rounded-xl border border-[#E3E2EE] bg-white px-5 py-2.5 text-xs font-bold text-[#16151F] hover:bg-[#F7F7FB]"
              >
                Dispatch another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-[#393185] hover:bg-[#006F34] px-6 py-2.5 text-xs font-bold text-white"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ------------------------------------------------ 1. Customer */}
            <StepCard step={1} title="Customer details" hint="Who is the visit for?" done={customerDone}>
              <div className="inline-flex rounded-xl border border-[#E3E2EE] bg-[#F7F7FB] p-1 text-xs font-semibold">
                {(["new", "existing"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => switchCustomerMode(mode)}
                    className={`rounded-lg px-3.5 py-1.5 transition ${
                      customerMode === mode ? "bg-white text-[#16151F] shadow-xs" : "text-[#62607A] hover:text-[#16151F]"
                    }`}
                  >
                    {mode === "new" ? "New customer" : "Existing customer"}
                  </button>
                ))}
              </div>

              {customerMode === "existing" && (
                <div>
                  <label className={labelClass} htmlFor="dispatch-existing">Choose customer</label>
                  <div className="relative">
                    <select
                      id="dispatch-existing"
                      value={selectedCustomerId}
                      onChange={(e) => chooseExistingCustomer(e.target.value)}
                      className={`${inputClass} appearance-none pr-9`}
                    >
                      <option value="">
                        {existingCustomers.length ? "Select a saved customer…" : "No saved customers yet"}
                      </option>
                      {existingCustomers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.phone ? ` · ${c.phone}` : ""}
                          {c.city ? ` · ${c.city.split(",")[0]}` : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[#62607A]" />
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="dispatch-name">Full name *</label>
                  <input
                    id="dispatch-name"
                    required
                    maxLength={255}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Priya Deshmukh"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="dispatch-phone">Phone number *</label>
                  <input
                    id="dispatch-phone"
                    required
                    type="tel"
                    inputMode="tel"
                    maxLength={20}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputClass}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="dispatch-email">Email <span className="font-normal text-[#9A98AE]">(optional)</span></label>
                  <input
                    id="dispatch-email"
                    type="email"
                    maxLength={255}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="name@example.com"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="dispatch-company">Company <span className="font-normal text-[#9A98AE]">(optional)</span></label>
                  <input
                    id="dispatch-company"
                    maxLength={255}
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className={inputClass}
                    placeholder="Leave empty for individuals"
                  />
                </div>
              </div>
            </StepCard>

            {/* ------------------------------------------------ 2. Address & map */}
            <StepCard
              step={2}
              title="Address & location"
              hint="Search the location: latitude and longitude are fetched automatically. Drag the pin to the exact entrance, then add flat/floor details."
              done={locationDone}
            >
              <div>
                <label className={labelClass} htmlFor="dispatch-address-autocomplete">Search location *</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <PhotonAutocompleteInput
                      value={searchText}
                      onChange={(value) => setSearchText(value)}
                      onPlaceSelect={applyPlace}
                      placeholder="Building, street, area or landmark…"
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={locateTypedAddress}
                    disabled={isLocating}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#E3E2EE] bg-white px-3.5 text-xs font-semibold text-[#16151F] hover:bg-[#F7F7FB] disabled:opacity-60"
                  >
                    {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Find
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-[#62607A]">
                  Pick a suggestion from the list, or type the address and press Find.
                </p>
              </div>

              {candidates.length > 0 && (
                <div className="space-y-1.5">
                  {candidates.map((c) => (
                    <button
                      key={c.place_id || `${c.latitude},${c.longitude}`}
                      type="button"
                      onClick={() => {
                        setLocation({ latitude: c.latitude, longitude: c.longitude, label: c.display_name, source: "lookup" });
                        setLocatedAddress(c.display_name);
                        if (!city && c.locality) setCity(c.locality);
                        if (!postalCode && c.postal_code) setPostalCode(c.postal_code);
                        setCandidates([]);
                        setLocateMessage(null);
                      }}
                      className="w-full text-left rounded-xl border border-[#E3E2EE] bg-[#FAFAFD] px-3 py-2 text-xs text-[#16151F] hover:border-[#393185]"
                    >
                      <MapPin className="inline h-3.5 w-3.5 mr-1 text-[#B86F52]" />
                      {c.display_name}
                    </button>
                  ))}
                </div>
              )}

              {locateMessage && (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {locateMessage}
                </p>
              )}

              {location && (
                <div className="rounded-xl border border-[#D7D4EE] bg-[#F7F7FB] p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#393185]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Located address · used as the geofence point for check-in
                  </div>
                  <p className="text-xs text-[#16151F]">{locatedAddress || "Reading the address for this pin…"}</p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="dispatch-unit">
                    Flat / house no., floor, building <span className="font-normal text-[#9A98AE]">(optional)</span>
                  </label>
                  <input
                    id="dispatch-unit"
                    maxLength={150}
                    value={unitDetails}
                    onChange={(e) => setUnitDetails(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Flat 302, 3rd floor, Sai Krupa Apts"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="dispatch-landmark">
                    Landmark <span className="font-normal text-[#9A98AE]">(optional)</span>
                  </label>
                  <input
                    id="dispatch-landmark"
                    maxLength={100}
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Opposite D-Mart"
                  />
                </div>
                <p className="sm:col-span-2 -mt-1 text-[11px] text-[#62607A]">
                  These details are added to the address for the agent. They don&apos;t move the pin.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelClass} htmlFor="dispatch-city">City *</label>
                  <input id="dispatch-city" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} placeholder="Auto-filled" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="dispatch-state">State</label>
                  <input id="dispatch-state" value={stateName} onChange={(e) => setStateName(e.target.value)} className={inputClass} placeholder="Auto-filled" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="dispatch-pin">PIN code</label>
                  <input
                    id="dispatch-pin"
                    inputMode="numeric"
                    maxLength={6}
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ""))}
                    className={inputClass}
                    placeholder="Auto-filled"
                  />
                </div>
              </div>

              {/* Coordinates (read-only, auto-filled) */}
              <div
                className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                  location ? "border-[#D7D4EE] bg-[#F1F0F8] text-[#393185]" : "border-[#E3E2EE] bg-[#F7F7FB] text-[#62607A]"
                }`}
              >
                {location ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span className="font-mono font-semibold">
                      {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </span>
                    <span className="text-[11px]">· {SOURCE_LABEL[location.source]}</span>
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4 shrink-0" />
                    Latitude and longitude will appear here once the address is found.
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowManualCoords((v) => !v)}
                  className="ml-auto text-[11px] font-semibold underline underline-offset-2"
                >
                  {showManualCoords ? "Hide manual entry" : "Enter manually"}
                </button>
              </div>

              {showManualCoords && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[120px]">
                    <label className={labelClass} htmlFor="dispatch-lat">Latitude</label>
                    <input id="dispatch-lat" inputMode="decimal" value={manualLat} onChange={(e) => setManualLat(e.target.value)} className={inputClass} placeholder="19.0760" />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className={labelClass} htmlFor="dispatch-lng">Longitude</label>
                    <input id="dispatch-lng" inputMode="decimal" value={manualLng} onChange={(e) => setManualLng(e.target.value)} className={inputClass} placeholder="72.8777" />
                  </div>
                  <button
                    type="button"
                    onClick={applyManualCoords}
                    className="rounded-xl bg-[#393185] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#006F34]"
                  >
                    Use these
                  </button>
                </div>
              )}

              <DispatchLocationMap
                latitude={location?.latitude ?? null}
                longitude={location?.longitude ?? null}
                isEntranceVerified={location?.source === "map"}
                placeLabel={location?.label ?? null}
                onSelect={(lat, lng) => void handleMapPick(lat, lng)}
              />
            </StepCard>

            {/* ------------------------------------------------ 3. Visit */}
            <StepCard step={3} title="Visit details" done={visitDone}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="dispatch-purpose">Purpose</label>
                  <div className="relative">
                    <select id="dispatch-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className={`${inputClass} appearance-none pr-9`}>
                      {PURPOSES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[#62607A]" />
                  </div>
                </div>
                <div>
                  <span className={labelClass}>Priority</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["high", "medium", "low"] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setPriority(level)}
                        className={`rounded-xl border px-2 py-2.5 text-xs font-semibold capitalize transition ${
                          priority === level
                            ? level === "high"
                              ? "border-rose-300 bg-rose-50 text-rose-700"
                              : level === "medium"
                              ? "border-amber-300 bg-amber-50 text-amber-800"
                              : "border-[#D7D4EE] bg-[#F1F0F8] text-[#393185]"
                            : "border-[#E3E2EE] bg-[#FAFAFD] text-[#62607A] hover:text-[#16151F]"
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass} htmlFor="dispatch-date">Date *</label>
                  <div className="relative">
                    <input
                      id="dispatch-date"
                      required
                      type="date"
                      min={today()}
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass} htmlFor="dispatch-time">Time <span className="font-normal text-[#9A98AE]">(optional)</span></label>
                  <div className="relative">
                    <input id="dispatch-time" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className={inputClass} />
                    <Clock className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[#62607A]" />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="dispatch-notes">Instructions for the agent <span className="font-normal text-[#9A98AE]">(optional)</span></label>
                  <textarea
                    id="dispatch-notes"
                    rows={2}
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={`${inputClass} resize-none`}
                    placeholder="e.g. Enter via Gate 2, 2nd floor, ask for the manager."
                  />
                </div>
              </div>
            </StepCard>

            {/* ------------------------------------------------ 4. Agent */}
            <StepCard
              step={4}
              title="Assign agent"
              hint="Picked automatically: the agent whose territory contains this address. You can change it."
              done={agentDone}
            >
              {!location && (
                <p className="flex items-center gap-1.5 text-[11px] text-[#62607A]">
                  <Sparkles className="h-3.5 w-3.5" />
                  The agent is chosen after the customer&apos;s location is found in step 2.
                </p>
              )}
              {location && suggestionLoading && (
                <p className="flex items-center gap-1.5 text-[11px] text-[#62607A]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Finding the territory that contains this location…
                </p>
              )}
              {location && !suggestionLoading && suggestionError && (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {suggestionError}
                </p>
              )}
              {location && !suggestionLoading && suggestion && !recommended && (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {suggestion.detail}
                </p>
              )}
              {location && !suggestionLoading && recommended && (
                <div
                  className={`rounded-xl border p-3 text-xs ${
                    suggestion?.inside_territory
                      ? "border-[#D7D4EE] bg-[#F1F0F8] text-[#393185]"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">
                      <strong>
                        {selectedAgentId === recommendedId
                          ? `Auto-selected: ${recommended.name}`
                          : `Suggested: ${recommended.name} (you picked someone else)`}
                      </strong>
                      <div className="mt-0.5 text-[11px]">
                        {suggestion?.inside_territory
                          ? `This address is inside ${recommended.territory_name}, their territory.`
                          : `Outside every territory. ${recommended.territory_name} is the nearest, ${formatKm(recommended.distance_to_territory_meters)} away.`}
                        {" · "}
                        {recommended.open_visits} open visit{recommended.open_visits === 1 ? "" : "s"}
                      </div>
                    </div>
                    {selectedAgentId !== recommendedId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAgentId(recommendedId!);
                          setAgentManuallyChosen(false);
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#9CC3A8] bg-white px-2.5 py-1 text-[11px] font-semibold hover:bg-[#F7F7FB]"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Use suggested
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className={labelClass} htmlFor="dispatch-agent">Agent *</label>
                <div className="relative">
                  <select
                    id="dispatch-agent"
                    required
                    disabled={!location || agentsLoading || agents.length === 0}
                    value={selectedAgentId}
                    onChange={(e) => {
                      setSelectedAgentId(e.target.value);
                      setAgentManuallyChosen(true);
                    }}
                    className={`${inputClass} appearance-none pr-9`}
                  >
                    <option value="">
                      {!location
                        ? "Locate the customer address first"
                        : agentsLoading
                        ? "Loading agents…"
                        : agents.length === 0
                        ? "No active agents"
                        : "Select an agent…"}
                    </option>
                    {agents.map((agent) => {
                      const fit = suggestionByAgent.get(agent.id);
                      return (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} ({agent.agent_code || agent.id.slice(0, 8)})
                          {fit ? (fit.inside_territory ? ` — ${fit.territory_name}` : ` — ${formatKm(fit.distance_to_territory_meters)} from ${fit.territory_name}`) : ""}
                          {agent.id === recommendedId ? " ★ suggested" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[#62607A]" />
                </div>
                {!agentsLoading && agents.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-[#62607A]">Create or activate an agent in Field Agents first.</p>
                )}
                {/* Warn (don't block) when the address is outside the chosen agent's region */}
                {location && selectedAgent && suggestion && !suggestionLoading && (() => {
                  const fit = suggestionByAgent.get(selectedAgent.id);
                  if (fit?.inside_territory) return null;
                  const owner = suggestion.suggestions.find((item) => item.inside_territory);
                  return (
                    <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {fit
                          ? `This address is outside ${selectedAgent.name}'s region (${fit.territory_name}).`
                          : `${selectedAgent.name} has no region yet.`}{" "}
                        {owner && owner.agent_id !== selectedAgent.id
                          ? `It's inside ${owner.territory_name}, which belongs to ${owner.name}.`
                          : !owner
                          ? "It isn't inside any agent's region."
                          : ""}{" "}
                        You can still dispatch it.
                      </span>
                    </div>
                  );
                })()}
              </div>

              {selectedAgent && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-[#F7F7FB] px-3 py-2 text-[11px] text-[#62607A]">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    <strong className="text-[#16151F]">{selectedAgent.name}</strong>
                  </span>
                  <span>Territory: {selectedAgent.territory || "not set"}</span>
                  <span>
                    {selectedAgent.current_latitude != null && selectedAgent.current_longitude != null
                      ? `Last location: ${selectedAgent.current_latitude.toFixed(3)}, ${selectedAgent.current_longitude.toFixed(3)}`
                      : "Location not shared yet"}
                  </span>
                  <span>Today: {selectedAgent.assigned_tasks} visit{selectedAgent.assigned_tasks === 1 ? "" : "s"}</span>
                </div>
              )}
            </StepCard>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-[#E3E2EE] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-[#62607A]">
                {missing.length ? `Still needed: ${missing.join(", ")}.` : "Everything is ready to dispatch."}
              </p>
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-[#62607A] hover:text-[#16151F]">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#393185] px-6 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#006F34] disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Confirm & Dispatch"
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
