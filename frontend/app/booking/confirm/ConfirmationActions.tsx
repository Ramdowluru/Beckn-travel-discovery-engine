"use client";

import { useState } from "react";

interface ConfirmationActionsProps {
  reference: string;
  shareText: string;
}

export default function ConfirmationActions({
  reference,
  shareText,
}: ConfirmationActionsProps) {
  const [status, setStatus] = useState("");

  function downloadTickets() {
    const ticket = `TDE booking confirmation\n\nBooking reference: ${reference}\n\n${shareText}`;
    const blob = new Blob([ticket], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${reference.toLowerCase()}-tickets.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Tickets downloaded");
  }

  async function shareTrip() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "My TDE trip", text: shareText });
        setStatus("Trip shared");
        return;
      }

      await navigator.clipboard.writeText(shareText);
      setStatus("Trip details copied");
    } catch {
      setStatus("Sharing was cancelled");
    }
  }

  return (
    <>
      <button
        onClick={downloadTickets}
        style={{
          display: "block",
          width: "100%",
          backgroundColor: "var(--ink)",
          color: "var(--white)",
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          fontSize: "0.875rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          border: "none",
          padding: "0.9rem 0",
          marginBottom: "0.75rem",
          cursor: "pointer",
          transition: "background-color 0.15s",
        }}
      >
        Download tickets
      </button>

      <button
        onClick={shareTrip}
        style={{
          display: "block",
          width: "100%",
          backgroundColor: "transparent",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
          fontWeight: 400,
          fontSize: "0.875rem",
          letterSpacing: "0.04em",
          border: "1px solid var(--border)",
          padding: "0.9rem 0",
          marginBottom: status ? "0.75rem" : "1.25rem",
          cursor: "pointer",
          transition: "background-color 0.15s",
        }}
      >
        Share trip
      </button>

      {status && (
        <p
          role="status"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "0.72rem",
            color: "var(--ink-muted)",
            textAlign: "center",
            marginBottom: "1.25rem",
          }}
        >
          {status}
        </p>
      )}
    </>
  );
}