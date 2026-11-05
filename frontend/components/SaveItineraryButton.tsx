"use client";

import { useState } from "react";
import { ApiError, saveItineraryRequest } from "@/lib/api";

export default function SaveItineraryButton({
  transactionId,
  offerId,
}: {
  transactionId: string;
  offerId: string;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  async function save() {
    if (state !== "idle") return;
    setState("saving");
    setError("");
    try {
      await saveItineraryRequest(transactionId, offerId);
      setState("saved");
    } catch (requestError: unknown) {
      setState("idle");
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "This itinerary could not be saved. Please try again.",
      );
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={save}
        disabled={state !== "idle"}
        style={{ display: "block", width: "100%", backgroundColor: state === "saved" ? "var(--cream-dark)" : "var(--ink)", color: state === "saved" ? "var(--ink)" : "var(--white)", fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.875rem", letterSpacing: "0.06em", textTransform: "uppercase", border: "none", padding: "0.9rem 0", cursor: state === "idle" ? "pointer" : "default" }}
      >
        {state === "saving" ? "Saving..." : state === "saved" ? "Saved to my trips" : "Save itinerary"}
      </button>
      {error && (
        <p role="alert" style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--orange)", lineHeight: 1.5, marginTop: "0.75rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
