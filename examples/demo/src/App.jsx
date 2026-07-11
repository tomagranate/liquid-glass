import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
  FireIcon,
  MoonIcon,
  SpeakerWaveIcon,
  SunIcon,
  WifiIcon,
} from "@heroicons/react/16/solid";
import {
  BackwardIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/20/solid";
import {
  CalendarDaysIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/solid";
import {
  Glass,
  GlassMediaSurface,
  GlassRoot,
  GlassSurface,
  useGlass,
  useGlassDiagnostics,
} from "@tomagranate/liquid-glass/react";
import { createGlassScope, setBackground } from "@tomagranate/liquid-glass";
import { CodeBlock } from "./CodeBlock.jsx";
import {
  GlassButton,
  GlassDock,
  GlassPanel,
  GlassSlider,
  GlassSwitch,
  GlassToggleGroup,
  GlassVideoPlayer,
} from "./glass/index.ts";

const REPO = "https://github.com/tomagranate/liquid-glass";

const WALLPAPERS = [
  {
    id: "nebula",
    label: "Midnight nebula",
    file: "/wallpapers/nebula.webp",
    base: "#1b1741",
  },
  {
    id: "sapphire",
    label: "Sapphire flux",
    file: "/wallpapers/sapphire.webp",
    base: "#050f33",
  },
  {
    id: "amber",
    label: "Molten amber",
    file: "/wallpapers/amber.webp",
    base: "#201004",
  },
  {
    id: "arctic",
    label: "Arctic rim",
    file: "/wallpapers/arctic.webp",
    base: "#0a0f16",
  },
];

/* ── Scene code samples (kept in sync with the components they describe) ───── */

const HERO_CODE = [
  {
    label: "React",
    lang: "jsx",
    code: `import { Glass, GlassSurface } from "@tomagranate/liquid-glass/react";

// Zero configuration handles wallpaper and Chromium's live backdrop tier.
<Glass as="nav">{links}</Glass>

// Register only the bounded DOM islands that need in-place refraction.
<div className="bounded-card">
  <GlassSurface background>{liveContent}</GlassSurface>
  <Glass background={false} radius="50%" />
</div>`,
  },
  {
    label: "Vanilla",
    lang: "js",
    code: `import { glass, createSurface, setBackground } from "@tomagranate/liquid-glass";

setBackground(null);                            // auto-detect document.body
createSurface(document.querySelector(".card")); // bounded live island
glass(lensEl, { radius: "50%" });`,
  },
];

const DOCK_CODE = `import { Glass } from "@tomagranate/liquid-glass/react";

// One glass slab; the icons ride on top and stay crisp and clickable.
<Glass className="dock" radius={32} scale={84} chroma={0.55}>
  {apps.map((app) => (
    <button key={app.id} aria-label={app.label}>{app.icon}</button>
  ))}
</Glass>`;

const SLIDER_CODE = `import { useGlass, useSurface } from "@tomagranate/liquid-glass/react";

function Slider({ value, onChange }) {
  const track = useRef(null);
  const thumb = useRef(null);
  useSurface(track);                          // the filled bar bends in place
  const lens = useGlass(thumb, { radius: 999, background: false });
  useLayoutEffect(() => lens?.geometryChanged(), [value]);
  return (
    <div className="slider">
      <div ref={track} className="track">
        <div className="fill" style={{ width: \`\${value}%\` }} />
      </div>
      <div ref={thumb} className="thumb" style={{ left: \`\${value}%\` }} />
    </div>
  );
}`;

const SWITCH_CODE = `import { useGlass, useSurface } from "@tomagranate/liquid-glass/react";

function Switch({ on, onChange }) {
  const track = useRef(null);
  const thumb = useRef(null);
  useSurface(track);                          // track color bends under the thumb
  useGlass(thumb, { radius: 999, background: false });
  return (
    <div data-on={on} role="switch" onClick={() => onChange(!on)}>
      <span ref={track} className="track" />
      <div ref={thumb} className="thumb" />
    </div>
  );
}`;

const VIDEO_CODE = [
  {
    label: "React",
    lang: "jsx",
    code: `import { Glass, GlassMediaSurface } from "@tomagranate/liquid-glass/react";

// SVG filters can't sample video; the media surface uses a WebGL backend.
<GlassMediaSurface live>
  <video src="/coast.mp4" muted loop playsInline />
  <Glass as="button" radius="50%" background={false}>{playIcon}</Glass>
</GlassMediaSurface>`,
  },
  {
    label: "Vanilla",
    lang: "js",
    code: `import { createMediaSurface, glass } from "@tomagranate/liquid-glass";

createMediaSurface(videoEl, { live: true });
glass(playButton, { radius: "50%", chroma: 0.7, background: false });`,
  },
];

const CANVAS_CODE = `import {
  Glass,
  GlassMediaSurface,
} from "@tomagranate/liquid-glass/react";

// Charts, maps, games, and editors can opt into the live texture backend.
<GlassMediaSurface live>
  <canvas ref={chartRef} />
  <Glass as="button" background={false} radius={999}>
    Inspect live data
  </Glass>
</GlassMediaSurface>`;

const PLAYGROUND_CODE = `import { GlassSurface, useGlass } from "@tomagranate/liquid-glass/react";

function Specimen({ material }) {
  const ref = useRef(null);
  const handle = useGlass(ref, { radius: 32, background: false });
  // Material tweaks are a cheap patch — no re-create, no filter rebuild.
  useEffect(() => handle?.update(material), [handle, material]);
  return <div ref={ref} className="specimen">Specimen</div>;
}

<div className="stage">
  <GlassSurface className="pattern" />
  <Specimen material={material} />
</div>`;

const CATALOGUE_CASES = {
  wallpaper: "wallpaper-zero-config",
  backdrop: "live-backdrop-auto-fallback",
  content: "bounded-content-surface",
  partial: "partial-overlap-composition",
  reduced: "reduced-quality",
  oversized: "oversized-surface-fallback",
  density: "density-32-lenses",
  vanilla: "vanilla-api",
  scopes: "nested-scope-isolation",
};

const DENSITY_LENSES = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
];

export default function App() {
  const [wallpaper, setWallpaper] = useState(WALLPAPERS[2]);

  const [wifi, setWifi] = useState(true);
  const [focus, setFocus] = useState(false);
  const [lowPower, setLowPower] = useState(false);
  const [bright, setBright] = useState(72);
  const [volume, setVolume] = useState(46);
  const [warmth, setWarmth] = useState(28);
  const [appearance, setAppearance] = useState("auto");
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(38);
  const [now, setNow] = useState(() => new Date());
  const [tune, setTune] = useState({
    scale: 84,
    depth: 22,
    chroma: 0.5,
    blur: 0.4,
    specular: 0.4,
    rimLight: 0.9,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // The library reads the page background from document.body. Set the body
  // background per wallpaper, then re-detect — no CSS vars, no remount.
  useLayoutEffect(() => {
    document.body.style.backgroundImage = `url(${wallpaper.file})`;
    document.body.style.backgroundColor = wallpaper.base;
    setBackground(null);
  }, [wallpaper]);

  const sceneProps = {
    wifi,
    setWifi,
    focus,
    setFocus,
    lowPower,
    setLowPower,
    bright,
    setBright,
    volume,
    setVolume,
    warmth,
    setWarmth,
    appearance,
    setAppearance,
    playing,
    setPlaying,
    progress,
    setProgress,
    now,
    wallpaper,
    setWallpaper,
    tune,
    setTune,
  };

  return (
    <div className="app-root">
      <div className="app-scroller">
        <main>
          <Scenes {...sceneProps} />
        </main>
      </div>

      {/* General chrome uses the zero-config backdrop/copy route. Content
          surfaces appear only as bounded islands in the examples below. */}
      <div className="overlay-layer">
        <Nav />
      </div>
    </div>
  );
}

function Scenes(p) {
  return (
    <>
      <Hero wallpaper={p.wallpaper} setWallpaper={p.setWallpaper} />
      <DockScene />
      <LockScreenScene
        now={p.now}
        playing={p.playing}
        setPlaying={p.setPlaying}
        progress={p.progress}
        setProgress={p.setProgress}
      />
      <ControlCenterScene {...p} />
      <VideoScene />
      <PatternsScene />
      <CanvasMediaScene />
      <PlaygroundScene tune={p.tune} setTune={p.setTune} />
      <Footer />
    </>
  );
}

/* ── Chrome ─────────────────────────────────────────────────────────────── */

/**
 * The glass nav bar. It lives in the overlay layer over the page surface, so
 * `surfaces: "auto"` registers it against the surface and it bends whatever
 * scrolls beneath — one `<Glass>`, no duplicate copy of the page.
 */
function Nav() {
  return (
    <Glass
      as="nav"
      className="glassx nav"
      aria-label="Primary"
      radius={999}
      depth={20}
      scale={56}
      blur={1.5}
      chroma={0.5}
      specular={0.35}
      rimLight={0.9}
      tint="rgba(10,12,24,0.32)"
      shadow="0 18px 50px rgba(0,0,0,0.28)"
    >
      <div className="nav-row">
        <a className="nav-brand" href="#top" aria-label="Liquid Glass — home">
          <LensMark />
          liquid-glass
        </a>
        <div className="nav-links">
          <a href="https://www.npmjs.com/package/@tomagranate/liquid-glass">
            npm
          </a>
          <a href={REPO}>GitHub</a>
        </div>
      </div>
    </Glass>
  );
}

function LensMark() {
  return (
    <svg className="nav-mark" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <circle cx="8.6" cy="8.6" r="2.6" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function GitHubIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function Hero({ wallpaper, setWallpaper }) {
  const [copied, setCopied] = useState(false);

  const copyInstall = () => {
    navigator.clipboard
      ?.writeText("npm install @tomagranate/liquid-glass")
      .catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <header
      className="hero shell"
      id="top"
      data-demo-case={CATALOGUE_CASES.wallpaper}
    >
      <p className="eyebrow">@tomagranate/liquid-glass</p>
      <h1 className="hero-title">Interfaces that bend light.</h1>
      <p className="lede">
        Progressive liquid-glass for the web. Chromium gets live compositor
        refraction; Safari and Firefox use bounded copied or in-place surfaces,
        then degrade to native blur or tint before the effect can overwhelm a
        frame. Video and canvas use a WebGL media path.
      </p>
      <div className="hero-actions">
        <GlassButton
          variant="primary"
          onClick={() =>
            document
              .getElementById("dock")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          Explore the scenarios
        </GlassButton>
        <GlassButton
          variant="ghost"
          onClick={() => window.open(REPO, "_blank", "noopener")}
        >
          <GitHubIcon className="glassx-btn-icon" />
          View on GitHub
        </GlassButton>
      </div>
      <button type="button" className="install" onClick={copyInstall}>
        <code>npm install @tomagranate/liquid-glass</code>
        {copied ? (
          <CheckIcon className="install-icon" />
        ) : (
          <ClipboardIcon className="install-icon" />
        )}
      </button>
      <div className="hero-wallpapers">
        <span>Try another wallpaper</span>
        <WallpaperSwitcher current={wallpaper} onSelect={setWallpaper} />
      </div>
      <CodeBlock tabs={HERO_CODE} />
    </header>
  );
}

/* ── Scenes ─────────────────────────────────────────────────────────────── */

function SceneHeader({ index, title, children }) {
  return (
    <div className="scene-head">
      <p className="eyebrow">Scene {index}</p>
      <h2 className="scene-title">{title}</h2>
      <p className="scene-sub">{children}</p>
    </div>
  );
}

function DockScene() {
  return (
    <section
      className="scene shell"
      id="dock"
      data-demo-case={CATALOGUE_CASES.backdrop}
    >
      <SceneHeader index="01" title="One slab of glass, eight apps.">
        The dock is a single glass panel; the icons ride on top in the content
        layer. Hover an icon — the wallpaper stays bent underneath while the
        content moves freely.
      </SceneHeader>
      <div className="stage stage-center">
        <GlassDock />
      </div>
      <CodeBlock code={DOCK_CODE} lang="jsx" />
    </section>
  );
}

function LockScreenScene({ now, playing, setPlaying, progress, setProgress }) {
  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="scene shell" data-demo-case="slider">
      <SceneHeader
        index="02"
        title="Read your notifications through the wallpaper."
      >
        Cards frost just enough to keep text legible while the rim keeps bending
        the picture behind them. The player's progress thumb is a live lens: the
        filled bar of its track bends in place under the thumb as it slides.
      </SceneHeader>
      <div className="stage lock">
        <p className="lock-time">{time}</p>
        <p className="lock-date">{date}</p>
        <MusicWidget
          playing={playing}
          setPlaying={setPlaying}
          progress={progress}
          setProgress={setProgress}
        />
        <Notification
          gradient="linear-gradient(180deg, #6be07a, #12b845)"
          Icon={ChatBubbleOvalLeftEllipsisIcon}
          app="Messages"
          time="now"
          title="Maya"
          body="Are you seeing this? The wallpaper bends right through the card."
        />
        <Notification
          gradient="linear-gradient(180deg, #ff9d5c, #f0562a)"
          Icon={CalendarDaysIcon}
          app="Calendar"
          time="9:00 AM"
          title="Design review"
          body="Liquid glass pass on the component library"
        />
        <Notification
          gradient="linear-gradient(180deg, #4da8ff, #1668e3)"
          Icon={EnvelopeIcon}
          app="Mail"
          time="8:12 AM"
          title="Release notes"
          body="v0.1 — refraction without screenshots"
        />
      </div>
      <CodeBlock code={SLIDER_CODE} lang="jsx" />
    </section>
  );
}

function MusicWidget({ playing, setPlaying, progress, setProgress }) {
  return (
    <GlassPanel
      className="lock-card"
      contentClassName="widget"
      glass={{ tint: "rgba(8,12,24,0.38)", blur: 2.5 }}
    >
      <div className="widget-top">
        <span className="widget-art" aria-hidden="true" />
        <div className="widget-meta">
          <p className="widget-title">Total Internal Reflection</p>
          <p className="widget-artist">Caustics</p>
        </div>
        <div className="widget-controls">
          <button
            type="button"
            className="widget-btn"
            aria-label="Back 10 percent"
            onClick={() => setProgress(Math.max(0, progress - 10))}
          >
            <BackwardIcon className="widget-icon" />
          </button>
          <button
            type="button"
            className="widget-btn"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? (
              <PauseIcon className="widget-icon lg" />
            ) : (
              <PlayIcon className="widget-icon lg" />
            )}
          </button>
          <button
            type="button"
            className="widget-btn"
            aria-label="Forward 10 percent"
            onClick={() => setProgress(Math.min(100, progress + 10))}
          >
            <ForwardIcon className="widget-icon" />
          </button>
        </div>
      </div>
      <GlassSlider
        className="sm widget-progress"
        value={progress}
        onChange={setProgress}
        aria-label="Playback position"
      />
    </GlassPanel>
  );
}

function Notification({ gradient, Icon, app, time, title, body }) {
  return (
    <GlassPanel
      className="lock-card"
      contentClassName="notif"
      glass={{ tint: "rgba(8,12,24,0.44)", blur: 3, rimLight: 1.05 }}
    >
      <span className="glassx-app-badge" style={{ background: gradient }}>
        <Icon aria-hidden="true" />
      </span>
      <div className="notif-text">
        <div className="notif-top">
          <span className="notif-app">{app}</span>
          <span className="notif-time">{time}</span>
        </div>
        <p className="notif-title">{title}</p>
        <p className="notif-body">{body}</p>
      </div>
    </GlassPanel>
  );
}

/* The Auto/Light/Dark segments restyle the tiles' glass material live —
   tint and frost are plain options, so switching them is just a patch. */
const APPEARANCE_GLASS = {
  auto: {},
  light: { tint: "rgba(255,255,255,0.34)", blur: 3, rimLight: 1.1 },
  dark: { tint: "rgba(8,10,22,0.5)", blur: 3, rimLight: 0.6 },
};

function ControlCenterScene(p) {
  const tileGlass = APPEARANCE_GLASS[p.appearance];
  return (
    <section className="scene shell" data-demo-case="switch-slider-toggle">
      <SceneHeader
        index="03"
        title="Controls that feel made from the material."
      >
        Switches, sliders, and selection pills are working controls, not a
        painted mockup. Move them to see their small lenses track the surface
        beneath without putting the whole page on an animation loop.
      </SceneHeader>
      <div className="stage">
        <div className="cc-grid">
          <GlassPanel
            className="cc-tile"
            contentClassName="cc-body"
            glass={tileGlass}
          >
            <p className="cc-title">Connectivity</p>
            <div className="cc-row">
              <WifiIcon className="cc-icon" />
              <span className="cc-label">Wi-Fi</span>
              <GlassSwitch checked={p.wifi} onChange={p.setWifi} />
            </div>
            <div className="cc-row">
              <MoonIcon className="cc-icon" />
              <span className="cc-label">Focus</span>
              <GlassSwitch checked={p.focus} onChange={p.setFocus} />
            </div>
            <div className="cc-row">
              <BoltIcon className="cc-icon" />
              <span className="cc-label">Low power mode</span>
              <GlassSwitch checked={p.lowPower} onChange={p.setLowPower} />
            </div>
          </GlassPanel>
          <GlassPanel
            className="cc-tile"
            contentClassName="cc-body"
            glass={tileGlass}
          >
            <p className="cc-title">Display and sound</p>
            <div className="cc-row">
              <SunIcon className="cc-icon" />
              <div className="cc-control">
                <span>Brightness</span>
                <GlassSlider
                  className="cc-slider"
                  value={p.bright}
                  onChange={p.setBright}
                  aria-label="Brightness"
                />
              </div>
            </div>
            <div className="cc-row">
              <SpeakerWaveIcon className="cc-icon" />
              <div className="cc-control">
                <span>Volume</span>
                <GlassSlider
                  className="cc-slider"
                  value={p.volume}
                  onChange={p.setVolume}
                  aria-label="Volume"
                />
              </div>
            </div>
            <div className="cc-row">
              <FireIcon className="cc-icon" />
              <div className="cc-control">
                <span>Warmth</span>
                <GlassSlider
                  className="cc-slider"
                  value={p.warmth}
                  onChange={p.setWarmth}
                  aria-label="Warmth"
                />
              </div>
            </div>
          </GlassPanel>
        </div>
        <div className="cc-toggle">
          <GlassToggleGroup
            value={p.appearance}
            onChange={p.setAppearance}
            options={[
              { value: "auto", label: "Auto" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
      </div>
      <CodeBlock code={SWITCH_CODE} lang="jsx" />
    </section>
  );
}

function VideoScene() {
  return (
    <section className="scene shell" data-demo-case="video-media">
      <SceneHeader index="04" title="Glass over live video.">
        A `GlassMediaSurface` registers the video and drives a WebGL shader fed
        the same displacement map, because an SVG filter can't sample a playing
        video. Every frame refracts through the glass controls in real time.
      </SceneHeader>
      <div className="stage stage-center">
        <GlassVideoPlayer width={680} height={383} />
      </div>
      <CodeBlock tabs={VIDEO_CODE} />
    </section>
  );
}

function PatternsScene() {
  return (
    <section className="scene shell" id="catalogue">
      <SceneHeader index="05" title="Use glass where it adds meaning.">
        Start with a card or movable lens, then scale up deliberately. The
        library keeps each effect bounded and chooses a usable browser fallback
        when full refraction would cost too much.
      </SceneHeader>
      <div className="catalogue-grid stage">
        <CatalogueCard
          demoCase={CATALOGUE_CASES.content}
          title="A live content card"
          description="Register one interactive island when the glass should bend changing DOM content."
        >
          <div className="bounded-demo">
            <GlassSurface background className="bounded-surface">
              <div className="surface-stripes" aria-hidden="true" />
              <p>Live content remains selectable and clickable.</p>
            </GlassSurface>
            <Glass className="catalogue-lens" preset="thin" background={false}>
              Live content
            </Glass>
          </div>
        </CatalogueCard>

        <CatalogueCard
          title="A lens users can move"
          description="Drag the lens across a detailed surface. Programmatic moves stay aligned through the public handle."
        >
          <div className="lens-demo">
            <GlassSurface className="lens-demo-surface">
              <span>Quarterly</span>
              <strong>42.8%</strong>
              <div className="lens-demo-chart" aria-hidden="true" />
            </GlassSurface>
            <MovableGlass />
          </div>
        </CatalogueCard>

        <CatalogueCard
          demoCase={CATALOGUE_CASES.partial}
          title="Compose nearby surfaces"
          description="One lens can cross adjacent cards without duplicating their UI or blocking interaction."
        >
          <div className="partial-stage">
            <GlassSurface className="partial-surface partial-a">
              Surface A
            </GlassSurface>
            <GlassSurface className="partial-surface partial-b">
              Surface B
            </GlassSurface>
            <Glass className="partial-lens" radius={28} background={false}>
              A + B
            </Glass>
          </div>
        </CatalogueCard>

        <CatalogueCard
          demoCase={CATALOGUE_CASES.reduced}
          title="A lighter material"
          description="Use the performance profile for repeated controls while keeping the same component API."
        >
          <Glass className="quality-sample" quality="performance">
            quality=&quot;performance&quot;
          </Glass>
        </CatalogueCard>

        <CatalogueCard
          demoCase={CATALOGUE_CASES.oversized}
          title="Graceful on large panes"
          description="Large decorative glass stays legible when the browser selects native blur or tint instead of refraction."
          wide
        >
          <Glass
            className="oversized-sample"
            quality="balanced"
            fallback="blur"
            background="linear-gradient(135deg, #31d8c6, #402d86 55%, #ff9a52)"
          >
            <span>
              Always usable. Full refraction when the browser budget allows it.
            </span>
          </Glass>
        </CatalogueCard>

        <CatalogueCard
          demoCase={CATALOGUE_CASES.density}
          title="A dense component system"
          description="Thirty-two small lenses share an adaptive quality policy, so one dashboard cannot collapse the page."
          wide
        >
          <div
            className="density-grid"
            aria-label="Thirty-two live glass lenses"
          >
            {DENSITY_LENSES.map((id) => (
              <Glass
                className="density-lens"
                quality="balanced"
                preset="thin"
                key={id}
                aria-label={`Glass lens ${Number(id)}`}
              >
                {Number(id)}
              </Glass>
            ))}
          </div>
        </CatalogueCard>

        <VanillaCase />
        <ScopeIsolationCase />
      </div>
      <DiagnosticsPanel />
    </section>
  );
}

function CatalogueCard({
  demoCase,
  title,
  description,
  wide = false,
  children,
}) {
  return (
    <article
      className={`catalogue-card${wide ? " catalogue-card-wide" : ""}`}
      data-demo-case={demoCase}
      tabIndex={0}
    >
      <div className="catalogue-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="catalogue-stage">{children}</div>
    </article>
  );
}

function MovableGlass() {
  const ref = useRef(null);
  const handle = useGlass(ref, {
    background: false,
    quality: "balanced",
    radius: 24,
    depth: 12,
    scale: 32,
    chroma: 0,
    tint: "rgba(5,12,25,.18)",
  });
  const position = useRef({ x: 0, y: 0 });
  const drag = useRef(null);

  return (
    <button
      ref={ref}
      type="button"
      className="glassx lens-inline"
      data-demo-case="draggable-lens"
      aria-label="Draggable glass lens"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          id: event.pointerId,
          x: event.clientX - position.current.x,
          y: event.clientY - position.current.y,
        };
      }}
      onPointerMove={(event) => {
        if (drag.current?.id !== event.pointerId) return;
        position.current = {
          x: event.clientX - drag.current.x,
          y: event.clientY - drag.current.y,
        };
        event.currentTarget.style.transform = `translate(${position.current.x}px, ${position.current.y}px)`;
        handle?.geometryChanged();
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        const directions = {
          ArrowLeft: [-8, 0],
          ArrowRight: [8, 0],
          ArrowUp: [0, -8],
          ArrowDown: [0, 8],
        };
        const delta = directions[event.key];
        if (!delta) return;
        event.preventDefault();
        position.current = {
          x: position.current.x + delta[0],
          y: position.current.y + delta[1],
        };
        event.currentTarget.style.transform = `translate(${position.current.x}px, ${position.current.y}px)`;
        handle?.geometryChanged();
      }}
    >
      Drag lens
    </button>
  );
}

function VanillaCase() {
  const host = useRef(null);
  const scopeRef = useRef(null);
  const [diagnostics, setDiagnostics] = useState(null);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const scope = createGlassScope({ quality: "performance" });
    scopeRef.current = scope;
    const handle = scope.glass(element, { preset: "prominent" });
    const update = () => setDiagnostics(scope.getDiagnostics());
    update();
    const timer = window.setInterval(update, 500);
    return () => {
      window.clearInterval(timer);
      handle.destroy();
      scope.destroy();
      scopeRef.current = null;
    };
  }, []);

  return (
    <CatalogueCard
      demoCase={CATALOGUE_CASES.vanilla}
      title="Vanilla API"
      description="A private scope owns this lens and exposes its real counters without React internals."
    >
      <div ref={host} className="vanilla-sample">
        <code>
          import {`{ createGlassScope }`} from
          &quot;@tomagranate/liquid-glass&quot;;
        </code>
        <span>scope.glass(element)</span>
        <small>{diagnostics?.lenses ?? 0} active lens</small>
      </div>
    </CatalogueCard>
  );
}

function ScopeIsolationCase() {
  return (
    <CatalogueCard
      demoCase={CATALOGUE_CASES.scopes}
      title="Nested root isolation"
      description="Give a modal, microfrontend, or embedded tool its own owner so it never refracts a neighboring app."
    >
      <div className="scope-stage">
        <GlassRoot quality="balanced">
          <GlassSurface className="scope-surface scope-outer">
            Outer scope
            <Glass className="scope-lens">Outer lens</Glass>
            <GlassRoot quality="performance">
              <GlassSurface className="scope-surface scope-inner">
                Inner scope
                <Glass className="scope-lens">Inner lens</Glass>
              </GlassSurface>
            </GlassRoot>
          </GlassSurface>
        </GlassRoot>
      </div>
    </CatalogueCard>
  );
}

function DiagnosticsPanel() {
  const diagnostics = useGlassDiagnostics();
  const invariantWindow = useRef({
    diagnostics: null,
    geometry: null,
    media: null,
    label: "pending — awaiting second sample",
  });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(CATALOGUE_CASES.wallpaper);
  const [snapshot, setSnapshot] = useState({
    backends: ["pending"],
    lenses: 0,
  });

  useEffect(() => {
    const select = (event) => {
      const match = event.target.closest?.("[data-demo-case]");
      if (match?.dataset.demoCase) setSelected(match.dataset.demoCase);
    };
    document.addEventListener("pointerdown", select, true);
    document.addEventListener("focusin", select, true);
    return () => {
      document.removeEventListener("pointerdown", select, true);
      document.removeEventListener("focusin", select, true);
    };
  }, []);

  useEffect(() => {
    const read = () => {
      const previous = invariantWindow.current;
      let invariant = previous.label;
      if (previous.diagnostics !== diagnostics) {
        if (previous.geometry != null && previous.media != null) {
          const geometryDelta = Math.max(
            0,
            diagnostics.geometryRafCallbacks - previous.geometry,
          );
          const mediaDelta = Math.max(
            0,
            diagnostics.mediaRafCallbacks - previous.media,
          );
          const callbacks = geometryDelta + mediaDelta;
          invariant =
            callbacks === 0
              ? "idle — no callbacks this window"
              : `active — ${callbacks} callbacks this window`;
        }
        invariantWindow.current = {
          diagnostics,
          geometry: diagnostics.geometryRafCallbacks,
          media: diagnostics.mediaRafCallbacks,
          label: invariant,
        };
      }
      const root = document.querySelector(`[data-demo-case="${selected}"]`);
      const lenses = [...(root?.querySelectorAll("[data-lg-backend]") ?? [])];
      if (root?.matches("[data-lg-backend]")) lenses.unshift(root);
      const backends = [
        ...new Set(
          lenses.flatMap((el) =>
            (el.dataset.lgBackend || "pending").split(",").filter(Boolean),
          ),
        ),
      ];
      const policy = lenses.some((el) =>
        el.dataset.lgBackend?.includes("native"),
      )
        ? "budget or browser fallback"
        : backends.includes("none")
          ? "effect unavailable"
          : "within active policy";
      setSnapshot({
        backends: backends.length ? backends : ["pending"],
        lenses: lenses.length,
        quality:
          selected === CATALOGUE_CASES.reduced ? "performance" : "balanced",
        policy: diagnostics.policy.at(-1)?.reason ?? policy,
        dpr: diagnostics.policy.at(-1)?.dpr,
        chroma: diagnostics.policy.at(-1)?.chroma,
        surfaces: diagnostics.contentSurfaces + diagnostics.mediaSurfaces,
        invariant,
      });
    };
    read();
  }, [diagnostics, selected]);

  const engine = /Firefox/i.test(navigator.userAgent)
    ? "Firefox"
    : /Safari/i.test(navigator.userAgent) &&
        !/Chrome|Chromium/i.test(navigator.userAgent)
      ? "Safari"
      : "Chromium";

  return (
    <aside
      className="diagnostics"
      data-open={open}
      aria-label="Glass diagnostics"
    >
      <button
        type="button"
        className="diagnostics-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>How this browser rendered the examples</span>
        <strong>{snapshot.backends.join(" + ")}</strong>
      </button>
      {open && (
        <dl className="diagnostics-grid">
          <div>
            <dt>Example</dt>
            <dd>{selected}</dd>
          </div>
          <div>
            <dt>Browser</dt>
            <dd>{engine}</dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>{snapshot.backends.join(", ")}</dd>
          </div>
          <div>
            <dt>Quality</dt>
            <dd>{snapshot.quality}</dd>
          </div>
          <div>
            <dt>Fallback</dt>
            <dd>{snapshot.policy}</dd>
          </div>
          <div>
            <dt>Active lens / surface</dt>
            <dd>{`${diagnostics.lenses} / ${snapshot.surfaces ?? 0}`}</dd>
          </div>
          <div>
            <dt>Effective detail</dt>
            <dd>
              {snapshot.dpr == null
                ? "pending"
                : `DPR ${snapshot.dpr} · chroma ${snapshot.chroma}`}
            </dd>
          </div>
          <div>
            <dt>Polling-window invariant</dt>
            <dd>{snapshot.invariant}</dd>
          </div>
        </dl>
      )}
    </aside>
  );
}

function CanvasMediaScene() {
  return (
    <section className="scene shell" data-demo-case="canvas-media">
      <SceneHeader index="06" title="Glass over a canvas, with the public API.">
        Charts, maps, games, and editors paint pixels that SVG filters cannot
        read. The media surface uploads that canvas only while a lens overlaps
        it. Disabling general background sampling makes this control explicitly
        refract the live canvas in every supported browser.
      </SceneHeader>
      <div className="stage stage-center">
        <CanvasChart />
      </div>
      <CodeBlock code={CANVAS_CODE} lang="jsx" />
    </section>
  );
}

function CanvasChart() {
  const canvasRef = useRef(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0;
    let animation = 0;
    let visible = true;
    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#08243c");
      gradient.addColorStop(0.55, "#125f71");
      gradient.addColorStop(1, "#421e62");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "rgba(255,255,255,.12)";
      context.lineWidth = 1;
      for (let x = 0; x <= width; x += 40) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let y = 0; y <= height; y += 40) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      context.beginPath();
      for (let x = 0; x <= width; x += 4) {
        const y =
          height * 0.58 -
          Math.sin(x * 0.022 + frame * 0.025) * 34 -
          Math.sin(x * 0.007) * 48;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = "#8ff7df";
      context.lineWidth = 5;
      context.shadowColor = "rgba(75,255,221,.5)";
      context.shadowBlur = 16;
      context.stroke();
      context.shadowBlur = 0;
      context.fillStyle = "rgba(255,255,255,.9)";
      context.font = "600 15px InterVariable, sans-serif";
      context.fillText("Live signal", 24, 34);
      frame += 1;
      animation = visible ? requestAnimationFrame(draw) : 0;
    };
    draw();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      cancelAnimationFrame(animation);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return () => cancelAnimationFrame(animation);
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) {
        cancelAnimationFrame(animation);
        animation = 0;
      } else if (!animation) {
        draw();
      }
    });
    observer.observe(canvas);
    return () => {
      visible = false;
      cancelAnimationFrame(animation);
      observer.disconnect();
    };
  }, []);

  return (
    <GlassMediaSurface live className="canvas-media-frame">
      <canvas
        ref={canvasRef}
        className="canvas-media-source"
        width="760"
        height="360"
        aria-label="Animated live signal chart"
      />
      <Glass
        as="button"
        type="button"
        className="canvas-media-control"
        background={false}
        radius={999}
        depth={18}
        scale={56}
        tint="rgba(5,12,25,.22)"
      >
        Inspect live data
      </Glass>
    </GlassMediaSurface>
  );
}

function PlaygroundScene({ tune, setTune }) {
  const set = (key) => (v) => setTune((t) => ({ ...t, [key]: v }));
  return (
    <section
      className="scene shell"
      id="playground"
      data-demo-case="material-update"
    >
      <SceneHeader index="07" title="Mix your own material.">
        Tune a real component against a detailed test pattern. Each slider calls
        `handle.update()` on the same lens, so material changes are immediate
        and the component keeps its state, focus, and event handlers.
      </SceneHeader>
      <div className="stage playground">
        <div className="specimen-stage">
          <GlassSurface className="specimen-source">
            <span>Live surface</span>
            <div aria-hidden="true" />
          </GlassSurface>
          <Specimen tune={tune} />
        </div>
        <GlassPanel
          className="mixer"
          contentClassName="mixer-body"
          glass={{ tint: "rgba(8,10,20,0.45)", blur: 3, rimLight: 0.7 }}
        >
          <Range
            label="Displacement"
            value={tune.scale}
            display={tune.scale}
            min={0}
            max={160}
            onChange={set("scale")}
          />
          <Range
            label="Rim depth"
            value={tune.depth}
            display={tune.depth}
            min={1}
            max={48}
            onChange={set("depth")}
          />
          <Range
            label="Chromatic aberration"
            value={tune.chroma}
            display={tune.chroma.toFixed(2)}
            min={0}
            max={1}
            step={0.01}
            onChange={set("chroma")}
          />
          <Range
            label="Frost"
            value={tune.blur}
            display={tune.blur.toFixed(1)}
            min={0}
            max={8}
            step={0.1}
            onChange={set("blur")}
          />
          <Range
            label="Specular"
            value={tune.specular}
            display={tune.specular.toFixed(2)}
            min={0}
            max={1}
            step={0.01}
            onChange={set("specular")}
          />
          <Range
            label="Rim light"
            value={tune.rimLight}
            display={tune.rimLight.toFixed(2)}
            min={0}
            max={1.5}
            step={0.01}
            onChange={set("rimLight")}
          />
        </GlassPanel>
      </div>
      <CodeBlock code={PLAYGROUND_CODE} lang="jsx" />
    </section>
  );
}

/* A standalone glass specimen whose material is tuned via handle.update(). */
function Specimen({ tune }) {
  const ref = useRef(null);
  const handle = useGlass(ref, { radius: 32, background: false, ...tune });

  useEffect(() => {
    handle?.update({ radius: 32, background: false, ...tune });
  }, [handle, tune]);

  return (
    <div ref={ref} className="glassx specimen">
      <span className="specimen-label">Specimen</span>
    </div>
  );
}

function rangeName(label) {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function Range({ label, display, onChange, name = rangeName(label), ...rest }) {
  return (
    <label className="range">
      <span className="range-top">
        {label}
        <code>{display}</code>
      </span>
      <input
        type="range"
        name={name}
        {...rest}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

/* ── Footer and wallpaper switcher ──────────────────────────────────────── */

function Footer() {
  return (
    <footer className="footer shell">
      <p>
        MIT licensed. Built by <a href={REPO}>Tom Grant</a>.
      </p>
      <p className="footer-credit">
        Footage: Oregon Coast Odyssey by EagleView,{" "}
        <a href="https://commons.wikimedia.org/wiki/File:Oregon_Coast_Odyssey-_FPV_Drone_Captures_Stunning_Ocean_Views.webm">
          CC BY 3.0, via Wikimedia Commons
        </a>
        .
      </p>
    </footer>
  );
}

function WallpaperSwitcher({ current, onSelect }) {
  return (
    <GlassPanel
      className="switcher"
      contentClassName="switcher-row"
      glass={{ radius: 999, blur: 2 }}
    >
      {WALLPAPERS.map((wp) => (
        <button
          key={wp.id}
          type="button"
          className="switcher-swatch"
          data-active={wp.id === current.id}
          style={{ backgroundImage: `url(${wp.file})` }}
          onClick={() => onSelect(wp)}
          aria-label={`Wallpaper: ${wp.label}`}
          title={wp.label}
        />
      ))}
    </GlassPanel>
  );
}
