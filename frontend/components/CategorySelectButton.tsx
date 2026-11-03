"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  cancelCategoryRequest,
  confirmCategoryRequest,
  getCategorySelectionRequest,
  initCategoryRequest,
  refreshCategoryBookingStatus,
  selectCategoryRequest,
  type CategorySelectionResponse,
} from "@/lib/api";

type Category = "hotel" | "experience";

export default function CategorySelectButton({
  kind,
  offerId,
  transactionId,
  quantity,
  peopleCount,
  roomCount = 0,
  reviewDetails,
}: {
  kind: Category;
  offerId: string;
  transactionId: string;
  quantity: number;
  peopleCount: number;
  roomCount?: number;
  reviewDetails: string[];
}) {
  const [selectionState, setSelectionState] = useState<"idle" | "selecting" | "selected" | "pending">("idle");
  const [initState, setInitState] = useState<"idle" | "initializing" | "initialized" | "pending">("idle");
  const [confirmState, setConfirmState] = useState<"idle" | "confirming" | "confirmed" | "pending" | "failed">("idle");
  const [cancelState, setCancelState] = useState<"idle" | "cancelling" | "pending" | "cancelled" | "rejected">("idle");
  const [cancellationReason, setCancellationReason] = useState("");
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [selectionId, setSelectionId] = useState("");
  const [quote, setQuote] = useState("");
  const [orderId, setOrderId] = useState("");
  const [finalQuote, setFinalQuote] = useState("");
  const [finalQuoteCurrency, setFinalQuoteCurrency] = useState("");
  const [finalQuoteAmount, setFinalQuoteAmount] = useState("");
  const [quoteBreakup, setQuoteBreakup] = useState<Array<{ title?: string; price?: { currency?: string; value?: string } }>>([]);
  const [priceChanged, setPriceChanged] = useState(false);
  const [acceptedFinalQuote, setAcceptedFinalQuote] = useState(false);
  const [confirmedService, setConfirmedService] = useState("");
  const [confirmedSchedule, setConfirmedSchedule] = useState("");
  const [providerStatusText, setProviderStatusText] = useState("");
  const [names, setNames] = useState<string[]>(() => Array(peopleCount).fill(""));
  const [roomAssignments, setRoomAssignments] = useState<number[]>(
    () => Array.from({ length: peopleCount }, (_, index) => (index % Math.max(roomCount, 1)) + 1),
  );
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const storageKey = `tde-category-selection:${kind}:${transactionId}:${offerId}`;

  function applyStatus(result: CategorySelectionResponse) {
    setSelectionId(result.selection_id);
    const savedDetails = result.customer_details;
    if (savedDetails?.people?.length) setNames(savedDetails.people.map((person) => person.name));
    if (savedDetails?.room_assignments?.length) setRoomAssignments(savedDetails.room_assignments);
    if (savedDetails?.contact_email) setEmail(savedDetails.contact_email);
    if (savedDetails?.contact_phone) setPhone(savedDetails.contact_phone);
    setSelectionState(["SELECTED", "INITIALIZED", "CONFIRMED", "CANCELLED"].includes(result.state) ? "selected" : "pending");
    if (result.cancellation_policy) setCancellationPolicy(result.cancellation_policy);
    const selectedPrice = result.quote?.price;
    setQuote(selectedPrice?.value ? `${selectedPrice.currency ?? ""} ${selectedPrice.value}`.trim() : "");
    if (result.init_state === "INITIALIZED" || result.state === "INITIALIZED") {
      setInitState("initialized");
      setOrderId(result.order?.id ?? "");
      const finalPrice = result.order?.quote?.price;
      setFinalQuote(finalPrice?.value ? `${finalPrice.currency ?? ""} ${finalPrice.value}`.trim() : "");
      setFinalQuoteCurrency(finalPrice?.currency ?? "");
      setFinalQuoteAmount(finalPrice?.value ?? "");
      setQuoteBreakup(result.order?.quote?.breakup ?? []);
      setPriceChanged(result.price_changed === true);
    } else if (result.init_state === "INIT_REQUESTED" || result.init_state === "PENDING_PROVIDER") {
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
      const result = await refreshCategoryBookingStatus(selectionId);
      applyStatus(result);
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

  async function refresh(id = selectionId) {
    if (!id) return;
    setRefreshing(true);
    setError("");
    try {
      applyStatus(await getCategorySelectionRequest(id));
    } catch (requestError: unknown) {
      setError(requestError instanceof ApiError ? requestError.message : "Booking status could not be refreshed.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const savedId = window.localStorage.getItem(storageKey);
    if (!savedId) return;
    const persistedId = savedId;
    let active = true;
    void getCategorySelectionRequest(persistedId)
      .then((result) => {
        if (active) applyStatus(result);
      })
      .catch(() => {
        if (active) setError("Saved booking status could not be restored.");
      });
    return () => {
      active = false;
    };
  }, [storageKey]);

  async function select() {
    setSelectionState("selecting");
    setError("");
    try {
      const result = await selectCategoryRequest(kind, offerId, transactionId, quantity);
      applyStatus(result);
      window.localStorage.setItem(storageKey, result.selection_id);
    } catch (requestError: unknown) {
      setSelectionState("idle");
      setError(requestError instanceof ApiError ? requestError.message : "Offer selection could not be completed.");
    }
  }

  async function initialize() {
    setInitState("initializing");
    setError("");
    try {
      const result = await initCategoryRequest(
        selectionId,
        names.map((name) => ({ name })),
        kind === "hotel" ? roomAssignments : undefined,
        email,
        phone,
      );
      applyStatus(result);
    } catch (requestError: unknown) {
      setInitState("idle");
      setError(requestError instanceof ApiError ? requestError.message : "Provider initialization could not be completed.");
    }
  }

  async function confirm() {
    if (!finalQuoteCurrency || !finalQuoteAmount || !acceptedFinalQuote) return;
    setConfirmState("confirming");
    setError("");
    try {
      applyStatus(await confirmCategoryRequest(selectionId, {
        currency: finalQuoteCurrency,
        value: finalQuoteAmount,
      }));
    } catch (requestError: unknown) {
      setConfirmState(requestError instanceof ApiError && requestError.status === 409 ? "failed" : "idle");
      setError(requestError instanceof ApiError ? requestError.message : "Provider confirmation could not be completed.");
    }
  }

  async function cancelBooking() {
    if (!confirmCancellation || cancellationReason.trim().length < 3) return;
    setCancelState("cancelling");
    setError("");
    try {
      applyStatus(await cancelCategoryRequest(selectionId, cancellationReason.trim()));
    } catch (requestError: unknown) {
      setCancelState("idle");
      setError(requestError instanceof ApiError ? requestError.message : "Cancellation could not be completed.");
    }
  }

  return (
    <div style={{ display: "grid", gap: "0.65rem" }}>
      <button type="button" onClick={() => void select()} disabled={selectionState !== "idle"}>
        {selectionState === "selecting" ? "Validating with provider…" : selectionState === "selected" ? "Selected" : selectionState === "pending" ? "Provider response pending" : kind === "hotel" ? "Select this stay" : "Select this experience"}
      </button>
      {quote && <p role="status">Provider quote: {quote}</p>}
      {selectionState === "pending" && (
        <button type="button" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? "Checking provider outcome…" : "Refresh selection status"}
        </button>
      )}
      {selectionState === "selected" && initState === "idle" && (
        <div style={{ display: "grid", gap: "0.55rem" }}>
          <strong>{kind === "hotel" ? "Guest details" : "Participant details"}</strong>
          {names.map((name, index) => (
            <label key={index}>
              {kind === "hotel" ? `Guest ${index + 1}` : `Participant ${index + 1}`}
              <input
                aria-label={`${kind === "hotel" ? "Guest" : "Participant"} ${index + 1} name`}
                value={name}
                onChange={(event) => setNames((current) => current.map((entry, currentIndex) => currentIndex === index ? event.target.value : entry))}
              />
              {kind === "hotel" && (
                <select
                  aria-label={`Guest ${index + 1} room`}
                  value={roomAssignments[index]}
                  onChange={(event) => setRoomAssignments((current) => current.map((entry, currentIndex) => currentIndex === index ? Number(event.target.value) : entry))}
                >
                  {Array.from({ length: roomCount }, (_, roomIndex) => (
                    <option key={roomIndex + 1} value={roomIndex + 1}>Room {roomIndex + 1}</option>
                  ))}
                </select>
              )}
            </label>
          ))}
          <label>
            Lead contact email
            <input aria-label="Contact email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Lead contact phone
            <input aria-label="Contact phone" pattern="^\+?[0-9][0-9 ()-]{5,30}[0-9]$" title="Enter a valid contact phone number." value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <button type="button" onClick={() => void initialize()} disabled={names.some((name) => !name.trim()) || !email || !phone}>
            Initialize selected quote
          </button>
        </div>
      )}
      {initState === "initializing" && <p role="status">Initializing with provider…</p>}
      {initState === "pending" && (
        <div>
          <p role="status">Provider initialization is pending. Do not retry blindly.</p>
          {!orderId && <p role="status">Status reconciliation is unavailable until the provider returns an order reference.</p>}
          <button type="button" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? "Checking provider outcome…" : "Refresh initialization status"}
          </button>
        </div>
      )}
      {initState === "initialized" && (
        <div role="status">
          <strong>Review your booking</strong>
          <ul>{reviewDetails.map((detail) => <li key={detail}>{detail}</li>)}</ul>
          <p>{kind === "hotel" ? "Guests" : "Participants"}: {names.map((name, index) => {
            const room = kind === "hotel" ? roomAssignments[index] : undefined;
            return room ? `${name || "Name unavailable"} (Room ${room})` : name || "Name unavailable";
          }).join(", ")}</p>
          {email && <p>Lead contact: {email}</p>}
          {phone && <p>Contact phone: {phone}</p>}
          <p>Provider order: {orderId || "received"}</p>
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
          {priceChanged && <p>The provider changed the price. Explicit acceptance is required before any later confirmation.</p>}
          {confirmState === "idle" && (
            <div>
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
                Confirm booking
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
              <p>{confirmedService || (kind === "hotel" ? "Hotel stay" : "Experience")}</p>
              {confirmedSchedule && <p>{confirmedSchedule}</p>}
              <p>Final price: {finalQuote}</p>
              <p>Payment status: Not paid (simulated; no payment was collected).</p>
              <p>Confirmation is provider-specific; other bookings are independent.</p>
              <p>{cancellationPolicy || "Mock policy: cancel before the scheduled start; no fee; unpaid orders have no refund."}</p>
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
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
