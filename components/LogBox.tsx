"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";

type Result =
  | { kind: "saved"; items: string[] }
  | { kind: "clarification"; question: string; reason: "missing_info" | "client_details" }
  | { kind: "error"; message: string };

// "Log by talking": type your day in plain English, Claude sorts it.
// If Claude needs more information, a question appears with a reply box.
export default function LogBox() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState("");
  // The text being clarified. Earlier questions and answers get folded into it.
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(body: { text: string; clarification?: { question: string; answer: string } }) {
    setBusy(true);
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as Result | null;
      return data ?? { kind: "error" as const, message: "Something went wrong. Nothing was saved." };
    } catch {
      return { kind: "error" as const, message: "Could not reach the server. Nothing was saved." };
    } finally {
      setBusy(false);
    }
  }

  function handle(data: Result, sentText: string) {
    setResult(data);
    if (data.kind === "saved") {
      setText("");
      setPending(null);
      router.refresh(); // update cards and charts
    } else if (data.kind === "clarification" && data.reason === "missing_info") {
      setPending(sentText);
      setAnswer("");
    } else {
      // Client details or an error: Hamza edits the original text and sends again.
      setPending(null);
    }
  }

  async function submitLog(event?: FormEvent) {
    event?.preventDefault();
    if (!text.trim() || busy) return;
    handle(await send({ text }), text);
  }

  async function submitAnswer(event: FormEvent) {
    event.preventDefault();
    if (!pending || result?.kind !== "clarification" || !answer.trim() || busy) return;
    const question = result.question;
    const data = await send({ text: pending, clarification: { question, answer } });
    // If Claude asks again, keep the first answer as part of the text.
    handle(data, `${pending}\n(${question} — ${answer})`);
  }

  function cancelQuestion() {
    setPending(null);
    setResult(null);
  }

  // Ctrl+Enter (or Cmd+Enter) sends.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) submitLog();
  }

  const asking = result?.kind === "clarification" && result.reason === "missing_info" && pending;

  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm text-muted">Log</h2>

      <form onSubmit={submitLog} className="mt-3 flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy || !!asking}
          rows={4}
          maxLength={2000}
          placeholder="gym 1h legs, slept 23:40 to 7:10, worked 3h on the power automate flow"
          className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:border-muted disabled:opacity-50"
        />
        {!asking && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Ctrl + Enter to send</span>
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-background disabled:opacity-40"
            >
              {busy ? "Logging…" : "Log"}
            </button>
          </div>
        )}
      </form>

      {asking && result?.kind === "clarification" && (
        <form onSubmit={submitAnswer} className="mt-4 flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-sm">{result.question}</p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={busy}
              maxLength={1000}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-muted disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !answer.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-40"
            >
              {busy ? "…" : "Reply"}
            </button>
            <button
              type="button"
              onClick={cancelQuestion}
              disabled={busy}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {result?.kind === "clarification" && result.reason === "client_details" && (
        <p className="mt-4 rounded-lg border border-warning/40 p-3 text-sm text-warning">
          {result.question} Nothing was saved, and the text was not kept.
        </p>
      )}

      {result?.kind === "saved" && (
        <ul className="mt-4 flex flex-col gap-1 text-sm">
          {result.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-accent">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      {result?.kind === "error" && <p className="mt-4 text-sm text-error">{result.message}</p>}
    </section>
  );
}
