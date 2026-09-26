/* ─────────────────────────────────────────────────────────────────
   Shared mock data — used by results page AND detail pages.
   When the backend is ready, replace these with real API calls.
───────────────────────────────────────────────────────────────── */

export interface TransportOption {
  id: string;
  provider: string;
  type: string;
  departure: string;
  departureCity: string;
  arrival: string;
  arrivalCity: string;
  duration: string;
  stops: string;
  price: string;
  priceNum: number;
  description: string;
  amenities: string[];
  cancellation: string;
  providerNote: string;
}

export interface StayOption {
  id: string;
  provider: string;
  name: string;
  location: string;
  rating: string;
  amenities: string[];
  pricePerNight: string;
  totalPrice: string;
  nights: number;
  image: string;
  images: string[];
  description: string;
  checkIn: string;
  checkOut: string;
  cancellation: string;
  providerNote: string;
}

export interface ExperienceOption {
  id: string;
  provider: string;
  name: string;
  duration: string;
  price: string;
  priceNum: number;
  rating: string;
  category: string;
  image: string;
  images: string[];
  description: string;
  includes: string[];
  meetingPoint: string;
  cancellation: string;
  providerNote: string;
}

/* ─── Transport ───────────────────────────────────────────────── */
export const transportOptions: TransportOption[] = [
  {
    id: "skyconnect-vtz-hyd",
    provider: "SkyConnect",
    type: "FLIGHT",
    departure: "08:20",
    departureCity: "Visakhapatnam",
    arrival: "10:00",
    arrivalCity: "Hyderabad",
    duration: "1h 40m",
    stops: "Non-stop",
    price: "₹4,500",
    priceNum: 4500,
    description:
      "Direct flight from Visakhapatnam (VTZ) to Hyderabad (HYD). Operated by SkyConnect on Airbus A320. Cabin baggage 7 kg included. Check-in baggage 15 kg available.",
    amenities: ["Cabin baggage 7 kg", "In-flight snacks", "USB charging", "Web check-in"],
    cancellation: "Free cancellation up to 24 hrs before departure.",
    providerNote: "Booking goes directly to SkyConnect. No platform markup.",
  },
  {
    id: "airindia-vtz-hyd",
    provider: "Air India",
    type: "FLIGHT",
    departure: "09:30",
    departureCity: "Visakhapatnam",
    arrival: "11:15",
    arrivalCity: "Hyderabad",
    duration: "1h 45m",
    stops: "Non-stop",
    price: "₹5,200",
    priceNum: 5200,
    description:
      "Non-stop Air India service from Visakhapatnam to Hyderabad. Boeing 737-800. Meal included on this route.",
    amenities: ["Cabin baggage 8 kg", "Meal included", "Extra legroom available", "Miles accrual"],
    cancellation: "Cancellation allowed up to 48 hrs. Partial refund applies.",
    providerNote: "Booking goes directly to Air India. No platform markup.",
  },
  {
    id: "railway-12727",
    provider: "Railway 12727",
    type: "TRAIN",
    departure: "06:00",
    departureCity: "Visakhapatnam",
    arrival: "17:30",
    arrivalCity: "Secunderabad Jn",
    duration: "11h 30m",
    stops: "1 stop",
    price: "₹1,200",
    priceNum: 1200,
    description:
      "Godavari Express (12727) from Visakhapatnam to Secunderabad Junction. AC 2-tier sleeper. Pantry car available.",
    amenities: ["AC 2-tier sleeper", "Pantry car", "Bedroll included", "Charging points"],
    cancellation: "Cancel up to 4 hrs before departure for partial refund.",
    providerNote: "Booking processed via Indian Railways. No platform markup.",
  },
  {
    id: "intercity-bus",
    provider: "Intercity",
    type: "BUS",
    departure: "09:00",
    departureCity: "Visakhapatnam",
    arrival: "21:15",
    arrivalCity: "MGBS, Hyderabad",
    duration: "12h 15m",
    stops: "Direct",
    price: "₹950",
    priceNum: 950,
    description:
      "Intercity sleeper bus from Visakhapatnam to Mahatma Gandhi Bus Station, Hyderabad. Volvo A/C Sleeper. Pickup from Dwaraka Bus Stand.",
    amenities: ["A/C Sleeper berth", "Charging point", "Blanket provided", "Water bottle"],
    cancellation: "Free cancellation up to 6 hrs before departure.",
    providerNote: "Booking goes directly to Intercity Bus. No platform markup.",
  },
];

/* ─── Stays ───────────────────────────────────────────────────── */
export const stayOptions: StayOption[] = [
  {
    id: "hotel-minerva-grand",
    provider: "Grande Hotels",
    name: "Hotel Minerva Grand",
    location: "Begumpet, Hyderabad",
    rating: "4.2",
    amenities: ["WiFi", "AC", "Restaurant", "Gym"],
    pricePerNight: "₹2,800",
    totalPrice: "₹5,600",
    nights: 2,
    image: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80",
      "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80",
    ],
    description:
      "A full-service hotel in Begumpet, close to Hyderabad's business and cultural districts. Rooms are spacious with city views. On-site restaurant serves Andhra and continental cuisine.",
    checkIn: "14:00",
    checkOut: "11:00",
    cancellation: "Free cancellation up to 24 hrs before check-in.",
    providerNote: "Booking goes directly to Grande Hotels. No platform markup.",
  },
  {
    id: "modern-loft-apartment",
    provider: "Homes by Priya",
    name: "Modern Loft Apartment",
    location: "Jubilee Hills, Hyderabad",
    rating: "4.5",
    amenities: ["Kitchen", "WiFi", "Workspace"],
    pricePerNight: "₹3,200",
    totalPrice: "₹6,400",
    nights: 2,
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&q=80",
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
    ],
    description:
      "A stylish loft apartment in Jubilee Hills. Fully equipped kitchen, high-speed WiFi, and a dedicated workspace. Ideal for long stays and remote workers. Hosted directly by Priya.",
    checkIn: "13:00",
    checkOut: "11:00",
    cancellation: "Free cancellation up to 48 hrs before check-in.",
    providerNote: "Booking goes directly to the host. No platform markup.",
  },
  {
    id: "hotel-abode",
    provider: "Deccan Heritage Stays",
    name: "Hotel Abode",
    location: "Lakdikapul, Hyderabad",
    rating: "3.8",
    amenities: ["WiFi", "AC", "Parking"],
    pricePerNight: "₹2,200",
    totalPrice: "₹4,400",
    nights: 2,
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
      "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80",
    ],
    description:
      "A heritage-style property in Lakdikapul with comfortable rooms and free parking. Walking distance to Hussain Sagar Lake. Good value for short city stays.",
    checkIn: "12:00",
    checkOut: "10:00",
    cancellation: "Non-refundable. Date changes allowed up to 24 hrs before.",
    providerNote: "Booking goes directly to Deccan Heritage Stays. No platform markup.",
  },
];

/* ─── Experiences ─────────────────────────────────────────────── */
export const experienceOptions: ExperienceOption[] = [
  {
    id: "charminar-heritage-walk",
    provider: "Old City Guides",
    name: "Charminar Heritage Walk",
    duration: "3 hrs",
    price: "₹500",
    priceNum: 500,
    rating: "4.8",
    category: "Culture",
    image: "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&q=80",
      "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80",
    ],
    description:
      "An immersive walking tour through the old city, led by local historians. Covers Charminar, Laad Bazaar, Mecca Masjid, and the surrounding lanes. Small groups only — max 8 people.",
    includes: ["Expert guide", "Entry tickets", "Water bottle", "Map handout"],
    meetingPoint: "Charminar South Gate, 09:00 AM",
    cancellation: "Free cancellation up to 24 hrs before the tour.",
    providerNote: "Booking goes directly to Old City Guides. No platform markup.",
  },
  {
    id: "hyderabad-food-tour",
    provider: "Deccan Culinary Explorers",
    name: "Hyderabad Food Tour",
    duration: "4 hrs",
    price: "₹1,200",
    priceNum: 1200,
    rating: "4.9",
    category: "Food",
    image: "https://images.unsplash.com/photo-1563379091339-03246963d96c?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1563379091339-03246963d96c?w=800&q=80",
      "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=800&q=80",
    ],
    description:
      "A guided food tour through the iconic food streets of Hyderabad. Haleem, Biryani, Mirchi ka Salan, Irani chai, and Osmania biscuits — all covered. Led by a local food writer.",
    includes: ["All food tastings", "Guide", "Cultural context notes"],
    meetingPoint: "Paradise Restaurant, Secunderabad, 07:00 PM",
    cancellation: "Free cancellation up to 12 hrs before the tour.",
    providerNote: "Booking goes directly to Deccan Culinary Explorers. No platform markup.",
  },
  {
    id: "golconda-fort-tour",
    provider: "Heritage Guides",
    name: "Golconda Fort Tour",
    duration: "2.5 hrs",
    price: "₹600",
    priceNum: 600,
    rating: "4.6",
    category: "History",
    image: "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&q=80",
      "https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=800&q=80",
    ],
    description:
      "A guided tour of the 16th-century Golconda Fort, one of the finest examples of medieval military architecture in India. Includes the acoustic demonstration at the main entrance.",
    includes: ["Entry ticket", "Expert guide", "Acoustic demonstration"],
    meetingPoint: "Golconda Fort Main Gate, 08:00 AM",
    cancellation: "Free cancellation up to 24 hrs before the tour.",
    providerNote: "Booking goes directly to Heritage Guides. No platform markup.",
  },
  {
    id: "local-handicrafts-workshop",
    provider: "Telangana Craft Co-op",
    name: "Local Handicrafts Workshop",
    duration: "2 hrs",
    price: "₹1,000",
    priceNum: 1000,
    rating: "4.3",
    category: "Local",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    images: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
      "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=800&q=80",
    ],
    description:
      "Hands-on workshop in traditional Telangana crafts — Nirmal paintings, Bidri work, and Ikat weaving demonstration. Run by artisan cooperative members. You take home what you make.",
    includes: ["All materials", "Artisan instructor", "Take-home craft piece"],
    meetingPoint: "Shilparamam Cultural Village, Gate 2, 10:00 AM",
    cancellation: "Free cancellation up to 24 hrs before the workshop.",
    providerNote: "Booking goes directly to Telangana Craft Co-op. No platform markup.",
  },
];
