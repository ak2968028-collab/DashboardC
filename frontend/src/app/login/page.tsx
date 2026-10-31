"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LogIn, LogOut } from "lucide-react";
import { homeFor, useAuth } from "@/components/AuthContext";
import { Alert, Card, PageTitle } from "@/components/ui";
import { errorText } from "@/lib/api";

export default function LoginPage() {
  const { user, ready, login, logout } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(username, password);
      router.push(homeFor(u.role));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <PageTitle>🔐 Supervisor &amp; Admin Login</PageTitle>
      <p>The dashboard is open to everyone. Log in only to submit village survey data (village supervisor) or to review and approve it (admin).</p>
      {ready && user ? (
        <Card>
          <p>You are logged in as <b>{user.full_name || user.username}</b> ({user.role}).</p>
          <div className="controls">
            <Link href={homeFor(user.role)} className="btn primary">Go to {user.role === "admin" ? "Admin" : "Data Entry"}</Link>
            <button className="btn" onClick={logout}><LogOut size={16} /> Log out</button>
          </div>
        </Card>
      ) : (
        <Card>
          <form onSubmit={submit} className="stack">
            <label className="field">
              <span>Username</span>
              <input autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <Alert kind="error">❌ {error}</Alert>}
            <button className="btn primary block" type="submit" disabled={busy}>
              <LogIn size={16} /> {busy ? "Logging in…" : "Log in"}
            </button>
            <p className="caption">Accounts are created by the admin. Forgot your password? Ask the admin to reset it.</p>
          </form>
        </Card>
      )}
    </div>
  );
}
