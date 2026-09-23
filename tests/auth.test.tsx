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
  getSession: vi.fn(async () => null),
  signIn: vi.fn(),
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
      name: "Forgot or haven’t set a password?",
    }),
  );
  expect(api.supabase!.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "owner@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "a reset link is on its way",
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
  await screen.findByRole("heading", { name: "Welcome back." });
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
  expect(screen.getByLabelText("Email")).toBeInTheDocument();
  expect(api.supabase!.auth.resetPasswordForEmail).not.toHaveBeenCalled();
});
