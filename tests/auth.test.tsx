import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { AuthGate } from "../src/components/AuthGate";
import * as api from "../src/service";

const state = vi.hoisted(() => ({
  notify: (_event: AuthChangeEvent, _session: Session | null) => {},
}));
vi.mock("../src/service", () => ({
  demo: false,
  configured: true,
  ownerEmail: "owner@example.com",
  getSession: vi.fn(async () => null),
  signIn: vi.fn(async () => {}),
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((callback) => {
        state.notify = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
    },
  },
}));
const session = { user: { id: "owner" } } as Session;
function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthGate>
        <p>Your private workspace</p>
      </AuthGate>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.signIn).mockResolvedValue(undefined);
  vi.mocked(api.getSession).mockResolvedValue(null);
  vi.mocked(api.supabase!.auth.updateUser).mockResolvedValue({
    data: { user: null },
    error: null,
  } as never);
  window.history.replaceState(null, "", "/");
});

it("only sends a reset email when explicitly submitted", async () => {
  setup();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Forgot password?",
    }),
  );
  expect(api.supabase!.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "A reset link is on its way",
  );
  expect(api.supabase!.auth.resetPasswordForEmail).toHaveBeenCalledWith(
    "owner@example.com",
    { redirectTo: `${window.location.origin}/?reset=1` },
  );
  expect(
    screen.getByRole("button", { name: "Send reset link" }),
  ).toBeDisabled();
});

it("keeps recovery separate from the workspace until matching passwords save successfully", async () => {
  setup();
  await screen.findByRole("heading", { name: "Password to enter" });
  act(() => state.notify("PASSWORD_RECOVERY", session));
  expect(screen.queryByText("Your private workspace")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "synthetic-test-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "different-test-password" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save password and open notebook" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("do not match");
  expect(api.supabase!.auth.updateUser).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "synthetic-test-password" },
  });
  vi.mocked(api.supabase!.auth.updateUser).mockResolvedValueOnce({
    data: { user: null },
    error: { message: "Session expired" },
  } as never);
  fireEvent.click(
    screen.getByRole("button", { name: "Save password and open notebook" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Session expired");
  expect(screen.queryByText("Your private workspace")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Save password and open notebook" }),
  );
  expect(await screen.findByText("Your private workspace")).toBeInTheDocument();
});

it("preserves the reset screen across reload with an authenticated recovery session", async () => {
  window.history.replaceState(null, "", "/?reset=1");
  vi.mocked(api.getSession).mockResolvedValue(session);
  setup();
  expect(await screen.findByLabelText("New password")).toBeInTheDocument();
  expect(screen.queryByText("Your private workspace")).not.toBeInTheDocument();
});

it("offers a fresh link when recovery is missing or expired without making a request", async () => {
  window.history.replaceState(null, "", "/?reset=1");
  setup();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "missing or expired",
  );
  expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  expect(api.supabase!.auth.updateUser).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Request a new reset link" }),
  );
  expect(
    screen.getByRole("button", { name: "Send reset link" }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  expect(api.supabase!.auth.resetPasswordForEmail).not.toHaveBeenCalled();
});

it("accepts only a password and enters the notebook after Supabase authenticates", async () => {
  setup();
  const password = await screen.findByLabelText("Password to enter");
  expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();
  fireEvent.change(password, { target: { value: "synthetic-test-password" } });
  fireEvent.submit(password.closest("form")!);
  expect(api.signIn).toHaveBeenCalledWith("synthetic-test-password");
  expect(screen.queryByText("Your private workspace")).not.toBeInTheDocument();
  await act(async () => state.notify("SIGNED_IN", session));
  expect(await screen.findByText("Your private workspace")).toBeInTheDocument();
});

it("keeps the notebook locked on a failed password and allows another attempt", async () => {
  vi.mocked(api.signIn).mockRejectedValueOnce(
    new Error("Invalid login credentials"),
  );
  setup();
  const password = await screen.findByLabelText("Password to enter");
  fireEvent.change(password, { target: { value: "wrong-test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Enter notebook" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Invalid login credentials",
  );
  expect(screen.queryByText("Your private workspace")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enter notebook" })).toBeEnabled();
  fireEvent.change(password, { target: { value: "corrected-test-password" } });
  fireEvent.submit(password.closest("form")!);
  expect(api.signIn).toHaveBeenLastCalledWith("corrected-test-password");
});
