/* ─── /api/transport/[id] ─────────────────────────────────────────
   Stub — always returns 404 until wired to the real backend.
───────────────────────────────────────────────────────────────── */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return Response.json(
    { error: `Transport option '${id}' not found` },
    { status: 404 },
  );
}
