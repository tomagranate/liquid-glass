import { useEffect, useMemo, useRef, useState } from "react";
import type { LensSpec } from "@tomagranate/liquid-glass";
import { useGlassTexture } from "@tomagranate/liquid-glass";
import "./components.css";

export interface GlassVideoPlayerProps {
  /** Video URL (same-origin, so WebGL can texture it). */
  src?: string;
  poster?: string;
  width?: number;
  height?: number;
}

const CONTROL_GLASS = { depth: 8, scale: 20, chroma: 0.4, specular: 0.5 };

/**
 * A video player whose controls are liquid glass. Each control is a small lens
 * over the playing video, refracting it live — glass buttons over a video.
 * The `<video>` can't be read by an SVG filter (and on Safari not at all), so the
 * controls use the WebGL texture backend ({@link useGlassTexture}); the icons
 * ride on top in the DOM and stay clickable.
 */
export function GlassVideoPlayer({
  src = "/sample.mp4",
  poster,
  width = 480,
  height = 270,
}: GlassVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);

  // Control geometry (CSS px relative to the overlay canvas).
  const pad = 16;
  const barH = 44;
  const by = height - pad - barH;
  const play = { x: pad, y: by, w: 44, h: 44, radius: 22 };
  const vol = { x: width - pad - 40, y: by + 2, w: 40, h: 40, radius: 20 };
  const scrub = {
    x: play.x + play.w + 14,
    y: by + 12,
    w: vol.x - 14 - (play.x + play.w + 14),
    h: 20,
    radius: 10,
  };

  const lenses: LensSpec[] = useMemo(
    () => [
      { ...play, ...CONTROL_GLASS },
      { ...scrub, ...CONTROL_GLASS, depth: 6, scale: 14 },
      { ...vol, ...CONTROL_GLASS },
    ],
    // geometry only depends on size
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height],
  );

  const canvasRef = useGlassTexture({
    getSource: () => videoRef.current,
    width,
    height,
    lenses,
    live: true,
  });

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () =>
      setProgress(v.duration ? v.currentTime / v.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.play().catch(() => setPlaying(false));
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v?.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  };

  return (
    <div className="glassx glassx-video" style={{ width, height }}>
      <video
        ref={videoRef}
        className="glassx-video-el"
        src={src}
        poster={poster}
        muted={muted}
        loop
        playsInline
        autoPlay
      />
      <canvas
        ref={canvasRef}
        className="glassx-video-glass"
        aria-hidden="true"
      />

      {/* Interactive controls, positioned over their glass lenses. */}
      <button
        type="button"
        className="glassx-video-ctl glass-fg"
        style={{ left: play.x, top: play.y, width: play.w, height: play.h }}
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <div
        className="glassx-video-scrub glass-fg"
        style={{ left: scrub.x, top: scrub.y, width: scrub.w, height: scrub.h }}
        onPointerDown={seek}
        role="slider"
        aria-label="Seek"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
      >
        <div
          className="glassx-video-scrub-fill"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <button
        type="button"
        className="glassx-video-ctl glass-fg"
        style={{ left: vol.x, top: vol.y, width: vol.w, height: vol.h }}
        onClick={toggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </div>
  );
}

export default GlassVideoPlayer;
