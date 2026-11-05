export async function POST(request: Request) {
  const body = await request.json() as { name?: string; email?: string; code?: string };
  if (body.code !== "246810") return Response.json({ error: "That verification code is not correct." }, { status: 400 });
  const name = body.name?.trim() || "Guest traveler";
  const email = body.email?.trim().toLowerCase() || "traveler@example.com";
  return Response.json({ user: { name, email, initials: name.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join("") } });
}