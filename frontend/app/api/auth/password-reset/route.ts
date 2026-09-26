export async function POST(request: Request) {
  const body = await request.json() as { email?: string };
  return Response.json({ message: `A password reset link has been prepared for ${body.email?.trim() || "your email address"}.` });
}