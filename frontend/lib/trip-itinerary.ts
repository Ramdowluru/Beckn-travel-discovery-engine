import type { HydratedTripBooking, UserTrip } from "./api";
import { formatProviderDateTime, providerDateInIndia } from "./booking-dates";

export interface TimelineItem {
  bookingId: string;
  booking: HydratedTripBooking | null;
  status: string;
  kind: string;
  title: string;
  provider: string;
  location: string;
  schedule: string[];
  startDate: string;
  endDate: string;
  startInstant: number | null;
  endInstant: number | null;
  warnings: string[];
}

const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

function providerTimestamp(booking: HydratedTripBooking | null, edge: "start" | "end"): string {
  const order = record(booking?.order);
  const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments : [];
  const fulfillment = record(fulfillments[0]);
  const point = record(fulfillment[edge]);
  const time = record(point.time);
  const timestamp = text(time.timestamp);
  return timestamp && /(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp) && Number.isFinite(Date.parse(timestamp))
    ? timestamp
    : "";
}

export function displayDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function instantDate(value: string): string {
  return providerDateInIndia(value);
}

function makeTimelineItem(
  trip: UserTrip,
  reference: UserTrip["bookings"][number],
): TimelineItem {
  const booking = reference.booking;
  const display = record(booking?.display);
  const criteria = record(booking?.criteria);
  const kind = booking?.kind ?? "booking";
  const startTimestamp = providerTimestamp(booking, "start");
  const endTimestamp = providerTimestamp(booking, "end");
  const startDate = text(display.departureDate)
    || text(display.date)
    || text(display.checkIn)
    || text(criteria.date)
    || text(criteria.experience_date)
    || text(criteria.check_in)
    || instantDate(startTimestamp);
  const endDate = kind === "hotel"
    ? text(display.checkOut) || text(criteria.check_out) || instantDate(endTimestamp)
    : kind === "transport"
      ? text(display.arrivalDate) || instantDate(endTimestamp)
      : instantDate(endTimestamp) || startDate;
  const departure = text(display.departure);
  const arrival = text(display.arrival);
  const checkIn = text(display.checkIn) || text(criteria.check_in);
  const checkOut = text(display.checkOut) || text(criteria.check_out);
  const experienceTime = text(display.time);
  const providerSchedule = [startTimestamp, endTimestamp]
    .map(formatProviderDateTime)
    .filter(Boolean);
  const transportSchedule = providerSchedule.length === 2
    ? providerSchedule.join(" – ")
    : [
        startDate ? displayDate(startDate) : "Date not supplied",
        departure ? `${departure} IST` : "",
      ].filter(Boolean).join(" · ")
      + " – "
      + [
        endDate ? displayDate(endDate) : "Date not supplied",
        arrival ? `${arrival} IST` : "",
      ].filter(Boolean).join(" · ");
  const schedule = kind === "hotel"
    ? [
        checkIn && `Check-in: ${displayDate(checkIn)}`,
        checkOut && `Check-out: ${displayDate(checkOut)}`,
      ].filter((value): value is string => Boolean(value))
    : kind === "transport"
      ? [transportSchedule]
      : [
          startDate && displayDate(startDate),
          experienceTime ? `${experienceTime} (provider time)` : "",
          providerSchedule[0] || "",
        ].filter((value): value is string => Boolean(value));
  const warnings: string[] = [];
  const effectiveEndDate = kind === "hotel" && endDate
    ? (() => {
        const checkout = new Date(`${endDate}T00:00:00Z`);
        checkout.setUTCDate(checkout.getUTCDate() - 1);
        return checkout.toISOString().slice(0, 10);
      })()
    : endDate;
  if (startDate && (startDate < trip.start_date || startDate > trip.end_date)) {
    warnings.push("This service starts outside the trip dates.");
  }
  if (effectiveEndDate && effectiveEndDate > trip.end_date) {
    warnings.push("This service ends outside the trip dates.");
  }
  return {
    bookingId: reference.booking_id,
    booking,
    status: reference.status,
    kind,
    title: booking?.service || `${kind[0].toUpperCase()}${kind.slice(1)} booking`,
    provider: booking?.provider_name || "Provider not available",
    location: text(display.route)
      || [text(display.departureCity), text(display.arrivalCity)].filter(Boolean).join(" → ")
      || text(display.location)
      || text(criteria.to)
      || text(criteria.destination),
    schedule: schedule.length ? schedule : ["Date or time not supplied"],
    startDate: startDate || trip.start_date,
    endDate: endDate || startDate || trip.start_date,
    startInstant: startTimestamp ? Date.parse(startTimestamp) : null,
    endInstant: endTimestamp ? Date.parse(endTimestamp) : null,
    warnings,
  };
}

export function buildTimeline(trip: UserTrip): TimelineItem[] {
  const items = trip.bookings.map((reference) => makeTimelineItem(trip, reference));
  const timedActivities = items.filter((item) =>
    item.kind !== "hotel"
    && item.startInstant !== null
    && item.endInstant !== null
    && item.endInstant > item.startInstant
  );
  for (let left = 0; left < timedActivities.length; left += 1) {
    for (let right = left + 1; right < timedActivities.length; right += 1) {
      const first = timedActivities[left];
      const second = timedActivities[right];
      if (first.startInstant! < second.endInstant! && second.startInstant! < first.endInstant!) {
        first.warnings.push(`Schedule overlaps with ${second.title}. Review both provider schedules.`);
        second.warnings.push(`Schedule overlaps with ${first.title}. Review both provider schedules.`);
      }
    }
  }
  return items.sort((left, right) => {
    const dateStart = (value: string) => {
      const timestamp = Date.parse(`${value}T00:00:00Z`);
      return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
    };
    const leftStart = left.startInstant ?? dateStart(left.startDate);
    const rightStart = right.startInstant ?? dateStart(right.startDate);
    return leftStart - rightStart;
  });
}
