"use client";

/**
 * Catches errors thrown by the root layout itself, which error.tsx cannot —
 * it must render its own <html>/<body> since it replaces the whole tree.
 * Deliberately plain (no design-system imports) since the layout that would
 * provide fonts/providers may be exactly what failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: "#6b7280", maxWidth: 380, fontSize: "0.875rem" }}>
            The application hit an unexpected error. Reference:{" "}
            <code>{error.digest ?? "unknown"}</code>
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              background: "#111827",
              color: "white",
              fontSize: "0.875rem",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
