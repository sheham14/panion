import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const VALID_SIZES = [192, 512];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: sizeStr } = await params;
  const size = parseInt(sizeStr, 10);

  if (!VALID_SIZES.includes(size)) {
    return new Response("Not found", { status: 404 });
  }

  const borderRadius = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.52);

  return new ImageResponse(
    (
      <div
        style={{
          background: "#00E5C3",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: `${borderRadius}px`,
          color: "#0f1416",
          fontSize: `${fontSize}px`,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        P
      </div>
    ),
    { width: size, height: size },
  );
}
