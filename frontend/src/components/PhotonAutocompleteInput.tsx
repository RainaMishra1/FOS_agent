"use client";

import React, { useEffect, useRef, useState } from "react";
import { Search, Loader2, MapPin, X, AlertCircle, Compass } from "lucide-react";
import { searchPhotonAddress, ParsedPhotonPlace } from "@/lib/photon";

interface PhotonAutocompleteInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (details: ParsedPhotonPlace) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export default function PhotonAutocompleteInput({
  id = "dispatch-address-autocomplete",
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Search addresses, buildings, schools, businesses, or landmarks in India…",
  disabled = false,
  required = false,
  className = "",
}: PhotonAutocompleteInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [suggestions, setSuggestions] = useState<ParsedPhotonPlace[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [userHasSelected, setUserHasSelected] = useState(false);

  // Debounced search with Photon API (triggers after typing 3+ characters)
  useEffect(() => {
    // If user just clicked an item or value is too short, don't query
    if (userHasSelected) {
      setUserHasSelected(false);
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      setHasError(null);
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setHasError(null);

    const debounceTimer = setTimeout(async () => {
      try {
        const results = await searchPhotonAddress(trimmed, {
          limit: 8,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setSuggestions(results);
          setIsOpen(true);
          setHighlightedIndex(-1);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setHasError("Unable to fetch suggestions. You can continue typing or adjust the entrance pin on the map.");
          setSuggestions([]);
          setIsOpen(false);
        }
      }
    }, 320); // 320ms debounce to query Photon responsibly

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [value, userHasSelected]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectSuggestion = (place: ParsedPhotonPlace) => {
    setUserHasSelected(true);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
    onChange(place.formattedAddress);
    onPlaceSelect(place);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const clearInput = () => {
    onChange("");
    setSuggestions([]);
    setIsOpen(false);
    setHasError(null);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0 && value.trim().length >= 3) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete="off"
          className={`${className} pr-16 pl-9 transition duration-150`}
        />

        {/* Leading Icon */}
        <div className="pointer-events-none absolute left-3 flex items-center justify-center text-beige-muted">
          <Search className="h-4 w-4" />
        </div>

        {/* Trailing Controls */}
        <div className="absolute right-3 flex items-center gap-1.5">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-beige-terracotta" />}
          {value && !disabled && (
            <button
              type="button"
              onClick={clearInput}
              aria-label="Clear address input"
              className="rounded-full p-1 text-beige-muted hover:bg-beige-sand hover:text-beige-text transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Suggestions Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-beige-border bg-beige-card p-1.5 shadow-xl">
          {suggestions.length > 0 ? (
            suggestions.map((item, index) => {
              const isSelected = index === highlightedIndex;
              return (
                <button
                  type="button"
                  key={`${item.osmType || "osm"}-${item.osmId || index}-${item.latitude},${item.longitude}`}
                  onClick={() => handleSelectSuggestion(item)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs transition ${
                    isSelected ? "bg-beige-sand text-beige-text font-medium" : "text-beige-text hover:bg-beige-sand/60"
                  }`}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-beige-terracotta" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-beige-text truncate">{item.name}</span>
                      {item.placeType && (
                        <span className="rounded bg-beige-sand/80 px-1.5 py-0.2 text-[9px] uppercase tracking-wider text-beige-muted border border-beige-border/50">
                          {item.placeType}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-beige-muted line-clamp-2">{item.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-beige-muted/80">
                      {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                    </p>
                  </div>
                </button>
              );
            })
          ) : (
            !isLoading && (
              <div className="p-3 text-center text-xs text-beige-muted">
                No matching locations found in Photon. You can refine your search or position the pin on the map.
              </div>
            )
          )}
        </div>
      )}

      {/* Error Notice */}
      {hasError && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-beige-terracotta">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {hasError}
        </p>
      )}

      {/* Provider Status Note */}
      <div className="mt-1 flex items-center justify-between text-[10px] text-beige-muted px-1">
        <span className="flex items-center gap-1">
          <Compass className="h-3 w-3 text-beige-terracotta" />
          Powered by Photon API (OpenStreetMap) · Type 3+ characters for suggestions
        </span>
        <span className="font-mono">Prioritizing India</span>
      </div>
    </div>
  );
}
