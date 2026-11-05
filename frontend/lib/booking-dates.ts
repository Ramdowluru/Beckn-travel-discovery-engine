import type { BookingRecord } from "@/lib/api";

type Edge = "start" | "end";

function providerTimestamp(booking: BookingRecord, edge: Edge): string {
  return booking.order.fulfillments?.[0]?.[edge]?.time?.timestamp ?? "";
}

function timestampDate(timestamp: string): string {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) return "";
  const parsed = new Date(timestamp);
  if (!timestamp || Number.isNaN(parsed.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function providerDateInIndia(timestamp: string): string {
  return timestampDate(timestamp);
}

export function formatBookingDate(value: string): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: match ? "UTC" : "Asia/Kolkata",
  });
}

export function formatProviderDateTime(timestamp: string): string {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) return "";
  const date = new Date(timestamp);
  if (!timestamp || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
  }).format(date);
}

export function transportSchedule(booking: BookingRecord): string {
  const start = providerTimestamp(booking, "start");
  const end = providerTimestamp(booking, "end");
  const departure = formatProviderDateTime(start) || [
    formatBookingDate(String(booking.display.departureDate || booking.display.date || "")),
    booking.display.departure ? `${booking.display.departure} IST` : "",
  ].filter(Boolean).join(", ");
  const arrival = formatProviderDateTime(end) || [
    formatBookingDate(String(booking.display.arrivalDate || booking.display.date || "")),
    booking.display.arrival ? `${booking.display.arrival} IST` : "",
  ].filter(Boolean).join(", ");
  return departure && arrival ? `${departure} – ${arrival}` : departure || arrival;
}

export function destinationArrivalDate(booking: BookingRecord): string {
  const end = providerTimestamp(booking, "end");
  return timestampDate(end)
    || String(booking.display.arrivalDate || "");
}
