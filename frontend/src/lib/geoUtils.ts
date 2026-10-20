import { Agent, Customer } from "@/types";

/**
 * Calculates the straight-line (great-circle) distance between two sets of
 * latitude and longitude coordinates using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lng1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lng2 Longitude of point 2 in decimal degrees
 * @returns Distance in kilometers
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const EARTH_RADIUS_KM = 6371; // Earth's mean radius in km

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = EARTH_RADIUS_KM * c;
  return Math.round(distance * 100) / 100; // 2 decimal places
}

/**
 * Formats a distance in kilometers into a friendly human-readable string.
 * Example: 0.85 km -> "850 m", 3.42 km -> "3.4 km"
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

export interface AgentEligibilityResult {
  agent: Agent;
  distanceKm: number;
  formattedDistance: string;
  isEligible: boolean;
  ineligibilityReason?: string;
  rank?: number;
}

export interface LeadRankingResult {
  customer: Customer;
  recommendedAgent: AgentEligibilityResult | null;
  eligibleAgents: AgentEligibilityResult[];
  ineligibleAgents: AgentEligibilityResult[];
  reasonIfNone?: string;
}

/**
 * Evaluates all agents against a customer lead:
 * 1. Finds on-duty / available agents.
 * 2. Excludes agents who are inactive or on break.
 * 3. Excludes agents who exceed the configurable mock workload limit.
 * 4. Calculates the straight-line Haversine distance to each agent.
 * 5. Ranks eligible agents by ascending distance.
 */
export function rankAgentsForLead(
  customer: Customer,
  agents: Agent[],
  maxWorkloadLimit: number = 6
): LeadRankingResult {
  const eligible: AgentEligibilityResult[] = [];
  const ineligible: AgentEligibilityResult[] = [];

  for (const agent of agents) {
    const distanceKm = calculateHaversineDistanceKm(
      agent.coordinates.lat,
      agent.coordinates.lng,
      customer.coordinates.lat,
      customer.coordinates.lng
    );
    const formattedDistance = formatDistance(distanceKm);

    // Rule 1 & 2: Check availability status
    if (agent.status === "inactive") {
      ineligible.push({
        agent,
        distanceKm,
        formattedDistance,
        isEligible: false,
        ineligibilityReason: "Agent is inactive / shift concluded",
      });
      continue;
    }

    if (agent.status === "break") {
      ineligible.push({
        agent,
        distanceKm,
        formattedDistance,
        isEligible: false,
        ineligibilityReason: "Agent is currently on a scheduled break",
      });
      continue;
    }

    // Rule 3: Check workload limit
    const currentTasks = agent.assignedTasks || 0;
    if (currentTasks >= maxWorkloadLimit) {
      ineligible.push({
        agent,
        distanceKm,
        formattedDistance,
        isEligible: false,
        ineligibilityReason: `Workload capacity reached (${currentTasks}/${maxWorkloadLimit} tasks)`,
      });
      continue;
    }

    // Agent is eligible
    eligible.push({
      agent,
      distanceKm,
      formattedDistance,
      isEligible: true,
    });
  }

  // Rule 5: Rank eligible agents by distance (ascending)
  eligible.sort((a, b) => a.distanceKm - b.distanceKm);

  // Assign rankings (1-indexed)
  eligible.forEach((res, index) => {
    res.rank = index + 1;
  });

  const recommendedAgent = eligible.length > 0 ? eligible[0] : null;

  let reasonIfNone: string | undefined = undefined;
  if (eligible.length === 0) {
    if (agents.length === 0) {
      reasonIfNone = "No registered field agents found in the system.";
    } else {
      reasonIfNone = `No available agents found within capacity. All ${agents.length} agents are either inactive, on break, or have reached their workload limit (${maxWorkloadLimit} tasks).`;
    }
  }

  return {
    customer,
    recommendedAgent,
    eligibleAgents: eligible,
    ineligibleAgents: ineligible,
    reasonIfNone,
  };
}
