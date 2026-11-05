"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  addBookingToTrip,
  createTrip,
  fetchTrips,
  removeBookingFromTrip,
  updateTrip,
  type BookingRecord,
  type CreateTripInput,
  type UserTrip,
} from "@/lib/api";
import { displayDate } from "@/lib/trip-itinerary";

interface TripManagementProps {
  initialTrips: UserTrip[];
  bookings: BookingRecord[];
  initialError?: string;
  initialManagedTripId?: string;
}

const fieldStyle = {
  width: "100%",
  padding: "0.65rem 0.75rem",
  border: "1px solid var(--border)",
  backgroundColor: "var(--white)",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
  fontSize: "0.85rem",
};

const buttonStyle = {
  border: "1px solid var(--ink)",
  backgroundColor: "var(--ink)",
  color: "var(--white)",
  padding: "0.6rem 1rem",
  fontFamily: "var(--font-body)",
  fontSize: "0.8rem",
  cursor: "pointer",
};

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Trip changes could not be saved. Please try again.";
}

function bookingLabel(booking: BookingRecord): string {
  const service = booking.service || `${booking.kind} booking`;
  const provider = booking.provider_name || booking.provider_id || "Provider";
  return `${service} — ${provider} · ${booking.status.replaceAll("_", " ")}`;
}

function tripTotal(trip: UserTrip): string {
  const prices = trip.bookings.flatMap(({ booking, status }) => {
    if (status !== "CONFIRMED") return [];
    const currency = booking?.quote?.price?.currency;
    const value = Number(booking?.quote?.price?.value);
    return currency && Number.isFinite(value) ? [{ currency, value }] : [];
  });
  if (!prices.length) return "No booking total";
  const currencies = new Set(prices.map((price) => price.currency));
  if (currencies.size !== 1) return "Multiple currencies";
  const [currency] = currencies;
  const total = prices.reduce((sum, price) => sum + price.value, 0);
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(total);
  return currency === "INR" ? `₹${formatted}` : `${currency} ${formatted}`;
}

export default function TripManagement({
  initialTrips,
  bookings,
  initialError,
  initialManagedTripId,
}: TripManagementProps) {
  const [trips, setTrips] = useState(initialTrips);
  const [loadError, setLoadError] = useState(initialError ?? "");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [managingTripId, setManagingTripId] = useState<string | null>(initialManagedTripId ?? null);
  const mutationsPending = pendingAction !== "" && pendingAction !== "refresh";

  function replaceTrip(updated: UserTrip) {
    setLoadError("");
    setTrips((current) => {
      const exists = current.some((trip) => trip.id === updated.id);
      return exists
        ? current.map((trip) => trip.id === updated.id ? updated : trip)
        : [updated, ...current];
    });
  }

  async function refreshTrips() {
    setPendingAction("refresh");
    setLoadError("");
    try {
      setTrips(await fetchTrips());
    } catch (error) {
      setLoadError(messageFromError(error));
    } finally {
      setPendingAction("");
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const input: CreateTripInput = {
      title: String(data.get("title") ?? "").trim(),
      destination: String(data.get("destination") ?? "").trim(),
      start_date: String(data.get("start_date") ?? ""),
      end_date: String(data.get("end_date") ?? ""),
    };
    if (!input.title || !input.destination || !input.start_date || !input.end_date) {
      setFormError("Enter a title, destination, and both trip dates.");
      return;
    }
    if (input.end_date < input.start_date) {
      setFormError("End date must be on or after the start date.");
      return;
    }

    setPendingAction("create");
    try {
      replaceTrip(await createTrip(input));
      form.reset();
      setSuccessMessage("Trip created.");
    } catch (error) {
      setFormError(messageFromError(error));
    } finally {
      setPendingAction("");
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>, trip: UserTrip) {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const startDate = String(data.get("start_date") ?? "");
    const endDate = String(data.get("end_date") ?? "");
    if (endDate < startDate) {
      setFormError("End date must be on or after the start date.");
      return;
    }
    setPendingAction(`edit:${trip.id}`);
    try {
      replaceTrip(await updateTrip(trip.id, {
        title: String(data.get("title") ?? "").trim(),
        destination: String(data.get("destination") ?? "").trim(),
        start_date: startDate,
        end_date: endDate,
      }));
      setEditingTripId(null);
      setSuccessMessage("Trip updated.");
    } catch (error) {
      setFormError(messageFromError(error));
    } finally {
      setPendingAction("");
    }
  }

  async function handleAddBooking(event: FormEvent<HTMLFormElement>, trip: UserTrip) {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");
    const bookingId = String(new FormData(event.currentTarget).get("booking_id") ?? "");
    if (!bookingId) {
      setFormError("Choose one of your existing bookings.");
      return;
    }
    setPendingAction(`add:${trip.id}`);
    try {
      replaceTrip(await addBookingToTrip(trip.id, bookingId));
      setSuccessMessage("Booking added to trip. The booking itself was not changed.");
    } catch (error) {
      setFormError(messageFromError(error));
    } finally {
      setPendingAction("");
    }
  }

  async function handleRemoveBooking(trip: UserTrip, bookingId: string) {
    setFormError("");
    setSuccessMessage("");
    setPendingAction(`remove:${trip.id}:${bookingId}`);
    try {
      replaceTrip(await removeBookingFromTrip(trip.id, bookingId));
      setSuccessMessage("Booking reference removed from trip. The booking itself was not changed.");
    } catch (error) {
      setFormError(messageFromError(error));
    } finally {
      setPendingAction("");
    }
  }

  return (
    <section aria-labelledby="trips-heading" className="trip-management-section">
      <div className="trip-management-heading">
        <div>
          <p className="trip-section-eyebrow">Itineraries</p>
          <h1 id="trips-heading">Trips</h1>
          <p>Trips group bookings you’ve already made into one itinerary.</p>
        </div>
        <a className="trip-plan-link" href="#create-trip">Plan a new trip</a>
        {loadError && (
          <button type="button" onClick={refreshTrips} disabled={pendingAction === "refresh"} style={buttonStyle}>
            {pendingAction === "refresh" ? "Refreshing…" : "Retry loading trips"}
          </button>
        )}
      </div>

      {loadError && (
        <p role="alert" style={{ marginTop: "1rem", color: "#9b2c2c", fontFamily: "var(--font-body)", fontSize: "0.85rem" }}>
          Trips could not be loaded: {loadError}
        </p>
      )}
      {formError && (
        <p role="alert" style={{ marginTop: "1rem", color: "#9b2c2c", fontFamily: "var(--font-body)", fontSize: "0.85rem" }}>
          {formError}
        </p>
      )}
      {successMessage && (
        <p role="status" style={{ marginTop: "1rem", color: "var(--ink)", fontFamily: "var(--font-body)", fontSize: "0.85rem" }}>
          {successMessage}
        </p>
      )}

      <form
        onSubmit={handleCreate}
        id="create-trip"
        className="trip-create-form"
      >
        <h3>Create a trip</h3>
        <div className="trip-create-fields">
          <label style={labelStyle}>
            Title
            <input name="title" required maxLength={120} style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            Destination
            <input name="destination" required maxLength={160} style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            Start date
            <input name="start_date" type="date" required style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            End date
            <input name="end_date" type="date" required style={fieldStyle} />
          </label>
        </div>
        <button type="submit" disabled={mutationsPending} style={{ ...buttonStyle, marginTop: "0.9rem" }}>
          {pendingAction === "create" ? "Creating…" : "Create trip"}
        </button>
      </form>

      {trips.length === 0 ? (
        <p className="trip-empty-state">
          {loadError ? "Trip list is unavailable until it can be loaded." : "No trips yet. Create one to organize your existing bookings."}
        </p>
      ) : (
        <div className="trip-summary-list">
          {trips.map((trip) => {
            const memberIds = new Set(trip.bookings.map((entry) => entry.booking_id));
            const availableBookings = bookings.filter((booking) => !memberIds.has(booking.id));
            const editing = editingTripId === trip.id;
            const managing = managingTripId === trip.id;
            const actionBusy = mutationsPending;
            return (
              <article id={`trip-${trip.id}`} key={trip.id} className="trip-summary-card">
                <h3>{trip.title}</h3>
                <p className="trip-summary-meta">{trip.destination} · {displayDate(trip.start_date)} – {displayDate(trip.end_date)}</p>
                {trip.bookings.length > 0 ? (
                  <ul className="trip-preview-bookings">
                    {trip.bookings.slice(0, 3).map((reference) => (
                      <li key={reference.booking_id}>
                        {reference.booking?.service || `${reference.booking?.kind ?? "Booking"} booking`}
                      </li>
                    ))}
                    {trip.bookings.length > 3 && <li>+ {trip.bookings.length - 3} more booking{trip.bookings.length - 3 === 1 ? "" : "s"}</li>}
                  </ul>
                ) : (
                  <p className="trip-preview-empty">No bookings added yet.</p>
                )}
                <div className="trip-summary-footer">
                  <strong>{tripTotal(trip)}</strong>
                  <div>
                    <Link href={`/trips/${encodeURIComponent(trip.id)}/itinerary`} className="trip-view-link">
                      View itinerary
                    </Link>
                    <button
                      type="button"
                      className="trip-manage-toggle"
                      aria-expanded={managing}
                      aria-controls={`trip-manage-${trip.id}`}
                      onClick={() => {
                        setFormError("");
                        setManagingTripId(managing ? null : trip.id);
                        if (managing) setEditingTripId(null);
                      }}
                    >
                      {managing ? "Close" : "Manage trip"}
                    </button>
                  </div>
                </div>

                {managing && (
                  <div id={`trip-manage-${trip.id}`} className="trip-manage-panel">
                    <div className="trip-manage-panel-heading">
                      <h4>Manage {trip.title}</h4>
                      <button
                        type="button"
                        disabled={mutationsPending}
                        onClick={() => {
                          setFormError("");
                          setEditingTripId(editing ? null : trip.id);
                        }}
                        style={secondaryButtonStyle}
                      >
                        {editing ? "Close editor" : "Edit trip"}
                      </button>
                    </div>
                {editing && (
                  <form onSubmit={(event) => handleUpdate(event, trip)} style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
                      <label style={labelStyle}>Title<input name="title" required maxLength={120} defaultValue={trip.title} style={fieldStyle} /></label>
                      <label style={labelStyle}>Destination<input name="destination" required maxLength={160} defaultValue={trip.destination} style={fieldStyle} /></label>
                      <label style={labelStyle}>Start date<input name="start_date" type="date" required defaultValue={trip.start_date} style={fieldStyle} /></label>
                      <label style={labelStyle}>End date<input name="end_date" type="date" required defaultValue={trip.end_date} style={fieldStyle} /></label>
                    </div>
                    <button type="submit" disabled={mutationsPending} style={{ ...buttonStyle, marginTop: "0.85rem" }}>
                      {pendingAction === `edit:${trip.id}` ? "Saving…" : "Save changes"}
                    </button>
                  </form>
                )}

                <div className="trip-manage-bookings">
                  <h5>Bookings in this trip</h5>
                  {trip.bookings.length === 0 ? (
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--ink-muted)" }}>No booking references added.</p>
                  ) : (
                    <ul style={{ display: "grid", gap: "0.55rem", listStyle: "none", padding: 0 }}>
                      {trip.bookings.map((reference) => {
                        const busy = pendingAction === `remove:${trip.id}:${reference.booking_id}`;
                        return (
                          <li key={reference.booking_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", padding: "0.7rem", backgroundColor: "var(--cream)" }}>
                            <span style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--ink)" }}>
                              {reference.booking
                                ? `${bookingLabel(reference.booking)} · ${reference.booking.display.location || reference.booking.display.route || reference.booking.display.departureCity || ""}`
                                : `Booking unavailable · ${reference.booking_id}`}
                              {" · "}
                              <strong>{reference.status.replaceAll("_", " ")}</strong>
                            </span>
                            <button
                              type="button"
                              disabled={busy || mutationsPending}
                              onClick={() => void handleRemoveBooking(trip, reference.booking_id)}
                              style={secondaryButtonStyle}
                            >
                              {busy ? "Removing…" : "Remove from trip"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {availableBookings.length > 0 ? (
                    <form onSubmit={(event) => void handleAddBooking(event, trip)} style={{ display: "flex", gap: "0.6rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
                      <label htmlFor={`booking-${trip.id}`} style={{ ...labelStyle, flex: "1 1 260px" }}>
                        Add an existing booking
                        <select id={`booking-${trip.id}`} name="booking_id" defaultValue="" required style={fieldStyle}>
                          <option value="" disabled>Choose a booking</option>
                          {availableBookings.map((booking) => (
                            <option key={booking.id} value={booking.id}>{bookingLabel(booking)}</option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" disabled={actionBusy} style={{ ...buttonStyle, alignSelf: "end" }}>
                        {pendingAction === `add:${trip.id}` ? "Adding…" : "Add booking"}
                      </button>
                    </form>
                  ) : (
                    <p style={{ marginTop: "0.7rem", fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "var(--ink-muted)" }}>
                      {bookings.length === 0 ? "No existing bookings are available to add." : "All listed bookings are already in this trip."}
                    </p>
                  )}
                </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

const labelStyle = {
  display: "grid",
  gap: "0.35rem",
  fontFamily: "var(--font-body)",
  fontSize: "0.75rem",
  color: "var(--ink-soft)",
};

const secondaryButtonStyle = {
  border: "1px solid var(--border)",
  backgroundColor: "transparent",
  color: "var(--ink)",
  padding: "0.45rem 0.7rem",
  fontFamily: "var(--font-body)",
  fontSize: "0.75rem",
  cursor: "pointer",
};
