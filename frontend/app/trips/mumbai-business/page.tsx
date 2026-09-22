import TripPage from "@/components/TripPage";

export default function MumbaiBusinessTripPage() {
  return <TripPage title="Mumbai Business" status="UPCOMING" route="Visakhapatnam → Mumbai" dates="5 – 6 Nov" included="Flight and hotel" total="₹12,200" description="Review the details of your upcoming Mumbai business trip." actions={[{ label: "Manage booking", href: "/trips/mumbai-business/manage", primary: true }, { label: "Back to my trips", href: "/trips" }]} />;
}