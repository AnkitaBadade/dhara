import { BedStatus, PHC, Rules, StaffMember, StateCode, StockItem } from '../types';

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Deterministic Days of Stock calculation
 * days = stock ÷ (daily use × seasonal uplift × surge multiplier)
 */
export function calculateDaysOfStock(
  quantity: number,
  dailyBurnRate: number,
  seasonalUplift: number = 1.0,
  surgeMultiplier: number = 1.0
): number {
  const effectiveBurn = Math.max(0.1, dailyBurnRate * seasonalUplift * surgeMultiplier);
  const days = quantity / effectiveBurn;
  return Math.round(days * 10) / 10;
}

/**
 * Seasonal uplift calculation from weekly consumption history
 * Formula: mean of last 4 weeks ÷ mean of earlier weeks
 * Odisha has only 3 weeks, so returns insufficient_history
 */
export function calculateSeasonalUplift(weeklyHistory: number[]): {
  uplift: number;
  status: 'ok' | 'insufficient_history';
  last4Mean?: number;
  earlierMean?: number;
} {
  if (!weeklyHistory || weeklyHistory.length < 5) {
    return { uplift: 1.0, status: 'insufficient_history' };
  }

  const last4 = weeklyHistory.slice(-4);
  const earlier = weeklyHistory.slice(0, -4);

  const last4Sum = last4.reduce((acc, v) => acc + v, 0);
  const earlierSum = earlier.reduce((acc, v) => acc + v, 0);

  const last4Mean = last4Sum / last4.length;
  const earlierMean = earlierSum / earlier.length;

  if (earlierMean === 0) {
    return { uplift: 1.0, status: 'ok', last4Mean, earlierMean };
  }

  const uplift = Math.round((last4Mean / earlierMean) * 100) / 100;
  return { uplift, status: 'ok', last4Mean, earlierMean };
}

/**
 * Facility-weighted federated average across states
 */
export function calculateFederatedAverage(
  stateProfiles: Record<string, Record<string, number>>,
  facilityCounts: Record<string, number>,
  medCodes: string[]
): Record<string, number> {
  const result: Record<string, number> = {};
  const totalFacilities = Object.values(facilityCounts).reduce((a, b) => a + b, 0);

  if (totalFacilities === 0) {
    medCodes.forEach((code) => {
      result[code] = 1.0;
    });
    return result;
  }

  for (const code of medCodes) {
    let weightedSum = 0;
    let weightSum = 0;

    for (const [state, profile] of Object.entries(stateProfiles)) {
      const uplift = profile[code] || 1.0;
      const count = facilityCounts[state] || 1;
      weightedSum += uplift * count;
      weightSum += count;
    }

    result[code] = Math.round((weightedSum / (weightSum || 1)) * 100) / 100;
  }

  return result;
}

/**
 * Evaluates staffing gaps and attendance metrics
 */
export function getStaffingMetrics(staffList: StaffMember[] = []) {
  const total = staffList.length;
  const present = staffList.filter((s) => s.status === 'present').length;
  const onLeave = staffList.filter((s) => s.status === 'leave').length;
  const absent = staffList.filter((s) => s.status === 'absent').length;
  const mo = staffList.find((s) => s.is_mo || s.role === 'Medical Officer');
  const moPresent = mo?.status === 'present';
  const attendancePercent = total > 0 ? Math.round((present / total) * 100) : 0;

  return {
    total,
    present,
    onLeave,
    absent,
    mo,
    moPresent,
    attendancePercent,
  };
}

export interface CandidateTransferPlan {
  fromPhc: PHC;
  toPhc: PHC;
  medCode: string;
  quantity: number;
  distanceKm: number;
  daysGained: number;
  donorRemainingDays: number;
  recipientCurrentDays: number;
  isAutoDispatch: boolean;
}

/**
 * Finds cross-district redistribution donors strictly following deterministic rules:
 * - Within state
 * - Distance <= rules.max_transfer_km
 * - Donor keeps >= rules.keep_buffer_days_at_donor after transfer
 */
export function findRedistributionCandidates(
  recipientPhc: PHC,
  medCode: string,
  allPhcsInState: PHC[],
  stockData: Record<string, Record<string, StockItem>>,
  upliftMap: Record<string, number>,
  surgeMap: Record<string, number>,
  rules: Rules
): CandidateTransferPlan[] {
  const candidates: CandidateTransferPlan[] = [];

  const recipientStock = stockData[recipientPhc.id]?.[medCode];
  if (!recipientStock) return [];

  const recipientUplift = upliftMap[medCode] || 1.0;
  const recipientSurge = surgeMap[medCode] || 1.0;
  const recipientDailyBurn = Math.max(0.1, recipientStock.daily_burn_rate * recipientUplift * recipientSurge);
  const recipientDays = recipientStock.quantity / recipientDailyBurn;

  // Only seek donors if recipient is below warning threshold or critical threshold
  if (recipientDays >= rules.warning_threshold_days) {
    return [];
  }

  // Desired target stock at recipient is at least warning_threshold_days (e.g. 14 days)
  const targetStock = Math.ceil(rules.warning_threshold_days * recipientDailyBurn);
  const neededQty = Math.max(1, targetStock - recipientStock.quantity);

  // Search candidate donors across all PHCs in state
  for (const donorPhc of allPhcsInState) {
    if (donorPhc.id === recipientPhc.id) continue;

    const distance = haversineDistance(
      recipientPhc.lat,
      recipientPhc.lng,
      donorPhc.lat,
      donorPhc.lng
    );

    if (distance > rules.max_transfer_km) continue;

    const donorStock = stockData[donorPhc.id]?.[medCode];
    if (!donorStock) continue;

    const donorUplift = upliftMap[medCode] || 1.0;
    const donorSurge = surgeMap[medCode] || 1.0;
    const donorDailyBurn = Math.max(0.1, donorStock.daily_burn_rate * donorUplift * donorSurge);

    // Required minimum buffer to stay at donor
    const minBufferQty = Math.ceil(rules.keep_buffer_days_at_donor * donorDailyBurn);
    const surplusQty = donorStock.quantity - minBufferQty;

    if (surplusQty > 5) {
      // We can transfer up to neededQty or surplusQty
      const transferQty = Math.min(neededQty, surplusQty);
      const donorRemainingStock = donorStock.quantity - transferQty;
      const donorRemainingDays = Math.round((donorRemainingStock / donorDailyBurn) * 10) / 10;
      const daysGained = Math.round((transferQty / recipientDailyBurn) * 10) / 10;
      const recipientCurrentDays = Math.round(recipientDays * 10) / 10;

      // Only suggest a transfer if it gives the receiver at least 5 extra days of stock
      // or brings it above the 7-day critical line
      const bringsAbove7DayLine = recipientCurrentDays < 7 && (recipientCurrentDays + daysGained) >= 7;
      const givesAtLeast5Days = daysGained >= 5;

      if (!givesAtLeast5Days && !bringsAbove7DayLine) {
        continue;
      }

      const isAutoDispatch =
        transferQty <= rules.auto_dispatch_max_units &&
        distance <= rules.auto_dispatch_max_km;

      candidates.push({
        fromPhc: donorPhc,
        toPhc: recipientPhc,
        medCode,
        quantity: Math.round(transferQty),
        distanceKm: distance,
        daysGained,
        donorRemainingDays,
        recipientCurrentDays,
        isAutoDispatch,
      });
    }
  }

  // Sort candidates by lowest distance, then highest days gained
  return candidates.sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Bed status metrics
 */
export function getBedMetrics(bed: BedStatus) {
  const total = bed.total || 0;
  const occupied = bed.occupied || 0;
  const available = Math.max(0, total - occupied);
  const occupancyRate = total > 0 ? Math.min(100, Math.round((occupied / total) * 100)) : 0;
  const isFull = available === 0;

  return {
    total,
    occupied,
    available,
    occupancyRate,
    isFull,
  };
}
