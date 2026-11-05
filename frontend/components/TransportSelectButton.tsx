"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CustomerFormScreen from "@/components/CustomerFormScreen";
import { useAuth } from "@/context/AuthContext";
import {
  ApiError,
  confirmTransportRequest,
  getTransportSelectionRequest,
  initTransportRequest,
  refreshTransportBookingStatus,
  selectTransportRequest,
  type TravellerGender,
} from "@/lib/api";

export default function TransportSelectButton({
  offerId,
  transactionId,
  quantity = 1,
  reviewDetails,
  unitPrice,
  totalPrice,
  currency,
}: {
  offerId: string;
  transactionId: string;
  quantity?: number;
  reviewDetails: string[];
  unitPrice: string;
  totalPrice: string;
  currency: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "selecting" | "selected" | "pending">("idle");
  const [quote, setQuote] = useState("");
  const [error, setError] = useState("");
  const [selectionId, setSelectionId] = useState("");
  const [travellerNames, setTravellerNames] = useState<string[]>(() => Array(quantity).fill(""));
  const [travellerGenders, setTravellerGenders] = useState<Array<TravellerGender | "">>(() => Array(quantity).fill(""));
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [initState, setInitState] = useState<"idle" | "initializing" | "initialized" | "pending">("idle");
  const [confirmState, setConfirmState] = useState<"idle" | "confirming" | "confirmed" | "pending" | "failed">("idle");
  const [orderId, setOrderId] = useState("");
  const [finalQuote, setFinalQuote] = useState("");
  const [finalQuoteCurrency, setFinalQuoteCurrency] = useState("");
  const [finalQuoteAmount, setFinalQuoteAmount] = useState("");
  const [quoteBreakup, setQuoteBreakup] = useState<Array<{ title?: string; price?: { currency?: string; value?: string } }>>([]);
  const [priceChanged, setPriceChanged] = useState(false);
  const [acceptedFinalQuote, setAcceptedFinalQuote] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [providerStatusText, setProviderStatusText] = useState("");
  const [cancellationPolicy, setCancellationPolicy] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const bookingReviewRef = useRef<HTMLElement>(null);
  const confirmationNavigatedRef = useRef(false);
  const storageKey = `tde-transport-selection:${user?.id ?? "anonymous"}:${transactionId}:${offerId}`;
  const draftKey = user ? `${storageKey}:customer-draft` : "";

  /* eslint-disable react-hooks/set-state-in-effect -- Restore a saved customer draft only when this offer mount is restored from browser history. */
  useEffect(() => {
    if (!draftKey) {
      setTravellerNames(Array(quantity).fill(""));
      setTravellerGenders(Array(quantity).fill(""));
      setContactEmail("");
      setContactPhone("");
      return;
    }
    setTravellerNames(Array(quantity).fill(""));
    setTravellerGenders(Array(quantity).fill(""));
    setContactEmail("");
    setContactPhone("");
    const savedDraft = window.sessionStorage.getItem(draftKey);
    if (!savedDraft) return;
    try {
      const draft = JSON.parse(savedDraft) as { names?: string[]; genders?: Array<TravellerGender | "">; email?: string; phone?: string };
      if (Array.isArray(draft.names)) setTravellerNames(draft.names);
      if (Array.isArray(draft.genders)) setTravellerGenders(draft.genders);
      if (typeof draft.email === "string") setContactEmail(draft.email);
      if (typeof draft.phone === "string") setContactPhone(draft.phone);
    } catch {
      window.sessionStorage.removeItem(draftKey);
    }
  }, [draftKey, quantity]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function saveDraft(names: string[], genders: Array<TravellerGender | "">, email: string, phone: string) {
    if (!draftKey) return;
    window.sessionStorage.setItem(draftKey, JSON.stringify({ names, genders, email, phone }));
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
    if (result.state === "SELECTED" && !["INITIALIZED", "INIT_REQUESTED", "PENDING_PROVIDER"].includes(result.init_state ?? "")) {
      setCustomerFormOpen(true);
    }
    const details = result.customer_details;
    if (details?.travellers?.length) {
      setTravellerNames(details.travellers.map((traveller) => traveller.name));
      setTravellerGenders(details.travellers.map((traveller) => traveller.gender ?? ""));
    }
    if (details?.contact_email) setContactEmail(details.contact_email);
    if (details?.contact_phone) setContactPhone(details.contact_phone);
    if (result.cancellation_policy) setCancellationPolicy(result.cancellation_policy);
    setPriceChanged(Boolean(result.price_changed));
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
    } else if (result.confirm_state === "PENDING_PROVIDER" || result.confirm_state === "CONFIRM_REQUESTED") {
      setConfirmState("pending");
    } else if (result.confirm_state === "CONFIRM_FAILED") {
      setConfirmState("failed");
      setError(result.confirm_error || "The provider could not confirm this order.");
    }
    if (result.provider_status) {
      const providerOrder = result.provider_status.message?.order;
      if (result.provider_status.error) {
        setProviderStatusText("Provider could not locate the order. The booking outcome remains unchanged and unknown.");
      } else if (providerOrder?.state === "CONFIRMED" && result.confirm_state === "CONFIRMED") {
        setProviderStatusText("Provider confirmation verified.");
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

  function reviewValue(label: string) {
    return reviewDetails.find((detail) => detail.startsWith(`${label}:`))?.slice(label.length + 1).trim() ?? "";
  }

  function displayGender(gender: TravellerGender | "") {
    return {
      female: "Female",
      male: "Male",
      non_binary: "Non-binary",
      prefer_not_to_say: "Prefer not to say",
      "": "",
    }[gender];
  }

  function editCustomerDetails() {
    setEditingDetails(true);
    setCustomerFormOpen(true);
    setAcceptedFinalQuote(false);
  }

  function leaveCustomerEdit() {
    setCustomerFormOpen(false);
    setEditingDetails(false);
  }

  useEffect(() => {
    if (!user) return;
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
  }, [storageKey, user]);

  useEffect(() => {
    if (initState !== "initialized" || editingDetails || confirmState === "confirmed") return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const screen = bookingReviewRef.current;
    screen?.focus();

    function trapTab(event: KeyboardEvent) {
      if (event.key !== "Tab" || !screen) return;
      const focusable = Array.from(screen.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        screen.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", trapTab);
    return () => {
      document.removeEventListener("keydown", trapTab);
      window.requestAnimationFrame(() => {
        if (!document.querySelector('[role="dialog"][aria-modal="true"]')) previousFocus?.focus();
      });
    };
  }, [confirmState, editingDetails, initState]);

  useEffect(() => {
    if (confirmState !== "confirmed" || !selectionId || confirmationNavigatedRef.current) return;
    confirmationNavigatedRef.current = true;
    router.replace(`/booking/confirmation/${encodeURIComponent(selectionId)}`);
  }, [confirmState, router, selectionId]);

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
      if (result.state !== "PENDING") setCustomerFormOpen(true);
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
        travellerNames.map((name, index) => ({
          name: name.trim(),
          ...(travellerGenders[index] ? { gender: travellerGenders[index] as TravellerGender } : {}),
        })),
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
      setCustomerFormOpen(false);
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
        onClick={state === "selected" ? () => setCustomerFormOpen(true) : select}
        disabled={state === "selecting" || state === "pending"}
        style={{ display: "block", width: "100%", backgroundColor: state === "selected" ? "var(--cream-dark)" : "var(--ink)", color: state === "selected" ? "var(--ink)" : "var(--white)", fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.875rem", letterSpacing: "0.06em", textTransform: "uppercase", border: "none", padding: "0.9rem 0", cursor: state === "idle" ? "pointer" : "default" }}
      >
        {state === "selecting" ? "Checking offer..." : state === "selected" ? "Continue with passenger details" : state === "pending" ? "Provider response pending" : "Continue"}
      </button>
      {quote && <p role="status" style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--ink-soft)", marginTop: "0.75rem" }}>Provider quote: {quote}</p>}
      {state === "pending" && <p role="status" style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--ink-soft)", marginTop: "0.75rem" }}>The provider may still be processing this selection. Do not retry blindly.</p>}
      {state === "pending" && selectionId && (
        <button type="button" onClick={() => void refreshStatus()} disabled={refreshing}>
          {refreshing ? "Checking provider outcome..." : "Refresh selection status"}
        </button>
      )}
      {state === "selected" && (initState === "idle" || editingDetails) && (
        <CustomerFormScreen
          open={customerFormOpen}
          title="Passenger details"
          service={reviewDetails.find((detail) => detail.startsWith("Service:"))?.replace("Service:", "").trim() ?? "Selected service"}
          summary={reviewDetails}
          priceLabel="Price per person"
          unitPrice={`${currency} ${unitPrice}`}
          totalPrice={`${currency} ${totalPrice}`}
          quantityLabel={quantity === 1 ? "passenger" : "passengers"}
          quantity={quantity}
          onBack={leaveCustomerEdit}
        >
        <div className="customer-form-content">
          <section className="customer-form-section">
            <h2>Passenger details</h2>
          {travellerNames.map((name, index) => (
            <fieldset key={index} className="customer-person-card">
              <legend>Passenger {index + 1}{index === 0 ? " · Lead" : ""}</legend>
              <label className="customer-field">
                Full name
                <input
                  autoComplete="name"
                  placeholder="Name as shown on ID"
                  aria-label={`Passenger ${index + 1} name`}
                  value={name}
                  aria-invalid={Boolean(fieldErrors[`traveller-${index}`])}
                  onChange={(event) => {
                    const next = travellerNames.map((entry, currentIndex) => currentIndex === index ? event.target.value : entry);
                    setTravellerNames(next);
                    clearFieldError(`traveller-${index}`);
                    saveDraft(next, travellerGenders, contactEmail, contactPhone);
                  }}
                />
                {fieldErrors[`traveller-${index}`] && <span className="field-error" role="alert">{fieldErrors[`traveller-${index}`]}</span>}
              </label>
              <label className="customer-field">
                Gender <span className="customer-optional-label">(optional)</span>
                <select
                  className="customer-room-select"
                  aria-label={`Passenger ${index + 1} gender (optional)`}
                  value={travellerGenders[index] ?? ""}
                  onChange={(event) => {
                    const next = travellerGenders.map((entry, currentIndex) =>
                      currentIndex === index ? event.target.value as TravellerGender | "" : entry,
                    );
                    setTravellerGenders(next);
                    saveDraft(travellerNames, next, contactEmail, contactPhone);
                  }}
                >
                  <option value="">Prefer not to specify</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </label>
            </fieldset>
          ))}
          </section>
          <section className="customer-form-section">
            <h2>Contact details</h2>
          <label className="customer-field">
            Contact email
            <input aria-label="Contact email" type="email" autoComplete="email" required placeholder="you@example.com" value={contactEmail} aria-invalid={Boolean(fieldErrors.email)}
              onChange={(event) => { setContactEmail(event.target.value); clearFieldError("email"); saveDraft(travellerNames, travellerGenders, event.target.value, contactPhone); }} />
            {fieldErrors.email && <span className="field-error" role="alert">{fieldErrors.email}</span>}
          </label>
          <label className="customer-field">
            Contact phone
            <input aria-label="Contact phone" autoComplete="tel" inputMode="tel" placeholder="Phone number" pattern="^\+?[0-9][0-9 ()-]{5,30}[0-9]$" title="Enter a valid contact phone number." value={contactPhone}
              aria-invalid={Boolean(fieldErrors.phone)} onChange={(event) => { setContactPhone(event.target.value); clearFieldError("phone"); saveDraft(travellerNames, travellerGenders, contactEmail, event.target.value); }} />
            {fieldErrors.phone && <span className="field-error" role="alert">{fieldErrors.phone}</span>}
          </label>
          <p className="customer-contact-hint">Your ticket or voucher will be sent to this email.</p>
          </section>
          {error && <p role="alert" className="customer-form-error">{error}</p>}
          <div className="customer-form-actions">
            <button type="button" className="customer-back-button" onClick={leaveCustomerEdit}>Back</button>
            <button type="button" className="offer-primary-action customer-submit" onClick={initialize}>
              {editingDetails ? "Update details" : "Continue"}
            </button>
          </div>
        </div>
        </CustomerFormScreen>
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
      {initState === "initialized" && !editingDetails && confirmState !== "confirmed" && (
        <section
          ref={bookingReviewRef}
          className="booking-review-screen"
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-review-title"
          tabIndex={-1}
        >
          <div className="booking-review-content">
            <ol className="booking-review-progress" aria-label="Booking progress">
              <li className="is-complete"><span>1</span>Details</li>
              <li className="is-current" aria-current="step"><span>2</span>Review</li>
              <li><span>3</span>Confirmed</li>
            </ol>
            <header className="booking-review-heading">
              <p className="tag-neutral">Almost there</p>
              <h1 id="booking-review-title">Review your booking</h1>
              <p>Check the provider’s details and final quote before confirming.</p>
            </header>

            <section className="booking-review-card" aria-labelledby="review-service-heading">
              <h2 id="review-service-heading" className="booking-review-card-title">1 · Selected service</h2>
              <div className="booking-review-service">
                <span className="booking-review-service-mark" aria-hidden="true">T</span>
                <div>
                  <span className="booking-review-badge">{reviewValue("Service") || "Transport"}</span>
                  <h3>{reviewValue("Provider") || "Selected provider"}</h3>
                  <p>{reviewValue("Route")}</p>
                </div>
              </div>
            </section>

            <section className="booking-review-card" aria-labelledby="review-journey-heading">
              <h2 id="review-journey-heading" className="booking-review-card-title">2 · Journey details</h2>
              <dl className="booking-review-rows">
                <div><dt>Route</dt><dd>{reviewValue("Route") || "Not provided"}</dd></div>
                <div><dt>Departure</dt><dd>{reviewValue("Departure") || "Not provided"}</dd></div>
                <div><dt>Arrival</dt><dd>{reviewValue("Arrival") || "Not provided"}</dd></div>
                <div><dt>Passengers</dt><dd>{quantity}</dd></div>
              </dl>
            </section>

            <section className="booking-review-card" aria-labelledby="review-customer-heading">
              <div className="booking-review-card-heading">
                <h2 id="review-customer-heading" className="booking-review-card-title">3 · Customer information</h2>
                {confirmState === "idle" && <button type="button" className="booking-review-edit" onClick={editCustomerDetails}>Edit</button>}
              </div>
              <div className="booking-review-people">
                {travellerNames.map((name, index) => (
                  <div className="booking-review-person" key={`passenger-${index}`}>
                    <span>Passenger {index + 1}{index === 0 ? " · Lead" : ""}</span>
                    <span>{name || "Name unavailable"}{displayGender(travellerGenders[index] ?? "") ? ` · ${displayGender(travellerGenders[index] ?? "")}` : ""}</span>
                  </div>
                ))}
                {contactEmail && <div className="booking-review-person"><span>Email</span><span>{contactEmail}</span></div>}
                {contactPhone && <div className="booking-review-person"><span>Phone</span><span>{contactPhone}</span></div>}
              </div>
            </section>

            <section className="booking-review-card" aria-labelledby="review-policy-heading">
              <h2 id="review-policy-heading" className="booking-review-card-title">4 · Cancellation policy</h2>
              <p className="booking-review-policy">{cancellationPolicy || "The provider has not supplied cancellation policy details for this selection."}</p>
            </section>

            <section className="booking-review-card booking-review-price" aria-labelledby="review-price-heading">
              <h2 id="review-price-heading" className="booking-review-card-title">5 · Price breakdown</h2>
              {quoteBreakup.length > 0 ? quoteBreakup.map((line, index) => (
                <div className="booking-review-price-row" key={`${line.title ?? "line"}-${index}`}>
                  <span>{line.title || "Provider quote"}</span>
                  <strong>{line.price?.currency} {line.price?.value}</strong>
                </div>
              )) : (
                <div className="booking-review-price-row">
                  <span>Final provider quote</span>
                  <strong>{finalQuote}</strong>
                </div>
              )}
              {priceChanged && <p className="booking-review-price-note">The provider returned a different price. Review it carefully before accepting.</p>}
              <div className="booking-review-total"><span>Total</span><strong>{finalQuote || "Quote unavailable"}</strong></div>
              <p className="booking-review-reference">Provider order: {orderId || "Pending reference"}</p>
            </section>

            {providerStatusText && <p role="status" className="booking-review-status">{providerStatusText}</p>}
            {confirmState === "idle" && (
              <div className="booking-review-accept">
                <label>
                  <input
                    type="checkbox"
                    checked={acceptedFinalQuote}
                    onChange={(event) => setAcceptedFinalQuote(event.target.checked)}
                  />
                  <span>I explicitly accept the final provider quote of <strong>{finalQuote || "the amount shown above"}</strong>.</span>
                </label>
                <p>Simulated booking only. No payment is collected. Initialization does not reserve inventory.</p>
              </div>
            )}
            {confirmState === "confirming" && <p role="status" className="booking-review-status">Confirming with the provider…</p>}
            {confirmState === "pending" && <p role="status" className="booking-review-status">Provider confirmation is pending or unknown. Do not retry blindly.</p>}
            {confirmState === "failed" && <p role="alert" className="booking-review-status">{error || "The provider could not confirm this order."}</p>}
            {orderId && confirmState !== "confirming" && (
              <button type="button" className="booking-review-refresh" onClick={() => void checkProviderStatus()} disabled={refreshing}>
                {refreshing ? "Refreshing booking status…" : "Refresh provider status"}
              </button>
            )}
            <div className="booking-review-actions">
              {confirmState === "idle" && <button type="button" className="booking-review-back" onClick={editCustomerDetails}>Back to edit</button>}
              {confirmState === "idle" && (
                <button
                  type="button"
                  className="booking-review-confirm"
                  onClick={() => void confirm()}
                  disabled={!acceptedFinalQuote || !finalQuoteAmount || !finalQuoteCurrency}
                >
                  Confirm booking
                </button>
              )}
            </div>
          </div>
        </section>
      )}
      {initState === "initialized" && !editingDetails && confirmState === "confirmed" && (
        <p role="status">Booking confirmed. Opening the confirmed booking details…</p>
      )}
      {error && <p role="alert" style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--orange)", lineHeight: 1.5, marginTop: "0.75rem" }}>{error}</p>}
    </div>
  );
}
