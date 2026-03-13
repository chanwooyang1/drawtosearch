import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at top, rgba(255,216,183,1), rgba(241,109,38,1) 64%, rgba(113,33,0,1) 100%)",
          color: "#21120b",
          display: "flex",
          fontFamily: "sans-serif",
          fontSize: 92,
          fontWeight: 700,
          height: "100%",
          justifyContent: "center",
          letterSpacing: "-0.08em",
          width: "100%",
        }}
      >
        D2S
      </div>
    ),
    size,
  );
}
