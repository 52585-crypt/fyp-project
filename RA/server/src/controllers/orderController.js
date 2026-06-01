import mongoose from "mongoose";
import { DEFAULT_PROVIDER_RADIUS_KM } from "../config/dispatch.js";
import { Order, ProviderProfile, Service } from "../models/index.js";
import { findNearbyProviders } from "../services/providerService.js";
import {
  calculateFuelPricing,
  calculateMechanicPricing,
  calculateTowingPricing,
} from "../utils/orderPricing.js";
import { getDistanceKm } from "../utils/distance.js";

const ACTIVE_STATUSES = [
  "open",
  "assigned",
  "arrived",
  "inspection_pending",
  "awaiting_extra_work_approval",
  "in_progress",
  "awaiting_fuel_confirmation",
  "tow_in_transit",
];

function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}

function parseFiniteNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function buildLocation(latitude, longitude, address = "") {
  const parsedLatitude = parseFiniteNumber(latitude);
  const parsedLongitude = parseFiniteNumber(longitude);

  if (parsedLatitude == null || parsedLongitude == null) {
    return null;
  }

  return {
    latitude: parsedLatitude,
    longitude: parsedLongitude,
    address: address?.trim() || null,
  };
}

function createOrderNumber() {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RR-${Date.now()}-${suffix}`;
}

function mapExtraWorkRequest(request) {
  if (!request) {
    return null;
  }

  return {
    id: request._id.toString(),
    providerNote: request.providerNote,
    status: request.status,
    requestedTotal: Number(request.requestedTotal),
    approvedTotal: Number(request.approvedTotal),
    respondedAt: request.respondedAt,
    items: request.items.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      description: item.description,
      partsCost: Number(item.partsCost),
      laborCost: Number(item.laborCost),
      quantity: Number(item.quantity),
      lineTotal: Number(item.lineTotal),
      customerDecision: item.customerDecision,
      decisionAt: item.decisionAt,
    })),
    createdAt: request.createdAt,
  };
}

function mapOrder(order) {
  const customer = order.customer || {};
  const provider = order.provider || {};
  const service = order.service || {};
  const activeExtraWorkRequest = [...(order.extraWorkRequests || [])]
    .reverse()
    .find((entry) => entry.status === "pending");
  const latestExtraWorkRequest = [...(order.extraWorkRequests || [])].reverse()[0] || null;

  return {
    id: order._id.toString(),
    orderNo: order.orderNo,
    serviceId: service._id?.toString() || order.service?.toString(),
    serviceCode: order.serviceCode,
    serviceName: service.name,
    status: order.status,
    notes: order.notes,
    pickupLocation: order.pickupLocation,
    destinationLocation: order.destinationLocation,
    customerVehicle: order.customerVehicle,
    towingProblemType: order.towingProblemType,
    mechanicCategory: order.mechanicCategory,
    fuelQuantityLiters: Number(order.fuelQuantityLiters || 0),
    pricing: {
      currency: order.pricing.currency,
      fuelPricePerLiter: Number(order.pricing.fuelPricePerLiter),
      quantitySubtotal: Number(order.pricing.quantitySubtotal),
      deliveryFee: Number(order.pricing.deliveryFee),
      visitFee: Number(order.pricing.visitFee),
      towingBaseFee: Number(order.pricing.towingBaseFee),
      perKmRate: Number(order.pricing.perKmRate),
      routeDistanceKm: Number(order.pricing.routeDistanceKm),
      distanceCharge: Number(order.pricing.distanceCharge),
      extraWorkTotal: Number(order.pricing.extraWorkTotal),
      total: Number(order.pricing.total),
    },
    tracking: {
      providerLatitude: order.tracking?.providerLatitude ?? null,
      providerLongitude: order.tracking?.providerLongitude ?? null,
      providerUpdatedAt: order.tracking?.providerUpdatedAt || null,
      arrivedAt: order.tracking?.arrivedAt || null,
      startedAt: order.tracking?.startedAt || null,
      fuelDeliveredAt: order.tracking?.fuelDeliveredAt || null,
      fuelConfirmedAt: order.tracking?.fuelConfirmedAt || null,
      completedAt: order.tracking?.completedAt || null,
      sosRaisedAt: order.tracking?.sosRaisedAt || null,
      sosMessage: order.tracking?.sosMessage || null,
    },
    payment: {
      method: order.payment?.method || "cash_on_delivery",
      customerConfirmed: Boolean(order.payment?.customerConfirmed),
