"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, Compass, CheckCircle2 } from "lucide-react";

export interface RouteMapStop {
  id: string;
  customer_name?: string | null;
  customer_address?: string | null;
  customer_latitude?: number | null;
  customer_longitude?: number | null;
  status: string;
  order_index?: number;
  distance_meters?: number | null;
  is_nearest?: boolean;
}

interface AgentRoadRouteMapProps {
  origin: { latitude: number; longitude: number } | null;
  stops: RouteMapStop[];
  geometry: [number, number][];
  selectedStopId?: string | null;
  onSelectStop?: (stop: RouteMapStop) => void;
  onGetRoute?: (stop: RouteMapStop) => void;
  singleDestinationMode?: boolean;
  activeDestinationStop?: RouteMapStop | null;
}

export default function AgentRoadRouteMap({
  origin,
  stops,
  geometry,
  selectedStopId,
  onSelectStop,
  onGetRoute,
  singleDestinationMode = false,
  activeDestinationStop,
}: AgentRoadRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = window as any;
    if (w.L) {
      setReady(true);
      return;
    }
    let link = document.getElementById("fos-agent-leaflet-css") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = "fos-agent-leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    let script = document.getElementById("fos-agent-leaflet-js") as HTMLScriptElement | null;
    const onLoad = () => setReady(Boolean((window as any).L));
    if (!script) {
      script = document.createElement("script");
      script.id = "fos-agent-leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = onLoad;
      document.body.appendChild(script);
    } else if ((window as any).L) {
      onLoad();
    } else {
      script.addEventListener("load", onLoad);
    }
    return () => script?.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!ready || !L || !mapRef.current) return;

    if (!instanceRef.current) {
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      instanceRef.current = map;
      layerRef.current = L.featureGroup().addTo(map);
    }

    const map = instanceRef.current;
    const layer = layerRef.current;
    layer.clearLayers();
    const bounds: [number, number][] = [];

    // 1. Draw Agent GPS origin marker
    const originLatLng: [number, number] | null = origin ? [origin.latitude, origin.longitude] : null;
    if (originLatLng) {
      const agentIcon = L.divIcon({
        className: "custom-agent-marker",
        html: `
          <div style="
            background: #64754f;
            color: #ffffff;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 3px solid #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
            </svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker(originLatLng, { icon: agentIcon, title: "Your Live Location" })
        .bindTooltip("<strong>Your Current GPS Location</strong><br/><span style='font-size: 10px; color: #666;'>Road route starts here</span>", { direction: "top" })
        .addTo(layer);

      bounds.push(originLatLng);
    }

    // 2. Draw Customer Task Markers
    stops.forEach((stop, index) => {
      if (stop.customer_latitude == null || stop.customer_longitude == null) return;
      const pos: [number, number] = [stop.customer_latitude, stop.customer_longitude];
      const isSelected = selectedStopId === stop.id;
      const isNearest = Boolean(stop.is_nearest);
      const isDone = stop.status === "completed";
      const isInProgress = stop.status === "in_progress";

      // Choose marker styling based on state
      const bg = isSelected
        ? "#2D6A4F"
        : isNearest
        ? "#1B4332"
        : isDone
        ? "#40916C"
        : isInProgress
        ? "#2D6A4F"
        : "#5C6B57";

      const border = isSelected ? "3px solid #ffffff" : isNearest ? "3px solid #E2F0E8" : "2px solid #ffffff";
      const scale = isSelected ? "1.25" : "1";
      const zIndex = isSelected ? 1000 : isNearest ? 900 : 500;

      const stopBadge = stop.order_index ?? index + 1;
      const labelText = isNearest ? `★ ${stopBadge}` : `${stopBadge}`;

      const customIcon = L.divIcon({
        className: "custom-task-marker",
        html: `
          <div style="
            background: ${bg};
            color: #ffffff;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            border: ${border};
            transform: scale(${scale});
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            transition: all 0.2s ease;
          ">
            ${labelText}
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker(pos, { icon: customIcon, zIndexOffset: zIndex, title: stop.customer_name || `Stop ${stopBadge}` });

      const distText = stop.distance_meters != null
        ? `${(stop.distance_meters >= 1000 ? `${(stop.distance_meters / 1000).toFixed(1)} km` : `${Math.round(stop.distance_meters)} m`)} from you`
        : "";

      const tooltipHtml = `
        <div style="font-family: inherit; font-size: 11px; line-height: 1.4;">
          <strong style="color: #292524; font-size: 12px; display: block;">${stop.customer_name || "Customer Site"}</strong>
          ${isNearest ? "<span style='color: #1B4332; font-weight: bold;'>⚡ Nearest Pending Task</span><br/>" : ""}
          <span style="color: #78716c;">${stop.customer_address || "Address unavailable"}</span><br/>
          <span style="display: inline-block; margin-top: 3px; font-weight: 600; color: #44403c;">Status: ${stop.status}</span>
          ${distText ? `<br/><span style="color: #2D6A4F; font-weight: 600;">${distText}</span>` : ""}
        </div>
      `;

      marker.bindTooltip(tooltipHtml, { direction: "top", sticky: false });

      marker.on("click", () => {
        onSelectStop?.(stop);
      });

      marker.addTo(layer);
      bounds.push(pos);
    });

    // 3. Draw OSRM Road Route Polyline
    if (geometry.length > 1) {
      // Leaflet expects [lat, lon], GeoJSON coordinates are [lon, lat]
      const latLngs = geometry.map(([lon, lat]) => [lat, lon]);
      L.polyline(latLngs, {
        color: "#2D6A4F",
        weight: 5,
        opacity: 0.9,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(layer);
    }

    // 4. Fit Bounds or Pan
    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else if (originLatLng) {
      map.setView(originLatLng, 14);
    } else {
      map.setView([20, 0], 2);
    }

    const resize = () => map.invalidateSize();
    setTimeout(resize, 120);
  }, [ready, origin?.latitude, origin?.longitude, stops, geometry, selectedStopId]);

  return (
    <div className="relative isolate z-0 h-[440px] overflow-hidden rounded-2xl border border-beige-border bg-beige-sand shadow-xs">
      <div ref={mapRef} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-beige-muted">
          Loading OpenStreetMap…
        </div>
      )}

      {/* Map Header Status Legend */}
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-beige-border bg-beige-card/95 px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur-xs">
        <span className="flex items-center gap-1.5 text-beige-text">
          <Navigation className="h-4 w-4 text-beige-terracotta" />
          {singleDestinationMode ? "Destination Route" : "Road route"}
        </span>
        <span className="text-beige-muted">·</span>
        <span className="flex items-center gap-1 text-beige-olive">
          <span className="h-2.5 w-2.5 rounded-full bg-beige-olive inline-block" />
          {origin ? "Your GPS" : "GPS Unavailable"}
        </span>
        {activeDestinationStop && (
          <>
            <span className="text-beige-muted">·</span>
            <span className="flex items-center gap-1 text-beige-terracotta font-bold truncate max-w-[160px]">
              <MapPin className="h-3.5 w-3.5" />
              {activeDestinationStop.customer_name}
            </span>
          </>
        )}
      </div>

      {/* Hint overlay at bottom */}
      <div className="absolute right-3 bottom-3 z-10 rounded-lg border border-beige-border bg-beige-card/90 px-2.5 py-1 text-[10px] text-beige-muted shadow-xs pointer-events-none">
        Click marker to select task · OSRM road geometry
      </div>
    </div>
  );
}
