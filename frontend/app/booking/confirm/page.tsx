import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ id?: string }>;
}

export default async function ConfirmedTripPage({ searchParams }: Props) {
  const { id } = await searchParams;
  if (id) redirect(`/trips/bookings/${encodeURIComponent(id)}`);
  redirect("/bookings");
}
