"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BookingCard from "@/components/BookingCard";
import { getBookingsRequest } from "@/lib/api";
import type { BookingRecord } from "@/lib/api";
import { formatBookingDate, transportSchedule } from "@/lib/booking-dates";

interface Props {
  searchParams: Promise<{ kind?: string }>;
}

const bookingKinds = [
  { value: "all", label: "All" },
  { value: "transport", label: "Travel" },
  { value: "hotel", label: "Stay" },
  { value: "experience", label: "Experience" },
];

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

function filterHref(kind: string) {
  return kind === "all" ? "/bookings" : `/bookings?kind=${encodeURIComponent(kind)}`;
}

function kindIcon(kind: BookingRecord["kind"]): string {
  if (kind === "hotel") return "▥";
  if (kind === "experience") return "✧";
  return "♧";
}

export default function BookingsPage({ searchParams }: Props) {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loadError, setLoadError] = useState("");
  const [activeKind, setActiveKind] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);

  // Load search params
  useEffect(() => {
    searchParams.then((params) => {
      setActiveKind(
        bookingKinds.some((filter) => filter.value === params.kind) ? params.kind! : "all"
      );
    });
  }, [searchParams]);

  // Load bookings
  useEffect(() => {
    const loadBookings = async () => {
      try {
        setIsLoading(true);
        const data = await getBookingsRequest();
        setBookings(data);
        setLoadError("");
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Bookings are temporarily unavailable.");
        setBookings([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadBookings();
  }, []);

  const filteredBookings = activeKind === "all"
    ? bookings
    : bookings.filter((booking) => booking.kind === activeKind);

  const handleRemoved = () => {
    // Refresh page to remove the hidden booking from the list
    window.location.reload();
  };

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div className="my-bookings-shell">
          <p className="tag booking-eyebrow">Your account</p>
          <h1 className="my-bookings-title">My Bookings</h1>
          <p className="my-bookings-subtitle">Each provider reservation is managed individually.</p>

          <nav className="booking-kind-tabs" aria-label="Filter bookings by type">
            {bookingKinds.map((filter) => {
              const count = filter.value === "all"
                ? bookings.length
                : bookings.filter((booking) => booking.kind === filter.value).length;
              return (
                <Link
                  key={filter.value}
                  href={filterHref(filter.value)}
                  aria-current={activeKind === filter.value ? "page" : undefined}
                  className={activeKind === filter.value ? "booking-kind-tab active" : "booking-kind-tab"}
                >
                  {filter.label} <span>{count}</span>
                </Link>
              );
            })}
          </nav>

          {loadError ? (
            <p role="alert" className="booking-empty">Bookings are temporarily unavailable: {loadError}</p>
          ) : isLoading ? (
            <p className="booking-empty">Loading your bookings...</p>
          ) : filteredBookings.length === 0 ? (
            <p className="booking-empty">{bookings.length ? "No bookings in this category yet." : "Your confirmed bookings will appear here."}</p>
          ) : (
            <div className="booking-list">
              {filteredBookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onRemoved={handleRemoved}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
