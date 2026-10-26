import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { LoginPage } from "./LoginPage";
import { ChangePasswordPage } from "./ChangePasswordPage";
import { useAuthStore } from "./auth-store";
import { signIn, changePassword } from "./auth-service";
vi.mock("./auth-service", () => ({ signIn: vi.fn(), changePassword: vi.fn() }));
const session = {
  accessToken: "synthetic-access",
  accessTokenExpiresAt: new Date(Date.now() + 600000).toISOString(),
  user: {
    id: "10000000-0000-4000-8000-000000000001",
    companyId: "20000000-0000-4000-8000-000000000001",
    role: "partner" as const,
    fullName: "Synthetic Partner",
    email: "synthetic@example.test",
    isActive: true as const,
    passwordChangeRequired: false,
  },
};
afterEach(() => {
  useAuthStore.getState().clear();
  vi.resetAllMocks();
});
it("preserves entered credentials through a recoverable sign-in failure", async () => {
  vi.mocked(signIn).mockRejectedValue(new Error("offline"));
  const actor = userEvent.setup();
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  await actor.type(screen.getByLabelText("Work email"), session.user.email);
  await actor.type(screen.getByLabelText("Password"), " synthetic password ");
  await actor.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Sign-in unsuccessful")).toBeVisible();
  expect(screen.getByLabelText("Password")).toHaveValue(" synthetic password ");
  expect(useAuthStore.getState().session).toBeNull();
});
it("clears the password after confirmed sign-in and keeps only memory state", async () => {
  vi.mocked(signIn).mockResolvedValue(session);
  const actor = userEvent.setup();
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  await actor.type(screen.getByLabelText("Work email"), session.user.email);
  await actor.type(screen.getByLabelText("Password"), " synthetic password ");
  await actor.click(screen.getByRole("button", { name: "Sign in" }));
  expect(signIn).toHaveBeenCalledWith(
    session.user.email,
    " synthetic password ",
  );
  expect(screen.getByLabelText("Password")).toHaveValue("");
  expect(useAuthStore.getState().session).toEqual(session);
});
it("keeps first-login credentials local when confirmation is different", async () => {
  useAuthStore
    .getState()
    .accept({
      ...session,
      user: { ...session.user, passwordChangeRequired: true },
    });
  const actor = userEvent.setup();
  render(
    <MemoryRouter>
      <ChangePasswordPage />
    </MemoryRouter>,
  );
  await actor.type(
    screen.getByLabelText("Current password"),
    "Synthetic initial password",
  );
  await actor.type(
    screen.getByLabelText("New password"),
    "Synthetic chosen password",
  );
  await actor.type(
    screen.getByLabelText("Confirm new password"),
    "Synthetic different password",
  );
  await actor.click(screen.getByRole("button", { name: "Update password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "make sure both new passwords match",
  );
  expect(changePassword).not.toHaveBeenCalled();
});
