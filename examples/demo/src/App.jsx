import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ClipboardIcon,
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
import { ChatBubbleOvalLeftEllipsisIcon } from "@heroicons/react/24/solid";
import {
  Glass,
  GlassMedia,
  GlassOverMedia,
  GlassOverPage,
  GlassOverRegion,
  GlassOverWallpaper,
  GlassRegion,
  GlassRoot,
  useGlassDiagnostics,
  useGlassOverRegion,
} from "@tomagranate/liquid-glass/react";
import { createGlassScope, setBackground } from "@tomagranate/liquid-glass";
import { CodeBlock } from "./CodeBlock.jsx";
import {
  GlassButton,
  GlassDock,
  GlassLens,
  GlassPanel,
  GlassSlider,
  GlassSwitch,
  GlassVideoPlayer,
} from "./glass/index.ts";

const REPO = "https://github.com/tomagranate/liquid-glass";
const SUPPORT_URL = "?browser-support";

/**
 * Local re-implementation of the library's `detectEngine` (src/core/policy.ts).
 * The public API doesn't export it, so the demo mirrors the same UA check
 * rather than reaching into core internals. Kept intentionally tiny and in
 * lock-step with the library so the honest signals below match reality.
 */
function detectEngine() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Firefox\//.test(ua)) return "firefox";
  if (/AppleWebKit\//.test(ua) && !/(?:Chrome|Chromium|Edg)\//.test(ua)) {
    return "webkit";
  }
  return "chromium";
}

const ENGINE_LABEL = { webkit: "Safari", firefox: "Firefox" };

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

/* ── Demo case ids (kept in sync with the regression tour) ─────────────────── */

const CASES = {
  wallpaper: "wallpaper-zero-config",
  backdrop: "live-backdrop-auto-fallback",
  slider: "slider",
  content: "bounded-content-surface",
  lens: "draggable-lens",
  switch: "switch-slider-toggle",
  video: "video-media",
  material: "material-update",
  partial: "partial-overlap-composition",
  reduced: "reduced-quality",
  oversized: "oversized-surface-fallback",
  density: "density-32-lenses",
  vanilla: "vanilla-api",
  scopes: "nested-scope-isolation",
  canvas: "canvas-media",
};

/* ── Section snippets (≤6 lines, one API introduced each) ──────────────────── */

// One full-width code block sits below the four-pane grid.
const EXAMPLES_CODE = [
  {
    label: "Page",
    lang: "jsx",
    code: `import { GlassOverPage } from "@tomagranate/liquid-glass/react";

// Chromium refracts the live page. Safari and Firefox use polished frost.
<GlassOverPage as="nav" radius={999}>
  {links}
</GlassOverPage>`,
  },
  {
    label: "Region",
    lang: "jsx",
    code: `import { GlassOverRegion, GlassRegion } from "@tomagranate/liquid-glass/react";

// Mark a bounded live DOM region. Keep the lens outside the marked subtree.
<GlassRegion>{liveContent}</GlassRegion>
<GlassOverRegion radius="50%" />`,
  },
  {
    label: "Media",
    lang: "jsx",
    code: `import { GlassMedia, GlassOverMedia } from "@tomagranate/liquid-glass/react";

<GlassMedia live>
  <video src="/coast.mp4" muted loop playsInline />
  <GlassOverMedia as="button" radius="50%">{playIcon}</GlassOverMedia>
</GlassMedia>`,
  },
  {
    label: "Wallpaper",
    lang: "jsx",
    code: `import { GlassOverWallpaper } from "@tomagranate/liquid-glass/react";

// Use this only when the CSS artwork is known and safe to paint again.
<GlassOverWallpaper wallpaper="url(/art.webp)" radius={999}>
  Brand artwork
</GlassOverWallpaper>`,
  },
];

const CONTROLS_CODE = [
  {
    label: "React",
    lang: "jsx",
    code: `import { useGlassOverRegion, useGlassRegion } from "@tomagranate/liquid-glass/react";

function Slider({ value }) {
  const track = useRef(null);
  const thumb = useRef(null);
  useGlassRegion(track);
  useGlassOverRegion(thumb, { radius: 999 });
  return (
    <div className="slider">
      <div ref={track} className="track">
        <div className="fill" style={{ width: \`\${value}%\` }} />
      </div>
      <div ref={thumb} className="thumb" style={{ left: \`\${value}%\` }} />
    </div>
  );
}`,
  },
  {
    label: "Vanilla",
    lang: "js",
    code: `import { createGlassRegion, glassOverRegion } from "@tomagranate/liquid-glass";

const track = document.querySelector(".slider-track");
const thumb = document.querySelector(".slider-thumb");
createGlassRegion(track);
const handle = glassOverRegion(thumb, { radius: 999 });

input.addEventListener("input", () => {
  thumb.style.left = input.value + "%";
  handle.geometryChanged();
});`,
  },
];

const CANVAS_CODE = [
  {
    label: "React",
    lang: "jsx",
    code: `import { GlassMedia, GlassOverMedia } from "@tomagranate/liquid-glass/react";

<GlassMedia live>
  <canvas ref={chartRef} />
  <GlassOverMedia as="button" radius={999}>Inspect live data</GlassOverMedia>
</GlassMedia>`,
  },
  {
    label: "Vanilla",
    lang: "js",
    code: `import { createGlassMedia, glassOverMedia } from "@tomagranate/liquid-glass";

createGlassMedia(document.querySelector("canvas"), { live: true });
glassOverMedia(document.querySelector(".chart-control"), { radius: 999 });`,
  },
];

const DENSITY_LENSES = Array.from({ length: 32 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

/* ── App ───────────────────────────────────────────────────────────────────── */

export default function App() {
  const [wallpaper, setWallpaper] = useState(WALLPAPERS[2]);
  const [wifi, setWifi] = useState(true);
  const [focus, setFocus] = useState(false);
  const [bright, setBright] = useState(72);
  const [volume, setVolume] = useState(46);
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

  const isFixtures =
    typeof location !== "undefined" && /fixtures/.test(location.search);
  const isBrowserSupport =
    typeof location !== "undefined" && /browser-support/.test(location.search);
  const showDiagnostics =
    typeof location !== "undefined" && /diagnostics/.test(location.search);

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

  if (isFixtures) {
    return (
      <div className="app-root">
        <div className="app-scroller">
          <FixturesPage />
        </div>
      </div>
    );
  }

  if (isBrowserSupport) {
    return (
      <div className="app-root">
        <div className="app-scroller">
          <main>
            <BrowserSupportPage />
          </main>
        </div>
        <div className="overlay-layer">
          <Nav />
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <div className="app-scroller">
        <main>
          <Hero wallpaper={wallpaper} setWallpaper={setWallpaper} />
          <ExamplesSection wallpaper={wallpaper} />
          <ComposedScene
            now={now}
            playing={playing}
            setPlaying={setPlaying}
            progress={progress}
            setProgress={setProgress}
            wifi={wifi}
            setWifi={setWifi}
            focus={focus}
            setFocus={setFocus}
            bright={bright}
            setBright={setBright}
            volume={volume}
            setVolume={setVolume}
          />
          <PlaygroundScene tune={tune} setTune={setTune} />
          <BudgetStrip />
          <Footer />
        </main>
      </div>

      {/* General chrome explicitly targets the live page. */}
      <div className="overlay-layer">
        <Nav />
        <HeroLens />
      </div>

      {showDiagnostics && <DiagnosticsPanel />}
    </div>
  );
}

/* ── Chrome ─────────────────────────────────────────────────────────────────── */

/**
 * The glass nav bar. It lives in the overlay layer over the page surface, so
 * `surfaces: "auto"` registers it against the surface and it bends whatever
 * scrolls beneath — one `<Glass>`, no duplicate copy of the page.
 */
function Nav() {
  return (
    <GlassOverPage
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
    </GlassOverPage>
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

/* A draggable lens floating over the hero. It lives in the overlay layer so it
   refracts the live page, but hides once the hero scrolls out of view so it
   never covers the sections below. */
function HeroLens() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const hero = document.getElementById("top");
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.intersectionRatio > 0.2),
      { threshold: [0, 0.2, 1] },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  if (!visible) return null;
  return <GlassLens className="hero-lens" size={172} />;
}

/* ── Browser-honesty signals (capability-driven, never a per-browser fork) ──── */

/**
 * One quiet line under the hero lede, shown only on non-Chromium engines. It
 * names the rendition the visitor is actually seeing and links to the browser
 * support page. Nothing renders on Chromium.
 */
function HeroEngineNote() {
  const engine = detectEngine();
  if (engine === "chromium") return null;
  const label = ENGINE_LABEL[engine] ?? "current";
  return (
    <p className="hero-engine-note">
      You're seeing the {label} rendition. Page glass uses polished frost.
      Marked regions and media still refract. Chromium can refract the live
      page. <a href={SUPPORT_URL}>Browser support →</a>
    </p>
  );
}

/**
 * A tiny "frosted fallback" pill pinned to a showcase stage. It is purely
 * capability-driven: it polls the `[data-lg-backend]` elements inside `watch`
 * and only appears when one of them actually reports a `native` backend (i.e.
 * the piece exceeded this browser's budget). It never keys off the user agent,
 * so it adds zero visual noise on Chromium where nothing falls back. The chip
 * itself is a plain link and carries no `data-lg-backend`, so the regression
 * tour's backend queries never see it.
 */
function FallbackChip({ watch }) {
  const [fellBack, setFellBack] = useState(false);
  useEffect(() => {
    const resolve = () => {
      if (!watch) return null;
      if (typeof watch === "string") return document.querySelector(watch);
      return watch.current ?? null;
    };
    const read = () => {
      const root = resolve();
      if (!root) return setFellBack(false);
      const nodes = [
        ...(root.matches?.("[data-lg-backend]") ? [root] : []),
        ...root.querySelectorAll("[data-lg-backend]"),
      ];
      const native = nodes.some((node) =>
        (node.dataset.lgBackend || "").split(",").includes("native"),
      );
      setFellBack(native);
    };
    read();
    const timer = window.setInterval(read, 500);
    return () => window.clearInterval(timer);
  }, [watch]);

  if (!fellBack) return null;
  return (
    <a
      className="fallback-chip"
      href={SUPPORT_URL}
      title="This piece exceeded this browser's budget and uses the native frost. Details →"
    >
      frosted fallback
    </a>
  );
}

/* ── 1. Hero ─────────────────────────────────────────────────────────────────── */

function Hero({ wallpaper, setWallpaper }) {
  const [manager, setManager] = useState("npm");
  const [copied, setCopied] = useState(false);
  const installCommands = {
    npm: "npm install @tomagranate/liquid-glass",
    pnpm: "pnpm add @tomagranate/liquid-glass",
    bun: "bun add @tomagranate/liquid-glass",
  };
  const managers = Object.keys(installCommands);

  const copyInstall = () => {
    navigator.clipboard?.writeText(installCommands[manager]).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <header className="hero shell" id="top" data-demo-case={CASES.wallpaper}>
      <p className="eyebrow">@tomagranate/liquid-glass</p>
      <h1 className="hero-title">Interfaces that bend light.</h1>
      <p className="lede">
        Add real refraction to buttons, cards, docks, and media controls—without
        turning your whole page into a GPU stress test.
      </p>
      <HeroEngineNote />
      <div className="hero-actions">
        <GlassButton
          variant="primary"
          onClick={() =>
            document
              .getElementById("examples")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          See it in action
        </GlassButton>
        <GlassButton
          variant="ghost"
          onClick={() => window.open(REPO, "_blank", "noopener")}
        >
          <GitHubIcon className="glassx-btn-icon" />
          View on GitHub
        </GlassButton>
      </div>
      <div className="install-card" aria-label="Install liquid-glass">
        <div
          className="install-tabs"
          role="tablist"
          aria-label="Package manager"
        >
          {managers.map((name, index) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={manager === name}
              aria-controls="install-command"
              onClick={() => setManager(name)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                event.preventDefault();
                const direction = event.key === "ArrowRight" ? 1 : -1;
                const next =
                  managers[
                    (index + direction + managers.length) % managers.length
                  ];
                setManager(next);
                event.currentTarget.parentElement
                  ?.querySelector(`[data-manager="${next}"]`)
                  ?.focus();
              }}
              data-manager={name}
            >
              {name}
            </button>
          ))}
        </div>
        <button type="button" className="install" onClick={copyInstall}>
          <code id="install-command">{installCommands[manager]}</code>
          {copied ? (
            <CheckIcon className="install-icon" />
          ) : (
            <ClipboardIcon className="install-icon" />
          )}
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? "Install command copied" : ""}
        </span>
      </div>
      <div className="hero-wallpapers">
        <span>Try another wallpaper</span>
        <WallpaperSwitcher current={wallpaper} onSelect={setWallpaper} />
      </div>
    </header>
  );
}

/* ── 2. Four explicit glass interfaces ──────────────────────────────────────── */

function ExamplesSection({ wallpaper }) {
  return (
    <section className="scene shell examples" id="examples">
      <div className="scene-head">
        <p className="eyebrow">Made for real interfaces</p>
        <h2 className="scene-title">Choose what sits behind the glass.</h2>
        <p className="scene-sub">
          Each interface names its source. The name also states its browser
          limits and performance cost.
        </p>
      </div>
      <div className="examples-grid stage">
        <ExamplePane
          title="Page glass"
          caption={
            <>
              Chromium bends the <strong>live page</strong>. Safari and Firefox
              use polished frost. They do not copy or bend arbitrary page
              content.
            </>
          }
        >
          <div className="wallpaper-demo">
            <div className="wallpaper-drift" aria-hidden="true">
              <p>Live page content</p>
              <p>scrolls and drifts</p>
              <p>behind the glass —</p>
              <p>watch it bend through</p>
              <p>the pill on Chromium.</p>
            </div>
            <GlassOverPage className="wallpaper-pill" radius={999}>
              Navigation
            </GlassOverPage>
          </div>
        </ExamplePane>

        <ExamplePane
          title="Region glass"
          caption={
            <>
              Mark a bounded region. An SVG filter bends its{" "}
              <strong>own live DOM in every browser</strong>—that is the
              difference from wallpaper glass. The content behind the lens stays
              selectable and clickable.
            </>
          }
        >
          <div className="lens-demo" data-demo-case={CASES.content}>
            <GlassRegion className="lens-demo-surface">
              <span>Conversion</span>
              <strong>42.8%</strong>
              <div className="lens-demo-chart" aria-hidden="true" />
            </GlassRegion>
            <MovableGlass />
          </div>
        </ExamplePane>

        <ExamplePane
          title="Wallpaper glass"
          caption={
            <>
              Use this for <strong>known CSS artwork</strong>. The library can
              paint that artwork again. Do not use it for arbitrary page UI.
            </>
          }
        >
          <div className="wallpaper-demo">
            <GlassOverWallpaper
              className="wallpaper-pill"
              wallpaper={`url(${wallpaper.file})`}
              radius={999}
            >
              Brand artwork
            </GlassOverWallpaper>
          </div>
        </ExamplePane>

        <ExamplePane
          title="Media glass"
          caption={
            <>
              Video and canvas go through a WebGL backend, because browser
              filters <strong>cannot read video or canvas pixels</strong>.
              Canvas works identically.
            </>
          }
        >
          <div className="media-demo" data-demo-case={CASES.video}>
            <GlassVideoPlayer width={420} height={264} />
          </div>
        </ExamplePane>
      </div>

      <CodeBlock tabs={EXAMPLES_CODE} />
    </section>
  );
}

function ExamplePane({ title, caption, children }) {
  const stage = useRef(null);
  return (
    <article className="example-pane">
      <div ref={stage} className="example-stage">
        {children}
        <FallbackChip watch={stage} />
      </div>
      <h3 className="example-title">{title}</h3>
      <p className="example-caption">{caption}</p>
    </article>
  );
}

/* ── 3. Built from real controls (one composed lock-screen vignette) ─────────── */

function ComposedScene(p) {
  const stage = useRef(null);
  const time = p.now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = p.now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="scene shell composed">
      <div className="scene-head">
        <p className="eyebrow">Built from real controls</p>
        <h2 className="scene-title">One material, a whole interface.</h2>
        <p className="scene-sub">
          Switches, sliders, and a media player are working controls, not a
          painted mockup. Each small lens bends the surface beneath it without
          putting the page on an animation loop.
        </p>
      </div>

      <div ref={stage} className="stage lockscreen">
        <div className="lock-head">
          <p className="lock-time">{time}</p>
          <p className="lock-date">{date}</p>
        </div>

        <div className="lock-body">
          <div className="lock-col">
            <div data-demo-case={CASES.slider}>
              <MusicWidget
                playing={p.playing}
                setPlaying={p.setPlaying}
                progress={p.progress}
                setProgress={p.setProgress}
              />
            </div>
            <Notification
              gradient="linear-gradient(180deg, #6be07a, #12b845)"
              Icon={ChatBubbleOvalLeftEllipsisIcon}
              app="Messages"
              time="now"
              title="Maya"
              body="Are you seeing this? The wallpaper bends right through the card."
            />
          </div>

          <div className="lock-col">
            <div data-demo-case={CASES.switch}>
              <GlassPanel className="cc-tile" contentClassName="cc-body">
                <p className="cc-title">Controls</p>
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
              </GlassPanel>
            </div>
          </div>
        </div>

        <div className="lock-dock" data-demo-case={CASES.backdrop} id="dock">
          <GlassDock />
        </div>
        <FallbackChip watch={stage} />
      </div>

      <CodeBlock tabs={CONTROLS_CODE} />
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

/* A movable circular-ish lens over the content surface. Bends the surface in
   place; the chart underneath stays a normal interactive element. */
function MovableGlass() {
  const ref = useRef(null);
  const handle = useGlassOverRegion(ref, {
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
      data-demo-case={CASES.lens}
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

/* ── 4. Mix your own material (playground) ───────────────────────────────────── */

function PlaygroundScene({ tune, setTune }) {
  const stage = useRef(null);
  const set = (key) => (v) => setTune((t) => ({ ...t, [key]: v }));
  const [copied, setCopied] = useState(false);
  const snippet = `<GlassOverRegion radius={32} scale={${Math.round(tune.scale)}} depth={${Math.round(tune.depth)}} chroma={${tune.chroma.toFixed(2)}} blur={${tune.blur.toFixed(1)}} specular={${tune.specular.toFixed(2)}} rimLight={${tune.rimLight.toFixed(2)}} />`;

  const copySnippet = () => {
    navigator.clipboard?.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section
      className="scene shell"
      id="playground"
      data-demo-case={CASES.material}
    >
      <div className="scene-head">
        <p className="eyebrow">Mix your own material</p>
        <h2 className="scene-title">Tune a real component live.</h2>
        <p className="scene-sub">
          Each slider calls `handle.update()` on the same lens, so material
          changes are immediate and the component keeps its state, focus, and
          event handlers.
        </p>
      </div>
      <div ref={stage} className="stage playground">
        <div className="specimen-stage">
          <GlassRegion className="specimen-source">
            <span>Live surface</span>
            <div aria-hidden="true" />
          </GlassRegion>
          <Specimen tune={tune} />
          <div className="specimen-snippet" aria-label="Current material">
            <button
              type="button"
              className="install snippet-copy"
              onClick={copySnippet}
            >
              <code>{snippet}</code>
              {copied ? (
                <CheckIcon className="install-icon" />
              ) : (
                <ClipboardIcon className="install-icon" />
              )}
            </button>
            <span className="sr-only" aria-live="polite">
              {copied ? "Material snippet copied" : ""}
            </span>
          </div>
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
        <FallbackChip watch={stage} />
      </div>
    </section>
  );
}

/* A standalone glass specimen whose material is tuned via handle.update(). */
function Specimen({ tune }) {
  const ref = useRef(null);
  const handle = useGlassOverRegion(ref, { radius: 32, ...tune });

  useEffect(() => {
    handle?.update({ radius: 32, ...tune });
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

/* ── 5. It knows when to quit (strip) ────────────────────────────────────────── */

function BudgetStrip() {
  return (
    <section className="shell budget-strip">
      <p>
        <strong>It knows when to quit.</strong> Budgets and fallbacks are built
        in—oversized or dense glass degrades to native blur or tint, and Safari
        and Firefox refract a matching background copy.
      </p>
      <a href={SUPPORT_URL}>Browser support →</a>
    </section>
  );
}

/* ── Footer and wallpaper switcher ───────────────────────────────────────────── */

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

/* ── Browser support view (user-facing, styled like the main page) ──────────── */

const SUPPORT_MATRIX = {
  head: ["What you are refracting", "Chrome", "Safari", "Firefox"],
  rows: [
    ["Page", "Live refraction", "Polished frost", "Polished frost"],
    [
      "Marked region",
      "Live refraction",
      "Live refraction *",
      "Live refraction *",
    ],
    ["Registered media", "WebGL2", "WebGL2", "WebGL2"],
    [
      "Known wallpaper",
      "Painted refraction",
      "Painted refraction *",
      "Painted refraction *",
    ],
  ],
};

const BACKEND_CARDS = [
  {
    id: "backdrop",
    title: "Chromium backdrop tier",
    api: "backdrop-filter: url()",
    body: "Compositor-sampled, so there is zero scroll lag and the glass bends the live page — wallpaper and any page content behind it.",
    fallback:
      "Falls back to the background-copy tier where the compositor route is unavailable.",
  },
  {
    id: "copy",
    title: "Wallpaper tier",
    api: "GlassOverWallpaper",
    body: "A known CSS wallpaper is painted again and refracted. This route does not claim to bend arbitrary page content.",
    fallback:
      "Dense or oversized copies switch to the native blur/tint fallback.",
  },
  {
    id: "content",
    title: "Marked region",
    api: "GlassOverRegion",
    body: "An SVG filter bends a marked region's live DOM. Each engine has a size budget.",
    fallback: "Over budget → native blur or tint.",
  },
  {
    id: "media",
    title: "Registered media",
    api: "GlassOverMedia",
    body: "Video and canvas are textured through WebGL2, because browser filters cannot read moving media pixels. Needs same-origin or CORS-enabled media.",
    fallback: "Work stops entirely while the media is off-screen.",
  },
  {
    id: "native",
    title: "Page fallback",
    api: "GlassOverPage",
    body: "Safari and Firefox use polished frost for arbitrary page content. Oversized effects can also use this safe fallback.",
    fallback: "This is the fallback. It is always usable.",
  },
];

const ENGINE_SHOTS = [
  {
    id: "chromium",
    name: "Chromium",
    src: "/compare/chromium.png",
    alt: "The vignette rendered in Chromium",
    caption: "live page refraction",
  },
  {
    id: "webkit",
    name: "WebKit (Safari engine)",
    src: "/compare/webkit.png",
    alt: "The vignette rendered in WebKit",
    caption: "page frost + marked-source refraction",
  },
  {
    id: "firefox",
    name: "Firefox",
    src: "/compare/firefox.png",
    alt: "The vignette rendered in Firefox",
    caption: "page frost + marked-source refraction",
  },
];

function BrowserSupportPage() {
  return (
    <div className="support shell">
      <header className="support-head">
        <p className="eyebrow">@tomagranate/liquid-glass</p>
        <h1 className="hero-title support-title">Browser support.</h1>
        <p className="lede">
          Choose the source with a named interface. The library then selects a
          backend and uses frost before an effect can hurt page performance.
        </p>
        <a className="support-back" href="?">
          ← Back to the overview
        </a>
      </header>

      <section className="support-section">
        <h2 className="scene-title support-h2">Modes × browsers</h2>
        <div className="support-table-wrap">
          <table className="support-table">
            <thead>
              <tr>
                {SUPPORT_MATRIX.head.map((cell) => (
                  <th key={cell}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SUPPORT_MATRIX.rows.map((row) => (
                <tr key={row[0]}>
                  <th scope="row">{row[0]}</th>
                  {row.slice(1).map((cell, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed column order
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="support-foot">
          * Keep registered UI areas bounded in Safari and Firefox. Large or
          dense areas automatically become native blur or tint instead of
          breaking.
        </p>
      </section>

      <section className="support-section">
        <h2 className="scene-title support-h2">The backends</h2>
        <div className="support-cards">
          {BACKEND_CARDS.map((card) => (
            <article key={card.id} className="support-card">
              <div className="support-card-head">
                <h3>{card.title}</h3>
                <code>{card.api}</code>
              </div>
              <p className="support-card-body">{card.body}</p>
              <p className="support-card-fallback">
                <span>Fallback</span>
                {card.fallback}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="support-section">
        <h2 className="scene-title support-h2">The same page, three engines</h2>
        <p className="scene-sub">
          One build uses the same component tree. The named source defines the
          result. The browser only changes the available backend.
        </p>
        <div className="engine-compare">
          {ENGINE_SHOTS.map((shot) => (
            <figure className="engine-shot" key={shot.id}>
              <img
                src={shot.src}
                alt={shot.alt}
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <figcaption>
                <span className="engine-shot-name">{shot.name}</span>
                {shot.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="support-section">
        <h2 className="scene-title support-h2">See the fallback live</h2>
        <p className="scene-sub">
          The same component, three treatments. The middle one still refracts —
          <code>quality=&quot;performance&quot;</code> trims detail (no
          dispersion, no highlight, 1× maps); it is not the fallback. The right
          one sits in a scope whose budget it exceeds, so the policy engine
          swaps refraction for the native frost. That frosted card is the floor
          every element degrades to; <code>fallback=&quot;tint&quot;</code>{" "}
          keeps only the tint film, <code>&quot;none&quot;</code> removes the
          glass chrome entirely.
        </p>
        <div className="support-ladder">
          <div className="support-demo">
            <p className="support-demo-label">Full refraction</p>
            <GlassOverPage className="ladder-sample">
              <span>The quick brown fox</span>
            </GlassOverPage>
            <code className="support-demo-code">{"<GlassOverPage>"}</code>
          </div>
          <div className="support-demo">
            <p className="support-demo-label">
              Leaner detail — still refracting
            </p>
            <GlassOverPage className="ladder-sample" quality="performance">
              <span>The quick brown fox</span>
            </GlassOverPage>
            <code className="support-demo-code">
              {'<GlassOverPage quality="performance">'}
            </code>
          </div>
          <div className="support-demo">
            <p className="support-demo-label">Over budget — native frost</p>
            <GlassRoot
              budgets={{ chromium: 20_000, webkit: 20_000, firefox: 20_000 }}
            >
              <GlassOverPage className="ladder-sample" fallback="blur">
                <span>The quick brown fox</span>
              </GlassOverPage>
            </GlassRoot>
            <code className="support-demo-code">
              {'<GlassOverPage fallback="blur">'}
            </code>
          </div>
        </div>
      </section>

      <section className="support-section support-note">
        <p>
          Want the runtime truth? A live diagnostics readout sits at{" "}
          <a href="?diagnostics">/?diagnostics</a> and the technical regression
          fixtures live at <a href="?fixtures">/?fixtures</a>.
        </p>
        <a className="support-back" href="?">
          ← Back to the overview
        </a>
      </section>
    </div>
  );
}

/* ── Fixtures view (regression coverage for cut technical cases) ─────────────── */

function FixturesPage() {
  return (
    <main className="fixtures shell">
      <h1 className="fixtures-title">Technical fixtures</h1>
      <p className="fixtures-note">
        Regression coverage for cases the marketing page no longer shows. Not
        user-facing.
      </p>
      <div className="fixtures-grid">
        <Fixture demoCase={CASES.partial} title="Partial-overlap composition">
          <div className="partial-stage">
            <GlassRegion className="partial-surface partial-a">
              Surface A
            </GlassRegion>
            <GlassRegion className="partial-surface partial-b">
              Surface B
            </GlassRegion>
            <GlassOverRegion className="partial-lens" radius={28}>
              A + B
            </GlassOverRegion>
          </div>
        </Fixture>

        <Fixture demoCase={CASES.reduced} title="Reduced quality">
          <Glass className="quality-sample" quality="performance">
            quality=&quot;performance&quot;
          </Glass>
        </Fixture>

        <Fixture
          demoCase={CASES.oversized}
          title="Oversized surface fallback"
          wide
        >
          {/* The policy clamps dpr before surrendering, so a merely-large pane
              now refracts; a tiny scoped budget keeps this fixture over the
              line at every viewport so it exercises the native tier. */}
          <GlassRoot
            budgets={{ chromium: 20_000, webkit: 20_000, firefox: 20_000 }}
          >
            <GlassOverWallpaper
              className="oversized-sample"
              quality="balanced"
              fallback="blur"
              wallpaper="linear-gradient(135deg, #31d8c6, #402d86 55%, #ff9a52)"
            >
              <span>
                Always usable. Full refraction when the budget allows.
              </span>
            </GlassOverWallpaper>
          </GlassRoot>
        </Fixture>

        <Fixture demoCase={CASES.density} title="Density (32 lenses)" wide>
          <div
            className="density-grid"
            aria-label="Thirty-two live glass lenses"
          >
            {DENSITY_LENSES.map((id) => (
              <GlassOverPage
                className="density-lens"
                quality="balanced"
                preset="thin"
                key={id}
                aria-label={`Glass lens ${Number(id)}`}
              >
                {Number(id)}
              </GlassOverPage>
            ))}
          </div>
        </Fixture>

        <Fixture demoCase={CASES.canvas} title="Canvas media">
          <CanvasChart />
          <CodeBlock tabs={CANVAS_CODE} />
        </Fixture>

        <VanillaFixture />
        <ScopeIsolationFixture />
      </div>
      <DiagnosticsPanel />
    </main>
  );
}

function Fixture({ demoCase, title, wide = false, children }) {
  return (
    <section
      className={`fixture${wide ? " fixture-wide" : ""}`}
      data-demo-case={demoCase}
      tabIndex={0}
    >
      <h2>{title}</h2>
      <div className="fixture-stage">{children}</div>
    </section>
  );
}

function VanillaFixture() {
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
    <Fixture demoCase={CASES.vanilla} title="Vanilla API">
      <div ref={host} className="vanilla-sample">
        <code>
          import {`{ createGlassScope }`} from
          &quot;@tomagranate/liquid-glass&quot;;
        </code>
        <span>scope.glass(element)</span>
        <small>{diagnostics?.lenses ?? 0} active lens</small>
      </div>
    </Fixture>
  );
}

function ScopeIsolationFixture() {
  return (
    <Fixture demoCase={CASES.scopes} title="Nested scope isolation">
      <div className="scope-stage">
        <GlassRoot quality="balanced">
          <GlassRegion className="scope-surface scope-outer">
            Outer scope
            <GlassOverRegion className="scope-lens">Outer lens</GlassOverRegion>
            <GlassRoot quality="performance">
              <GlassRegion className="scope-surface scope-inner">
                Inner scope
                <GlassOverRegion className="scope-lens">
                  Inner lens
                </GlassOverRegion>
              </GlassRegion>
            </GlassRoot>
          </GlassRegion>
        </GlassRoot>
      </div>
    </Fixture>
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
    <GlassMedia live className="canvas-media-frame">
      <canvas
        ref={canvasRef}
        className="canvas-media-source"
        width="760"
        height="360"
        aria-label="Animated live signal chart"
      />
      <GlassOverMedia
        as="button"
        type="button"
        className="canvas-media-control"
        radius={999}
        depth={18}
        scale={56}
        tint="rgba(5,12,25,.22)"
      >
        Inspect live data
      </GlassOverMedia>
    </GlassMedia>
  );
}

/* ── Diagnostics (behind ?diagnostics on the main page; always on fixtures) ──── */

function DiagnosticsPanel() {
  const diagnostics = useGlassDiagnostics();
  const invariantWindow = useRef({
    diagnostics: null,
    geometry: null,
    media: null,
    label: "pending — awaiting second sample",
  });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(CASES.wallpaper);
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
        quality: selected === CASES.reduced ? "performance" : "balanced",
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
