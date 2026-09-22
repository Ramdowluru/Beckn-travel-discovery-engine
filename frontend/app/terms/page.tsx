import ContentPage from "@/components/ContentPage";

export default function TermsPage() {
  return <ContentPage eyebrow="Legal" title="Terms of service" description="These terms describe the current demonstration experience for TDE." sections={[{ heading: "The TDE role", body: "TDE is a discovery interface. Bookings, payments, fulfillment and provider policies are handled by the relevant partner." }, { heading: "Catalog information", body: "Listings and prices in this frontend are illustrative mock data and should not be treated as live availability." }, { heading: "Use of this demo", body: "Use the service for evaluation and demonstration purposes only." }]} actions={[{ label: "Privacy policy", href: "/privacy" }, { label: "Back home", href: "/", primary: true }]} />;
}