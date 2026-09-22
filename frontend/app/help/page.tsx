import ContentPage from "@/components/ContentPage";

export default function HelpPage() {
  return <ContentPage eyebrow="Support" title="How can we help?" description="Find answers about searching, bookings, provider payments and trip changes." sections={[{ heading: "Using TDE", body: "Search across transport, stays and experiences, then choose the provider that fits your journey." }, { heading: "Booking support", body: "TDE connects you directly with providers. Booking-specific changes follow the provider's terms." }, { heading: "Still need help?", body: "Our support team can point you to the right provider or explain the next step." }]} actions={[{ label: "Cancellations", href: "/help/cancellations" }, { label: "Contact support", href: "/help/contact", primary: true }]} />;
}