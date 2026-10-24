"use client";

import React, { useEffect, useRef, useState } from "react";
import { Search, Loader2, MapPin, X, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import {
  getGoogleMapsApiKey,
  isGooglePlacesLoaded,
  loadGooglePlacesScript,
  parseGooglePlaceDetails,
  ParsedPlaceDetails,
} from "@/lib/googleMaps";

interface GooglePlacesAutocompleteInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (details: ParsedPlaceDetails) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export default function GooglePlacesAutocompleteInput({
  id = "dispatch-address-autocomplete",
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Search for street address, building, school, or business…",
  disabled = false,
  required = false,
  className = "",
}: GooglePlacesAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [selectedPlaceName, setSelectedPlaceName] = useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);

  // Initialize Google Maps Places script
  useEffect(() => {
    const key = getGoogleMapsApiKey();
    if (!key) {
      setApiKeyMissing(true);
      return;
    }

    if (isGooglePlacesLoaded()) {
      setIsApiLoaded(true);
      return;
    }

    setIsLoadingScript(true);
    loadGooglePlacesScript()
      .then((loaded) => {
        setIsApiLoaded(loaded);
        if (!loaded) setApiKeyMissing(true);
      })
      .catch(() => {
        setApiKeyMissing(true);
      })
      .finally(() => {
        setIsLoadingScript(false);
      });
  }, []);

  // Attach Autocomplete to input
  useEffect(() => {
    if (!isApiLoaded || !inputRef.current || autocompleteRef.current) return;
    const google = (window as any).google;
    if (!google?.maps?.places?.Autocomplete) return;

    try {
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        fields: ["formatted_address", "geometry", "name", "place_id", "address_components"],
        types: ["geocode", "establishment"],
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const parsed = parseGooglePlaceDetails(place);
        if (parsed) {
          setSelectedPlaceName(parsed.name || parsed.formattedAddress);
          onChange(parsed.formattedAddress || parsed.name);
          onPlaceSelect(parsed);
        }
      });

      autocompleteRef.current = autocomplete;
    } catch (err) {
      console.warn("Failed to attach Google Places Autocomplete:", err);
    }

    return () => {
      if (autocompleteRef.current && (window as any).google?.maps?.event?.clearInstanceListeners) {
        (window as any).google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [isApiLoaded, onChange, onPlaceSelect]);

  const handleClear = () => {
    onChange("");
    setSelectedPlaceName(null);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-beige-muted">
          {isLoadingScript ? (
            <Loader2 className="h-4 w-4 animate-spin text-beige-terracotta" />
          ) : isApiLoaded ? (
            <Sparkles className="h-4 w-4 text-emerald-600" />
          ) : (
            <Search className="h-4 w-4 text-beige-terracotta" />
          )}
        </div>

        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          required={required}
          onChange={(e) => {
            onChange(e.target.value);
            if (selectedPlaceName && e.target.value !== selectedPlaceName) {
              setSelectedPlaceName(null);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full text-sm rounded-xl bg-beige-bg border border-beige-border pl-9 pr-9 py-2.5 text-beige-text placeholder-beige-muted focus:outline-none focus:border-beige-terracotta ${className}`}
        />

        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-beige-muted hover:text-beige-text"
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Provider & status indication */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px]">
        {isApiLoaded ? (
          <span className="flex items-center gap-1 font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            Google Places Autocomplete active (search landmarks, businesses, schools, addresses)
          </span>
        ) : apiKeyMissing ? (
          <span className="flex items-center gap-1 text-beige-muted">
            <AlertCircle className="h-3.5 w-3.5 text-beige-muted shrink-0" />
            OpenStreetMap search active (Configure <code className="font-mono text-[10px] bg-beige-sand px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> for Google Places)
          </span>
        ) : (
          <span className="text-beige-muted">Connecting to Google Places…</span>
        )}

        {selectedPlaceName && (
          <span className="flex items-center gap-1 text-beige-text font-medium truncate max-w-[240px]">
            <MapPin className="h-3 w-3 text-beige-terracotta shrink-0" />
            {selectedPlaceName}
          </span>
        )}
      </div>
    </div>
  );
}
