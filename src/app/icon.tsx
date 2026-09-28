import { ImageResponse } from "next/og";

/**
 * Browser-tab favicon, generated at build time — same mark as `LogoMark`
 * (`components/layout/logo.tsx`), redrawn here because `ImageResponse`
 * builds from JSX/CSS, not by rendering that SVG component directly.
 * Keep the two in sync if the mark ever changes.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#574ebc",
          borderRadius: 8,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 7,
            top: 9,
            width: 18,
            height: 3.5,
            borderRadius: 1.75,
            background: "#ffffff",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 7,
            top: 14.25,
            width: 11,
            height: 3.5,
            borderRadius: 1.75,
            background: "rgba(255,255,255,0.7)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 7,
            top: 19.5,
            width: 14.5,
            height: 3.5,
            borderRadius: 1.75,
            background: "rgba(255,255,255,0.45)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
