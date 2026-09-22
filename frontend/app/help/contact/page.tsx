import ContentPage from "@/components/ContentPage";

export default function ContactPage() {
  return <ContentPage eyebrow="Support" title="Contact us" description="Tell us what you need help with and we will guide you to the right provider or resource." sections={[{ heading: "Email", body: "support@tde.travel" }, { heading: "Response time", body: "Support requests are reviewed during business hours, Monday through Friday." }, { heading: "Booking details", body: "Include your booking reference and provider name when asking about an existing trip." }]} actions={[{ label: "Help center", href: "/help", primary: true }]} />;
}