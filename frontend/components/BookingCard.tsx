"use client";

import Link from "next/link";
import { useState } from "react";
import type { BookingRecord } from "@/lib/api";
import { formatBookingDate, transportSchedule } from "@/lib/booking-dates";

interface Props {
  booking: BookingRecord;
  onRemoved?: () => void;
}

function bookingStatus(status: BookingRecord["status"]): string {
  if (status === "REJECTED") return "rejected";
  if (status === "PENDING_UNKNOWN" || status === "INITIALIZED") return "pending";
  return status === "CONFIRMED" ? "confirmed" : "cancelled";
}

function customerStatus(status: BookingRecord["status"]): string {
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "REJECTED") return "Rejected";
  if (status === "INITIALIZED") return "Initialized, awaiting confirmation";
  return "Pending provider update";
}

function bookingLocation(booking: BookingRecord): string {
  const display = booking.display;
  return display.route
    || [display.departureCity, display.arrivalCity].filter(Boolean).join(" → ")
    || String(display.location || "");
}

function formattedQuote(booking: BookingRecord): string {
  const price = booking.quote?.price;
  if (!price?.currency && !price?.value) return "Price unavailable";
  return `${price.currency || ""} ${price.value || ""}`.trim();
}

function scheduledAt(booking: BookingRecord): string {
  if (booking.kind === "transport") return transportSchedule(booking);
  const rawDate = String(
    booking.display.date
    || booking.display.checkIn
    || booking.display.departure
    || booking.order.fulfillments?.[0]?.start?.time?.timestamp
    || "",
  );
  if (!rawDate) return "";
  const date = formatBookingDate(rawDate);
  const time = String(booking.display.time || booking.display.departure || "");
  return [date, time].filter(Boolean).join(", ");
}

function kindIcon(kind: BookingRecord["kind"]): string {
  if (kind === "hotel") return "▥";
  if (kind === "experience") return "✧";
  return "♧";
}

export default function BookingCard({ booking, onRemoved }: Props) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const isCancelled = booking.status === "CANCELLED";

  const handleRemove = async () => {
    if (!confirm("Remove this cancelled booking from My Bookings?")) {
      return;
    }

    setRemoving(true);
    setError("");

    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.cookie
            .split("; ")
            .find((c) => c.startsWith("tde_csrf="))
            ?.slice("tde_csrf=".length) || "",
        },
      });

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "Booking not found or is not cancelled."
            : "Failed to remove booking.",
        );
      }

      onRemoved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
      setRemoving(false);
    }
  };

  return (
    <article key={booking.id} className="booking-list-card">
      <span className="booking-kind-icon" aria-hidden="true">
        {kindIcon(booking.kind)}
      </span>
      <div className="booking-list-info">
        <h2>
          {booking.service ||
            (booking.kind === "hotel"
              ? "Stay booking"
              : booking.kind === "experience"
                ? "Experience booking"
                : "Travel booking")}
        </h2>
        <span className={`booking-status status-${bookingStatus(booking.status)}`}>
          {customerStatus(booking.status)}
        </span>
        <p className="booking-card-meta">
          {bookingLocation(booking)}
          {bookingLocation(booking) && scheduledAt(booking) ? " · " : ""}
          {scheduledAt(booking)}
        </p>
        <p className="booking-card-meta">
          {booking.kind === "hotel"
            ? `${booking.quantity ?? 1} room${booking.quantity === 1 ? "" : "s"}`
            : `${booking.quantity ?? 1} ${booking.kind === "experience" ? "participant" : "traveller"}${booking.quantity === 1 ? "" : "s"}`}
          {booking.id ? ` · Ref ${booking.id.slice(0, 8).toUpperCase()}` : ""}
        </p>
        {error && (
          <p className="booking-card-error" style={{ color: "#d84315", marginTop: "0.5rem", fontSize: "0.85rem" }}>
            {error}
          </p>
        )}
      </div>
      <strong className="booking-card-price">{formattedQuote(booking)}</strong>
      <div style={{ display: "flex", gap: "0.5rem", flexDirection: "column", alignItems: "flex-end" }}>
        <Link className="booking-card-link" href={`/trips/bookings/${encodeURIComponent(booking.id)}`}>
          View Booking
        </Link>
        {isCancelled && (
          <button
            onClick={handleRemove}
            disabled={removing}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.75rem",
              fontWeight: 500,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              border: "1px solid #d84315",
              background: removing ? "#f5f1ed" : "transparent",
              color: "#d84315",
              cursor: removing ? "not-allowed" : "pointer",
              opacity: removing ? 0.6 : 1,
              transition: "all 0.2s",
            }}
          >
            {removing ? "Removing..." : "Remove"}
          </button>
        )}
      </div>
    </article>
  );
}
