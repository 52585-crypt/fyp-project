import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type AuthState = {
  token: string | null;
  user: { id: string; name: string; phone: string } | null;
  isAuthenticated: boolean;
};

const initialState: AuthState = {
  token: null,
  user: null,
  isAuthenticated: false
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<AuthState>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      state.isAuthenticated = Boolean(action.payload.token);
    },
    clearCredentials(state) {
      state.token = null;
      state.user = null;
      state.isAuthenticated = false;
    }
  }
});

export const { clearCredentials, setCredentials } = authSlice.actions;
export const authReducer = authSlice.reducer;
