import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Panion — Grocery Price Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0f1416",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        {/* Teal accent bar at top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "#00E5C3",
          }}
        />

        {/* Wordmark */}
        <div
          style={{
            color: "#00E5C3",
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.5px",
            marginBottom: 32,
          }}
        >
          Panion
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            color: "#ffffff",
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-2px",
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          <div>Better groceries,</div>
          <div>better prices.</div>
        </div>

        {/* Subline */}
        <div
          style={{
            color: "#888888",
            fontSize: 26,
            fontWeight: 400,
          }}
        >
          St. John&apos;s, Newfoundland
        </div>
      </div>
    ),
    { ...size },
  );
}