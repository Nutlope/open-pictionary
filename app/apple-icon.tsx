import { ImageResponse } from "next/og";
import { OgCreature } from "@/lib/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: Kimi's red circle, eyes up, on the lemon room. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFD84A" }}>
        <OgCreature k="kimi-k3" size={140} />
      </div>
    ),
    size,
  );
}
