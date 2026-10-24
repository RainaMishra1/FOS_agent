"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Agent } from "@/types";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  MapPin,
  Search,
  X,
  Crosshair,
  Building2,
  UserCheck,
  ShieldCheck,
  Navigation,
  Info,
  Compass,
} from "lucide-react";
import {
  AgentApiItem,
  ApiError,
  createDispatchedVisit,
  fetchAgents,
  fetchCustomers,
  CustomerApiItem,
  geocodeDispatchAddress,
  GeocodeCandidate,
  reverseGeocodeDispatchLocation,
} from "@/lib/api";
import DispatchLocationMap from "@/components/DispatchLocationMap";
import PhotonAutocompleteInput from "@/components/PhotonAutocompleteInput";
import { ParsedPhotonPlace } from "@/lib/photon";
import { useAuth } from "@/context/AuthContext";

interface AssignWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedAgent?: Agent | null;
  preselectedAgentId?: string;
  preselectedDate?: string;
  onSuccess?: (message: string) => void;
}

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function AssignWorkModal({
  isOpen,
  onClose,
  preselectedAgent,
  preselectedAgentId,
  preselectedDate,
  onSuccess,
}: AssignWorkModalProps) {
  const { session } = useAuth();

  // Active agents state
  const [agents, setAgents] = useState<AgentApiItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Existing Customers state
  const [existingCustomers, setExistingCustomers] = useState<CustomerApiItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customersLoading, setCustomersLoading] = useState(false);
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [reusingVerifiedCoords, setReusingVerifiedCoords] = useState(false);

  // Destination & Customer Fields
  const [customerName, setCustomerName] = useState("");
  const [company, setCompany] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [locality, setLocality] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("India");

  // Coordinates & Place Details
  const [coordinates, setCoordinates] = useState<{
    latitude: number;
    longitude: number;
    display_name: string;
    source: "photon" | "nominatim" | "map" | "verified_customer";
  } | null>(null);

  // Geocoding Fallback Candidates
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);

  // Verification & Map State
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [isEntranceVerified, setIsEntranceVerified] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  // Schedule & Dispatch parameters
  const [scheduledDate, setScheduledDate] = useState(today());
  const [scheduledTime, setScheduledTime] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [notes, setNotes] = useState("");

  // Loading & Feedback
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const hasValidCoordinates = Boolean(
    coordinates &&
      Number.isFinite(coordinates.latitude) &&
      Number.isFinite(coordinates.longitude) &&
      coordinates.latitude >= -90 &&
      coordinates.latitude <= 90 &&
      coordinates.longitude >= -180 &&
      coordinates.longitude <= 180
  );

  useEffect(() => {
    if (isOpen && preselectedDate) setScheduledDate(preselectedDate);
  }, [isOpen, preselectedDate]);

  // Load Active Agents
  const loadAgents = useCallback(async () => {
    if (!isOpen) return;
    setAgentsLoading(true);
    try {
      const result = await fetchAgents(session?.access_token, { limit: 100 });
      const available = result.items.filter((agent) => agent.status.toLowerCase() === "active");
      setAgents(available);
      setSelectedAgentId((current) => {
        if (current && available.some((agent) => agent.id === current)) return current;
        if (preselectedAgentId && available.some((agent) => agent.id === preselectedAgentId)) return preselectedAgentId;
        if (preselectedAgent && available.some((agent) => agent.id === preselectedAgent.id)) return preselectedAgent.id;
        return available[0]?.id || "";
      });
    } catch {
      setAgents([]);
      setSelectedAgentId("");
    } finally {
      setAgentsLoading(false);
    }
  }, [isOpen, preselectedAgent, preselectedAgentId, session?.access_token]);

  // Load Existing Customers for fast dispatch and verified coordinate reuse
  const loadCustomers = useCallback(async () => {
    if (!isOpen) return;
    setCustomersLoading(true);
    try {
      const result = await fetchCustomers(session?.access_token, { limit: 100 });
      setExistingCustomers(result.items || []);
    } catch {
      setExistingCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  }, [isOpen, session?.access_token]);

  useEffect(() => {
    void loadAgents();
    void loadCustomers();
  }, [loadAgents, loadCustomers]);

  if (!isOpen) return null;

  // Handle switching to or selecting an existing customer
  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    if (!customerId) {
      setIsExistingCustomer(false);
      setReusingVerifiedCoords(false);
      return;
    }

    const cust = existingCustomers.find((c) => c.id === customerId);
    if (!cust) return;

    setIsExistingCustomer(true);
    setCustomerName(cust.name || "");
    setCompany(cust.company || "");
    setContactPerson(cust.contact_person || "");
    setPhone(cust.phone || "");
    setEmail(cust.email || "");
    setAddress(cust.address || "");
    setLocality(cust.city || "");

    // Check if customer already has valid verified coordinates
    if (cust.latitude != null && cust.longitude != null && (cust.latitude !== 0 || cust.longitude !== 0)) {
      setCoordinates({
        latitude: cust.latitude,
        longitude: cust.longitude,
        display_name: `${cust.name} (Saved Customer Site)`,
        source: "verified_customer",
      });
      setLocationConfirmed(true);
      setIsEntranceVerified(true);
      setReusingVerifiedCoords(true);
      setMapOpen(true);
      setMessage("");
    } else {
      setCoordinates(null);
      setLocationConfirmed(false);
      setIsEntranceVerified(false);
      setReusingVerifiedCoords(false);
      setMessage("This customer has no saved coordinates. Search their address or place a pin on the entrance.");
    }
  };

  const clearLocationChoice = () => {
    if (reusingVerifiedCoords) {
      setReusingVerifiedCoords(false);
    }
    setCoordinates(null);
    setCandidates([]);
    setLocationConfirmed(false);
    setIsEntranceVerified(false);
  };

  const updateAddressPart = (setter: (value: string) => void, value: string) => {
    setter(value);
    clearLocationChoice();
  };

  // Photon Autocomplete Selection Callback
  const handlePhotonPlaceSelect = (place: ParsedPhotonPlace) => {
    setMessage("");
    setReusingVerifiedCoords(false);

    // Auto-populate parsed address components
    if (place.formattedAddress) setAddress(place.formattedAddress);
    if (place.locality) setLocality(place.locality);
    if (place.state) setState(place.state);
    if (place.postalCode) setPostalCode(place.postalCode);
    if (place.country) setCountry(place.country);

    // If customer name is empty and place has a name, prefill it
    if (!customerName.trim() && place.name) {
      setCustomerName(place.name);
    }

    // Set coordinates from Photon result
    setCoordinates({
      latitude: place.latitude,
      longitude: place.longitude,
      display_name: place.formattedAddress || place.name || "Selected Location",
      source: "photon",
    });

    // Marker is placed at address/place centroid; admin can verify or drag to exact entrance
    setIsEntranceVerified(false);
    setLocationConfirmed(false);
    setMapOpen(true);
  };

  // Fallback: OpenStreetMap Nominatim Search
  const findCoordinatesNominatim = async () => {
    if (address.trim().length < 2 || locality.trim().length < 2) {
      setMessage("Enter the landmark or street address and locality before looking up coordinates.");
      return;
    }
    setMessage("");
    clearLocationChoice();
    setIsGeocoding(true);
    try {
      const result = await geocodeDispatchAddress(
        {
          address: address.trim(),
          locality: locality.trim(),
          state: state.trim(),
          postal_code: postalCode.trim(),
          country: country.trim(),
        },
        session?.access_token
      );
      setCandidates(result.candidates);
      if (result.candidates.length === 0) {
        setMessage(
          "No matching place was returned for those address details. Your address is unchanged; select the building entrance on the map or refine the locality."
        );
      }
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.detail || error.message
          : "Address lookup failed unexpectedly. You can click or drag directly on the map to place the entrance pin."
      );
    } finally {
      setIsGeocoding(false);
    }
  };

  const selectCandidate = (candidate: GeocodeCandidate) => {
    setCoordinates({ ...candidate, source: "nominatim" });
    setLocationConfirmed(false);
    setIsEntranceVerified(false);
    setMapOpen(true);
    setMessage("");
  };

  // Map Marker Draggable Adjustment or Click
  const selectMapPoint = async (latitude: number, longitude: number, isEntranceAdjusted: boolean) => {
    setCoordinates({
      latitude,
      longitude,
      display_name: isEntranceAdjusted ? "Exact Entrance Pin Selected" : "Map point selected",
      source: "map",
    });
    setReusingVerifiedCoords(false);
    setIsEntranceVerified(isEntranceAdjusted);
    setLocationConfirmed(true);
    setMessage("");
    setIsReverseGeocoding(true);
    try {
      const result = await reverseGeocodeDispatchLocation(latitude, longitude, session?.access_token);
      setCoordinates((prev) =>
        prev
          ? {
              ...prev,
              display_name: result.display_name,
            }
          : null
      );
    } catch {
      // Non-fatal
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");

    if (!selectedAgentId) {
      return setMessage("There are no active agents available for dispatch.");
    }
    if (!coordinates || !hasValidCoordinates || !locationConfirmed) {
      return setMessage("Verify and confirm the customer entrance coordinates before dispatching.");
    }

    const persistedCity = [locality.trim(), state.trim(), postalCode.trim(), country.trim()]
      .filter(Boolean)
      .join(", ");
    if (persistedCity.length > 100) {
      return setMessage(
        "Shorten the locality, state, postal code, or country text. Their combined address detail must fit the existing 100-character city field."
      );
    }

    setIsSubmitting(true);
    try {
      const visit = await createDispatchedVisit(
        {
          customer_id: selectedCustomerId || undefined,
          agent_id: selectedAgentId,
          customer_name: customerName.trim(),
          company: company.trim() || undefined,
          contact_person: contactPerson.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim(),
          city: persistedCity,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          priority,
          notes: notes.trim() || undefined,
        },
        session?.access_token
      );

      if (
        visit.customer_latitude == null ||
        visit.customer_longitude == null ||
        Math.abs(visit.customer_latitude - coordinates.latitude) > 0.000001 ||
        Math.abs(visit.customer_longitude - coordinates.longitude) > 0.000001
      ) {
        throw new Error(
          "The saved visit did not confirm the selected site coordinates. Refresh the dispatch list before retrying."
        );
      }

      const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
      const entranceStatus = isEntranceVerified ? "Entrance-verified" : "Centroid";
      const summary = `Visit ${visit.visit_code || visit.id.slice(0, 8)} assigned to ${
        selectedAgent?.name || "agent"
      }. Saved site (${entranceStatus}): ${visit.customer_latitude.toFixed(6)}, ${visit.customer_longitude.toFixed(
        6
      )}.`;
      setFeedback(summary);
      onSuccess?.(summary);
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.detail || error.message
          : error instanceof Error
          ? error.message
          : "Could not save the dispatch. Try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "w-full text-sm rounded-xl bg-beige-bg border border-beige-border px-3 py-2.5 text-beige-text placeholder-beige-muted focus:outline-none focus:border-beige-terracotta";
  const labelClass = "block text-xs font-semibold text-beige-text mb-1.5";

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-beige-bg px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4 border-b border-beige-border pb-5">
          <div>
            <button
              type="button"
              onClick={onClose}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-beige-terracotta hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
            </button>
            <h2 className="text-xl font-bold text-beige-text sm:text-2xl">New Dispatch</h2>
            <p className="mt-1 text-xs text-beige-muted">
              Select an existing customer or search an address with Photon API, adjust the pin to the exact building entrance,
              and dispatch to an active field agent.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dispatch"
            className="rounded-xl border border-beige-border bg-beige-card p-2 text-beige-muted hover:text-beige-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {feedback ? (
          <div className="mt-10 rounded-3xl border border-beige-border bg-beige-card p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-beige-olive-subtle text-beige-olive">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-beige-text">Dispatch created</h3>
            <p className="mt-2 text-sm text-beige-muted">{feedback}</p>
            <button
              onClick={onClose}
              className="mt-6 rounded-xl bg-beige-terracotta px-5 py-2.5 text-xs font-bold text-white"
            >
              Return to dashboard
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-6 space-y-5 rounded-3xl border border-beige-border bg-beige-card p-5 shadow-sm sm:p-7"
          >
            {message && (
              <div
                role="alert"
                className="flex gap-2 rounded-xl border border-beige-terracotta/30 bg-[#FDF2F0] p-3 text-xs text-beige-terracotta"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {message}
              </div>
            )}

            {/* Agent Selector */}
            <div>
              <label className={labelClass} htmlFor="dispatch-agent">
                Assign to active agent *
              </label>
              <select
                id="dispatch-agent"
                required
                disabled={agentsLoading || agents.length === 0}
                value={selectedAgentId}
                onChange={(event) => setSelectedAgentId(event.target.value)}
                className={inputClass}
              >
                {agentsLoading && <option value="">Loading agents…</option>}
                {!agentsLoading && agents.length === 0 && <option value="">No active agents available</option>}
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                    {agent.agent_code ? ` (${agent.agent_code})` : ""}
                    {agent.territory ? ` · ${agent.territory}` : ""}
                  </option>
                ))}
              </select>
              {!agentsLoading && agents.length === 0 && (
                <p className="mt-1.5 text-[11px] text-beige-muted">
                  Create or activate an agent in the Field Agents directory before dispatching.
                </p>
              )}
            </div>

            {/* Customer Mode: Existing Customer vs New Customer */}
            <div className="rounded-2xl border border-beige-border bg-beige-sand/40 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <label className="text-xs font-semibold text-beige-text flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-beige-terracotta" />
                  Customer Selection
                </label>
                <span className="text-[11px] text-beige-muted">
                  Reuse verified customer records or enter new destination
                </span>
              </div>

              <select
                id="dispatch-customer-select"
                value={selectedCustomerId}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                disabled={customersLoading}
                className={inputClass}
              >
                <option value="">+ New Customer / One-off Destination</option>
                {existingCustomers.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name} {cust.company ? `(${cust.company})` : ""} · {cust.city || cust.address}
                    {cust.latitude != null && cust.longitude != null ? " [✓ Coordinates Saved]" : ""}
                  </option>
                ))}
              </select>

              {reusingVerifiedCoords && (
                <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-beige-olive-subtle/80 border border-beige-olive/30 p-2.5 text-xs text-beige-olive-dark">
                  <UserCheck className="h-4 w-4 shrink-0 text-beige-olive mt-0.5" />
                  <div>
                    <span className="font-semibold text-beige-text">Reusing verified customer coordinates:</span>{" "}
                    <span className="font-mono text-[11px]">
                      {coordinates?.latitude.toFixed(6)}, {coordinates?.longitude.toFixed(6)}
                    </span>
                    <p className="text-[11px] text-beige-muted mt-0.5">
                      These verified coordinates are protected and will NOT be overwritten unless you adjust the pin on the map.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Customer Details */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="dispatch-customer">
                  Customer / Site name *
                </label>
                <input
                  id="dispatch-customer"
                  required
                  maxLength={255}
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  className={inputClass}
                  placeholder="Type a customer or site name"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="dispatch-company">
                  Company
                </label>
                <input
                  id="dispatch-company"
                  maxLength={255}
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  className={inputClass}
                  placeholder="Company name"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="dispatch-contact">
                  Contact person
                </label>
                <input
                  id="dispatch-contact"
                  maxLength={255}
                  value={contactPerson}
                  onChange={(event) => setContactPerson(event.target.value)}
                  className={inputClass}
                  placeholder="On-site contact"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="dispatch-phone">
                  Contact phone
                </label>
                <input
                  id="dispatch-phone"
                  type="tel"
                  maxLength={50}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className={inputClass}
                  placeholder="Phone number"
                />
              </div>
            </div>

            {/* Address Search with Photon API Autocomplete */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelClass} htmlFor="dispatch-address">
                  Customer Address / Landmark *
                </label>
                <span className="text-[11px] text-beige-muted flex items-center gap-1">
                  <Compass className="h-3.5 w-3.5 text-beige-terracotta" />
                  Photon autocomplete (OpenStreetMap)
                </span>
              </div>

              <PhotonAutocompleteInput
                id="dispatch-address"
                value={address}
                onChange={(val) => updateAddressPart(setAddress, val)}
                onPlaceSelect={handlePhotonPlaceSelect}
                placeholder="Search addresses, buildings, schools, businesses, or landmarks in India…"
                required
                className={inputClass}
              />
            </div>

            {/* Locality, State, PIN, Country */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="dispatch-locality">
                  Locality / City *
                </label>
                <input
                  id="dispatch-locality"
                  required
                  maxLength={100}
                  value={locality}
                  onChange={(event) => updateAddressPart(setLocality, event.target.value)}
                  className={inputClass}
                  placeholder="e.g. Kalyan East, Whitefield"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="dispatch-state">
                  State
                </label>
                <input
                  id="dispatch-state"
                  maxLength={100}
                  value={state}
                  onChange={(event) => updateAddressPart(setState, event.target.value)}
                  className={inputClass}
                  placeholder="e.g. Maharashtra, Karnataka"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="dispatch-postal">
                  PIN code
                </label>
                <input
                  id="dispatch-postal"
                  maxLength={20}
                  value={postalCode}
                  onChange={(event) => updateAddressPart(setPostalCode, event.target.value)}
                  className={inputClass}
                  placeholder="e.g. 421306, 560066"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="dispatch-country">
                  Country *
                </label>
                <input
                  id="dispatch-country"
                  required
                  maxLength={80}
                  value={country}
                  onChange={(event) => updateAddressPart(setCountry, event.target.value)}
                  className={inputClass}
                  placeholder="India"
                />
              </div>
            </div>

            {/* Map & Geocode Actions */}
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={isGeocoding || address.trim().length < 2 || locality.trim().length < 2 || !country.trim()}
                onClick={findCoordinatesNominatim}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-beige-border bg-beige-sand px-4 py-2.5 text-xs font-bold text-beige-text disabled:opacity-50"
              >
                {isGeocoding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching OpenStreetMap…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 text-beige-terracotta" />
                    Structured OSM Lookup
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setMapOpen((open) => !open)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-beige-border bg-beige-card px-4 py-2.5 text-xs font-bold text-beige-text"
              >
                <Crosshair className="h-4 w-4 text-beige-terracotta" />
                {mapOpen ? "Hide entrance map" : "Adjust entrance on map"}
              </button>
            </div>

            {/* Nominatim Structured Candidate List */}
            {candidates.length > 0 && (
              <div className="space-y-2 rounded-xl border border-beige-border bg-beige-sand/50 p-3">
                <p className="text-xs font-semibold text-beige-text">
                  Choose a matching place ({candidates.length}). Results may identify a nearby locality or landmark; confirm the entrance pin.
                </p>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {candidates.map((candidate, index) => (
                    <button
                      type="button"
                      key={candidate.place_id || `${candidate.latitude},${candidate.longitude}`}
                      onClick={() => selectCandidate(candidate)}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        coordinates?.source === "nominatim" &&
                        coordinates.latitude === candidate.latitude &&
                        coordinates.longitude === candidate.longitude
                          ? "border-beige-terracotta bg-beige-card"
                          : "border-beige-border bg-beige-card/70 hover:bg-beige-card"
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-beige-terracotta" />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-beige-text">{candidate.display_name}</span>
                          <span className="mt-1 block text-[10px] text-beige-muted">
                            {[candidate.locality, candidate.state, candidate.postal_code, candidate.country, candidate.type]
                              .filter(Boolean)
                              .join(" · ") || "Address result"}
                          </span>
                          <span className="mt-1 block font-mono text-[10px] text-beige-muted">
                            {candidate.latitude.toFixed(6)}, {candidate.longitude.toFixed(6)} · Result {index + 1}
                          </span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Interactive Leaflet Map with Draggable Entrance Marker */}
            {mapOpen && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-beige-text flex items-center gap-1.5">
                    <Navigation className="h-4 w-4 text-beige-terracotta" />
                    Building Entrance Locator (OpenStreetMap + Leaflet)
                  </span>
                  <span className="text-[11px] text-beige-muted">
                    Zoom level 17+ · Drag marker or click exact gate
                  </span>
                </div>
                <DispatchLocationMap
                  latitude={coordinates?.latitude ?? null}
                  longitude={coordinates?.longitude ?? null}
                  isEntranceVerified={isEntranceVerified}
                  placeLabel={customerName || address || null}
                  onSelect={(lat, lng, isAdjusted) => void selectMapPoint(lat, lng, isAdjusted)}
                />
              </div>
            )}

            {/* Coordinates & Entrance Pin Confirmation Card */}
            <div
              className={`rounded-2xl border p-4 text-xs transition ${
                coordinates
                  ? "border-beige-olive/30 bg-beige-olive-subtle/50 text-beige-text"
                  : "border-beige-border bg-beige-sand/50 text-beige-muted"
              }`}
            >
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-beige-terracotta" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="font-bold text-sm">
                      {coordinates
                        ? coordinates.source === "verified_customer"
                          ? "Existing Customer Verified Coordinates"
                          : coordinates.source === "photon"
                          ? "Photon Search Location"
                          : coordinates.source === "map"
                          ? "Map-Selected Location"
                          : "Structured Address Result"
                        : "Location not selected"}
                    </p>
                    {coordinates && (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          isEntranceVerified
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-amber-100 text-amber-800 border border-amber-300"
                        }`}
                      >
                        {isEntranceVerified ? (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Entrance Pin Adjusted & Verified
                          </>
                        ) : (
                          <>
                            <Info className="h-3.5 w-3.5" />
                            Centroid (Verify entrance pin)
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  {coordinates ? (
                    <>
                      <p className="mt-2 font-mono text-xs bg-beige-bg/70 px-2 py-1 rounded-md border border-beige-border inline-block">
                        Lat: {coordinates.latitude.toFixed(6)} · Lng: {coordinates.longitude.toFixed(6)}
                      </p>
                      <p className="mt-1 text-[11px] text-beige-muted">
                        Target Address: {address}, {[locality, state, postalCode, country].filter(Boolean).join(", ")}
                      </p>
                      <p className="mt-1 text-[11px] text-beige-muted">
                        {isReverseGeocoding ? "Resolving map coordinates…" : coordinates.display_name}
                      </p>

                      <label className="mt-3.5 flex items-start gap-2.5 border-t border-beige-border/70 pt-3 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={locationConfirmed}
                          onChange={(event) => setLocationConfirmed(event.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded accent-[#B86F52]"
                        />
                        <span className="font-medium text-beige-text leading-tight">
                          I confirm these coordinates mark the customer building entrance for field agent dispatch and
                          750m geofence validation.
                        </span>
                      </label>
                    </>
                  ) : (
                    <p className="mt-1">
                      Search for the address using Photon API or select its location on the map.
                      Coordinates must be confirmed before dispatching.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Schedule & Priority */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="dispatch-date">
                  Scheduled date *
                </label>
                <input
                  id="dispatch-date"
                  required
                  type="date"
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="dispatch-time">
                  Scheduled time *
                </label>
                <div className="relative">
                  <input
                    id="dispatch-time"
                    required
                    type="time"
                    value={scheduledTime}
                    onChange={(event) => setScheduledTime(event.target.value)}
                    className={inputClass}
                  />
                  <Clock className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-beige-muted" />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="dispatch-priority">
                  Priority *
                </label>
                <select
                  id="dispatch-priority"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as "high" | "medium" | "low")}
                  className={inputClass}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            {/* Instructions */}
            <div>
              <label className={labelClass} htmlFor="dispatch-notes">
                Visit instructions / Gate notes
              </label>
              <textarea
                id="dispatch-notes"
                rows={3}
                maxLength={5000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className={inputClass}
                placeholder="e.g. Enter via Gate 2 near the security cabin. Present visitor pass at reception."
              />
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col-reverse gap-2 border-t border-beige-border pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-beige-muted hover:bg-beige-sand"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  agentsLoading ||
                  agents.length === 0 ||
                  !hasValidCoordinates ||
                  !locationConfirmed
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-beige-terracotta px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving dispatch…
                  </>
                ) : (
                  "Confirm & Dispatch"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
