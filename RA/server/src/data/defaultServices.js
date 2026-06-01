export const defaultServices = [
  {
    code: "fuel_delivery",
    name: "Fuel Delivery",
    description: "Emergency fuel delivery for cars and bikes across Lahore.",
    pricing: {
      currency: "PKR",
      flatDeliveryFee: 250,
      fuelPrices: {
        petrol: 272,
        diesel: 280,
      },
    },
    config: {
      fuelTypes: ["petrol", "diesel"],
      vehicleTypes: ["bike", "car"],
      quantities: [1, 2, 5, 10],
    },
  },
  {
    code: "car_towing",
    name: "Car Towing",
    description: "Tow vehicle from pickup point to workshop or destination.",
    pricing: {
      currency: "PKR",
      visitFee: 600,
      towingBaseFee: 2200,
      perKmRate: 180,
    },
