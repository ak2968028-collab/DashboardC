"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { ClipboardList, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { homeFor, useAuth } from "@/components/AuthContext";
import { Alert, CarbonLoader, Card, PageTitle } from "@/components/ui";
import { errorText } from "@/lib/api";
import type { Role } from "@/lib/types";

const ROLES: Record<Role, { title: string; label: string; hint: string; icon: typeof ShieldCheck }> = {
  admin: { title: "Admin Login", label: "Admin", hint: "Review and approve survey data, and manage accounts.", icon: ShieldCheck },
  supervisor: { title: "Village Supervisor Login", label: "Village Supervisor", hint: "Submit survey data for your villages.", icon: ClipboardList },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<CarbonLoader label="Loading…" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { user, ready, login, logout } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("role");
  const [role, setRole] = useState<Role>(initial === "admin" ? "admin" : "supervisor");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow the navbar "Sign In" menu when it changes ?role= while this page is open.
  useEffect(() => {
    if (initial === "admin" || initial === "supervisor") setRole(initial);
  }, [initial]);

  const pickRole = (r: Role) => {
    setRole(r);
    setError(null);
    router.replace(`/login?role=${r}`, { scroll: false });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(username, password);
      if (u.role !== role) {
        // Signed in with the other kind of account: undo it and point to the right option.
        logout();
        setError(`This is a ${ROLES[u.role].label.toLowerCase()} account. Choose "${ROLES[u.role].label}" above and log in again.`);
        setBusy(false);
        return;
      }
      router.push(homeFor(u.role));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const r = ROLES[role];
  return (
    <div className="narrow">
      <PageTitle>{ready && user ? "Signed in" : r.title}</PageTitle>
      <p>The dashboard is open to everyone. Log in only to submit village survey data (village supervisor) or to review and approve it (admin).</p>
      {ready && user ? (
        <Card>
          <p>You are logged in as <b>{user.full_name || user.username}</b> ({ROLES[user.role].label}).</p>
          <div className="controls">
            <Link href={homeFor(user.role)} className="btn primary">Go to {user.role === "admin" ? "Admin" : "Data Entry"}</Link>
            <button className="btn" onClick={logout}><LogOut size={16} /> Log out</button>
          </div>
        </Card>
      ) : (
        <Card>
          <form onSubmit={submit} className="stack">
            <div className="login-roles" role="radiogroup" aria-label="Log in as">
              {(Object.keys(ROLES) as Role[]).map((k) => {
                const o = ROLES[k];
                return (
                  <button key={k} type="button" role="radio" aria-checked={role === k} className={role === k ? "active" : ""} onClick={() => pickRole(k)}>
                    <o.icon size={18} />
                    <span><b>{o.label}</b><small>{o.hint}</small></span>
                  </button>
                );
              })}
            </div>
            <label className="field">
              <span>Username</span>
              <input autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <Alert kind="error">{error}</Alert>}
            <button className="btn primary block" type="submit" disabled={busy}>
              <LogIn size={16} /> {busy ? "Logging in…" : `Log in as ${r.label}`}
            </button>
            <p className="caption">Accounts are created by the admin. Forgot your password? Ask the admin to reset it.</p>
          </form>
        </Card>
      )}
    </div>
  );
}
