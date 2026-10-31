"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { mutate } from "swr";
import { LogIn } from "lucide-react";
import { ApiError, authFetcher, sendApi, setAuthToken } from "@/lib/api";
import type { Role, User } from "@/lib/types";
import { Alert } from "./ui";

const TOKEN_KEY = "varanasi-dashboard-token";

interface AuthState {
  user: User | null;
  /** False until a saved login has been checked. */
  ready: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Drops cached responses that belong to the previous login. */
const clearPrivateCache = () =>
  mutate((key) => typeof key === "string" && /^\/api\/(admin|supervisor)\//.test(key), undefined, { revalidate: false });

function saveToken(token: string | null) {
  setAuthToken(token);
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    saveToken(null);
    setUser(null);
    clearPrivateCache();
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await authFetcher<User>("/api/auth/me"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) logout();
    }
  }, [logout]);

  // Restore the saved login for this browser.
  useEffect(() => {
    let token: string | null = null;
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch {}
    if (!token) return setReady(true);
    setAuthToken(token);
    refreshUser().finally(() => setReady(true));
  }, [refreshUser]);

  const login = async (username: string, password: string) => {
    const res = await sendApi<{ access_token: string; user: User }>("POST", "/api/auth/login", { username, password });
    clearPrivateCache();
    saveToken(res.access_token);
    setUser(res.user);
    return res.user;
  };

  return <AuthContext.Provider value={{ user, ready, login, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export const homeFor = (role: Role) => (role === "admin" ? "/admin" : "/supervisor");

/** Renders children only for a logged-in user with the given role. */
export function RequireRole({ role, children }: { role: Role; children: (user: User) => ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="loading">Checking login…</div>;
  if (!user) {
    return (
      <Alert kind="info">
        🔒 This page is for {role === "admin" ? "the administrator" : "village supervisors"}.{" "}
        <Link href="/login" className="btn primary" style={{ marginLeft: 8 }}><LogIn size={16} /> Log in</Link>
      </Alert>
    );
  }
  if (user.role !== role) {
    return (
      <Alert kind="warning">
        You are logged in as <b>{user.username}</b> ({user.role}); this page is for {role}s.{" "}
        <Link href={homeFor(user.role)}>Go to your page</Link>
      </Alert>
    );
  }
  return <>{children(user)}</>;
}
