import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth })),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
  vi.stubEnv("VITE_OWNER_EMAIL", "owner@example.com");
  auth.signInWithPassword.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

it("authenticates the configured owner using the password entered", async () => {
  const { signIn } = await import("../src/service");
  await signIn("synthetic-test-password");
  expect(auth.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
    email: "owner@example.com",
    password: "synthetic-test-password",
  });
});

it("fails closed when the owner is missing and preserves Supabase errors", async () => {
  vi.stubEnv("VITE_OWNER_EMAIL", "");
  const missing = await import("../src/service");
  await expect(missing.signIn("synthetic-test-password")).rejects.toThrow(
    "owner is not configured",
  );
  expect(auth.signInWithPassword).not.toHaveBeenCalled();

  vi.resetModules();
  vi.stubEnv("VITE_OWNER_EMAIL", "owner@example.com");
  auth.signInWithPassword.mockResolvedValue({
    error: new Error("Invalid login credentials"),
  });
  const configured = await import("../src/service");
  await expect(configured.signIn("wrong-test-password")).rejects.toThrow(
    "Invalid login credentials",
  );
});
