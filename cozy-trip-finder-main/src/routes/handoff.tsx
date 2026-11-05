import { createFileRoute } from "@tanstack/react-router";
import { Page, Section } from "@/components/tde/Shell";

export const Route = createFileRoute("/handoff")({
  head: () => ({
    meta: [
      { title: "Design handoff notes — TDE" },
      { name: "description", content: "Visual improvements and functionality issues requiring developer verification." },
      { property: "og:title", content: "Design handoff notes — TDE" },
      { property: "og:description", content: "Developer annotations for the TDE redesign." },
    ],
  }),
  component: Handoff,
});

const visual = [
  ["Typography", "DM Serif Display for headings, DM Sans for UI, JetBrains Mono for labels and codes."],
  ["Corners", "border-radius: 0 everywhere — enforced globally."],
  ["Layout", "1152px max content width, 8px spacing scale, thin 1px borders."],
  ["Buttons", "Primary (burnt orange) = main action; Ink (black) = choose/view; Outline = secondary; Red = destructive."],
  ["Forms", "Grouped into Journey/Dates, People, Contact sections with inline validation."],
  ["Review", "Five numbered sections then a single Confirm Booking action — no raw provider data."],
  ["Responsive", "Single column below 768px, full-width controls, 44px minimum touch targets, menu-button nav."],
];
const issues = [
  ["Hotel room-count mismatch", "Original flow showed different room counts between details and review. UI now sends rooms separately from guests; backend must verify it stores and returns the same value."],
  ["Date-only timestamps", "Check-in/out are calendar dates. Original showed 05:30 (UTC→IST conversion of a date). Backend must keep them as dates, not timestamps."],
  ["Search-context preservation", "Search is kept in app state; confirm the real app passes it through every step."],
  ["Back/Edit form state", "Entered values are kept as a draft per service; verify in the real app."],
  ["Cancellation integration", "Moved to My Bookings → Booking Details. Verify the provider cancel call and returned status."],
  ["Itinerary grouping", "Built from booking dates; overnight journeys appear with both dates. Verify with real provider data."],
  ["Navigation highlighting", "My Bookings stays highlighted on listing and detail pages."],
  ["Ticket/voucher endpoint", "Prototype downloads a text file; wire the button to the existing endpoint."],
];

function Handoff() {
  return (
    <Page className="max-w-4xl space-y-6">
      <h1 className="text-5xl">Design handoff notes</h1>
      <p className="text-muted-foreground">Flow: Search → Results → Details → Customer details → Review → Confirmation → My Bookings → Booking Details → Cancel. These visuals do not fix the data issues listed below.</p>
      <Section title="Visual / UI improvements">{visual.map(([k, v]) => <p key={k} className="border-b py-2 text-sm last:border-0"><b>{k}.</b> {v}</p>)}</Section>
      <Section title="Functionality & data — needs developer verification">{issues.map(([k, v]) => <p key={k} className="border-b py-2 text-sm last:border-0"><b className="text-destructive">{k}.</b> {v}</p>)}</Section>
    </Page>
  );
}
