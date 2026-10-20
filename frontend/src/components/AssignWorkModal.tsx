"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Agent } from "@/types";
import { AlertCircle, ArrowLeft, Check, Clock, Loader2, MapPin, Search, X, Crosshair } from "lucide-react";
import { AgentApiItem, ApiError, createDispatchedVisit, fetchAgents, geocodeDispatchAddress, GeocodeCandidate, reverseGeocodeDispatchLocation } from "@/lib/api";
import DispatchLocationMap from "@/components/DispatchLocationMap";
import { useAuth } from "@/context/AuthContext";

interface AssignWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedAgent?: Agent | null;
  onSuccess?: (message: string) => void;
}

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function AssignWorkModal({ isOpen, onClose, preselectedAgent, onSuccess }: AssignWorkModalProps) {
  const { session } = useAuth();
  const [agents, setAgents] = useState<AgentApiItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentsLoading, setAgentsLoading] = useState(false);
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
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number; display_name: string; source: "nominatim" | "map" } | null>(null);
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(today());
  const [scheduledTime, setScheduledTime] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [notes, setNotes] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const hasValidCoordinates = Boolean(coordinates && Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) && coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 && coordinates.longitude >= -180 && coordinates.longitude <= 180);

  const loadAgents = useCallback(async () => {
    if (!isOpen) return;
    setAgentsLoading(true);
    setMessage("");
    try {
      const result = await fetchAgents(session?.access_token, { limit: 100 });
      const available = result.items.filter((agent) => agent.status.toLowerCase() === "active");
      setAgents(available);
      setSelectedAgentId((current) => {
        if (current && available.some((agent) => agent.id === current)) return current;
        if (preselectedAgent && available.some((agent) => agent.id === preselectedAgent.id)) return preselectedAgent.id;
        return available[0]?.id || "";
      });
    } catch (error) {
      setAgents([]);
      setSelectedAgentId("");
      setMessage(error instanceof ApiError ? (error.detail || error.message) : "Could not load agents from the FOS database.");
    } finally {
      setAgentsLoading(false);
    }
  }, [isOpen, preselectedAgent, session?.access_token]);

  useEffect(() => { void loadAgents(); }, [loadAgents]);

  if (!isOpen) return null;

  const clearLocationChoice = () => {
    setCoordinates(null);
    setCandidates([]);
    setLocationConfirmed(false);
  };

  const updateAddressPart = (setter: (value: string) => void, value: string) => {
    setter(value);
    clearLocationChoice();
  };

  const findCoordinates = async () => {
    if (address.trim().length < 2 || locality.trim().length < 2) {
      setMessage("Enter the landmark or street address and locality before looking up coordinates.");
      return;
    }
    setMessage("");
    setCoordinates(null);
    setCandidates([]);
    setLocationConfirmed(false);
    setIsGeocoding(true);
    try {
      const result = await geocodeDispatchAddress({
        address: address.trim(), locality: locality.trim(), state: state.trim(),
        postal_code: postalCode.trim(), country: country.trim(),
      }, session?.access_token);
      setCandidates(result.candidates);
      if (result.candidates.length === 0) {
        setMessage("No matching place was returned for those address details. Your address is unchanged; select the correct site on the map or refine the locality and PIN code.");
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? (error.detail || error.message) : "Address lookup failed unexpectedly. The address is unchanged; try again or select the point on the map.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const selectCandidate = (candidate: GeocodeCandidate) => {
    setCoordinates({ ...candidate, source: "nominatim" });
    setLocationConfirmed(false);
    setMapOpen(true);
    setMessage("");
  };

  const selectMapPoint = async (latitude: number, longitude: number) => {
    setCoordinates({ latitude, longitude, display_name: "Map point selected", source: "map" });
    setLocationConfirmed(false);
    setMessage("");
    setIsReverseGeocoding(true);
    try {
      const result = await reverseGeocodeDispatchLocation(latitude, longitude, session?.access_token);
      setCoordinates({ latitude, longitude, display_name: result.display_name, source: "map" });
    } catch (error) {
      const reason = error instanceof ApiError ? error.detail || error.message : "Reverse lookup unavailable.";
      setMessage(`${reason} The selected map point is still available; verify it before confirming.`);
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!selectedAgentId) return setMessage("There are no active agents available for dispatch.");
    if (!coordinates || !hasValidCoordinates || !locationConfirmed) return setMessage("Select a valid geocoding result or map point, then confirm it before dispatching.");
    const persistedCity = [locality.trim(), state.trim(), postalCode.trim(), country.trim()].filter(Boolean).join(", ");
    if (persistedCity.length > 100) return setMessage("Shorten the locality, state, postal code, or country text. Their combined address detail must fit the existing 100-character city field.");
    setIsSubmitting(true);
    try {
      const visit = await createDispatchedVisit({
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
      }, session?.access_token);
      if (visit.customer_latitude == null || visit.customer_longitude == null ||
          Math.abs(visit.customer_latitude - coordinates.latitude) > 0.000001 ||
          Math.abs(visit.customer_longitude - coordinates.longitude) > 0.000001) {
        throw new Error("The saved visit did not confirm the selected site coordinates. Refresh the dispatch list before retrying.");
      }
      const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
      const summary = `Visit ${visit.visit_code || visit.id.slice(0, 8)} assigned to ${selectedAgent?.name || "agent"}. Saved site: ${visit.customer_latitude.toFixed(6)}, ${visit.customer_longitude.toFixed(6)}.`;
      setFeedback(summary);
      onSuccess?.(summary);
    } catch (error) {
      setMessage(error instanceof ApiError ? (error.detail || error.message) : error instanceof Error ? error.message : "Could not save the dispatch. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "w-full text-sm rounded-xl bg-beige-bg border border-beige-border px-3 py-2.5 text-beige-text placeholder-beige-muted focus:outline-none focus:border-beige-terracotta";
  const labelClass = "block text-xs font-semibold text-beige-text mb-1.5";

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-beige-bg px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4 border-b border-beige-border pb-5">
          <div>
            <button type="button" onClick={onClose} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-beige-terracotta hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
            </button>
            <h2 className="text-xl font-bold text-beige-text sm:text-2xl">New Dispatch</h2>
            <p className="mt-1 text-xs text-beige-muted">Enter a destination manually, find its coordinates, then assign the visit to an active agent.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dispatch" className="rounded-xl border border-beige-border bg-beige-card p-2 text-beige-muted hover:text-beige-text"><X className="h-5 w-5" /></button>
        </div>

        {feedback ? (
          <div className="mt-10 rounded-3xl border border-beige-border bg-beige-card p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-beige-olive-subtle text-beige-olive"><Check className="h-6 w-6" /></div>
            <h3 className="mt-4 text-lg font-bold text-beige-text">Dispatch created</h3>
            <p className="mt-2 text-sm text-beige-muted">{feedback}</p>
            <button onClick={onClose} className="mt-6 rounded-xl bg-beige-terracotta px-5 py-2.5 text-xs font-bold text-white">Return to dashboard</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-3xl border border-beige-border bg-beige-card p-5 shadow-sm sm:p-7">
            {message && <div role="alert" className="flex gap-2 rounded-xl border border-beige-terracotta/30 bg-[#FDF2F0] p-3 text-xs text-beige-terracotta"><AlertCircle className="h-4 w-4 shrink-0" />{message}</div>}

            <div>
              <label className={labelClass} htmlFor="dispatch-agent">Assign to active agent *</label>
              <select id="dispatch-agent" required disabled={agentsLoading || agents.length === 0} value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)} className={inputClass}>
                {agentsLoading && <option value="">Loading agents…</option>}
                {!agentsLoading && agents.length === 0 && <option value="">No active agents available</option>}
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.agent_code ? ` (${agent.agent_code})` : ""}{agent.territory ? ` · ${agent.territory}` : ""}</option>)}
              </select>
              {!agentsLoading && agents.length === 0 && <p className="mt-1.5 text-[11px] text-beige-muted">Create or activate an agent in the Field Agents directory before dispatching.</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass} htmlFor="dispatch-customer">Customer / Site name *</label><input id="dispatch-customer" required maxLength={255} value={customerName} onChange={(event) => setCustomerName(event.target.value)} className={inputClass} placeholder="Type a customer or site name" /></div>
              <div><label className={labelClass} htmlFor="dispatch-company">Company</label><input id="dispatch-company" maxLength={255} value={company} onChange={(event) => setCompany(event.target.value)} className={inputClass} placeholder="Company name" /></div>
              <div><label className={labelClass} htmlFor="dispatch-contact">Contact person</label><input id="dispatch-contact" maxLength={255} value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} className={inputClass} placeholder="On-site contact" /></div>
              <div><label className={labelClass} htmlFor="dispatch-phone">Contact phone</label><input id="dispatch-phone" type="tel" maxLength={50} value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} placeholder="Phone number" /></div>
            </div>

            <div><label className={labelClass} htmlFor="dispatch-address">Street address or landmark *</label><textarea id="dispatch-address" required minLength={2} maxLength={300} rows={2} value={address} onChange={(event) => updateAddressPart(setAddress, event.target.value)} className={inputClass} placeholder="For example: Divine Paradise High School near Church" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass} htmlFor="dispatch-locality">Locality / City *</label><input id="dispatch-locality" required maxLength={100} value={locality} onChange={(event) => updateAddressPart(setLocality, event.target.value)} className={inputClass} placeholder="Kalyan East" /></div>
              <div><label className={labelClass} htmlFor="dispatch-state">State</label><input id="dispatch-state" maxLength={100} value={state} onChange={(event) => updateAddressPart(setState, event.target.value)} className={inputClass} placeholder="Maharashtra" /></div>
              <div><label className={labelClass} htmlFor="dispatch-postal">PIN code</label><input id="dispatch-postal" maxLength={20} value={postalCode} onChange={(event) => updateAddressPart(setPostalCode, event.target.value)} className={inputClass} placeholder="421306" /></div>
              <div><label className={labelClass} htmlFor="dispatch-country">Country *</label><input id="dispatch-country" required maxLength={80} value={country} onChange={(event) => updateAddressPart(setCountry, event.target.value)} className={inputClass} placeholder="India" /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" disabled={isGeocoding || address.trim().length < 2 || locality.trim().length < 2 || !country.trim()} onClick={findCoordinates} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-beige-border bg-beige-sand px-4 py-2.5 text-xs font-bold text-beige-text disabled:opacity-50">{isGeocoding ? <><Loader2 className="h-4 w-4 animate-spin" />Searching address…</> : <><Search className="h-4 w-4 text-beige-terracotta" />Find address coordinates</>}</button>
              <button type="button" onClick={() => setMapOpen((open) => !open)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-beige-border bg-beige-card px-4 py-2.5 text-xs font-bold text-beige-text"><Crosshair className="h-4 w-4 text-beige-terracotta" />{mapOpen ? "Close map selection" : "Select location on map"}</button>
            </div>

            {candidates.length > 0 && <div className="space-y-2 rounded-xl border border-beige-border bg-beige-sand/50 p-3">
              <p className="text-xs font-semibold text-beige-text">Choose a matching place ({candidates.length}). Results may identify a nearby locality or landmark; confirm the actual site.</p>
              <div className="max-h-56 space-y-2 overflow-y-auto">{candidates.map((candidate, index) => <button type="button" key={candidate.place_id || `${candidate.latitude},${candidate.longitude}`} onClick={() => selectCandidate(candidate)} className={`w-full rounded-lg border p-3 text-left transition ${coordinates?.source === "nominatim" && coordinates.latitude === candidate.latitude && coordinates.longitude === candidate.longitude ? "border-beige-terracotta bg-beige-card" : "border-beige-border bg-beige-card/70 hover:bg-beige-card"}`}>
                <span className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-beige-terracotta" /><span className="min-w-0"><span className="block text-xs font-semibold text-beige-text">{candidate.display_name}</span><span className="mt-1 block text-[10px] text-beige-muted">{[candidate.locality, candidate.state, candidate.postal_code, candidate.country, candidate.type].filter(Boolean).join(" · ") || "Address result"}</span><span className="mt-1 block font-mono text-[10px] text-beige-muted">{candidate.latitude.toFixed(6)}, {candidate.longitude.toFixed(6)} · Result {index + 1}</span></span></span>
              </button>)}</div>
            </div>}

            {mapOpen && <DispatchLocationMap latitude={coordinates?.latitude ?? null} longitude={coordinates?.longitude ?? null} onSelect={(lat, lng) => void selectMapPoint(lat, lng)} />}

            <div className={`rounded-xl border p-3 text-xs ${coordinates ? "border-beige-olive/30 bg-beige-olive-subtle/60 text-beige-text" : "border-beige-border bg-beige-sand/50 text-beige-muted"}`}>
              <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-beige-terracotta" /><div className="min-w-0"><p className="font-semibold">{coordinates ? (coordinates.source === "map" ? "Map point selected" : "Address result selected") : "Location not selected"}</p>{coordinates ? <><p className="mt-1 font-mono">Latitude: {coordinates.latitude.toFixed(6)} · Longitude: {coordinates.longitude.toFixed(6)}</p><p className="mt-1 text-[10px] text-beige-muted">Original address: {address}, {[locality, state, postalCode, country].filter(Boolean).join(", ")}</p><p className="mt-1 text-[10px] text-beige-muted">{isReverseGeocoding ? "Looking up a readable map address…" : coordinates.display_name}</p><label className="mt-3 flex items-start gap-2 border-t border-beige-border/70 pt-3 text-xs"><input type="checkbox" checked={locationConfirmed} onChange={(event) => setLocationConfirmed(event.target.checked)} className="mt-0.5 accent-[#B86F52]" /><span>I confirm this marker is the correct customer site and coordinates.</span></label></> : <p className="mt-1">Search for the address or select its point on the map. A location must be confirmed before dispatch.</p>}</div></div>
              <p className="mt-2 pl-6 text-[10px] text-beige-muted">Search uses OpenStreetMap Nominatim after you click. Avoid private information. © OpenStreetMap contributors.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className={labelClass} htmlFor="dispatch-date">Scheduled date *</label><input id="dispatch-date" required type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className={inputClass} /></div>
              <div><label className={labelClass} htmlFor="dispatch-time">Scheduled time *</label><div className="relative"><input id="dispatch-time" required type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className={inputClass} /><Clock className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-beige-muted" /></div></div>
              <div><label className={labelClass} htmlFor="dispatch-priority">Priority *</label><select id="dispatch-priority" value={priority} onChange={(event) => setPriority(event.target.value as "high" | "medium" | "low")} className={inputClass}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
            </div>

            <div><label className={labelClass} htmlFor="dispatch-notes">Visit instructions</label><textarea id="dispatch-notes" rows={3} maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} placeholder="Type access notes or special instructions" /></div>

            <div className="flex flex-col-reverse gap-2 border-t border-beige-border pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-beige-muted hover:bg-beige-sand">Cancel</button>
              <button type="submit" disabled={isSubmitting || agentsLoading || agents.length === 0 || !hasValidCoordinates || !locationConfirmed} className="inline-flex items-center justify-center gap-2 rounded-xl bg-beige-terracotta px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Saving dispatch…</> : "Confirm & Dispatch"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
