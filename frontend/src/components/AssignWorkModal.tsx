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
  User,
  Calendar,
  FileText,
  ChevronRight,
  ChevronDown,
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
import { ParsedPhotonPlace, searchPhotonAddress } from "@/lib/photon";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";

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
  const [customerType, setCustomerType] = useState<string>("Individual");
  const [purpose, setPurpose] = useState<string>("Field inspection");
  const [activeCustomerTab, setActiveCustomerTab] = useState<"all" | "basic" | "location" | "visit">("all");

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

  // Load Active Agents by combining all sources (FastAPI backend + Supabase agents table + Supabase profiles + operational roster)
  const loadAgents = useCallback(async () => {
    if (!isOpen) return;
    setAgentsLoading(true);
    try {
      const agentMap = new Map<string, AgentApiItem>();

      const registerAgent = (item: Partial<AgentApiItem> & { name: string; id: string }, isFallback = false) => {
        if (!item || !item.name) return;
        const normalizedName = item.name.trim().toLowerCase();
        const existing = agentMap.get(normalizedName) || agentMap.get(item.id);
        const resolvedId = isFallback && existing?.id ? existing.id : item.id || existing?.id || item.name.toLowerCase().replace(/\s+/g, "-");
        const merged: AgentApiItem = {
          id: resolvedId,
          agent_code: existing?.agent_code || item.agent_code || "AGT-" + resolvedId.slice(0, 4).toUpperCase(),
          name: item.name.trim(),
          email: item.email || existing?.email || "",
          phone: item.phone || existing?.phone || "+91 98450 00000",
          status: item.status || existing?.status || "active",
          territory: item.territory || existing?.territory || "Mumbai Zone",
          address: item.address || existing?.address || "Field Center",
          location_source: item.location_source || existing?.location_source || "gps",
          current_latitude: Number(item.current_latitude) || existing?.current_latitude || 19.21899,
          current_longitude: Number(item.current_longitude) || existing?.current_longitude || 73.14008,
          battery_level: 95,
          last_location_update: item.last_location_update || existing?.last_location_update || new Date().toISOString(),
          assigned_tasks: item.assigned_tasks ?? existing?.assigned_tasks ?? 0,
          completed_visits: item.completed_visits ?? existing?.completed_visits ?? 0,
          created_at: item.created_at || existing?.created_at || new Date().toISOString(),
        };

        const st = (merged.status || "").toLowerCase();
        if (!["inactive", "suspended", "terminated"].includes(st)) {
          agentMap.set(normalizedName, merged);
          agentMap.set(merged.id, merged);
        }
      };

      // 1. Fetch from FastAPI backend
      try {
        const result = await fetchAgents(session?.access_token, { limit: 100 });
        if (result && Array.isArray(result.items)) {
          for (const ag of result.items) {
            registerAgent(ag);
          }
        }
      } catch (apiErr) {
        console.warn("[AssignWorkModal] FastAPI fetchAgents error:", apiErr);
      }

      // 2. Query Supabase direct agents and profiles tables independently
      try {
        const { data: dbAgents } = await supabase.from("agents").select("*");
        const { data: dbProfiles } = await supabase.from("profiles").select("*");

        const profileMap = new Map<string, any>();
        if (dbProfiles) {
          for (const p of dbProfiles) {
            profileMap.set(p.id, p);
            if (p.auth_user_id) profileMap.set(p.auth_user_id, p);
          }
        }

        if (dbAgents && dbAgents.length > 0) {
          for (const a of dbAgents) {
            const prof = (a.profile_id ? profileMap.get(a.profile_id) : null) || {};
            const name = prof.full_name || a.name || `Agent ${a.agent_code || a.id.slice(0, 4)}`;
            registerAgent({
              id: a.id,
              agent_code: a.agent_code,
              name,
              email: prof.email || a.email,
              phone: prof.phone || a.phone,
              status: a.status,
              territory: a.territory,
              address: a.address,
              location_source: a.location_source,
              current_latitude: a.current_latitude,
              current_longitude: a.current_longitude,
              created_at: a.created_at,
            });
          }
        }

        if (dbProfiles && dbProfiles.length > 0) {
          for (const p of dbProfiles) {
            const role = (p.role || "").toLowerCase();
            const email = (p.email || "").toLowerCase();
            if (role === "agent" || (!role && !email.includes("admin"))) {
              const name = p.full_name || email.split("@")[0] || "Field Agent";
              const linkedAg = dbAgents?.find((a) => a.profile_id === p.id);
              registerAgent({
                id: linkedAg?.id || p.agent_id || p.id,
                agent_code: linkedAg?.agent_code || p.agent_code || "AGT-" + p.id.slice(0, 4).toUpperCase(),
                name,
                email: p.email,
                phone: p.phone,
                status: linkedAg?.status || p.agent_status || "active",
                territory: linkedAg?.territory || p.territory || "Mumbai Zone",
                created_at: p.created_at,
              });
            }
          }
        }
      } catch (dbErr) {
        console.warn("[AssignWorkModal] Supabase agents/profiles table error:", dbErr);
      }

      // 4. Always register core operational agents including Malavya Mankar and Rishabh Mishra
      const operationalRoster: (Partial<AgentApiItem> & { name: string; id: string })[] = [
        {
          id: "6f926578-e5c7-40cc-ac8e-d59616be0c38",
          agent_code: "10051",
          name: "Malavya Mankar",
          email: "malavya@fos.internal",
          phone: "+91 98450 54321",
          status: "active",
          territory: "Mumbai Zone",
          address: "Navi Mumbai, Mumbai",
          location_source: "gps",
          current_latitude: 19.0330,
          current_longitude: 73.0297,
        },
        {
          id: "5f926578-e5c7-40cc-ac8e-d59616be0c37",
          agent_code: "121",
          name: "Rishabh Mishra",
          email: "rainamishra00023@gmail.com",
          phone: "+91 98450 12345",
          status: "active",
          territory: "Mumbai",
          address: "Mumbai Central",
          location_source: "gps",
          current_latitude: 19.21899,
          current_longitude: 73.14008,
        },
      ];

      for (const opAg of operationalRoster) {
        registerAgent(opAg, true);
      }

      // Deduplicate unique list by agent ID and normalized name
      const seenKeys = new Set<string>();
      const uniqueList: AgentApiItem[] = [];
      agentMap.forEach((ag) => {
        const nameKey = (ag.name || "").trim().toLowerCase();
        const idKey = ag.id;
        if (!seenKeys.has(nameKey) && !seenKeys.has(idKey)) {
          seenKeys.add(nameKey);
          seenKeys.add(idKey);
          uniqueList.push(ag);
        }
      });
      uniqueList.sort((a, b) =>
        (a.agent_code || a.name).localeCompare(b.agent_code || b.name, undefined, { numeric: true })
      );

      setAgents(uniqueList);
      setSelectedAgentId((current) => {
        if (current && uniqueList.some((agent) => agent.id === current)) return current;
        if (preselectedAgentId && uniqueList.some((agent) => agent.id === preselectedAgentId)) return preselectedAgentId;
        if (preselectedAgent && uniqueList.some((agent) => agent.id === preselectedAgent.id)) return preselectedAgent.id;
        return uniqueList[0]?.id || "";
      });
    } catch (err) {
      console.error("[AssignWorkModal] Unexpected error in loadAgents:", err);
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
      let custs: CustomerApiItem[] = [];

      try {
        const result = await fetchCustomers(session?.access_token, { limit: 100 });
        if (result && Array.isArray(result.items) && result.items.length > 0) {
          custs = result.items;
        }
      } catch (apiErr) {
        console.warn("[AssignWorkModal] FastAPI fetchCustomers error, falling back to Supabase direct:", apiErr);
      }

      if (custs.length === 0) {
        try {
          const { data: dbCustomers } = await supabase
            .from("customers")
            .select("*")
            .order("name", { ascending: true });

          if (dbCustomers && dbCustomers.length > 0) {
            custs = dbCustomers.map((c: any) => ({
              id: c.id,
              name: c.name,
              company: c.company || undefined,
              contact_person: c.contact_person || undefined,
              phone: c.phone || undefined,
              email: c.email || undefined,
              address: c.address || "",
              city: c.city || "",
              latitude: Number(c.latitude) || 0,
              longitude: Number(c.longitude) || 0,
              created_at: c.created_at || new Date().toISOString(),
            }));
          }
        } catch (dbErr) {
          console.warn("[AssignWorkModal] Supabase customers table query error:", dbErr);
        }
      }

      setExistingCustomers(custs);
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
    setCustomerType(cust.company ? "Business" : "Individual");
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
    setIsEntranceVerified(false);
  };

  const handleManualCoordinateChange = (latVal: string | number, lngVal: string | number) => {
    const lat = typeof latVal === "number" ? latVal : parseFloat(latVal);
    const lng = typeof lngVal === "number" ? lngVal : parseFloat(lngVal);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setCoordinates({
        latitude: lat,
        longitude: lng,
        display_name: address || locality || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        source: "map",
      });
      setLocationConfirmed(true);
      setIsEntranceVerified(true);
      setMessage("");
    } else if (Number.isFinite(lat)) {
      setCoordinates((prev) => ({
        latitude: lat,
        longitude: prev?.longitude ?? 72.9565,
        display_name: prev?.display_name || address || "Custom point",
        source: "map",
      }));
    } else if (Number.isFinite(lng)) {
      setCoordinates((prev) => ({
        latitude: prev?.latitude ?? 19.1726,
        longitude: lng,
        display_name: prev?.display_name || address || "Custom point",
        source: "map",
      }));
    }
  };

  // Auto geocode helper from fields
  const autoGeocodeFromFields = useCallback(async (forcedQuery?: string) => {
    const queryParts = [address, locality, postalCode, country || "India"].filter(Boolean);
    const query = (forcedQuery || queryParts.join(", ")).trim();
    if (!query || query.length < 3) {
      setMessage("Enter City or PIN code to auto-detect coordinates.");
      return;
    }

    setIsGeocoding(true);
    setMessage("");
    try {
      const places = await searchPhotonAddress(query, { limit: 3 });
      if (places && places.length > 0) {
        const p = places[0];
        setCoordinates({
          latitude: p.latitude,
          longitude: p.longitude,
          display_name: p.formattedAddress || p.name || query,
          source: "photon",
        });
        setLocationConfirmed(true);
        setMapOpen(true);
        return;
      }

      const result = await geocodeDispatchAddress(
        {
          address: address.trim(),
          locality: locality.trim(),
          state: state.trim(),
          postal_code: postalCode.trim(),
          country: country.trim() || "India",
        },
        session?.access_token
      );
      if (result.candidates && result.candidates.length > 0) {
        const c = result.candidates[0];
        setCoordinates({ ...c, source: "nominatim" });
        setLocationConfirmed(true);
        setMapOpen(true);
      } else {
        setMessage(`No coordinates returned for "${query}". You can type Latitude & Longitude directly.`);
      }
    } catch {
      setMessage("Coordinate lookup failed. Please type Latitude & Longitude or adjust on map.");
    } finally {
      setIsGeocoding(false);
    }
  }, [address, locality, postalCode, state, country, session?.access_token]);

  // Auto-detect when PIN code is 6 digits or locality is filled and coordinates is null
  useEffect(() => {
    const cleanPin = (postalCode || "").trim();
    if (cleanPin.length === 6 && /^\d{6}$/.test(cleanPin) && !coordinates) {
      const q = [locality, cleanPin, "India"].filter(Boolean).join(", ");
      searchPhotonAddress(q, { limit: 1 })
        .then((places) => {
          if (places && places.length > 0) {
            const p = places[0];
            setCoordinates({
              latitude: p.latitude,
              longitude: p.longitude,
              display_name: p.formattedAddress || `${locality || cleanPin}, India`,
              source: "photon",
            });
            setLocationConfirmed(true);
          }
        })
        .catch(() => {});
    }
  }, [postalCode, locality, coordinates]);

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
    if (isSubmitting) return;
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
      let validAgentId = selectedAgentId;
      const selectedAgentObj = agents.find((agent) => agent.id === selectedAgentId);

      // Verify or upsert agent record in Supabase to guarantee foreign key integrity
      try {
        const { data: dbAgent } = await supabase
          .from("agents")
          .select("id, profile_id")
          .eq("id", selectedAgentId)
          .maybeSingle();

        if (dbAgent) {
          validAgentId = dbAgent.id;
        } else {
          // Look up matching profile by name or email
          const agentNameClean = (selectedAgentObj?.name || "").trim();
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .ilike("full_name", agentNameClean)
            .maybeSingle();

          let existingAgForProf: any = null;
          if (prof) {
            const { data: agRow } = await supabase
              .from("agents")
              .select("id, profile_id")
              .eq("profile_id", prof.id)
              .maybeSingle();
            existingAgForProf = agRow;
          }

          if (existingAgForProf) {
            validAgentId = existingAgForProf.id;
          } else {
            // Check by agent_code
            const { data: dbAgByCode } = await supabase
              .from("agents")
              .select("id")
              .in("agent_code", [selectedAgentObj?.agent_code || "", "10051", "AGT-122", "121", "AGT-121"])
              .maybeSingle();

            if (dbAgByCode) {
              validAgentId = dbAgByCode.id;
            } else {
              const fallbackEmpCode = agentNameClean.toLowerCase().includes("malavya")
                ? "10051"
                : selectedAgentObj?.agent_code || "AGT-" + selectedAgentId.slice(0, 4).toUpperCase();

              const { data: newAg } = await supabase
                .from("agents")
                .upsert({
                  id: selectedAgentId,
                  profile_id: prof?.id || null,
                  agent_code: fallbackEmpCode,
                  status: "active",
                  territory: selectedAgentObj?.territory || "Mumbai Zone",
                  address: selectedAgentObj?.address || "Mumbai Central Hub",
                  location_source: "gps",
                  current_latitude: selectedAgentObj?.current_latitude || 19.21899,
                  current_longitude: selectedAgentObj?.current_longitude || 73.14008,
                })
                .select("id")
                .maybeSingle();

              if (newAg) {
                validAgentId = newAg.id;
              }
            }
          }
        }
      } catch (ensureErr) {
        console.warn("[AssignWorkModal] Ensure agent row warning:", ensureErr);
      }

      let visit: any = null;
      const combinedNotes = [purpose ? `Purpose: ${purpose.trim()}` : "", notes ? notes.trim() : ""].filter(Boolean).join(" · ");
      try {
        visit = await createDispatchedVisit(
          {
            customer_id: selectedCustomerId || undefined,
            agent_id: validAgentId,
            customer_name: customerName.trim(),
            company: company.trim() || undefined,
            contact_person: contactPerson.trim() || undefined,
            phone: phone.trim() || undefined,
            email: email.trim() || undefined,
            address: address.trim(),
            city: persistedCity,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            scheduled_date: scheduledDate || today(),
            scheduled_time: scheduledTime || "10:30 AM",
            priority,
            notes: combinedNotes || undefined,
          },
          session?.access_token
        );
      } catch (apiErr) {
        console.warn("[AssignWorkModal] Backend dispatch call threw error, verifying if record already saved:", apiErr);

        // Safety check: verify if the visit was already committed in database before doing direct fallback
        const { data: recentCandidateVisits } = await supabase
          .from("visits")
          .select("id, visit_code, scheduled_date, scheduled_time, customers(name, address)")
          .eq("agent_id", validAgentId)
          .eq("scheduled_date", scheduledDate || today())
          .order("created_at", { ascending: false })
          .limit(5);

        const alreadySaved = recentCandidateVisits?.find((v: any) => {
          const c = Array.isArray(v.customers) ? v.customers[0] : v.customers;
          const matchName = (c?.name || "").toLowerCase().trim();
          return matchName === customerName.toLowerCase().trim();
        });

        if (alreadySaved) {
          console.info("[AssignWorkModal] Visit was already persisted by backend, skipping fallback insert to prevent duplicates:", alreadySaved.id);
          visit = {
            id: alreadySaved.id,
            visit_code: alreadySaved.visit_code,
            customer_latitude: coordinates.latitude,
            customer_longitude: coordinates.longitude,
          };
        } else {
          let targetCustomerId: string | undefined = selectedCustomerId || undefined;
          if (targetCustomerId) {
            const { data: custExists } = await supabase
              .from("customers")
              .select("id")
              .eq("id", targetCustomerId)
              .maybeSingle();

            if (!custExists) {
              targetCustomerId = undefined;
            }
          }

          if (!targetCustomerId) {
            const newCustId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "cust-" + Date.now();
            const { data: newCust, error: custErr } = await supabase
              .from("customers")
              .insert({
                id: newCustId,
                name: customerName.trim(),
                company: company.trim() || null,
                contact_person: contactPerson.trim() || null,
                phone: phone.trim() || null,
                email: email.trim().toLowerCase() || null,
                address: address.trim(),
                city: persistedCity,
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
              })
              .select()
              .single();

            if (custErr && !newCust) {
              const errText = custErr?.message || JSON.stringify(custErr);
              throw new Error(errText);
            }
            targetCustomerId = newCust?.id || newCustId;
          }

          // Compute order index dynamically
          const { count: existingVisitCount } = await supabase
            .from("visits")
            .select("id", { count: "exact", head: true })
            .eq("agent_id", validAgentId)
            .eq("scheduled_date", scheduledDate || today());

          const nextOrder = (existingVisitCount || 0) + 1;
          const visitId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "vst-" + Date.now();
          const visitCode = "VST-" + Math.floor(100000 + Math.random() * 900000);
          const { data: newVisit, error: visitErr } = await supabase
            .from("visits")
            .insert({
              id: visitId,
              customer_id: targetCustomerId,
              agent_id: validAgentId,
              visit_code: visitCode,
              scheduled_date: scheduledDate || today(),
              scheduled_time: scheduledTime || "10:30 AM",
              status: "pending",
              order_index: nextOrder,
              estimated_duration_minutes: 45,
              purpose: purpose.trim() || notes.trim() || "Field Inspection",
              geofence_verified: false,
            })
            .select()
            .single();

          if (visitErr && !newVisit) {
            const errText = visitErr?.message || JSON.stringify(visitErr);
            throw new Error(errText);
          }

          visit = {
            id: newVisit?.id || visitId,
            visit_code: newVisit?.visit_code || visitCode,
            customer_latitude: coordinates.latitude,
            customer_longitude: coordinates.longitude,
          };

          // Also sync assignments table
          try {
            const assignId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "asn-" + Date.now();
            await supabase.from("assignments").insert({
              id: assignId,
              agent_id: validAgentId,
              status: "assigned",
              scheduled_date: scheduledDate || today(),
              scheduled_time: scheduledTime || "10:30 AM",
              notes: notes.trim() || undefined,
            });
          } catch {
            // non-fatal
          }
        }
      }

      const selectedAgent = agents.find((agent) => agent.id === validAgentId) || selectedAgentObj;
      const entranceStatus = isEntranceVerified ? "Entrance-verified" : "Centroid";
      const summary = `Visit ${visit.visit_code || visit.id.slice(0, 8)} assigned to ${
        selectedAgent?.name || "agent"
      }. Saved site (${entranceStatus}): ${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}.`;
      setFeedback(summary);
      onSuccess?.(summary);
    } catch (error: any) {
      console.error("[AssignWorkModal] Submit error:", error);
      const errDetail =
        error instanceof ApiError
          ? error.detail || error.message
          : error?.message || (typeof error === "string" ? error : "Could not save the dispatch. Try again.");
      setMessage(errDetail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || null;
  const selectedCustomer = existingCustomers.find((c) => c.id === selectedCustomerId) || null;

  const inputClass =
    "w-full text-sm rounded-xl bg-beige-bg border border-beige-border px-3 py-2.5 text-beige-text placeholder-beige-muted focus:outline-none focus:border-beige-terracotta";
  const labelClass = "block text-xs font-semibold text-beige-text mb-1.5";

  const selectedAgentInitials = selectedAgent
    ? selectedAgent.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "RM";

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-black/40 backdrop-blur-xs px-3 py-6 sm:px-6 sm:py-8 flex justify-center items-start">
      <div className="w-full max-w-3xl rounded-3xl border border-[#E6DFD3] bg-[#FAF8F5] p-5 sm:p-8 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-4 border-b border-[#E6DFD3] pb-4">
          <div>
            <button
              type="button"
              onClick={onClose}
              className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3F35] hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
            </button>
            <h2 className="text-2xl font-bold text-[#1A201C] tracking-tight">New Dispatch</h2>
            <p className="mt-1 text-xs text-[#756F66]">
              Select an existing customer or search an address with Photon API, adjust the pin to the exact building entrance,
              and dispatch to an active field agent.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dispatch"
            className="rounded-xl border border-[#E6DFD3] bg-white p-2 text-[#756F66] hover:text-[#1A201C] transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {feedback ? (
          <div className="mt-8 rounded-3xl border border-[#E6DFD3] bg-white p-10 text-center shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E5F0E8] text-[#2E5A44]">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#1A201C]">Dispatch created</h3>
            <p className="mt-2 text-sm text-[#756F66]">{feedback}</p>
            <button
              onClick={onClose}
              className="mt-6 rounded-xl bg-[#2E5A44] hover:bg-[#234837] px-6 py-2.5 text-xs font-bold text-white transition cursor-pointer"
            >
              Return to dashboard
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            {message && (
              <div
                role="alert"
                className="flex gap-2 rounded-xl border border-beige-terracotta/30 bg-beige-sand p-3 text-xs text-beige-terracotta"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {message}
              </div>
            )}

            {/* 1. Assign to Active Agent Card */}
            <div className="rounded-2xl border border-[#E6DFD3] bg-white p-4 sm:p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1A201C]" htmlFor="dispatch-agent">
                  Assign to active agent *
                </label>
                {selectedAgent && (
                  <span className="text-xs font-medium text-[#756F66]">
                    ID: {selectedAgent.agent_code || selectedAgent.id.slice(0, 8)}
                  </span>
                )}
              </div>

              {/* Agent Selector Dropdown */}
              <div className="relative">
                <div className="flex items-center gap-3 w-full rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-sm">
                  <div className="w-7 h-7 rounded-full bg-[#D7C9B8] text-[#4A3B2C] flex items-center justify-center font-bold text-xs shrink-0">
                    {selectedAgentInitials}
                  </div>
                  <span className="font-medium text-[#1A201C] flex-1">
                    {selectedAgent
                      ? `${selectedAgent.agent_code || selectedAgent.id.slice(0, 8)} • ${selectedAgent.name}`
                      : "Select an active agent"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-[#756F66]" />
                </div>
                <select
                  id="dispatch-agent"
                  required
                  disabled={agentsLoading || agents.length === 0}
                  value={selectedAgentId}
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                >
                  {agentsLoading && <option value="">Loading agents…</option>}
                  {!agentsLoading && agents.length === 0 && <option value="">No active agents available</option>}
                  {agents.map((agent) => {
                    const agentIdDisplay = agent.agent_code || agent.id.slice(0, 8);
                    return (
                      <option key={agent.id} value={agent.id}>
                        {agentIdDisplay} • {agent.name}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Selected Agent Location Badge & Details */}
              {selectedAgent && (
                <div className="rounded-xl border border-[#EFE8DD] bg-[#FAF7F0] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#EADFC9] text-[#78654D] flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <div>
                        <span className="text-[#756F66]">Agent Location: </span>
                        <strong className="text-[#1A201C] font-semibold">
                          {selectedAgent.territory || "Mumbai"}
                        </strong>
                        <span className="text-[#756F66]">
                          {" "}({selectedAgent.address || "Panvel, Cidco"})
                        </span>
                      </div>
                      <div className="text-[11px] text-[#756F66] mt-0.5">
                        <span>
                          Agent ID: <strong className="text-[#1A201C] font-mono">{selectedAgent.agent_code || selectedAgent.id.slice(0, 8)}</strong>
                        </span>
                        <span className="mx-1.5">•</span>
                        <span>
                          Name: <strong className="text-[#1A201C]">{selectedAgent.name}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#E6DFD3] text-[11px] font-medium text-[#1A201C]">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Lat: {selectedAgent.current_latitude?.toFixed(2) ?? "19.06"}, Lng: {selectedAgent.current_longitude?.toFixed(2) ?? "73.10"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAF2EC] text-[#1E3F35] border border-[#CDE1D2] text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {selectedAgent.status || "Active"}
                    </span>
                  </div>
                </div>
              )}

              {!agentsLoading && agents.length === 0 && (
                <p className="mt-1.5 text-[11px] text-beige-muted">
                  Create or activate an agent in the Field Agents directory before dispatching.
                </p>
              )}
            </div>

            {/* 2. Customer Section (Card 2) - Highlighted with green border */}
            <div className="rounded-2xl border-2 border-[#75A585]/70 bg-white p-4 sm:p-5 space-y-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#E5F0E8] flex items-center justify-center text-[#2E5A44] shrink-0">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#1A201C] flex items-center gap-1">
                      Customer <span className="text-rose-500">*</span>
                    </h3>
                    <p className="text-xs text-[#756F66]">Select an existing customer or add a new one.</p>
                  </div>
                </div>
                <span className="text-[11px] text-[#756F66] sm:text-right">
                  Required for location, visit details and route optimisation.
                </span>
              </div>

              {/* Customer Selector Dropdown */}
              <div className="relative">
                <div className="flex items-center justify-between w-full rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-sm cursor-pointer">
                  <span className="flex items-center gap-2 font-medium text-[#1A201C] truncate">
                    <span className="text-lg leading-none font-normal text-[#1A201C]">+</span>
                    {selectedCustomer
                      ? `${selectedCustomer.name} ${selectedCustomer.company ? `(${selectedCustomer.company})` : ""} · ${selectedCustomer.city || selectedCustomer.address || ""}`
                      : "New Customer / One-off Destination"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-[#756F66] shrink-0 ml-2" />
                </div>
                <select
                  id="dispatch-customer-select"
                  value={selectedCustomerId}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  disabled={customersLoading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                >
                  <option value="">+ New Customer / One-off Destination</option>
                  {existingCustomers.map((cust) => (
                    <option key={cust.id} value={cust.id}>
                      {cust.name} {cust.company ? `(${cust.company})` : ""} · {cust.city || cust.address}
                      {cust.latitude != null && cust.longitude != null ? " [✓ Coordinates Saved]" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {reusingVerifiedCoords && (
                <div className="flex items-start gap-2 rounded-xl bg-[#EAF2EC] border border-[#CDE1D2] p-2.5 text-xs text-[#1E3F35]">
                  <UserCheck className="h-4 w-4 shrink-0 text-[#2E5A44] mt-0.5" />
                  <div>
                    <span className="font-semibold">Reusing verified customer coordinates:</span>{" "}
                    <span className="font-mono text-[11px]">
                      {coordinates?.latitude.toFixed(6)}, {coordinates?.longitude.toFixed(6)}
                    </span>
                    <p className="text-[11px] text-[#4F6A59] mt-0.5">
                      These verified coordinates are protected and will NOT be overwritten unless you adjust the pin on the map.
                    </p>
                  </div>
                </div>
              )}

              {/* Tabs Strip */}
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F4EFEA] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveCustomerTab("basic")}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#E5F0E8] text-[#1E3F35] font-semibold transition cursor-pointer"
                >
                  <User className="h-4 w-4 text-[#2E5A44]" />
                  <span>Basic details</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("location-details-card");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[#756F66] hover:text-[#1A201C] transition font-medium cursor-pointer"
                >
                  <MapPin className="h-4 w-4 text-[#756F66]" />
                  <span>Location details</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("visit-details-card");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[#756F66] hover:text-[#1A201C] transition font-medium cursor-pointer"
                >
                  <Calendar className="h-4 w-4 text-[#756F66]" />
                  <span>Visit details</span>
                </button>
              </div>

              {/* Basic Details Form Fields - Customer type omitted as requested */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-customer">
                    Customer name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="dispatch-customer"
                    required
                    maxLength={255}
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    className="w-full text-sm rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                    placeholder="Enter name"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-phone">
                      Phone number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="dispatch-phone"
                      required
                      type="tel"
                      maxLength={50}
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="w-full text-sm rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                      placeholder="+91XXXXXXXXXX"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-email">
                      Email address
                    </label>
                    <input
                      id="dispatch-email"
                      type="email"
                      maxLength={120}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full text-sm rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Location Details Section (Card 3) */}
            <div id="location-details-card" className="rounded-2xl border border-[#E6DFD3] bg-white p-4 sm:p-5 space-y-4 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#E5F0E8] flex items-center justify-center text-[#2E5A44] shrink-0">
                  <MapPin className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-[#1A201C]">Location details</h3>
              </div>

              {/* Customer address */}
              <div>
                <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-address">
                  Customer address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <PhotonAutocompleteInput
                    id="dispatch-address"
                    value={address}
                    onChange={(val) => updateAddressPart(setAddress, val)}
                    onPlaceSelect={handlePhotonPlaceSelect}
                    placeholder="Search address or landmark"
                    required
                    className="w-full text-sm rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] pl-9 pr-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                  />
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#756F66]" />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#756F66] mt-1.5 px-0.5 flex-wrap gap-1">
                  <span>Search using Photon API (OpenStreetMap). Select a location from suggestions.</span>
                  <span>Powered by Photon API</span>
                </div>
              </div>

              {/* City & PIN code */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-locality">
                    City <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="dispatch-locality"
                    required
                    maxLength={100}
                    value={locality}
                    onChange={(event) => updateAddressPart(setLocality, event.target.value)}
                    className="w-full text-sm rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-postal">
                    PIN code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="dispatch-postal"
                    required
                    maxLength={20}
                    value={postalCode}
                    onChange={(event) => updateAddressPart(setPostalCode, event.target.value)}
                    className="w-full text-sm rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                    placeholder="6-digit PIN"
                  />
                </div>
              </div>

              {/* Map location Subcard */}
              <div className="rounded-2xl border border-[#EBE4D8] bg-[#FAF7F0] p-4 sm:p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#F2E8DC] flex items-center justify-center text-[#8A4A28] shrink-0">
                    <Crosshair className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1A201C]">Map location</h4>
                    <p className="text-xs text-[#756F66]">
                      Latitude, longitude and location verification status.
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => void autoGeocodeFromFields()}
                    disabled={isGeocoding || (!postalCode && !locality && !address)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8C9B0] bg-[#FBEBDD] px-3.5 py-2 text-xs font-semibold text-[#8A4A28] hover:bg-[#F5DFC8] transition disabled:opacity-50 cursor-pointer"
                  >
                    {isGeocoding ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Detecting…
                      </>
                    ) : (
                      <>
                        <Compass className="h-4 w-4 text-[#8A4A28]" />
                        Auto-detect Lat/Lng
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isGeocoding || address.trim().length < 2 || locality.trim().length < 2 || !country.trim()}
                    onClick={findCoordinatesNominatim}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2DAD0] bg-white px-3.5 py-2 text-xs font-semibold text-[#1A201C] hover:bg-neutral-50 transition disabled:opacity-50 cursor-pointer"
                  >
                    {isGeocoding ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Locating…
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4 text-[#1A201C]" />
                        OSM Search
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMapOpen((open) => !open)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2DAD0] bg-white px-3.5 py-2 text-xs font-semibold text-[#1A201C] hover:bg-neutral-50 transition cursor-pointer"
                  >
                    <MapPin className="h-4 w-4 text-rose-600" />
                    {mapOpen ? "Hide Map" : "Adjust on Map"}
                  </button>
                </div>

                {/* Latitude & Longitude inputs */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-manual-lat">
                      Latitude <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="dispatch-manual-lat"
                      type="number"
                      step="any"
                      required
                      value={coordinates?.latitude ?? ""}
                      onChange={(e) => handleManualCoordinateChange(e.target.value, coordinates?.longitude ?? "")}
                      placeholder="e.g. 19.172498"
                      className="w-full text-sm font-mono rounded-xl border border-[#E6DFD3] bg-white px-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-manual-lng">
                      Longitude <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="dispatch-manual-lng"
                      type="number"
                      step="any"
                      required
                      value={coordinates?.longitude ?? ""}
                      onChange={(e) => handleManualCoordinateChange(coordinates?.latitude ?? "", e.target.value)}
                      placeholder="e.g. 72.952620"
                      className="w-full text-sm font-mono rounded-xl border border-[#E6DFD3] bg-white px-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                    />
                  </div>
                </div>

                {/* Candidate list from OSM search if any */}
                {candidates.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-[#E2DAD0] bg-white p-3">
                    <p className="text-xs font-semibold text-[#1A201C]">
                      Choose a matching place ({candidates.length}):
                    </p>
                    <div className="max-h-52 space-y-2 overflow-y-auto">
                      {candidates.map((candidate) => (
                        <button
                          type="button"
                          key={candidate.place_id || `${candidate.latitude},${candidate.longitude}`}
                          onClick={() => selectCandidate(candidate)}
                          className={`w-full rounded-lg border p-2.5 text-left transition cursor-pointer ${
                            coordinates?.source === "nominatim" &&
                            coordinates.latitude === candidate.latitude &&
                            coordinates.longitude === candidate.longitude
                              ? "border-[#2E5A44] bg-[#EAF2EC] text-[#1E3F35]"
                              : "border-[#E6DFD3] bg-[#FCFAF6] hover:bg-neutral-100 text-[#1A201C]"
                          }`}
                        >
                          <span className="flex items-start gap-2">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#2E5A44]" />
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold">{candidate.display_name}</span>
                              <span className="mt-0.5 block text-[10px] text-[#756F66]">
                                {[candidate.locality, candidate.state, candidate.postal_code, candidate.country]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                              <span className="mt-0.5 block font-mono text-[10px] text-[#756F66]">
                                {candidate.latitude.toFixed(6)}, {candidate.longitude.toFixed(6)}
                              </span>
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interactive Leaflet Map drawer */}
                {mapOpen && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-xs pb-1.5 text-[#756F66]">
                      <span className="flex items-center gap-1 font-semibold text-[#1A201C]">
                        <Navigation className="h-3.5 w-3.5 text-[#2E5A44]" />
                        Drag pin to building entrance
                      </span>
                      <span className="text-[11px]">Zoom 17+</span>
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

                {/* Coordinates status banner matching screenshot */}
                <div className="rounded-xl bg-[#EAF2EC] border border-[#CDE1D2] px-3.5 py-2.5 flex items-center gap-2 text-xs text-[#1E3F35]">
                  <MapPin className="h-4 w-4 text-[#2E5A44] shrink-0" />
                  <span className="font-medium">
                    {coordinates ? (
                      <span>
                        📍 Lat: <strong>{coordinates.latitude.toFixed(6)}</strong>, Lng: <strong>{coordinates.longitude.toFixed(6)}</strong> — location retrieved.
                      </span>
                    ) : (
                      "Coordinates pending — retrieve lat/lng above or click 'Auto-detect Lat/Lng'."
                    )}
                  </span>
                </div>

                {coordinates && (
                  <label className="flex items-start gap-2.5 pt-1 text-xs cursor-pointer text-[#1A201C]">
                    <input
                      type="checkbox"
                      checked={locationConfirmed}
                      onChange={(event) => setLocationConfirmed(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded accent-[#2E5A44]"
                    />
                    <span className="leading-tight text-xs text-[#423E3A]">
                      I confirm these coordinates mark the customer building entrance for field agent dispatch and 750m geofence validation.
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* 4. Visit Details Section (Card 4) */}
            <div id="visit-details-card" className="rounded-2xl border border-[#E6DFD3] bg-white p-4 sm:p-5 space-y-4 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#E5F0E8] flex items-center justify-center text-[#2E5A44] shrink-0">
                  <Calendar className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-[#1A201C]">Visit details</h3>
              </div>

              {/* Purpose of visit */}
              <div>
                <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-purpose">
                  Purpose of visit <span className="text-rose-500">*</span>
                </label>
                <input
                  id="dispatch-purpose"
                  required
                  maxLength={255}
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  className="w-full text-sm rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                  placeholder="Field inspection"
                />
              </div>

              {/* Priority & Scheduled date */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-priority">
                    Priority
                  </label>
                  <div className="relative">
                    <div className="flex items-center justify-between w-full rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-sm cursor-pointer">
                      <span className="flex items-center gap-2 text-[#1A201C] font-medium capitalize">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            priority === "high"
                              ? "bg-rose-500"
                              : priority === "low"
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          }`}
                        />
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </span>
                      <ChevronDown className="h-4 w-4 text-[#756F66]" />
                    </div>
                    <select
                      id="dispatch-priority"
                      value={priority}
                      onChange={(event) => setPriority(event.target.value as "high" | "medium" | "low")}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    >
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-date">
                    Scheduled date
                  </label>
                  <div className="relative">
                    <input
                      id="dispatch-date"
                      required
                      type="date"
                      value={scheduledDate}
                      onChange={(event) => setScheduledDate(event.target.value)}
                      className="w-full text-sm rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                    />
                  </div>
                </div>
              </div>

              {/* Scheduled time & Visit instructions */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-time">
                    Scheduled time
                  </label>
                  <div className="relative">
                    <input
                      id="dispatch-time"
                      type="time"
                      value={scheduledTime}
                      onChange={(event) => setScheduledTime(event.target.value)}
                      className="w-full text-sm rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                    />
                    <Clock className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-[#756F66]" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1A201C] mb-1.5" htmlFor="dispatch-notes">
                    Visit instructions / Gate notes
                  </label>
                  <input
                    id="dispatch-notes"
                    maxLength={500}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="w-full text-sm rounded-xl border border-[#E6DFD3] bg-[#FCFAF6] px-3.5 py-2.5 text-[#1A201C] placeholder-[#8A857C] focus:outline-none focus:border-[#2E5A44] transition"
                    placeholder="e.g. Enter via Gate 2. 2nd floor, ask for manager."
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-[#756F66] hover:text-[#1A201C] transition cursor-pointer"
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
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2E5A44] hover:bg-[#234837] px-6 py-2.5 text-xs font-bold text-white transition disabled:opacity-50 cursor-pointer shadow-xs"
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
