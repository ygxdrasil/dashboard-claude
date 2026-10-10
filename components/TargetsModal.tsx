"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { TARGET_INFO, TARGET_METRICS } from "@/lib/targets";
import type { TargetMetric } from "@/lib/types";

type Inputs = Record<TargetMetric, string>;

const emptyInputs = () =>
  Object.fromEntries(TARGET_METRICS.map((m) => [m, ""])) as Inputs;

// "Targets" button for the footer. Opens a small form for the six targets.
// An empty box means "no target".
export default function TargetsModal() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [inputs, setInputs] = useState<Inputs>(emptyInputs);
  const [status, setStatus] = useState<"idle" | "loading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  function fill(targets: Partial<Record<TargetMetric, number>>) {
    const next = emptyInputs();
    for (const m of TARGET_METRICS) {
      if (targets[m] !== undefined) next[m] = String(targets[m]);
    }
    setInputs(next);
  }

  async function open() {
    setError(null);
    setStatus("loading");
    dialog.current?.showModal();
    try {
      const res = await fetch("/api/targets");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fill(data.targets);
    } catch {
      setError("Could not load targets.");
    }
    setStatus("idle");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const body: Record<string, number | null> = {};
    for (const m of TARGET_METRICS) {
      const raw = inputs[m].trim().replace(",", ".");
      body[m] = raw === "" ? null : Number(raw);
    }

    setStatus("saving");
    try {
      const res = await fetch("/api/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fill(data.targets);
      dialog.current?.close();
      router.refresh(); // cards and charts use the targets
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not save targets.");
    }
    setStatus("idle");
  }

  return (
    <>
      <button onClick={open} className="hover:text-foreground">
        Targets
      </button>

      <dialog
        ref={dialog}
        className="m-auto w-[440px] rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60"
      >
        <form onSubmit={save} className="p-6">
          <h2 className="text-base font-medium">Targets</h2>
          <p className="mt-1 text-sm text-muted">Leave a box empty for no target.</p>

          <div className="mt-5 flex flex-col gap-3">
            {TARGET_METRICS.map((m) => {
              const info = TARGET_INFO[m];
              return (
                <label key={m} className="flex items-center justify-between gap-4">
                  <span className="text-sm">
                    {info.label}
                    <span className="block text-xs text-muted">{info.unit}</span>
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={info.max}
                    step={info.step}
                    value={inputs[m]}
                    disabled={status !== "idle"}
                    onChange={(e) => setInputs({ ...inputs, [m]: e.target.value })}
                    className="w-32 rounded-lg border border-border bg-background px-3 py-1.5 text-right outline-none focus:border-muted disabled:opacity-50"
                  />
                </label>
              );
            })}
          </div>

          {error && <p className="mt-4 text-sm text-error">{error}</p>}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status !== "idle"}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-40"
            >
              {status === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
