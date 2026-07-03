import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PlayIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/20/solid";
import type { LensSpec } from "@tomagranate/liquid-glass";
import { useGlassTexture } from "@tomagranate/liquid-glass";
import { GlassCopyContext } from "./flat.ts";
import "./components.css";

export interface GlassVideoPlayerProps {
  /** Video URL (same-origin, so WebGL can texture it). */
  src?: string;
  poster?: string;
  width?: number;
  height?: number;
}

/* Deep, bubbly materials — the video should visibly pour through the rims. */
const BAR_GLASS = { depth: 14, scale: 44, chroma: 0.6, specular: 0.6 };
const SCRUB_GLASS = { depth: 10, scale: 26, chroma: 0.2, specular: 0.2 };
const BUBBLE_GLASS = { depth: 24, scale: 36, chroma: 0.7, specular: 0.6 };
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * A video player whose controls are liquid glass. Each control is a lens over
 * the playing video, refracting it live. The `<video>` can't be read by an SVG
 * filter (and on Safari not at all), so the controls use the WebGL texture
 * backend ({@link useGlassTexture}); the icons ride on top in the DOM and stay
 * clickable. Starts paused behind a big glass play bubble; the bubble pops
 * away while playing and clicking the frame pauses again.
 */
export function GlassVideoPlayer(props: GlassVideoPlayerProps) {
  const flat = useContext(GlassCopyContext);
  return flat ? <FlatVideoPlayer {...props} /> : <VideoPlayerImpl {...props} />;
}

function FlatVideoPlayer({
  poster = "/coast.jpg",
  width = 480,
  height = 270,
}: GlassVideoPlayerProps) {
  return (
    <div
      className="glassx glassx-video"
      style={{
        width: "100%",
        maxWidth: width,
        aspectRatio: `${width} / ${height}`,
        backgroundImage: `url(${poster})`,
      }}
    />
  );
}

function VideoPlayerImpl({
  src = "/coast.mp4",
  poster = "/coast.jpg",
  width = 480,
  height = 270,
}: GlassVideoPlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [size, setSize] = useState({ width, height });
  const aspectRatio = width / height;

  useLayoutEffect(() => {
    const node = hostRef.current;
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
      radius: controlSize / 2,
    };
    const scrub = {
      x: pad,
      y: by + (barH - scrubH) / 2,
      w: Math.max(0, vol.x - gap - pad),
      h: scrubH,
      radius: scrubH / 2,
    };
    const bubble = {
      x: (playerWidth - bubbleSize) / 2,
      y: (playerHeight - bubbleSize) / 2,
      w: bubbleSize,
      h: bubbleSize,
      radius: bubbleSize / 2,
    };

    const lenses: LensSpec[] = [
      { ...scrub, ...SCRUB_GLASS },
      { ...vol, ...BAR_GLASS },
      ...(playing ? [] : [{ ...bubble, ...BUBBLE_GLASS }]),
    ];

    return { bubble, lenses, scrub, vol };
  }, [playing, size.height, size.width]);

  const canvasRef = useGlassTexture({
    getSource: () => videoRef.current,
    width: size.width,
    height: size.height,
    lenses: layout.lenses,
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
    <div
      ref={hostRef}
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
        // Decode the first frame while paused so the lenses have pixels to
        // refract before playback starts (the loop skips readyState < 2).
        preload="auto"
        onClick={togglePlay}
      />
      <canvas
        ref={canvasRef}
        className="glassx-video-glass"
        aria-hidden="true"
      />

      {/* Interactive controls, positioned over their glass lenses. */}
      <button
        type="button"
        className="glassx-video-ctl glassx-video-bigplay"
        data-hidden={playing}
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
      </button>

      <div
        className="glassx-video-scrub"
        style={{
          left: layout.scrub.x,
          top: layout.scrub.y,
          width: layout.scrub.w,
          height: layout.scrub.h,
        }}
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
        className="glassx-video-ctl"
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
      </button>
    </div>
  );
}

export default GlassVideoPlayer;
