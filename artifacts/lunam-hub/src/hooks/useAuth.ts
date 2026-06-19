import { useQuery, useQueryClient } from "@tanstack/react-query";

interface AuthStatus {
  passwordRequired: boolean;
  authenticated: boolean;
}

async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch("/api/auth/status", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch auth status");
  return res.json() as Promise<AuthStatus>;
}

export function useAuth() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["auth-status"],
    queryFn: fetchAuthStatus,
    staleTime: 60_000,
    retry: false,
  });

  const authenticated = data?.authenticated ?? false;
  const passwordRequired = data?.passwordRequired ?? false;

  async function login(password: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      await qc.invalidateQueries({ queryKey: ["auth-status"] });
      return { ok: true };
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? "Login failed" };
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await qc.invalidateQueries({ queryKey: ["auth-status"] });
  }

  return { authenticated, passwordRequired, isLoading, login, logout };
}
