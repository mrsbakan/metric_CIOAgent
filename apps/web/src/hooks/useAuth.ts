"use client";
import { create } from "zustand";

interface AuthState {
  accessToken:  string | null;
  refreshToken: string | null;
  userId:       string | null;
  tenantId:     string | null;
  setTokens(access: string, refresh: string, userId: string, tenantId: string): void;
  logout(): void;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken:  typeof window !== "undefined" ? localStorage.getItem("access_token")  : null,
  refreshToken: typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null,
  userId:       typeof window !== "undefined" ? localStorage.getItem("user_id")       : null,
  tenantId:     typeof window !== "undefined" ? localStorage.getItem("tenant_id")     : null,

  setTokens(access, refresh, userId, tenantId) {
    localStorage.setItem("access_token",  access);
    localStorage.setItem("refresh_token", refresh);
    localStorage.setItem("user_id",       userId);
    localStorage.setItem("tenant_id",     tenantId);
    set({ accessToken: access, refreshToken: refresh, userId, tenantId });
  },

  logout() {
    localStorage.clear();
    set({ accessToken: null, refreshToken: null, userId: null, tenantId: null });
  },
}));
