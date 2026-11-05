/**
 * database/models/index.js
 *
 * Mongoose models for the Beckn-Based Travel Discovery Engine (TDE).
 * Mirrors database/README.md — SRS §12 field specs, Beckn lifecycle state machine.
 */

import mongoose from "mongoose";

const { Schema, model, models, Types } = mongoose;

/* ─────────────────────────────── Users ─────────────────────────────── */

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, sparse: true, unique: true },
    passwordHash: { type: String }, // bcrypt; omitted for OTP-only accounts
    role: { type: String, enum: ["traveler", "admin"], default: "traveler" },
    auth: {
      method: { type: String, enum: ["password", "otp"], default: "password" },
      lastLoginAt: Date,
    },
    preferences: {
      homeCity: String,
      preferredModes: [{ type: String, enum: ["flight", "train", "bus"] }],
      currency: { type: String, default: "INR" },
    },
  },
  { timestamps: true },
);

/* ───────────────────────────── Providers ───────────────────────────── */

const providerSchema = new Schema(
  {
    providerId: { type: String, required: true, unique: true }, // Beckn provider id
    name: { type: String, required: true },
    category: { type: String, enum: ["transport", "accommodation", "experience"], required: true },
    adapterEndpoint: { type: String, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    descriptor: {
      longDescription: String,
      images: [String],
      logo: String,
    },
    // GeoJSON — enables GIS proximity queries (SRS FR-11)
    locations: [
      {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], required: true }, // [lng, lat]
      },
    ],
    ttl: { seconds: { type: Number, default: 300 } }, // Beckn TTL for its catalog
  },
  { timestamps: true },
);

providerSchema.index({ locations: "2dsphere" });

/* ────────────────────────────── Catalogs ───────────────────────────── */

const priceSchema = new Schema(
  {
    value: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    type: { type: String, enum: ["per-seat", "per-night", "per-person"], default: "per-seat" },
  },
  { _id: false },
);

const geoPointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false },
);

const catalogSchema = new Schema(
  {
    catalogId: { type: String, required: true, unique: true }, // Beckn item id
    providerRef: { type: Types.ObjectId, ref: "Provider", required: true, index: true },
    category: { type: String, enum: ["transport", "accommodation", "experience"], required: true },
    descriptor: {
      name: { type: String, required: true },
      shortDesc: String,
      longDesc: String,
      images: [String],
    },
    price: { type: priceSchema, required: true },
    availability: {
      status: { type: String, enum: ["available", "sold_out", "unavailable"], default: "available" },
      seats: Number,
      rooms: Number,
      slots: Number,
    },
    timing: {
      departureTime: Date,
      arrivalTime: Date,
      checkInTime: String,
      checkOutTime: String,
      startTime: Date,
    },
    rating: {
      average: { type: Number, min: 0, max: 5, default: 0 },
      count: { type: Number, default: 0 },
    },
    location: geoPointSchema, // stays & experiences — 2dsphere for GIS
    item: { type: Schema.Types.Mixed }, // discriminator payload, see below
    tags: [{ type: String, index: true }], // amenity/feature filters
    ttl: { seconds: { type: Number, default: 300 } },
  },
  { timestamps: true },
);

// Discriminator payloads stored in `item` (validated at service layer or via sub-schema swap)
export const transportItemShape = {
  mode: { type: String, enum: ["flight", "train", "bus"], required: true },
  vehicleNumber: String,
  origin: {
    city: String,
    code: String,
    location: geoPointSchema,
  },
  destination: {
    city: String,
    code: String,
    location: geoPointSchema,
  },
  durationMinutes: Number,
  stops: { type: String, default: "Non-stop" },
};

export const accommodationItemShape = {
  propertyType: String,
  roomType: String,
  address: String,
  checkInTime: String,
  checkOutTime: String,
  amenities: [String],
};

export const experienceItemShape = {
  hostName: String,
  durationMinutes: Number,
  meetingPoint: { address: String, location: geoPointSchema },
  category: { type: String, enum: ["Food", "Culture", "Adventure", "History", "Nature", "Local"] },
  includes: [String],
};

catalogSchema.index({ category: 1, "price.value": 1 });
catalogSchema.index({
  "item.origin.city": 1,
  "item.destination.city": 1,
  "timing.departureTime": 1,
});
catalogSchema.index({ location: "2dsphere" });

/* ─────────────────────────────── Orders ────────────────────────────── */

const ORDER_STATES = ["created", "selected", "initiated", "confirmed", "cancelled", "completed"];

const orderItemSchema = new Schema(
  {
    catalogId: { type: String, required: true },
    descriptor: { name: String, shortDesc: String },
    category: { type: String, enum: ["transport", "accommodation", "experience"] },
    price: priceSchema,
    quantity: { type: Number, default: 1, min: 1 },
    timing: Schema.Types.Mixed, // frozen departure/check-in/start snapshot
  },
  { _id: false },
);

const fulfillmentSchema = new Schema(
  {
    id: String,
    type: { type: String, enum: ["departure", "return", "stay", "activity"] },
    start: {
      time: Date,
      location: { address: String, location: geoPointSchema },
    },
    end: {
      time: Date,
      location: { address: String, location: geoPointSchema },
    },
    vehicle: { category: String, number: String },
    stops: String,
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true }, // Beckn order id
    userRef: { type: Types.ObjectId, ref: "User", required: true, index: true },
    transactionId: { type: String, required: true, index: true }, // Beckn transaction id
    bppId: String,
    bppUri: String,
    status: { type: String, enum: ORDER_STATES, default: "created", index: true },
    items: [orderItemSchema], // denormalized snapshots — frozen at confirm
    fulfillments: [fulfillmentSchema],
    quote: {
      price: priceSchema,
      breakdown: [{ title: String, price: String }],
      ttl: Number,
    },
    payment: {
      type: { type: String, default: "ON-ORDER" },
      status: { type: String, enum: ["paid", "pending", "refunded"], default: "pending" },
      txnRef: String,
      paidAmount: Number,
    },
    cancellation: {
      reasonId: String,
      reason: String,
      cancelledBy: { type: String, enum: ["user", "provider"] },
      refundedAmount: Number,
      refundStatus: { type: String, enum: ["pending", "processed", "not_eligible"] },
    },
    providerReference: String, // provider's own booking reference
    timeline: [{ status: String, at: Date }],
  },
  { timestamps: true },
);

orderSchema.index({ userRef: 1, createdAt: -1 });

/** Beckn state machine — forward-only; cancel allowed only from active states. */
orderSchema.methods.transitionTo = function (next) {
  const allowed = {
    created: ["selected"],
    selected: ["initiated"],
    initiated: ["confirmed"],
    confirmed: ["cancelled", "completed"],
    cancelled: [],
    completed: [],
  };
  if (!allowed[this.status]?.includes(next)) {
    throw new Error(`Invalid order transition: ${this.status} → ${next}`);
  }
  this.status = next;
  this.timeline.push({ status: next, at: new Date() });
  return this.save();
};

/* ────────────────────────── User Journeys ──────────────────────────── */

const journeySchema = new Schema(
  {
    journeyId: { type: String, required: true, unique: true },
    userRef: { type: Types.ObjectId, ref: "User", default: null, index: true },
    sessionId: { type: String, index: true },
    searchCriteria: {
      origin: String,
      destination: String,
      date: Date,
      travellers: { type: Number, min: 1, max: 9 },
      filtersUsed: [String],
      category: { type: String, enum: ["transport", "accommodation", "experience"] },
    },
    stepsCompleted: [
      {
        type: String,
        enum: ["search", "view_results", "select", "init", "confirm"],
      },
    ],
    outcome: { type: String, enum: ["completed", "abandoned"], default: "abandoned" },
    searchLatencyMs: Number, // feeds the <3s KPI
  },
  { timestamps: true },
);

journeySchema.index({ userRef: 1, createdAt: -1 });

/* ────────────────────── Provider Callbacks (ops) ───────────────────── */

const callbackSchema = new Schema(
  {
    action: {
      type: String,
      enum: ["search", "select", "init", "confirm", "status", "track", "cancel"],
      required: true,
      index: true,
    },
    bppId: { type: String, index: true },
    transactionId: { type: String, index: true },
    status: { type: String, enum: ["received", "late", "failed"], required: true },
    latencyMs: Number,
    payload: Schema.Types.Mixed, // raw response, capped
    receivedAt: { type: Date, default: Date.now },
  },
  { capped: { size: 50 * 1024 * 1024 } }, // ~50 MB rolling buffer
);

callbackSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30-day TTL

/* ─────────────────────────────── Export ────────────────────────────── */

export const User = models.User || model("User", userSchema);
export const Provider = models.Provider || model("Provider", providerSchema);
export const Catalog = models.Catalog || model("Catalog", catalogSchema);
export const Order = models.Order || model("Order", orderSchema);
export const UserJourney = models.UserJourney || model("UserJourney", journeySchema);
export const ProviderCallback = models.ProviderCallback || model("ProviderCallback", callbackSchema);

export default { User, Provider, Catalog, Order, UserJourney, ProviderCallback };
