import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  PlayIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/20/solid";
import { Glass, GlassMediaSurface } from "@tomagranate/liquid-glass/react";
import "./components.css";

export interface GlassVideoPlayerProps {
  /** Video URL (same-origin, so WebGL can texture it). */
  src?: string;
  poster?: string;
  width?: number;
  height?: number;
}

/* Deep, bubbly materials — the video should visibly pour through the rims. */
const BAR_GLASS = {
  radius: 999,
  depth: 14,
  scale: 44,
  chroma: 0.6,
  specular: 0.6,
  tint: "rgba(4,10,20,0.48)",
  rimLight: 1.1,
  shadow: "0 8px 24px rgba(0,0,0,0.42)",
};
const SCRUB_GLASS = {
  radius: 999,
  depth: 10,
  scale: 26,
  chroma: 0.2,
  specular: 0.2,
  tint: "rgba(4,10,20,0.56)",
  rimLight: 0.9,
  shadow: "0 5px 18px rgba(0,0,0,0.4)",
};
const BUBBLE_GLASS = {
  radius: "50%" as const,
  depth: 24,
  scale: 36,
  chroma: 0.7,
  specular: 0.6,
  tint: "rgba(4,10,20,0.42)",
  rimLight: 1.15,
  shadow: "0 14px 36px rgba(0,0,0,0.46)",
};
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * A video player whose controls are liquid glass. The `<video>` is wrapped in a
 * `<GlassMediaSurface live>` — an SVG filter can't sample a playing video, so
 * the surface uses the WebGL texture backend. Each control is a plain `<Glass>`
 * lens positioned over the video; they overlap the media surface and refract it
 * live. Icons ride on top in the DOM and stay clickable.
 */
export function GlassVideoPlayer({
  src = "/coast.mp4",
  poster = "/coast.jpg",
  width = 480,
  height = 270,
}: GlassVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [size, setSize] = useState({ width, height });
  const aspectRatio = width / height;

  // Measure the video element (absolutely filling the surface) so control
  // positions track the rendered player size without relying on ref forwarding.
  useLayoutEffect(() => {
    const node = videoRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      const nextWidth = Math.max(1, rect.width);
      const nextHeight = Math.max(1, rect.height || nextWidth / aspectRatio);
      setSize((current) =>
        Math.abs(current.width - nextWidth) < 0.5 &&
        Math.abs(current.height - nextHeight) < 0.5
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };

    updateSize();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [aspectRatio]);

  const layout = useMemo(() => {
    const playerWidth = size.width;
    const playerHeight = size.height;
    const pad = clamp(playerWidth * 0.04, 10, 16);
    const controlSize = playerWidth < 380 ? 36 : 40;
    const barH = controlSize + 4;
    const by = Math.max(pad, playerHeight - pad - barH);
    const bubbleSize = clamp(playerWidth * 0.22, 72, 96);
    const gap = clamp(playerWidth * 0.025, 8, 14);
    const scrubH = playerWidth < 380 ? 18 : 20;
    const vol = {
      x: playerWidth - pad - controlSize,
      y: by + (barH - controlSize) / 2,
      w: controlSize,
      h: controlSize,
    };
    const scrub = {
      x: pad,
      y: by + (barH - scrubH) / 2,
      w: Math.max(0, vol.x - gap - pad),
      h: scrubH,
    };
    const bubble = {
      x: (playerWidth - bubbleSize) / 2,
      y: (playerHeight - bubbleSize) / 2,
      w: bubbleSize,
      h: bubbleSize,
    };
    return { bubble, scrub, vol };
  }, [size.height, size.width]);

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
  const seekWithKeyboard = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (
      !v?.duration ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
    ) {
      return;
    }
    e.preventDefault();
    if (e.key === "Home") v.currentTime = 0;
    else if (e.key === "End") v.currentTime = v.duration;
    else
      v.currentTime = clamp(
        v.currentTime + (e.key === "ArrowRight" ? 5 : -5),
        0,
        v.duration,
      );
    setProgress(v.currentTime / v.duration);
  };

  return (
    <GlassMediaSurface
      live
      className="glassx glassx-video"
      style={{
        width: "100%",
        maxWidth: width,
        aspectRatio: `${width} / ${height}`,
      }}
    >
      <video
        ref={videoRef}
        className="glassx-video-el"
        src={src}
        poster={poster}
        muted={muted}
        loop
        playsInline
        // The poster gives the lenses pixels to refract before playback;
        // metadata-only preload keeps the request from holding the page busy.
        preload="metadata"
        onClick={togglePlay}
      />

      {/* Interactive glass controls, positioned over the live video. */}
      <Glass
        as="button"
        type="button"
        className="glassx-video-ctl glassx-video-bigplay"
        data-hidden={playing}
        {...BUBBLE_GLASS}
        background={false}
        style={{
          left: layout.bubble.x,
          top: layout.bubble.y,
          width: layout.bubble.w,
          height: layout.bubble.h,
        }}
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        tabIndex={playing ? -1 : 0}
      >
        <PlayIcon className="glassx-ctl-icon xl" />
      </Glass>

      <Glass
        className="glassx-video-scrub"
        {...SCRUB_GLASS}
        background={false}
        style={{
          left: layout.scrub.x,
          top: layout.scrub.y,
          width: layout.scrub.w,
          height: layout.scrub.h,
        }}
        onPointerDown={seek}
        onKeyDown={seekWithKeyboard}
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
      </Glass>

      <Glass
        as="button"
        type="button"
        className="glassx-video-ctl"
        {...BAR_GLASS}
        background={false}
        style={{
          left: layout.vol.x,
          top: layout.vol.y,
          width: layout.vol.w,
          height: layout.vol.h,
        }}
        onClick={toggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? (
          <SpeakerXMarkIcon className="glassx-ctl-icon" />
        ) : (
          <SpeakerWaveIcon className="glassx-ctl-icon" />
        )}
      </Glass>
    </GlassMediaSurface>
  );
}

export default GlassVideoPlayer;
