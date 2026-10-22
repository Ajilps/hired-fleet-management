import { create } from "zustand";
export type PartnerUser = {
  id: string;
  companyId: string;
  fullName: string;
  email: string;
  isActive: true;
  role: "partner";
  passwordChangeRequired: boolean;
};
export type PartnerSession = {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: PartnerUser;
};
type AuthState = {
  session: PartnerSession | null;
  phase: "restoring" | "ready" | "error";
  notice: string;
  revision: number;
  accept: (session: PartnerSession) => void;
  clear: (notice?: string) => void;
  restoreError: () => void;
  beginRestore: () => void;
};
export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  phase: "restoring",
  notice: "",
  revision: 0,
  accept: (session) =>
    set((state) => ({
      session,
      phase: "ready",
      notice: "",
      revision: state.revision + 1,
    })),
  clear: (notice = "") =>
    set((state) => ({
      session: null,
      phase: "ready",
      notice,
      revision: state.revision + 1,
    })),
  restoreError: () => set({ phase: "error" }),
  beginRestore: () => set({ phase: "restoring" }),
}));
