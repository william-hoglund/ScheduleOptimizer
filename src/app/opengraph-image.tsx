import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

/**
 * The social-share preview card — what actually shows up when this link is
 * pasted into Slack, iMessage, or Twitter/X, which until now was nothing
 * (no opengraph-image file existed, so those surfaces fell back to a bare
 * link or the page title alone).
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const t = await getTranslations();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #6a5fd6 0%, #4a4098 60%, #3a3178 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(255,255,255,0.16)",
              display: "flex",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 14,
                top: 18,
                width: 36,
                height: 7,
                borderRadius: 3.5,
                background: "#ffffff",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 14,
                top: 28.5,
                width: 22,
                height: 7,
                borderRadius: 3.5,
                background: "rgba(255,255,255,0.7)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 14,
                top: 39,
                width: 29,
                height: 7,
                borderRadius: 3.5,
                background: "rgba(255,255,255,0.45)",
              }}
            />
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
            {t("app.name")}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 56,
            fontSize: 68,
            lineHeight: 1.15,
            fontWeight: 700,
            color: "#ffffff",
            maxWidth: 920,
          }}
        >
          {t("app.tagline")}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 30,
            color: "rgba(255,255,255,0.75)",
            maxWidth: 760,
          }}
        >
          {t("landing.hero.eyebrow")}
        </div>
      </div>
    ),
    { ...size },
  );
}
