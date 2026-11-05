"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  cancelCategoryRequest,
  cancelTransportRequest,
  getBookingRequest,
  refreshCategoryBookingStatus,
  refreshTransportBookingStatus,
  type BookingRecord,
} from "@/lib/api";

export default function BookingManagement({ booking: initialBooking }: { booking: BookingRecord }) {
  const router = useRouter();
  const [booking, setBooking] = useState(initialBooking);
  const [reason, setReason] = useState("Booked by mistake");
  const [otherReason, setOtherReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [showCancellation, setShowCancellation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const cancellationPending = ["CANCEL_REQUESTED", "PENDING_PROVIDER"].includes(booking.cancel_state ?? "");

  useEffect(() => {
    if (!refreshCooldown) return;
    const timeout = window.setTimeout(() => setRefreshCooldown(false), 15_000);
    return () => window.clearTimeout(timeout);
  }, [refreshCooldown]);

  async function reload() {
    setBooking(await getBookingRequest(booking.id));
  }

  async function refreshStatus() {
    if (busy || refreshCooldown) return;
    setBusy(true);
    setError("");
    setRefreshCooldown(true);
    try {
      if (booking.kind === "transport") {
        await refreshTransportBookingStatus(booking.id);
      } else {
        await refreshCategoryBookingStatus(booking.id);
      }
      await reload();
      router.refresh();
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "Booking status could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking() {
    const cancellationReason = reason === "Other" ? otherReason.trim() : reason;
    if (!confirmed || cancellationReason.length < 3) return;
    setBusy(true);
    setError("");
    try {
      if (booking.kind === "transport") {
        await cancelTransportRequest(booking.id, cancellationReason);
      } else {
        await cancelCategoryRequest(booking.id, cancellationReason);
      }
      await reload();
      router.refresh();
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "Cancellation could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Manage booking" style={{ display: "grid", gap: "0.75rem", marginTop: "1.5rem" }}>
      {(booking.status !== "CANCELLED" && booking.status !== "REJECTED") && (
        <button type="button" onClick={() => void refreshStatus()} disabled={busy || refreshCooldown}>
          {busy ? "Refreshing…" : refreshCooldown ? "Status refresh available soon" : "Refresh booking status"}
        </button>
      )}
      {booking.status === "PENDING_UNKNOWN" && (
        <p role="status">Outcome is pending or unknown. Refresh status to reconcile; do not resubmit the action.</p>
      )}
      {cancellationPending && (
        <p role="status">Cancellation is pending or unknown. Refresh status; do not resubmit.</p>
      )}
      {booking.cancel_state === "CANCEL_REJECTED" && (
        <p role="alert">The provider rejected the cancellation request. The booking remains confirmed.</p>
      )}
      {booking.status === "CONFIRMED" && !cancellationPending && booking.cancel_state !== "CANCEL_REJECTED" && (
        <>
          {!showCancellation ? (
            <button type="button" className="booking-cancel-trigger" onClick={() => setShowCancellation(true)}>Cancel Booking</button>
          ) : (
            <div className="booking-cancellation-panel">
              <h2>⚠ Cancel this booking</h2>
              <p>{booking.cancellation_policy || "Cancellation is subject to provider approval."} This cancels the whole provider booking.</p>
              <label htmlFor="booking-cancel-reason">Reason for cancellation</label>
              <select id="booking-cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
                <option>Booked by mistake</option>
                <option>Change of plans</option>
                <option>Found an alternative</option>
                <option>Other</option>
              </select>
              {reason === "Other" && (
                <input
                  aria-label="Other cancellation reason"
                  placeholder="Tell us why you are cancelling"
                  value={otherReason}
                  onChange={(event) => setOtherReason(event.target.value)}
                />
              )}
              <label className="booking-cancel-confirm">
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                I understand this cancels the entire provider booking and cannot be undone.
              </label>
              <p className="booking-cancel-footnote">This simulated booking is unpaid; no refund will be issued.</p>
              <div className="booking-cancel-actions">
                <button type="button" className="booking-keep-button" onClick={() => setShowCancellation(false)} disabled={busy}>Keep Booking</button>
                <button
                  type="button"
                  className="booking-confirm-cancel"
                  onClick={() => void cancelBooking()}
                  disabled={busy || !confirmed || (reason === "Other" && otherReason.trim().length < 3)}
                >
                  {busy ? "Requesting…" : "Confirm Cancellation"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {booking.status === "CANCELLED" && (
        <p role="status">Booking cancelled. Refund is not applicable because this simulated booking was unpaid.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
