"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl border border-line px-4 py-2.5 font-semibold"
    >
      Print
    </button>
  );
}
