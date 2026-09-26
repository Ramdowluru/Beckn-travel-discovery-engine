export async function POST(request: Request) {
  const body = await request.json() as { email?: string };
  const email = body.email?.trim().toLowerCase() || "traveler@example.com";
  const name = email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
  return Response.json({ user: { name, email, initials: name.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join("") } });
}