import mongoose from "mongoose";
import { Offer, ProviderProfile, Service, ServiceRequest } from "../models/index.js";
import { findNearbyProviders } from "../services/providerService.js";
import { getDistanceKm, getExtraDistanceCharge } from "../utils/distance.js";

function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}

function parseFiniteNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function mapOffer(offer) {
  const provider = offer.provider || {};

  return {
    id: offer._id.toString(),
    requestId: offer.request?._id?.toString() || offer.request?.toString(),
    providerId: provider._id?.toString() || offer.provider?.toString(),
    providerName: provider.name,
    price: Number(offer.price),
    estimatedMinutes: offer.estimatedMinutes,
    message: offer.message,
    distanceKm: Number(offer.distanceKm),
    extraDistanceCharge: Number(offer.extraDistanceCharge),
    status: offer.status,
  };
}

function mapRequest(request) {
  const service = request.service || {};
  const user = request.user || {};

  return {
    id: request._id.toString(),
    description: request.description,
    vehicleNumber: request.vehicleNumber,
    status: request.status,
    serviceName: service.name,
    latitude: Number(request.currentLatitude),
    longitude: Number(request.currentLongitude),
    userName: user.name,
    basePrice: Number(service.basePrice),
    extraPerKm: Number(service.extraPerKm),
    acceptedOfferId: request.acceptedOffer?.toString() || null,
  };
}

async function canProviderViewRequest(providerId, requestId) {
  return Boolean(await Offer.exists({ provider: providerId, request: requestId }));
}

export async function createRequest(req, res) {
  const { serviceId, description, vehicleNumber, latitude, longitude } = req.body;
  const currentLatitude = parseFiniteNumber(latitude);
  const currentLongitude = parseFiniteNumber(longitude);

  if (!serviceId || !description || !vehicleNumber || currentLatitude == null || currentLongitude == null) {
    return res.status(400).json({
      message: "serviceId, description, vehicleNumber, latitude and longitude are required",
    });
  }

  if (!isValidObjectId(serviceId)) {
    return res.status(400).json({ message: "Invalid serviceId" });
  }

  try {
    const service = await Service.findById(serviceId);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    const request = await ServiceRequest.create({
      user: req.user.id,
      service: service._id,
      description,
      vehicleNumber,
      currentLatitude,
      currentLongitude,
    });

    await request.populate([
      { path: "service", select: "name basePrice extraPerKm" },
      { path: "user", select: "name" },
    ]);

    const nearbyProviders = await findNearbyProviders(currentLatitude, currentLongitude, 4);

    return res.status(201).json({
      request: mapRequest(request),
      nearbyProviders,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to create request", error: error.message });
  }
}

export async function getRequestDetails(req, res) {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid request id" });
  }

  try {
    const request = await ServiceRequest.findById(id)
      .populate("service", "name basePrice extraPerKm")
      .populate("user", "name")
      .lean();

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    const isOwner = request.user?._id?.toString() === req.user.id;
    const providerCanView = req.user.role === "provider" && (await canProviderViewRequest(req.user.id, request._id));

    if (req.user.role === "user" && !isOwner) {
      return res.status(403).json({ message: "Forbidden" });
