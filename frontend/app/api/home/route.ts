/* ─── /api/home ───────────────────────────────────────────────────
   Stub — returns empty popular options.
   Wire to the real Beckn backend when ready.
───────────────────────────────────────────────────────────────── */
export async function GET() {
  return Response.json({
    popularOptions: [],
    stats: [
      { value: "—", label: "Transport options" },
      { value: "—", label: "Hotels & stays" },
      { value: "—", label: "Local experiences" },
      { value: "—", label: "Average rating" },
    ],
  });
}
