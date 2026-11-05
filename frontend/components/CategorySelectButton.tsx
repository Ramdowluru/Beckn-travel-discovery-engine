"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CustomerFormScreen from "@/components/CustomerFormScreen";
import { useAuth } from "@/context/AuthContext";
import {
  ApiError,
  confirmCategoryRequest,
  getCategorySelectionRequest,
  initCategoryRequest,
  refreshCategoryBookingStatus,
  selectCategoryRequest,
  type CategorySelectionResponse,
  type TravellerGender,
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
  priceLabel,
  unitPrice,
  totalPrice,
  summaryQuantity = peopleCount,
  quantityLabel,
}: {
  kind: Category;
  offerId: string;
  transactionId: string;
  quantity: number;
  peopleCount: number;
  roomCount?: number;
  reviewDetails: string[];
  priceLabel: string;
  unitPrice: string;
  totalPrice: string;
  summaryQuantity?: number;
  quantityLabel: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [selectionState, setSelectionState] = useState<"idle" | "selecting" | "selected" | "pending">("idle");
  const [initState, setInitState] = useState<"idle" | "initializing" | "initialized" | "pending">("idle");
  const [confirmState, setConfirmState] = useState<"idle" | "confirming" | "confirmed" | "pending" | "failed">("idle");
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
  const [editingDetails, setEditingDetails] = useState(false);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [providerStatusText, setProviderStatusText] = useState("");
  const [names, setNames] = useState<string[]>(() => Array(peopleCount).fill(""));
  const [genders, setGenders] = useState<Array<TravellerGender | "">>(() => Array(peopleCount).fill(""));
  const [ages, setAges] = useState<string[]>(() => Array(peopleCount).fill(""));
  const [roomAssignments, setRoomAssignments] = useState<number[]>(
    () => Array.from({ length: peopleCount }, (_, index) => (index % Math.max(roomCount, 1)) + 1),
  );
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const storageKey = `tde-category-selection:${user?.id ?? "anonymous"}:${kind}:${transactionId}:${offerId}`;
  const draftKey = user ? `${storageKey}:customer-draft` : "";
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const confirmationNavigatedRef = useRef(false);
  const reviewDialogRef = useRef<HTMLElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- Restore a saved customer draft only when this offer mount is restored from browser history. */
  useEffect(() => {
    if (!draftKey) {
      setNames(Array(peopleCount).fill(""));
      setGenders(Array(peopleCount).fill(""));
      setAges(Array(peopleCount).fill(""));
      setRoomAssignments(Array.from({ length: peopleCount }, (_, index) => (index % Math.max(roomCount, 1)) + 1));
      setEmail("");
      setPhone("");
      return;
    }
    setNames(Array(peopleCount).fill(""));
    setGenders(Array(peopleCount).fill(""));
    setAges(Array(peopleCount).fill(""));
    setRoomAssignments(Array.from({ length: peopleCount }, (_, index) => (index % Math.max(roomCount, 1)) + 1));
    setEmail("");
    setPhone("");
    const savedDraft = window.sessionStorage.getItem(draftKey);
    if (!savedDraft) return;
    try {
      const draft = JSON.parse(savedDraft) as { names?: string[]; genders?: Array<TravellerGender | "">; ages?: string[]; rooms?: number[]; email?: string; phone?: string };
      if (Array.isArray(draft.names)) setNames(draft.names);
      if (Array.isArray(draft.genders)) setGenders(draft.genders);
      if (Array.isArray(draft.ages)) setAges(draft.ages);
      if (Array.isArray(draft.rooms)) setRoomAssignments(draft.rooms);
      if (typeof draft.email === "string") setEmail(draft.email);
      if (typeof draft.phone === "string") setPhone(draft.phone);
    } catch {
      window.sessionStorage.removeItem(draftKey);
    }
  }, [draftKey, peopleCount, roomCount]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function saveDraft(nextNames: string[], nextGenders: Array<TravellerGender | "">, nextRooms: number[], nextEmail: string, nextPhone: string, nextAges = ages) {
    if (!draftKey) return;
    window.sessionStorage.setItem(draftKey, JSON.stringify({ names: nextNames, genders: nextGenders, ages: nextAges, rooms: nextRooms, email: nextEmail, phone: nextPhone }));
  }

  function clearFieldError(key: string) {
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function applyStatus(result: CategorySelectionResponse) {
    setSelectionId(result.selection_id);
    if (result.state === "SELECTED" && !["INITIALIZED", "INIT_REQUESTED", "PENDING_PROVIDER"].includes(result.init_state ?? "")) {
      setCustomerFormOpen(true);
    }
    const savedDetails = result.customer_details;
    if (savedDetails?.people?.length) {
      setNames(savedDetails.people.map((person) => person.name));
      setGenders(savedDetails.people.map((person) => person.gender ?? ""));
      setAges(savedDetails.people.map((person) => person.age === undefined || person.age === null ? "" : String(person.age)));
    }
    if (savedDetails?.room_assignments?.length) setRoomAssignments(savedDetails.room_assignments);
    if (savedDetails?.contact_email) setEmail(savedDetails.contact_email);
    if (savedDetails?.contact_phone) setPhone(savedDetails.contact_phone);
    setSelectionState(["SELECTED", "INITIALIZED", "CONFIRMED", "CANCELLED"].includes(result.state) ? "selected" : "pending");
    if (result.cancellation_policy) setCancellationPolicy(result.cancellation_policy);
    const selectedPrice = result.quote?.price;
    setQuote(selectedPrice?.value ? `${selectedPrice.currency ?? ""} ${selectedPrice.value}`.trim() : "");
    if (result.init_state === "INITIALIZED" || result.state === "INITIALIZED") {
      setInitState("initialized");
      setAcceptedFinalQuote(false);
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
    if (!user) return;
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
  }, [storageKey, user]);

  useEffect(() => {
    if (confirmState !== "confirmed" || !selectionId || confirmationNavigatedRef.current) return;
    confirmationNavigatedRef.current = true;
    router.replace(`/booking/confirmation/${encodeURIComponent(selectionId)}`);
  }, [confirmState, router, selectionId]);

  useEffect(() => {
    if (initState !== "initialized" || editingDetails) return;
    const dialog = reviewDialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>("input, button:not([disabled])");
    firstFocusable?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setEditingDetails(true);
        setCustomerFormOpen(true);
        setAcceptedFinalQuote(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
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

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editingDetails, initState, kind]);

  async function select() {
    setSelectionState("selecting");
    setError("");
    try {
      const result = await selectCategoryRequest(kind, offerId, transactionId, quantity);
      applyStatus(result);
      window.localStorage.setItem(storageKey, result.selection_id);
      if (result.state !== "PENDING") setCustomerFormOpen(true);
    } catch (requestError: unknown) {
      setSelectionState("idle");
      setError(requestError instanceof ApiError ? requestError.message : "Offer selection could not be completed.");
    }
  }

  async function initialize() {
    const nextErrors: Record<string, string> = {};
    names.forEach((name, index) => {
      if (!name.trim()) nextErrors[`person-${index}`] = `Enter this ${kind === "hotel" ? "guest" : "participant"}'s name.`;
      if (kind === "experience" && ages[index]) {
        const age = Number(ages[index]);
        if (!Number.isInteger(age) || age < 0 || age > 120) {
          nextErrors[`age-${index}`] = "Enter an age from 0 to 120.";
        }
      }
    });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = "Enter a valid email address.";
    if (!/^[+]?[0-9][0-9 ()-]{5,30}[0-9]$/.test(phone)) nextErrors.phone = "Enter a valid contact phone number.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setInitState("initializing");
    setError("");
    try {
      const result = await initCategoryRequest(
        selectionId,
        names.map((name, index) => ({
          name,
          ...(genders[index] ? { gender: genders[index] as TravellerGender } : {}),
          ...(kind === "experience" && ages[index] ? { age: Number(ages[index]) } : {}),
        })),
        kind === "hotel" ? roomAssignments : undefined,
        email,
        phone,
      );
      applyStatus(result);
      setEditingDetails(false);
      setCustomerFormOpen(false);
      setAcceptedFinalQuote(false);
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

  function closeCustomerForm() {
    setCustomerFormOpen(false);
    if (initState === "initialized") {
      setEditingDetails(false);
      setAcceptedFinalQuote(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "0.65rem" }}>
      <button
        type="button"
        className={`offer-primary-action${selectionState === "selected" ? " offer-selection-complete" : ""}`}
        onClick={() => selectionState === "selected" ? setCustomerFormOpen(true) : void select()}
        disabled={selectionState === "selecting" || selectionState === "pending"}
      >
        {selectionState === "selecting" ? "Checking offer…" : selectionState === "selected" ? `Continue with ${kind === "hotel" ? "guest" : "participant"} details` : selectionState === "pending" ? "Provider response pending" : "Continue"}
      </button>
      {quote && <p role="status">Provider quote: {quote}</p>}
      {selectionState === "pending" && (
        <button type="button" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? "Checking provider outcome…" : "Refresh selection status"}
        </button>
      )}
      {selectionState === "selected" && (initState === "idle" || editingDetails) && (
        <CustomerFormScreen
          open={customerFormOpen}
          title={kind === "hotel" ? "Guest details" : "Participant details"}
          service={reviewDetails.find((detail) => detail.startsWith(kind === "hotel" ? "Stay:" : "Activity:"))?.split(":").slice(1).join(":").trim() ?? "Selected service"}
          summary={reviewDetails}
          priceLabel={priceLabel}
          unitPrice={unitPrice}
          totalPrice={totalPrice}
          quantityLabel={quantityLabel}
          quantity={summaryQuantity}
          onBack={closeCustomerForm}
        >
        <div className="customer-form-content">
          {kind === "hotel" && (
            <section className="customer-form-section stay-guest-stay-summary" aria-label="Selected stay details">
              <h2>Stay details</h2>
              <div>
                {reviewDetails.filter((detail) => /^(Check-in|Check-out|Rooms|Guests):/.test(detail)).map((detail) => {
                  const separator = detail.indexOf(":");
                  return <p key={detail}><span>{detail.slice(0, separator)}</span><strong>{detail.slice(separator + 1).trim()}</strong></p>;
                })}
              </div>
            </section>
          )}
          {kind === "experience" && (
            <section className="customer-form-section experience-selection-summary" aria-label="Selected experience details">
              <h2>Experience date &amp; participants</h2>
              <div>
                {reviewDetails.filter((detail) => /^(Date|Time|Participants):/.test(detail)).map((detail) => {
                  const separator = detail.indexOf(":");
                  return <p key={detail}><span>{detail.slice(0, separator)}</span><strong>{detail.slice(separator + 1).trim()}</strong></p>;
                })}
              </div>
              <p className="experience-criteria-hint">Date and participant count are fixed for this provider quote. Return to results to change them.</p>
            </section>
          )}
          <section className="customer-form-section">
            <h2>{kind === "hotel" ? "Guest details" : "Participant details"}</h2>
          {names.map((name, index) => (
            <fieldset key={index} className={`customer-person-card${kind === "hotel" ? " hotel-customer-person" : ""}`}>
              <legend>{kind === "hotel" ? `Guest ${index + 1}` : `Participant ${index + 1}`}{index === 0 ? " · Lead" : ""}</legend>
              {kind === "experience" && (
                <div className="experience-participant-fields">
                  <label className="customer-field">
                    Full name
                    <input
                      autoComplete="name"
                      placeholder="Full name"
                      aria-label={`Participant ${index + 1} name`}
                      value={name}
                      aria-invalid={Boolean(fieldErrors[`person-${index}`])}
                      onChange={(event) => {
                        const next = names.map((entry, currentIndex) => currentIndex === index ? event.target.value : entry);
                        setNames(next);
                        clearFieldError(`person-${index}`);
                        saveDraft(next, genders, roomAssignments, email, phone);
                      }}
                    />
                    {fieldErrors[`person-${index}`] && <span className="field-error" role="alert">{fieldErrors[`person-${index}`]}</span>}
                  </label>
                  <label className="customer-field">
                    Age <span className="customer-optional-label">(optional)</span>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      inputMode="numeric"
                      aria-label={`Participant ${index + 1} age (optional)`}
                      value={ages[index] ?? ""}
                      aria-invalid={Boolean(fieldErrors[`age-${index}`])}
                      onChange={(event) => {
                        const next = ages.map((entry, currentIndex) => currentIndex === index ? event.target.value : entry);
                        setAges(next);
                        clearFieldError(`age-${index}`);
                        saveDraft(names, genders, roomAssignments, email, phone, next);
                      }}
                    />
                    {fieldErrors[`age-${index}`] && <span className="field-error" role="alert">{fieldErrors[`age-${index}`]}</span>}
                  </label>
                </div>
              )}
              {kind !== "experience" && (
              <label className="customer-field">
                Full name
                <input
                  autoComplete="name"
                  placeholder="Full name"
                  aria-label={`${kind === "hotel" ? "Guest" : "Participant"} ${index + 1} name`}
                  value={name}
                  aria-invalid={Boolean(fieldErrors[`person-${index}`])}
                  onChange={(event) => {
                    const next = names.map((entry, currentIndex) => currentIndex === index ? event.target.value : entry);
                    setNames(next);
                    clearFieldError(`person-${index}`);
                    saveDraft(next, genders, roomAssignments, email, phone);
                  }}
                />
                {fieldErrors[`person-${index}`] && <span className="field-error" role="alert">{fieldErrors[`person-${index}`]}</span>}
              </label>
              )}
              <label className="customer-field">
                Gender <span className="customer-optional-label">(optional)</span>
                <select
                  className="customer-room-select"
                  aria-label={`${kind === "hotel" ? "Guest" : "Participant"} ${index + 1} gender (optional)`}
                  value={genders[index] ?? ""}
                  onChange={(event) => {
                    const next = genders.map((entry, currentIndex) =>
                      currentIndex === index ? event.target.value as TravellerGender | "" : entry,
                    );
                    setGenders(next);
                    saveDraft(names, next, roomAssignments, email, phone);
                  }}
                >
                  <option value="">Prefer not to specify</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </label>
              {kind === "hotel" && (
                <label className="customer-field">
                  Room
                  <select className="customer-room-select"
                  aria-label={`Guest ${index + 1} room`}
                  value={roomAssignments[index]}
                  onChange={(event) => {
                    const next = roomAssignments.map((entry, currentIndex) => currentIndex === index ? Number(event.target.value) : entry);
                    setRoomAssignments(next);
                    saveDraft(names, genders, next, email, phone);
                  }}
                >
                  {Array.from({ length: roomCount }, (_, roomIndex) => (
                    <option key={roomIndex + 1} value={roomIndex + 1}>Room {roomIndex + 1}</option>
                  ))}
                  </select>
                </label>
              )}
            </fieldset>
          ))}
          </section>
          <section className="customer-form-section">
            <h2>Contact details</h2>
          <label className="customer-field">
            Contact email
            <input aria-label="Contact email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} aria-invalid={Boolean(fieldErrors.email)}
              onChange={(event) => { setEmail(event.target.value); clearFieldError("email"); saveDraft(names, genders, roomAssignments, event.target.value, phone); }} />
            {fieldErrors.email && <span className="field-error" role="alert">{fieldErrors.email}</span>}
          </label>
          <label className="customer-field">
            Contact phone
            <input aria-label="Contact phone" autoComplete="tel" inputMode="tel" placeholder="Phone number" pattern="^\+?[0-9][0-9 ()-]{5,30}[0-9]$" title="Enter a valid contact phone number." value={phone}
              aria-invalid={Boolean(fieldErrors.phone)} onChange={(event) => { setPhone(event.target.value); clearFieldError("phone"); saveDraft(names, genders, roomAssignments, email, event.target.value); }} />
            {fieldErrors.phone && <span className="field-error" role="alert">{fieldErrors.phone}</span>}
          </label>
          <p className="customer-contact-hint">Your booking details will be sent to this email.</p>
          </section>
          {error && <p role="alert" className="customer-form-error">{error}</p>}
          <div className="customer-form-actions">
            <button type="button" className="customer-back-button" onClick={closeCustomerForm}>Back</button>
            <button type="button" className="offer-primary-action customer-submit" onClick={() => void initialize()}>
              {editingDetails ? "Update details" : "Continue"}
            </button>
          </div>
        </div>
        </CustomerFormScreen>
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
      {initState === "initialized" && !editingDetails && (
        kind === "hotel" ? (
          <div className="stay-review-backdrop">
          <section ref={reviewDialogRef} className="stay-review" role="dialog" aria-modal="true" aria-labelledby="stay-review-title" tabIndex={-1}>
            <ol className="stay-booking-progress" aria-label="Booking progress">
              <li>1. Details</li>
              <li aria-current="step">2. Review</li>
              <li>3. Confirmed</li>
            </ol>
            <p className="stay-review-kicker">Almost there</p>
            <h2 id="stay-review-title">Review your stay</h2>
            <p className="stay-review-intro">Please check your reservation details before confirming.</p>
            <div className="stay-review-grid">
              <div className="stay-review-main">
                <section className="stay-review-card">
                  <h3>Reservation details</h3>
                  {reviewDetails.filter((detail) => /^(Stay|Location|Check-in|Check-out|Rooms|Guests):/.test(detail)).map((detail) => {
                    const separator = detail.indexOf(":");
                    return <p key={detail}><span>{detail.slice(0, separator)}</span><strong>{detail.slice(separator + 1).trim()}</strong></p>;
                  })}
                  <p><span>Provider order</span><strong>{orderId || "Received"}</strong></p>
                </section>
                <section className="stay-review-card">
                  <h3>Guest information</h3>
                  <ul>{names.map((name, index) => (
                    <li key={`${name}-${index}`}>
                      <strong>{name || "Name unavailable"}</strong>
                      <span>{roomAssignments[index] ? `Room ${roomAssignments[index]}` : "Lead guest"}{genders[index] ? ` · ${genders[index]}` : ""}</span>
                    </li>
                  ))}</ul>
                  <p><span>Contact email</span><strong>{email || "Not provided"}</strong></p>
                  <p><span>Contact phone</span><strong>{phone || "Not provided"}</strong></p>
                </section>
                <section className="stay-review-card">
                  <h3>Cancellation policy</h3>
                  <p className="stay-review-policy">{cancellationPolicy || "Review the provider cancellation policy before confirming."}</p>
                </section>
              </div>
              <aside className="stay-review-price-card">
                <h3>Price breakdown</h3>
                {quoteBreakup.map((line, index) => (
                  <p key={`${line.title ?? "line"}-${index}`}>
                    <span>{line.title || "Stay charge"}</span>
                    <strong>{line.price?.currency} {line.price?.value}</strong>
                  </p>
                ))}
                {!quoteBreakup.length && <p><span>Provider quote</span><strong>{finalQuote}</strong></p>}
                <div className="stay-review-total"><span>Total</span><strong>{finalQuote}</strong></div>
                {priceChanged && <p className="stay-review-price-change" role="status">The provider updated the price from {quote} to {finalQuote}. Your acceptance is required before confirming.</p>}
                <p className="stay-review-terms">Simulated booking only. No payment is collected and initialization does not reserve inventory.</p>
                {providerStatusText && <p role="status" className="stay-review-status">{providerStatusText}</p>}
                {orderId && <button className="stay-review-text-button" type="button" onClick={() => void checkProviderStatus()} disabled={refreshing}>
                  {refreshing ? "Refreshing…" : "Refresh provider status"}
                </button>}
                <label className="stay-review-accept">
                  <input type="checkbox" checked={acceptedFinalQuote} onChange={(event) => setAcceptedFinalQuote(event.target.checked)} />
                  <span>I accept the final quote of <strong>{finalQuote}</strong>.</span>
                </label>
                <div className="stay-review-actions">
                  <button type="button" onClick={() => { setEditingDetails(true); setCustomerFormOpen(true); setAcceptedFinalQuote(false); }}>Edit guest details</button>
                  <button type="button" onClick={() => void confirm()} disabled={!acceptedFinalQuote || !finalQuoteAmount || !finalQuoteCurrency || confirmState !== "idle"}>
                    {confirmState === "confirming" ? "Confirming…" : "Confirm stay"}
                  </button>
                </div>
                {confirmState === "pending" && <p role="status" className="stay-review-status">Provider confirmation is pending or unknown. Check booking status before taking further action.</p>}
                {confirmState === "failed" && <p role="alert" className="stay-review-status">{error || "The provider could not confirm this stay."}</p>}
              </aside>
            </div>
          </section>
          </div>
        ) : (
          <div className="stay-review-backdrop">
            <section ref={reviewDialogRef} className="stay-review experience-review" role="dialog" aria-modal="true" aria-labelledby="experience-review-title" tabIndex={-1}>
              <ol className="stay-booking-progress" aria-label="Booking progress">
                <li>1. Details</li>
                <li aria-current="step">2. Review</li>
                <li>3. Confirmed</li>
              </ol>
              <p className="stay-review-kicker">Almost there</p>
              <h2 id="experience-review-title">Review your booking</h2>
              <p className="stay-review-intro">Check the experience details and participant information before confirming.</p>
              <div className="stay-review-grid">
                <div className="stay-review-main">
                  <section className="stay-review-card">
                    <h3>Selected experience</h3>
                    {reviewDetails.filter((detail) => /^(Activity|Provider):/.test(detail)).map((detail) => {
                      const separator = detail.indexOf(":");
                      return <p key={detail}><span>{detail.slice(0, separator)}</span><strong>{detail.slice(separator + 1).trim()}</strong></p>;
                    })}
                    <p><span>Provider order</span><strong>{orderId || "Received"}</strong></p>
                  </section>
                  <section className="stay-review-card">
                    <h3>Reservation details</h3>
                    {reviewDetails.filter((detail) => /^(Date|Time|Meeting point|Participants):/.test(detail)).map((detail) => {
                      const separator = detail.indexOf(":");
                      return <p key={detail}><span>{detail.slice(0, separator)}</span><strong>{detail.slice(separator + 1).trim()}</strong></p>;
                    })}
                  </section>
                  <section className="stay-review-card">
                    <h3>Customer information</h3>
                    <ul>{names.map((name, index) => (
                      <li key={`${name}-${index}`}>
                        <strong>{name || "Name unavailable"}{ages[index] ? ` · Age ${ages[index]}` : ""}</strong>
                        <span>{index === 0 ? "Lead participant" : `Participant ${index + 1}`}{genders[index] ? ` · ${genders[index]}` : ""}</span>
                      </li>
                    ))}</ul>
                    <p><span>Email</span><strong>{email || "Not provided"}</strong></p>
                    <p><span>Phone</span><strong>{phone || "Not provided"}</strong></p>
                  </section>
                  <section className="stay-review-card">
                    <h3>Cancellation policy</h3>
                    <p className="stay-review-policy">{cancellationPolicy || reviewDetails.find((detail) => detail.startsWith("Cancellation policy:"))?.split(":").slice(1).join(":").trim() || "Review the provider cancellation policy before confirming."}</p>
                  </section>
                </div>
                <aside className="stay-review-price-card">
                  <h3>Price breakdown</h3>
                  {quoteBreakup.map((line, index) => (
                    <p key={`${line.title ?? "line"}-${index}`}>
                      <span>{line.title || "Experience charge"}</span>
                      <strong>{line.price?.currency} {line.price?.value}</strong>
                    </p>
                  ))}
                  {!quoteBreakup.length && <p><span>Provider quote</span><strong>{finalQuote}</strong></p>}
                  <div className="stay-review-total"><span>Total</span><strong>{finalQuote}</strong></div>
                  {priceChanged && <p className="stay-review-price-change" role="status">The provider updated the price from {quote} to {finalQuote}. Your acceptance is required before confirming.</p>}
                  <p className="stay-review-terms">Simulated booking only. No payment is collected. Availability is not reserved by initialization.</p>
                  {providerStatusText && <p role="status" className="stay-review-status">{providerStatusText}</p>}
                  {orderId && <button className="stay-review-text-button" type="button" onClick={() => void checkProviderStatus()} disabled={refreshing}>
                    {refreshing ? "Refreshing…" : "Refresh provider status"}
                  </button>}
                  <label className="stay-review-accept">
                    <input type="checkbox" checked={acceptedFinalQuote} onChange={(event) => setAcceptedFinalQuote(event.target.checked)} />
                    <span>I accept the final quote of <strong>{finalQuote}</strong>.</span>
                  </label>
                  <div className="stay-review-actions">
                    <button type="button" onClick={() => { setEditingDetails(true); setCustomerFormOpen(true); setAcceptedFinalQuote(false); }}>Edit participant details</button>
                    <button type="button" onClick={() => void confirm()} disabled={!acceptedFinalQuote || !finalQuoteAmount || !finalQuoteCurrency || confirmState !== "idle"}>
                      {confirmState === "confirming" ? "Confirming…" : "Confirm booking"}
                    </button>
                  </div>
                  {confirmState === "pending" && <p role="status" className="stay-review-status">Provider confirmation is pending or unknown. Check booking status before taking further action.</p>}
                  {confirmState === "failed" && <p role="alert" className="stay-review-status">{error || "The provider could not confirm this experience."}</p>}
                </aside>
              </div>
            </section>
          </div>
        )
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
