import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { PaymentMethod, RequestStatus, ServiceKind } from "../types";

type RequestState = {
  selectedService: ServiceKind;
  status: RequestStatus;
  paymentMethod: PaymentMethod;
};

const initialState: RequestState = {
  selectedService: "towing",
  status: "request_confirmed",
  paymentMethod: "cash"
};

const requestSlice = createSlice({
  name: "request",
  initialState,
  reducers: {
    setSelectedService(state, action: PayloadAction<ServiceKind>) {
      state.selectedService = action.payload;
    },
    setRequestStatus(state, action: PayloadAction<RequestStatus>) {
      state.status = action.payload;
    },
    setPaymentMethod(state, action: PayloadAction<PaymentMethod>) {
      state.paymentMethod = action.payload;
    }
  }
});

export const { setPaymentMethod, setRequestStatus, setSelectedService } = requestSlice.actions;
export const requestReducer = requestSlice.reducer;

