import mongoose from "mongoose";
import { connectDatabase } from "../config/db.js";
import { ProviderProfile, User } from "../models/index.js";
import { hashPassword } from "../utils/auth.js";
import { seedServices } from "./seedServices.js";

const demoPassword = "Demo@123";

const demoAccounts = [
  {
    role: "user",
    name: "Demo Customer",
    phone: "03000000001",
    profilePicture: null,
  },
  {
    role: "provider",
    name: "Ali Fuel Rescue",
    phone: "03000000002",
    profilePicture: null,
    providerProfile: {
      cnic: "3520212345671",
      serviceCodes: ["fuel_delivery"],
      city: "Lahore",
      currentLatitude: 24.8615,
      currentLongitude: 67.0099,
      isPremium: true,
    },
  },
  {
    role: "provider",
    name: "Hassan Tow Works",
    phone: "03000000003",
    profilePicture: null,
    providerProfile: {
      cnic: "3520212345672",
      serviceCodes: ["car_towing"],
      city: "Lahore",
      currentLatitude: 24.8558,
      currentLongitude: 67.0127,
      isPremium: false,
    },
  },
  {
    role: "provider",
    name: "Bilal Mobile Mechanic",
    phone: "03000000004",
    profilePicture: null,
    providerProfile: {
