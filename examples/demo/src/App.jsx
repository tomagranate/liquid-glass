import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
  FireIcon,
  MoonIcon,
  SunIcon,
  SpeakerWaveIcon,
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
import { useGlass } from "@tomagranate/liquid-glass";
import { GlassCopyContext } from "./glass/flat.ts";
import { useCopyWallpaper } from "./glass/useCopyWallpaper.ts";
import {
  GlassButton,
  GlassDock,
  GlassLens,
  GlassPanel,
  GlassShockwave,
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

export default function App() {
  const [wallpaper, setWallpaper] = useState(WALLPAPERS[2]);

  // All interactive demo state lives here: it survives the wallpaper remount,
  // and — because the nav and lens each render a second copy of the scenes —
  // passing the same props to every copy keeps them in sync automatically.
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

  // The engine refracts whatever `--lq-backdrop` paints; keep the real page
  // background and the refracted copy pointed at the same image.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      "--lq-backdrop",
      `url(${wallpaper.file})`,
    );
    document.body.style.backgroundImage = `url(${wallpaper.file})`;
    document.body.style.backgroundColor = wallpaper.base;
  }, [wallpaper]);

  // The element whose content the nav and lens refract.
  const pageRef = useRef(null);
  const alignToPage = useCallback(() => pageRef.current, []);
  // `inert` (set via ref: React 18 has no attribute support) makes the copies
  // unfocusable and invisible to assistive tech in one stroke.
  const inertRef = useCallback((node) => {
    if (node) node.inert = true;
  }, []);

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
    tune,
    setTune,
  };

  // A flat, inert duplicate of the page for a glass surface to refract.
  // Rendered once per surface (nav, lens); layout must match the real page.
  const pageCopy = (
    <GlassCopyContext.Provider value={true}>
      <div className="page-copy" aria-hidden="true" ref={inertRef}>
        <Scenes {...sceneProps} />
      </div>
    </GlassCopyContext.Provider>
  );

  return (
    // Remount on wallpaper change so every controller re-reads the backdrop.
    <div key={wallpaper.id}>
      <Nav alignTo={alignToPage} copy={pageCopy} />
      <div ref={pageRef}>
        <main>
          <Scenes
            {...sceneProps}
            lensAlignTo={alignToPage}
            lensCopy={pageCopy}
          />
        </main>
      </div>
      <WallpaperSwitcher current={wallpaper} onSelect={setWallpaper} />
    </div>
  );
}

/* Everything that scrolls under the nav. Rendered up to three times: the real
   page, the nav's refraction copy, and the lens's refraction copy. */
function Scenes(p) {
  return (
    <>
      <Hero lensAlignTo={p.lensAlignTo} lensCopy={p.lensCopy} />
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
      <ShockwaveScene />
      <PlaygroundScene tune={p.tune} setTune={p.setTune} />
      <Footer />
    </>
  );
}

/* ── Chrome ─────────────────────────────────────────────────────────────── */

/**
 * The fixed glass nav. Its refraction layer holds a wallpaper slice plus a
 * flat copy of the page content, aligned to the real page every frame
 * (refraction-target mode) — so headlines genuinely bend through the bar as
 * they scroll past.
 */
function Nav({ alignTo, copy }) {
  const g = useGlass({
    radius: 999,
    depth: 20,
    scale: 56,
    blur: 2.5,
    chroma: 0.5,
    specular: 0.35,
    rimLight: 0.9,
    tint: "rgba(255,255,255,0.08)",
    shadow: "0 18px 50px rgba(0,0,0,0.35)",
    alignTo,
  });
  const wallpaperRef = useCopyWallpaper(alignTo);

  return (
    <div
      className="glassx nav lq"
      ref={g.hostRef}
      // The backdrop copy is huge; never let find-in-page or programmatic
      // scrolling shift it inside the overflow-hidden host.
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
    >
      <div ref={g.refractionRef} className="lq-refraction">
        <div ref={g.backdropRef} className="lq-backdrop">
          <div ref={wallpaperRef} className="copy-wallpaper" />
          {copy}
        </div>
      </div>
      <div ref={g.sheenRef} className="lq-sheen" />
      <div className="lq-content nav-row">
        <a className="nav-brand" href="#top" aria-label="Liquid Glass — home">
          <LensMark />
          liquid-glass
        </a>
        <nav className="nav-links" aria-label="Site">
          <a href="https://www.npmjs.com/package/@tomagranate/liquid-glass">
            npm
          </a>
          <a href={REPO}>GitHub</a>
        </nav>
      </div>
    </div>
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

function Hero({ lensAlignTo, lensCopy }) {
  const flat = useContext(GlassCopyContext);
  const [copied, setCopied] = useState(false);

  const copyInstall = () => {
    navigator.clipboard
      ?.writeText("npm install @tomagranate/liquid-glass")
      .catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    // No ids inside refraction copies — they'd shadow the real anchors.
    <header className="hero shell" id={flat ? undefined : "top"}>
      <p className="eyebrow">@tomagranate/liquid-glass</p>
      <h1 className="hero-title">Interfaces that bend light.</h1>
      <p className="lede">
        An Apple-style liquid-glass material for the web, built on a single SVG
        filter primitive. Every surface on this page refracts what lies behind
        it — wallpaper and content alike. No screenshots, no backdrop hacks, and
        a WebGL fallback for canvas and video.
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
      <GlassLens
        className="hero-lens"
        size={200}
        hint="Drag me"
        alignTo={lensAlignTo}
        copy={lensCopy}
      />
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
  const flat = useContext(GlassCopyContext);
  return (
    <section className="scene shell" id={flat ? undefined : "dock"}>
      <SceneHeader index="01" title="One slab of glass, eight apps.">
        The dock is a single refracting surface; the icons ride on top of it in
        the content layer. Hover an icon — the wallpaper stays bent underneath
        while the content moves freely.
      </SceneHeader>
      <div className="stage stage-center">
        <GlassDock />
      </div>
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
    <section className="scene shell">
      <SceneHeader
        index="02"
        title="Read your notifications through the wallpaper."
      >
        Cards frost just enough to keep text legible while the rim keeps bending
        the picture behind them, and the progress thumb in the player is a
        moving lens refracting the track underneath.
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
          body="v0.0.3 — refraction without screenshots"
        />
      </div>
    </section>
  );
}

function MusicWidget({ playing, setPlaying, progress, setProgress }) {
  return (
    <GlassPanel className="lock-card" contentClassName="widget">
      <div className="widget-top">
        <span className="widget-art" aria-hidden="true" />
        <div className="widget-meta">
          <p className="widget-title">Total Internal Reflection</p>
          <p className="widget-artist">Caustics</p>
        </div>
        <div className="widget-controls">
          <button type="button" className="widget-btn" aria-label="Previous">
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
          <button type="button" className="widget-btn" aria-label="Next">
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
    <GlassPanel className="lock-card" contentClassName="notif">
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
   tint and frost are plain options, so switching them is just an update. */
const APPEARANCE_GLASS = {
  auto: {},
  light: { tint: "rgba(255,255,255,0.34)", blur: 3, rimLight: 1.1 },
  dark: { tint: "rgba(8,10,22,0.5)", blur: 3, rimLight: 0.6 },
};

function ControlCenterScene(p) {
  const tileGlass = APPEARANCE_GLASS[p.appearance];
  return (
    <section className="scene shell">
      <SceneHeader index="03" title="Controls with real lenses for thumbs.">
        Switch thumbs refract the track color sliding beneath them, and the
        segmented control mixes the tiles a lighter or darker glass — tint and
        frost are just material options.
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
              <GlassSlider
                className="cc-slider"
                value={p.bright}
                onChange={p.setBright}
                aria-label="Brightness"
              />
            </div>
            <div className="cc-row">
              <SpeakerWaveIcon className="cc-icon" />
              <GlassSlider
                className="cc-slider"
                value={p.volume}
                onChange={p.setVolume}
                aria-label="Volume"
              />
            </div>
            <div className="cc-row">
              <FireIcon className="cc-icon" />
              <GlassSlider
                className="cc-slider"
                value={p.warmth}
                onChange={p.setWarmth}
                aria-label="Warmth"
              />
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
    </section>
  );
}

function VideoScene() {
  return (
    <section className="scene shell">
      <SceneHeader index="04" title="Glass over live video.">
        An SVG filter can't sample a playing video, so these controls fall back
        to a WebGL shader fed the same displacement map — every frame refracts
        through the buttons in real time.
      </SceneHeader>
      <div className="stage stage-center">
        <GlassVideoPlayer width={680} height={383} />
      </div>
    </section>
  );
}

function ShockwaveScene() {
  return (
    <section className="scene shell">
      <SceneHeader index="05" title="Shockwaves through the light field.">
        Tap the field to send one slow, wide refracting pulse across the source
        pixels. The wavefront bends the geometry, glints, and then fades back
        into register.
      </SceneHeader>
      <div className="stage">
        <GlassShockwave />
      </div>
    </section>
  );
}

function PlaygroundScene({ tune, setTune }) {
  const flat = useContext(GlassCopyContext);
  const set = (key) => (v) => setTune((t) => ({ ...t, [key]: v }));
  return (
    <section className="scene shell" id={flat ? undefined : "playground"}>
      <SceneHeader index="06" title="Mix your own material.">
        Displacement, rim depth, chromatic aberration, frost, and rim light are
        all parameters. Tune the specimen, then ship the numbers you like.
      </SceneHeader>
      <div className="stage playground">
        <div className="specimen-stage">
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
    </section>
  );
}

/* A standalone glass surface (backdrop-clone mode) whose material is tunable. */
function Specimen({ tune }) {
  const flat = useContext(GlassCopyContext);
  return flat ? (
    <div className="specimen lq glassx-flat">
      <span className="lq-content specimen-label">Specimen</span>
    </div>
  ) : (
    <SpecimenImpl tune={tune} />
  );
}

function SpecimenImpl({ tune }) {
  const g = useGlass({ radius: 32, ...tune });
  return (
    <div ref={g.hostRef} className="specimen lq">
      <div ref={g.refractionRef} className="lq-refraction">
        <div ref={g.backdropRef} className="lq-backdrop" />
      </div>
      <div ref={g.sheenRef} className="lq-sheen" />
      <span className="lq-content specimen-label glass-fg">Specimen</span>
    </div>
  );
}

function Range({ label, display, onChange, ...rest }) {
  return (
    <label className="range">
      <span className="range-top">
        {label}
        <code>{display}</code>
      </span>
      <input
        type="range"
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
