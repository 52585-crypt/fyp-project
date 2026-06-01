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
      providerConfirmed: Boolean(order.payment?.providerConfirmed),
      customerConfirmedAt: order.payment?.customerConfirmedAt || null,
      providerConfirmedAt: order.payment?.providerConfirmedAt || null,
      status: order.payment?.status || "pending",
    },
    customer: {
      id: customer._id?.toString() || order.customer?.toString(),
      name: customer.name,
      phone: customer.phone,
      profilePicture: customer.profilePicture,
    },
    provider: order.provider
      ? {
          id: provider._id?.toString() || order.provider?.toString(),
          name: provider.name,
          phone: provider.phone,
          profilePicture: provider.profilePicture,
        }
      : null,
    activeExtraWorkRequest: mapExtraWorkRequest(activeExtraWorkRequest),
    latestExtraWorkRequest: mapExtraWorkRequest(latestExtraWorkRequest),
    nearbyProviders: Array.isArray(order.nearbyProviders) ? order.nearbyProviders : [],
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function mapNearbyProviders(providers) {
  return providers.slice(0, 12).map((provider) => ({
    id: provider.id,
    name: provider.name,
    distanceKm: Number(provider.distanceKm),
    latitude: Number(provider.currentLatitude),
    longitude: Number(provider.currentLongitude),
  }));
}

async function attachNearbyProvidersToOrder(order) {
  if (!order || order.provider || order.status !== "open") {
    return {
      ...mapOrder(order),
      nearbyProviders: [],
    };
  }

  const nearbyProviders = await findNearbyProviders(
    order.pickupLocation.latitude,
    order.pickupLocation.longitude,
    order.serviceCode,
    DEFAULT_PROVIDER_RADIUS_KM
  );

  return {
    ...mapOrder(order),
    nearbyProviders: mapNearbyProviders(nearbyProviders),
  };
}

async function findServiceByCode(serviceCode) {
  return Service.findOne({ code: serviceCode }).lean();
}

async function findActiveOrderForUser(userId, field) {
  return Order.findOne({
    [field]: userId,
    $or: [
      { status: { $in: ACTIVE_STATUSES } },
      { status: "completed", "payment.status": { $ne: "confirmed" } },
    ],
  })
    .sort({ updatedAt: -1 })
    .populate("service", "name code")
    .populate("customer", "name phone profilePicture")
    .populate("provider", "name phone profilePicture")
    .lean();
}

function updatePaymentStatus(order) {
  if (order.payment.customerConfirmed && order.payment.providerConfirmed) {
    order.payment.status = "confirmed";
  } else if (order.payment.customerConfirmed || order.payment.providerConfirmed) {
    order.payment.status = "partially_confirmed";
  } else {
    order.payment.status = "pending";
  }
}

function ensureProviderOwnsOrder(order, providerId) {
  return order.provider?.toString() === providerId;
}

export async function createOrder(req, res) {
  const {
    serviceCode,
    notes,
    pickupLatitude,
    pickupLongitude,
    pickupAddress,
    destinationLatitude,
    destinationLongitude,
    destinationAddress,
    vehicleMake,
    vehicleModel,
    licensePlate,
    vehicleType,
    fuelType,
    fuelQuantityLiters,
    towingProblemType,
    mechanicCategory,
  } = req.body;

  if (!serviceCode || !licensePlate) {
    return res.status(400).json({ message: "serviceCode and licensePlate are required" });
  }

  const existingActiveOrder = await findActiveOrderForUser(req.user.id, "customer");

  if (existingActiveOrder) {
    return res.status(409).json({ message: "Complete your active order before creating a new one" });
  }

  const service = await findServiceByCode(serviceCode);

  if (!service) {
    return res.status(404).json({ message: "Service not found" });
  }

  const pickupLocation = buildLocation(pickupLatitude, pickupLongitude, pickupAddress);

  if (!pickupLocation) {
    return res.status(400).json({ message: "Valid pickup latitude and longitude are required" });
  }

  let destinationLocation = null;
  let pricing = null;

  if (serviceCode === "fuel_delivery") {
    const quantity = parseFiniteNumber(fuelQuantityLiters);

    if (!service.config?.fuelTypes?.includes(fuelType)) {
      return res.status(400).json({ message: "Invalid fuel type" });
    }

    if (!service.config?.vehicleTypes?.includes(vehicleType)) {
      return res.status(400).json({ message: "Invalid vehicle type" });
    }

    if (!service.config?.quantities?.includes(quantity)) {
      return res.status(400).json({ message: "Invalid fuel quantity" });
    }

    pricing = calculateFuelPricing(service, fuelType, quantity);
  }

  if (serviceCode === "car_towing") {
    destinationLocation = buildLocation(destinationLatitude, destinationLongitude, destinationAddress);

    if (!destinationLocation) {
      return res.status(400).json({ message: "Valid destination latitude and longitude are required" });
    }

    if (!service.config?.problemTypes?.includes(towingProblemType)) {
      return res.status(400).json({ message: "Invalid towing problem type" });
    }

    pricing = calculateTowingPricing(service, pickupLocation, destinationLocation);
  }

  if (serviceCode === "mechanic") {
    const categories = service.config?.categories || [];

    if (!categories.some((entry) => entry.code === mechanicCategory)) {
      return res.status(400).json({ message: "Invalid mechanic category" });
    }

    pricing = calculateMechanicPricing(service, mechanicCategory);
  }

  try {
    const order = await Order.create({
      orderNo: createOrderNumber(),
      customer: req.user.id,
      service: service._id,
      serviceCode,
      status: "open",
      pickupLocation,
      destinationLocation,
      customerVehicle: {
        make: vehicleMake?.trim() || null,
        model: vehicleModel?.trim() || null,
        licensePlate: licensePlate.trim(),
        vehicleType: vehicleType || null,
        fuelType: fuelType || null,
      },
      notes: notes?.trim() || null,
      towingProblemType: towingProblemType || null,
      mechanicCategory: mechanicCategory || null,
      fuelQuantityLiters: serviceCode === "fuel_delivery" ? Number(fuelQuantityLiters) : null,
      pricing,
    });

    await order.populate([
      { path: "service", select: "name code" },
      { path: "customer", select: "name phone profilePicture" },
    ]);

    const nearbyProviders = await findNearbyProviders(
      pickupLocation.latitude,
      pickupLocation.longitude,
      serviceCode,
      DEFAULT_PROVIDER_RADIUS_KM
    );

    return res.status(201).json({
      order: {
        ...mapOrder(order),
        nearbyProviders: mapNearbyProviders(nearbyProviders),
      },
      nearbyProvidersCount: nearbyProviders.length,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to create order", error: error.message });
  }
}

export async function getMyActiveOrder(req, res) {
  try {
    const field = req.user.role === "provider" ? "provider" : "customer";
    const order = await findActiveOrderForUser(req.user.id, field);

    if (!order) {
      return res.json({ order: null });
    }

    return res.json({ order: await attachNearbyProvidersToOrder(order) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch active order", error: error.message });
  }
}

export async function getOrderDetails(req, res) {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid order id" });
  }

  try {
    const order = await Order.findById(id)
      .populate("service", "name code")
      .populate("customer", "name phone profilePicture")
      .populate("provider", "name phone profilePicture")
      .lean();

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

