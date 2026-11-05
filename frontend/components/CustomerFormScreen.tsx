"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface CustomerFormScreenProps {
  open: boolean;
  title: string;
  service: string;
  summary: string[];
  priceLabel: string;
  unitPrice: string;
  totalPrice: string;
  quantityLabel: string;
  quantity: number;
  onBack: () => void;
  children: ReactNode;
}

export default function CustomerFormScreen({
  open,
  title,
  service,
  summary,
  priceLabel,
  unitPrice,
  totalPrice,
  quantityLabel,
  quantity,
  onBack,
  children,
}: CustomerFormScreenProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const firstField = dialog?.querySelector<HTMLElement>("input:not([type=checkbox]), select");
    firstField?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onBackRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="customer-screen-backdrop">
      <section
        ref={dialogRef}
        className="customer-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-screen-title"
        tabIndex={-1}
      >
        <ol className="customer-progress" aria-label="Booking progress">
          <li aria-current="step">1. Details</li>
          <li>2. Review</li>
          <li>3. Confirmed</li>
        </ol>
        <div className="customer-screen-layout">
          <div className="customer-form-column">
            <h1 id="customer-screen-title">{title}</h1>
            {children}
          </div>
          <aside className="customer-summary" aria-label="Selected offer summary">
            <p className="customer-summary-kind">{priceLabel}</p>
            <h2>{service}</h2>
            <dl className="customer-summary-details">
              {summary.map((line) => {
                const separator = line.indexOf(":");
                const label = separator < 0 ? "" : line.slice(0, separator).trim();
                const value = separator < 0 ? line : line.slice(separator + 1).trim();
                return (
                  <div key={line}>
                    {label && <dt>{label}</dt>}
                    <dd>{value}</dd>
                  </div>
                );
              })}
            </dl>
            <div className="customer-price-row">
              <span>{unitPrice} × {quantity} {quantityLabel}</span>
              <strong>{totalPrice}</strong>
            </div>
            <div className="customer-total-row">
              <span>Total</span>
              <strong>{totalPrice}</strong>
            </div>
            <button type="button" className="customer-back-link" onClick={onBack}>Back to offer</button>
            <p className="customer-payment-note">Simulated booking only · No payment is collected.</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
