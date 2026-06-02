import { configureStore } from "@reduxjs/toolkit";
import { authReducer } from "./authSlice";
import { requestReducer } from "./requestSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    request: requestReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
