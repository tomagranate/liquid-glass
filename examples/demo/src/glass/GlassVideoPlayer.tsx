import { useContext, useEffect, useMemo, useRef, useState } from "react";
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
const SCRUB_GLASS = { depth: 10, scale: 26,  chroma: 0.2, specular: 0.2 };
const BUBBLE_GLASS = { depth: 24, scale: 36, chroma: 0.7, specular: 0.6 };

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
      style={{ width, height, backgroundImage: `url(${poster})` }}
    />
  );
}

function VideoPlayerImpl({
  src = "/coast.mp4",
  poster = "/coast.jpg",
  width = 480,
  height = 270,
}: GlassVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);

  // Control geometry (CSS px relative to the overlay canvas).
  const pad = 16;
  const barH = 44;
  const by = height - pad - barH;
  const bubbleSize = 96;
  const bubble = {
    x: (width - bubbleSize) / 2,
    y: (height - bubbleSize) / 2,
    w: bubbleSize,
    h: bubbleSize,
    radius: bubbleSize / 2,
  };
  const vol = { x: width - pad - 40, y: by + 2, w: 40, h: 40, radius: 20 };
  const scrub = {
    x: pad,
    y: by + 12,
    w: vol.x - 14 - pad,
    h: 20,
    radius: 10,
  };

  const lenses: LensSpec[] = useMemo(
    () => [
      { ...scrub, ...SCRUB_GLASS },
      { ...vol, ...BAR_GLASS },
      // The play bubble only exists while paused; while playing it pops away.
      ...(playing ? [] : [{ ...bubble, ...BUBBLE_GLASS }]),
    ],
    // geometry only depends on size + playing
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height, playing],
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
      {/* biome-ignore lint/a11y/useMediaCaption: decorative demo footage */}
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
          left: bubble.x,
          top: bubble.y,
          width: bubble.w,
          height: bubble.h,
        }}
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        tabIndex={playing ? -1 : 0}
      >
        <PlayIcon className="glassx-ctl-icon xl" />
      </button>

      <div
        className="glassx-video-scrub"
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
        className="glassx-video-ctl"
        style={{ left: vol.x, top: vol.y, width: vol.w, height: vol.h }}
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
