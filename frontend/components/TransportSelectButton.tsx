"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ApiError,
  cancelTransportRequest,
  confirmTransportRequest,
  getTransportSelectionRequest,
  initTransportRequest,
  refreshTransportBookingStatus,
  selectTransportRequest,
} from "@/lib/api";

export default function TransportSelectButton({
  offerId,
  transactionId,
  quantity = 1,
  reviewDetails,
}: {
  offerId: string;
  transactionId: string;
  quantity?: number;
  reviewDetails: string[];
}) {
  const [state, setState] = useState<"idle" | "selecting" | "selected" | "pending">("idle");
  const [quote, setQuote] = useState("");
  const [error, setError] = useState("");
  const [selectionId, setSelectionId] = useState("");
  const [travellerNames, setTravellerNames] = useState<string[]>(() => Array(quantity).fill(""));
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [initState, setInitState] = useState<"idle" | "initializing" | "initialized" | "pending">("idle");
  const [confirmState, setConfirmState] = useState<"idle" | "confirming" | "confirmed" | "pending" | "failed">("idle");
  const [cancelState, setCancelState] = useState<"idle" | "cancelling" | "pending" | "cancelled" | "rejected">("idle");
  const [cancellationReason, setCancellationReason] = useState("");
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [finalQuote, setFinalQuote] = useState("");
  const [finalQuoteCurrency, setFinalQuoteCurrency] = useState("");
  const [finalQuoteAmount, setFinalQuoteAmount] = useState("");
  const [quoteBreakup, setQuoteBreakup] = useState<Array<{ title?: string; price?: { currency?: string; value?: string } }>>([]);
  const [acceptedFinalQuote, setAcceptedFinalQuote] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [confirmedService, setConfirmedService] = useState("");
  const [confirmedSchedule, setConfirmedSchedule] = useState("");
  const [providerStatusText, setProviderStatusText] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const storageKey = `tde-transport-selection:${transactionId}:${offerId}`;
  const draftKey = `${storageKey}:customer-draft`;

  /* eslint-disable react-hooks/set-state-in-effect -- Restore a saved customer draft only when this offer mount is restored from browser history. */
  useEffect(() => {
    const savedDraft = window.sessionStorage.getItem(draftKey);
    if (!savedDraft) return;
    try {
      const draft = JSON.parse(savedDraft) as { names?: string[]; email?: string; phone?: string };
      if (Array.isArray(draft.names)) setTravellerNames(draft.names);
      if (typeof draft.email === "string") setContactEmail(draft.email);
      if (typeof draft.phone === "string") setContactPhone(draft.phone);
    } catch {
      window.sessionStorage.removeItem(draftKey);
    }
  }, [draftKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function saveDraft(names: string[], email: string, phone: string) {
    window.sessionStorage.setItem(draftKey, JSON.stringify({ names, email, phone }));
  }

  function clearFieldError(key: string) {
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function applySelectionStatus(result: Awaited<ReturnType<typeof getTransportSelectionRequest>>) {
    setSelectionId(result.selection_id);
    const details = result.customer_details;
    if (details?.travellers?.length) setTravellerNames(details.travellers.map((traveller) => traveller.name));
    if (details?.contact_email) setContactEmail(details.contact_email);
    if (details?.contact_phone) setContactPhone(details.contact_phone);
    if (result.cancellation_policy) setCancellationPolicy(result.cancellation_policy);
    setQuote(result.quote?.price?.value
      ? `${result.quote.price.currency ?? ""} ${result.quote.price.value}`.trim()
      : "");
    setState(["SELECTED", "INITIALIZED", "CONFIRMED", "CANCELLED"].includes(result.state) ? "selected" : "pending");
    if (result.init_state === "INITIALIZED" || result.state === "INITIALIZED") {
      setInitState("initialized");
      setAcceptedFinalQuote(false);
      setOrderId(result.order?.id ?? "");
      const value = result.order?.quote?.price?.value;
      setFinalQuote(value
        ? `${result.order?.quote?.price?.currency ?? ""} ${value}`.trim()
        : "");
      setFinalQuoteCurrency(result.order?.quote?.price?.currency ?? "");
      setFinalQuoteAmount(value ?? "");
      setQuoteBreakup(result.order?.quote?.breakup ?? []);
    } else if (result.init_state === "PENDING_PROVIDER" || result.init_state === "INIT_REQUESTED") {
      setInitState("pending");
    }
    if (result.confirm_state === "CONFIRMED") {
      setConfirmState("confirmed");
      const confirmedOrder = result.confirmed_order?.message?.order;
      const itemName = confirmedOrder?.items?.[0]?.descriptor?.name;
      if (itemName) setConfirmedService(itemName);
      const fulfillment = confirmedOrder?.fulfillments?.[0];
      const start = fulfillment?.start?.time?.timestamp
        ?? fulfillment?.stops?.find((stop) => stop.type === "START")?.time?.timestamp;
      const end = fulfillment?.end?.time?.timestamp
        ?? fulfillment?.stops?.find((stop) => stop.type === "END")?.time?.timestamp;
      if (start) {
        const startDate = new Date(start).toLocaleString();
        const endDate = end ? ` – ${new Date(end).toLocaleString()}` : "";
        setConfirmedSchedule(`${startDate}${endDate}`);
      }
    } else if (result.confirm_state === "PENDING_PROVIDER" || result.confirm_state === "CONFIRM_REQUESTED") {
      setConfirmState("pending");
    } else if (result.confirm_state === "CONFIRM_FAILED") {
      setConfirmState("failed");
      setError(result.confirm_error || "The provider could not confirm this order.");
    }
    if (result.cancel_state === "CANCELLED") {
      setCancelState("cancelled");
      const reason = result.cancelled_order?.message?.order?.cancellation?.reason?.descriptor?.short_desc;
      if (reason) setCancellationReason(reason);
    } else if (["CANCEL_REQUESTED", "PENDING_PROVIDER"].includes(result.cancel_state ?? "")) {
      setCancelState("pending");
    } else if (result.cancel_state === "CANCEL_REJECTED") {
      setCancelState("rejected");
      setError(result.cancel_error || "The provider rejected cancellation.");
    }
    if (result.provider_status) {
      const providerOrder = result.provider_status.message?.order;
      if (result.provider_status.error) {
        setProviderStatusText("Provider could not locate the order. The booking outcome remains unchanged and unknown.");
      } else if (providerOrder?.state === "CONFIRMED" && result.confirm_state === "CONFIRMED") {
        setProviderStatusText("Provider confirmation verified.");
      } else if (providerOrder?.state === "CANCELLED" && result.cancel_state === "CANCELLED") {
        setProviderStatusText("Provider cancellation verified.");
      } else if (providerOrder?.state === "CONFIRMED") {
        setProviderStatusText("Provider reports confirmed, but the BAP booking remains unresolved.");
      } else if (providerOrder?.state === "INITIALIZED" && ["CONFIRM_REQUESTED", "PENDING_PROVIDER"].includes(result.confirm_state ?? "")) {
        setProviderStatusText("Provider reports initialized; confirmation is still pending or unknown.");
      } else if (providerOrder?.state === "INITIALIZED") {
        setProviderStatusText("Provider reports initialized. Inventory is not reserved until confirmation.");
      }
    }
  }

  async function checkProviderStatus() {
    if (!selectionId) return;
    setRefreshing(true);
    setError("");
    try {
      const result = await refreshTransportBookingStatus(selectionId);
      applySelectionStatus(result);
      if (result.status_message) setProviderStatusText(result.status_message);
      if (result.status_state === "PENDING_PROVIDER") {
        setProviderStatusText("Provider status is pending or unknown; booking state was not changed.");
      }
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "Provider status could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function confirm() {
    if (!acceptedFinalQuote || !finalQuoteCurrency || !finalQuoteAmount) return;
    setConfirmState("confirming");
    setError("");
    try {
      applySelectionStatus(await confirmTransportRequest(selectionId, {
        currency: finalQuoteCurrency,
        value: finalQuoteAmount,
      }));
    } catch (requestError: unknown) {
      setConfirmState("idle");
      setError(requestError instanceof ApiError ? requestError.message : "Provider confirmation could not be completed.");
    }
  }

  async function cancelBooking() {
    if (!confirmCancellation || cancellationReason.trim().length < 3) return;
    setCancelState("cancelling");
    setError("");
    try {
      applySelectionStatus(await cancelTransportRequest(selectionId, cancellationReason.trim()));
    } catch (requestError: unknown) {
      setCancelState("idle");
      setError(requestError instanceof ApiError ? requestError.message : "Cancellation could not be completed.");
    }
  }

  async function refreshStatus(id = selectionId) {
    if (!id) return;
    setRefreshing(true);
    try {
      applySelectionStatus(await getTransportSelectionRequest(id));
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "Selection status could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const savedId = window.localStorage.getItem(storageKey);
    if (!savedId) return;
    const persistedId = savedId;
    let active = true;
    async function restoreStatus() {
      try {
        const result = await getTransportSelectionRequest(persistedId);
        if (active) applySelectionStatus(result);
      } catch {
        if (active) setError("Saved selection status could not be restored.");
      }
    }
    void restoreStatus();
    return () => {
      active = false;
    };
  }, [storageKey]);

  async function select() {
    setState("selecting");
    setError("");
    try {
      const result = await selectTransportRequest(offerId, transactionId, quantity);
      const value = result.quote?.price?.value;
      const currency = result.quote?.price?.currency ?? "";
      setQuote(value ? `${currency} ${value}` : "");
      setSelectionId(result.selection_id);
      window.localStorage.setItem(storageKey, result.selection_id);
      setState(result.state === "PENDING" ? "pending" : "selected");
    } catch (requestError: unknown) {
      setState("idle");
      setError(requestError instanceof ApiError ? requestError.message : "Selection could not be completed.");
    }

  }

  async function initialize() {
    const nextErrors: Record<string, string> = {};
    travellerNames.forEach((name, index) => {
      if (!name.trim()) nextErrors[`traveller-${index}`] = "Enter this passenger's name.";
    });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) nextErrors.email = "Enter a valid email address.";
    if (!/^\+?[0-9][0-9 ()-]{5,30}[0-9]$/.test(contactPhone)) nextErrors.phone = "Enter a valid contact phone number.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setInitState("initializing");
    setError("");
    try {
      const result = await initTransportRequest(
        selectionId,
        travellerNames.map((name) => ({ name: name.trim() })),
        contactEmail,
        contactPhone,
      );
      applySelectionStatus(result);
      setOrderId(result.order?.id ?? "");
      const finalValue = result.order?.quote?.price?.value;
      const finalCurrency = result.order?.quote?.price?.currency ?? "";
      setFinalQuote(finalValue ? `${finalCurrency} ${finalValue}` : "");
      setFinalQuoteCurrency(finalCurrency);
      setFinalQuoteAmount(finalValue ?? "");
      setInitState(result.state === "PENDING" ? "pending" : "initialized");
      setEditingDetails(false);
      setAcceptedFinalQuote(false);
      if (result.price_changed) {
        setError("The provider returned a changed quote. Explicit acceptance is required before any later confirmation.");
      }
    } catch (requestError: unknown) {
      setInitState("idle");
      setError(requestError instanceof ApiError ? requestError.message : "Initialization could not be completed.");
    }
  }

  return (
    <div>
      <button
        type="button"
        className={`offer-primary-action${state === "selected" ? " offer-selection-complete" : ""}`}
        onClick={select}
        disabled={state === "selecting" || state === "selected" || state === "pending"}
        style={{ display: "block", width: "100%", backgroundColor: state === "selected" ? "var(--cream-dark)" : "var(--ink)", color: state === "selected" ? "var(--ink)" : "var(--white)", fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.875rem", letterSpacing: "0.06em", textTransform: "uppercase", border: "none", padding: "0.9rem 0", cursor: state === "idle" ? "pointer" : "default" }}
      >
        {state === "selecting" ? "Checking offer..." : state === "selected" ? "Offer checked" : state === "pending" ? "Provider response pending" : "Continue"}
      </button>
      {quote && <p role="status" style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--ink-soft)", marginTop: "0.75rem" }}>Provider quote: {quote}</p>}
      {state === "pending" && <p role="status" style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--ink-soft)", marginTop: "0.75rem" }}>The provider may still be processing this selection. Do not retry blindly.</p>}
      {state === "pending" && selectionId && (
        <button type="button" onClick={() => void refreshStatus()} disabled={refreshing}>
          {refreshing ? "Checking provider outcome..." : "Refresh selection status"}
        </button>
      )}
      {state === "selected" && (initState === "idle" || editingDetails) && (
        <div style={{ marginTop: "1rem", display: "grid", gap: "0.6rem" }}>
          <strong>Passenger details</strong>
          {travellerNames.map((name, index) => (
            <label key={index}>
              Passenger {index + 1} name
              <input
                aria-label={`Passenger ${index + 1} name`}
                value={name}
                aria-invalid={Boolean(fieldErrors[`traveller-${index}`])}
                onChange={(event) => {
                  const next = travellerNames.map((entry, currentIndex) => currentIndex === index ? event.target.value : entry);
                  setTravellerNames(next);
                  clearFieldError(`traveller-${index}`);
                  saveDraft(next, contactEmail, contactPhone);
                }}
              />
              {fieldErrors[`traveller-${index}`] && <span className="field-error" role="alert">{fieldErrors[`traveller-${index}`]}</span>}
            </label>
          ))}
          <label>
            Lead contact email
            <input aria-label="Contact email" type="email" required value={contactEmail} aria-invalid={Boolean(fieldErrors.email)}
              onChange={(event) => { setContactEmail(event.target.value); clearFieldError("email"); saveDraft(travellerNames, event.target.value, contactPhone); }} />
            {fieldErrors.email && <span className="field-error" role="alert">{fieldErrors.email}</span>}
          </label>
          <label>
            Lead contact phone
            <input aria-label="Contact phone" pattern="^\+?[0-9][0-9 ()-]{5,30}[0-9]$" title="Enter a valid contact phone number." value={contactPhone}
              aria-invalid={Boolean(fieldErrors.phone)} onChange={(event) => { setContactPhone(event.target.value); clearFieldError("phone"); saveDraft(travellerNames, contactEmail, event.target.value); }} />
            {fieldErrors.phone && <span className="field-error" role="alert">{fieldErrors.phone}</span>}
          </label>
          <button type="button" className="offer-primary-action" onClick={initialize}>
            {editingDetails ? "Update and reinitialize" : "Continue"}
          </button>
        </div>
      )}
      {initState === "initializing" && <p role="status">Initializing with provider...</p>}
      {initState === "pending" && (
        <div>
          <p role="status">Provider initialization is pending. Do not retry blindly.</p>
          {!orderId && <p role="status">Status reconciliation is unavailable until the provider returns an order reference.</p>}
          <button type="button" onClick={() => void refreshStatus()} disabled={refreshing}>
            {refreshing ? "Checking provider outcome..." : "Refresh initialization status"}
          </button>
        </div>
      )}
      {initState === "initialized" && !editingDetails && (
        <div role="status" style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--ink-soft)", marginTop: "0.75rem" }}>
          <strong>Review your booking</strong>
          <ul>{reviewDetails.map((detail) => <li key={detail}>{detail}</li>)}</ul>
          <p>Passengers: {travellerNames.map((name) => name || "Name unavailable").join(", ")}</p>
          {contactEmail && <p>Lead contact: {contactEmail}</p>}
          {contactPhone && <p>Contact phone: {contactPhone}</p>}
          <p>Initialized provider order: {orderId || "received"}</p>
          {finalQuote && <p>Final provider quote: {finalQuote}</p>}
          {quoteBreakup.map((line, index) => (
            <p key={`${line.title ?? "line"}-${index}`}>{line.title}: {line.price?.currency} {line.price?.value}</p>
          ))}
          {providerStatusText && <p role="status">{providerStatusText}</p>}
          {orderId && (
            <button type="button" onClick={() => void checkProviderStatus()} disabled={refreshing}>
              {refreshing ? "Refreshing booking status…" : "Refresh booking status"}
            </button>
          )}
          {confirmState === "idle" && (
            <button type="button" onClick={() => {
              setEditingDetails(true);
              setAcceptedFinalQuote(false);
            }}>
              Edit customer details
            </button>
          )}
          {confirmState === "idle" && (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <label>
                <input
                  type="checkbox"
                  checked={acceptedFinalQuote}
                  onChange={(event) => setAcceptedFinalQuote(event.target.checked)}
                />
                I explicitly accept the final quote of {finalQuote}.
              </label>
              <p>Simulated booking only. No real payment or payment details are collected.</p>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={!acceptedFinalQuote || !finalQuoteAmount || !finalQuoteCurrency}
              >
                Confirm simulated booking
              </button>
            </div>
          )}
          {confirmState === "confirming" && <p role="status">Confirming with provider…</p>}
          {confirmState === "pending" && (
            <div>
              <p role="status">Provider confirmation is pending or unknown. Do not retry blindly.</p>
            </div>
          )}
          {confirmState === "confirmed" && (
            <div>
              <strong>Booking confirmed</strong>
              <p>Provider reference: {orderId || "received"}</p>
              <p>{confirmedService || "Transport service"}</p>
              {confirmedSchedule && <p>{confirmedSchedule}</p>}
              <p>Final price: {finalQuote}</p>
              <p>Payment status: Not paid (simulated; no payment was collected).</p>
              <p>Confirmation applies only to this provider order.</p>
              <p>{cancellationPolicy || "Mock policy: cancel before the scheduled departure; no fee; unpaid orders have no refund."}</p>
              <p><a href="/bookings">View My Bookings</a></p>
              <p><Link href="/trips">Add to trip</Link></p>
              {cancelState === "cancelled" && (
                <div role="status">
                  <strong>Booking cancelled</strong>
                  <p>Cancellation was recorded by the provider.</p>
                  {cancellationReason && <p>Reason: {cancellationReason}</p>}
                  <p>Refund: Not applicable; this simulated booking was unpaid.</p>
                </div>
              )}
              {cancelState === "pending" && <p role="status">Cancellation is pending or unknown. Refresh booking status; do not retry.</p>}
              {cancelState === "cancelling" && <p role="status">Requesting cancellation from the provider…</p>}
              {cancelState === "rejected" && <p role="alert">{`Cancellation rejected: ${error || "provider policy"}`}</p>}
              {cancelState === "idle" && (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <label>
                    Cancellation reason
                    <input
                      aria-label="Cancellation reason"
                      value={cancellationReason}
                      onChange={(event) => setCancellationReason(event.target.value)}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmCancellation}
                      onChange={(event) => setConfirmCancellation(event.target.checked)}
                    />
                    Cancel this whole provider booking.
                  </label>
                  <button
                    type="button"
                    onClick={() => void cancelBooking()}
                    disabled={!confirmCancellation || cancellationReason.trim().length < 3}
                  >
                    Cancel booking
                  </button>
                </div>
              )}
            </div>
          )}
          {confirmState !== "confirmed" && <p>Payment is simulated only. Initialization does not reserve inventory.</p>}
        </div>
      )}
      {error && <p role="alert" style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--orange)", lineHeight: 1.5, marginTop: "0.75rem" }}>{error}</p>}
    </div>
  );
}
