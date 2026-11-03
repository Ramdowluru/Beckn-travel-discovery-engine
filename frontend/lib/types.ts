/* ─────────────────────────────────────────────────────────────────
   Shared domain types — used across API routes, lib/api.ts, and
   page components. No mock data lives here.
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
  currency: string;
  unitPrice: number;
  totalPrice: number;
  travellerCount: number;
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
  totalPrice: string;
  participants: number;
  availability: number;
  date: string;
  time: string;
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
