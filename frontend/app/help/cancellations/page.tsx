import ContentPage from "@/components/ContentPage";

export default function CancellationsPage() {
  return <ContentPage eyebrow="Support" title="Cancellations" description="Cancellation terms are set by the provider you book with." sections={[{ heading: "Before booking", body: "Review the cancellation policy shown on each transport, stay or experience detail page." }, { heading: "After booking", body: "Use the provider's booking channel or contact support for help locating the correct cancellation process." }]} actions={[{ label: "Contact support", href: "/help/contact", primary: true }, { label: "Help center", href: "/help" }]} />;
}