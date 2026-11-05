import { redirect } from "next/navigation";

export default function TripsHistoryPage() {
  redirect("/bookings?date=past&status=all");
}