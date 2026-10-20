import { calculateHaversineDistanceKm, formatDistance } from "./geoUtils";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface BaseRouteStop {
  id: string;
  name: string;
  address: string;
  coordinates: Coordinates;
  scheduledTime?: string;
  scheduledDate?: string;
  priority?: "high" | "medium" | "low";
  status?: string;
  company?: string;
  estimatedDuration?: string | number;
  [key: string]: any;
}

export interface RouteLeg {
  stopNumber: number;
  fromName: string;
  toName: string;
  fromCoords: Coordinates;
  toCoords: Coordinates;
  straightLineDistanceKm: number;
  formattedDistance: string;
  estimatedTransitMinutes: number;
  formattedTransitTime: string;
  serviceDurationMinutes: number;
  cumulativeDistanceKm: number;
  cumulativeDurationMinutes: number;
}

export interface RouteOptimizationResult<T extends BaseRouteStop = BaseRouteStop> {
  orderedStops: T[];
  legs: RouteLeg[];
  stopCount: number;
  totalStraightLineDistanceKm: number;
  formattedTotalDistance: string;
  totalEstimatedDurationMinutes: number;
  formattedTotalDuration: string;
  initialStraightLineDistanceKm: number;
  formattedInitialDistance: string;
  distanceSavingsKm: number;
  percentageSavings: number;
  isOptimized: boolean;
  algorithmName: string;
  demoBadge: string;
  disclaimer: string;
}

// Average simulated urban vehicle speed in km/h for straight-line demo estimation
const DEMO_AVG_SPEED_KMH = 24;
// Default service time at each customer stop in minutes
const DEFAULT_SERVICE_MINUTES = 30;

/**
 * Calculates transit time in minutes from straight-line distance.
 * Note: Purely a demo estimate for planning visualization.
 */
function estimateTransitMinutes(distanceKm: number): number {
  if (distanceKm <= 0) return 0;
  const hours = distanceKm / DEMO_AVG_SPEED_KMH;
  // Add a base 3-minute turnaround for city stops
  return Math.max(3, Math.round(hours * 60 + 2));
}

/**
 * Formats duration in minutes to human-readable format (e.g., "1 hr 45 mins").
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} mins`;
  }
  const hrs = Math.floor(minutes / 60);
  const remMins = minutes % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs} hrs`;
}

/**
 * Evaluates route metrics for an arbitrary sequence of stops without reordering.
 * Used when manually moving stops up/down or viewing existing schedules.
 */
export function calculateRouteSequenceMetrics<T extends BaseRouteStop>(
  startCoords: Coordinates,
  stops: T[],
  initialStops?: T[],
  startLabel: string = "Agent Starting Location"
): RouteOptimizationResult<T> {
  const legs: RouteLeg[] = [];
  let currentCoords = { ...startCoords };
  let currentName = startLabel;
  let totalDistanceKm = 0;
  let totalDurationMinutes = 0;

  stops.forEach((stop, index) => {
    const distKm = calculateHaversineDistanceKm(
      currentCoords.lat,
      currentCoords.lng,
      stop.coordinates.lat,
      stop.coordinates.lng
    );
    const transitMins = estimateTransitMinutes(distKm);

    // Determine on-site service time
    let serviceMins = DEFAULT_SERVICE_MINUTES;
    if (typeof stop.estimatedDuration === "number") {
      serviceMins = stop.estimatedDuration;
    } else if (typeof stop.estimatedDuration === "string") {
      const parsed = parseInt(stop.estimatedDuration, 10);
      if (!isNaN(parsed)) serviceMins = parsed;
    }

    totalDistanceKm += distKm;
    totalDurationMinutes += transitMins + serviceMins;

    legs.push({
      stopNumber: index + 1,
      fromName: currentName,
      toName: stop.name || stop.customerName || `Stop #${index + 1}`,
      fromCoords: { ...currentCoords },
      toCoords: { ...stop.coordinates },
      straightLineDistanceKm: distKm,
      formattedDistance: formatDistance(distKm),
      estimatedTransitMinutes: transitMins,
      formattedTransitTime: formatDurationMinutes(transitMins),
      serviceDurationMinutes: serviceMins,
      cumulativeDistanceKm: Math.round(totalDistanceKm * 100) / 100,
      cumulativeDurationMinutes: totalDurationMinutes,
    });

    currentCoords = { ...stop.coordinates };
    currentName = stop.name || stop.customerName || `Stop #${index + 1}`;
  });

  // Calculate initial baseline distance if original stops are provided
  let baselineDistKm = totalDistanceKm;
  if (initialStops && initialStops.length > 0) {
    let baseCoord = { ...startCoords };
    let baseSum = 0;
    initialStops.forEach((st) => {
      baseSum += calculateHaversineDistanceKm(
        baseCoord.lat,
        baseCoord.lng,
        st.coordinates.lat,
        st.coordinates.lng
      );
      baseCoord = { ...st.coordinates };
    });
    baselineDistKm = baseSum;
  }

  const savingsKm = Math.max(0, Math.round((baselineDistKm - totalDistanceKm) * 100) / 100);
  const pctSavings = baselineDistKm > 0 ? Math.round((savingsKm / baselineDistKm) * 100) : 0;

  return {
    orderedStops: stops,
    legs,
    stopCount: stops.length,
    totalStraightLineDistanceKm: Math.round(totalDistanceKm * 100) / 100,
    formattedTotalDistance: formatDistance(totalDistanceKm),
    totalEstimatedDurationMinutes: totalDurationMinutes,
    formattedTotalDuration: formatDurationMinutes(totalDurationMinutes),
    initialStraightLineDistanceKm: Math.round(baselineDistKm * 100) / 100,
    formattedInitialDistance: formatDistance(baselineDistKm),
    distanceSavingsKm: savingsKm,
    percentageSavings: pctSavings,
    isOptimized: false,
    algorithmName: "Sequential Stop Order",
    demoBadge: "DEMO Estimate",
    disclaimer:
      "DEMO ESTIMATE ONLY: Distances are calculated using straight-line (great-circle) Haversine formulas. This is an illustrative heuristic estimate and does not represent real road navigation networks, traffic congestion, or turn-by-turn routing.",
  };
}

/**
 * Reorders selected stops using the Nearest-Neighbour Heuristic (Greedy TSP).
 *
 * Requirements:
 * 1. Starts from the agent's mock starting coordinates.
 * 2. Selects the nearest unvisited stop at each step based on Haversine distance.
 * 3. Returns the ordered stops and estimated straight-line metrics.
 * 4. Labels the result explicitly as a DEMO estimate.
 * 5. Does not claim road distance or a mathematically globally optimal route.
 */
export function optimizeRouteNearestNeighbour<T extends BaseRouteStop>(
  startCoords: Coordinates,
  stops: T[],
  startLabel: string = "Agent Starting Location"
): RouteOptimizationResult<T> {
  if (stops.length <= 1) {
    const result = calculateRouteSequenceMetrics(startCoords, stops, stops, startLabel);
    return {
      ...result,
      isOptimized: stops.length === 1,
      algorithmName: "Nearest-Neighbour Heuristic (Greedy TSP Demo)",
    };
  }

  // Calculate original baseline distance before optimization
  let baselineDistance = 0;
  let baseCoords = { ...startCoords };
  for (const stop of stops) {
    baselineDistance += calculateHaversineDistanceKm(
      baseCoords.lat,
      baseCoords.lng,
      stop.coordinates.lat,
      stop.coordinates.lng
    );
    baseCoords = { ...stop.coordinates };
  }

  // Nearest-Neighbour algorithm
  const unvisited: T[] = [...stops];
  const orderedStops: T[] = [];
  let currentCoords = { ...startCoords };

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let shortestDist = Number.MAX_VALUE;

    for (let i = 0; i < unvisited.length; i++) {
      const cand = unvisited[i];
      const dist = calculateHaversineDistanceKm(
        currentCoords.lat,
        currentCoords.lng,
        cand.coordinates.lat,
        cand.coordinates.lng
      );
      if (dist < shortestDist) {
        shortestDist = dist;
        nearestIndex = i;
      }
    }

    const nextStop = unvisited.splice(nearestIndex, 1)[0];
    orderedStops.push(nextStop);
    currentCoords = { ...nextStop.coordinates };
  }

  // Compute final legs and metrics on the newly ordered stops
  const metrics = calculateRouteSequenceMetrics(
    startCoords,
    orderedStops,
    stops,
    startLabel
  );

  return {
    ...metrics,
    isOptimized: true,
    algorithmName: "Nearest-Neighbour Heuristic (Greedy TSP Demo)",
    demoBadge: "DEMO Estimate",
    disclaimer:
      "DEMO ESTIMATE ONLY: Distances are calculated using straight-line (great-circle) Haversine formulas starting from the agent's mock coordinates. The nearest-neighbour algorithm is a greedy heuristic that provides a practical visit sequence for demonstration; it is not a road-network route or guaranteed global optimum.",
  };
}
