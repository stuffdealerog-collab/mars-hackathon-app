"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Re-renders the stats on demand. Nothing polls: the database is read only when someone asks. */
export default function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn-2 min-h-10 px-4 text-sm"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
