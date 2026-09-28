import { ImageResponse } from "next/og";

/**
 * iOS home-screen icon. No border-radius or transparency here — iOS applies
 * its own rounded-square mask, and a transparent background shows as black.
 * Same mark as `icon.tsx`, scaled from 32px to 180px (Apple's recommended size).
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const SCALE = 180 / 32;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#574ebc",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 7 * SCALE,
            top: 9 * SCALE,
            width: 18 * SCALE,
            height: 3.5 * SCALE,
            borderRadius: 1.75 * SCALE,
            background: "#ffffff",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 7 * SCALE,
            top: 14.25 * SCALE,
            width: 11 * SCALE,
            height: 3.5 * SCALE,
            borderRadius: 1.75 * SCALE,
            background: "rgba(255,255,255,0.7)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 7 * SCALE,
            top: 19.5 * SCALE,
            width: 14.5 * SCALE,
            height: 3.5 * SCALE,
            borderRadius: 1.75 * SCALE,
            background: "rgba(255,255,255,0.45)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
