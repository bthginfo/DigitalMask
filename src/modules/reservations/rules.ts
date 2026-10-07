import type { RecordData } from "@/shared/contracts";
import { numberValue, textValue } from "@/shared/contracts";

export interface ReservationInterval {
  id?: string;
  data: RecordData;
}

/** Half-open intervals; returns the real peak, never a sum of disjoint overlaps. */
export function peakReservedQuantity(
  reservations: ReservationInterval[],
  from = -Infinity,
  to = Infinity,
  excludeId?: string,
) {
  const edges: { at: number; amount: number }[] = [];
  for (const row of reservations) {
    if (row.id === excludeId || row.data.status === "cancelled") continue;
    const a = Math.max(from, Date.parse(textValue(row.data.start)));
    const b = Math.min(to, Date.parse(textValue(row.data.end)));
    const amount = numberValue(row.data.quantity);
    if (!(a < b) || !Number.isFinite(amount) || amount <= 0) continue;
    edges.push({ at: a, amount }, { at: b, amount: -amount });
  }
  // End edges first makes adjacent bookings share no capacity.
  edges.sort((a, b) => a.at - b.at || a.amount - b.amount);
  let reserved = 0;
  let peak = 0;
  for (const edge of edges) {
    reserved += edge.amount;
    peak = Math.max(peak, reserved);
  }
  return Math.round(peak * 1000000) / 1000000;
}

export function availableQuantity(
  capacity: number,
  reservations: ReservationInterval[],
  start: string,
  end: string,
  excludeId?: string,
) {
  const peak = peakReservedQuantity(reservations, Date.parse(start), Date.parse(end), excludeId);
  return Math.max(0, Math.round((capacity - peak) * 1000000) / 1000000);
}
