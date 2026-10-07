"use client";

// Last-resort boundary for failures in the root layout itself. It replaces
// the root layout, so it can't rely on globals.css or next/font — the
// colors below mirror the ink/paper/slate tokens by hand.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c1116",
          color: "#edf1f4",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <title>Countersign — Error</title>
        <div style={{ maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>
            Countersign couldn&rsquo;t load
          </h1>
          <p style={{ color: "#7c8896", fontSize: 14 }}>
            Something went wrong. Nothing was changed. Try again in a moment.
          </p>
          {error.digest && (
            <p style={{ color: "#4a545f", fontSize: 12, fontFamily: "monospace" }}>
              Reference {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 8,
              padding: "8px 16px",
              background: "transparent",
              color: "#edf1f4",
              border: "1px solid #8b85ff",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
