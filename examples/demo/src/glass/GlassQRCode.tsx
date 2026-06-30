import { useEffect, useRef, useState } from "react";
import type { LensSpec } from "@tomagranate/liquid-glass";
import { useGlassTexture } from "@tomagranate/liquid-glass";
import QRCode from "qrcode";
import "./components.css";

export interface GlassQRCodeProps {
  /** Encoded value. */
  value?: string;
  /** Square size, px. */
  size?: number;
}

/**
 * A QR code drawn to a `<canvas>`, with a glass lens refracting it. SVG filters
 * can't read canvas pixels, so this uses the WebGL texture backend
 * ({@link useGlassTexture}). Tap to send a refraction ripple through the code.
 */
export function GlassQRCode({
  value = "https://github.com/tomagranate/liquid-glass",
  size = 200,
}: GlassQRCodeProps) {
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [version, setVersion] = useState(0);
  const [press, setPress] = useState(0);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const c = qrRef.current;
    if (!c) return;
    QRCode.toCanvas(c, value, {
      width: size,
      margin: 1,
      color: { dark: "#0b0d16ff", light: "#ffffffff" },
    })
      .then(() => setVersion((v) => v + 1))
      .catch((e) => console.warn("GlassQRCode: render failed —", e));
  }, [value, size]);

  const lenses: LensSpec[] = [
    {
      // Cover the whole QR so the glass matches it edge to edge.
      x: 0,
      y: 0,
      w: size,
      h: size,
      radius: 18,
      depth: 14 + press * 12,
      scale: 22 + press * 46,
      chroma: 0.45,
      specular: 0.5,
    },
  ];

  const canvasRef = useGlassTexture({
    getSource: () => qrRef.current,
    width: size,
    height: size,
    lenses,
    sourceVersion: version,
  });

  const ripple = () => {
    const start = performance.now();
    const dur = 520;
    cancelAnimationFrame(animRef.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setPress(Math.sin(t * Math.PI)); // rise then settle
      if (t < 1) animRef.current = requestAnimationFrame(step);
      else setPress(0);
    };
    animRef.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  return (
    <div
      className="glassx glassx-qr"
      style={{ width: size, height: size }}
      onPointerDown={ripple}
    >
      <canvas
        ref={qrRef}
        className="glassx-qr-source"
        width={size}
        height={size}
      />
      <canvas ref={canvasRef} className="glassx-qr-glass" aria-hidden="true" />
    </div>
  );
}

export default GlassQRCode;
