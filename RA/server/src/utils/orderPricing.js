import { getDistanceKm } from "./distance.js";

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function calculateFuelPricing(service, fuelType, quantityLiters) {
  const fuelPricePerLiter = Number(service.pricing?.fuelPrices?.[fuelType] || 0);
  const deliveryFee = Number(service.pricing?.flatDeliveryFee || 0);
  const quantitySubtotal = toMoney(fuelPricePerLiter * quantityLiters);

  return {
    currency: service.pricing?.currency || "PKR",
    fuelPricePerLiter,
    quantitySubtotal,
    deliveryFee,
    visitFee: 0,
    towingBaseFee: 0,
    perKmRate: 0,
    routeDistanceKm: 0,
    distanceCharge: 0,
    extraWorkTotal: 0,
    total: toMoney(quantitySubtotal + deliveryFee),
  };
}
