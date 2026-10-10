"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-8"
      >
        <h1 className="text-lg font-medium">Life Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Enter your password to continue.</p>

        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-6 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-muted"
          placeholder="Password"
        />

        {error && <p className="mt-3 text-sm text-error">{error}</p>}

        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="mt-6 w-full rounded-lg bg-accent px-3 py-2 font-medium text-background disabled:opacity-40"
        >
          {busy ? "Checking…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
