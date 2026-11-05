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
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
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
    if (!confirmed || reason.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      if (booking.kind === "transport") {
        await cancelTransportRequest(booking.id, reason.trim());
      } else {
        await cancelCategoryRequest(booking.id, reason.trim());
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
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <strong>Cancel this booking</strong>
          <p><strong>Cancellation eligibility:</strong> {booking.cancellation_policy}</p>
          <label>
            Cancellation reason
            <input aria-label="Cancellation reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            Cancel this whole provider booking.
          </label>
          <p>Unpaid simulated bookings have no refund.</p>
          <button type="button" onClick={() => void cancelBooking()} disabled={busy || !confirmed || reason.trim().length < 3}>
            {busy ? "Requesting cancellation…" : "Cancel booking"}
          </button>
        </div>
      )}
      {booking.status === "CANCELLED" && (
        <p role="status">Booking cancelled. Refund is not applicable because this simulated booking was unpaid.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
