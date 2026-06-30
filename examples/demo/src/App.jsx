import { useState } from "react";
import { useGlass } from "@tomagranate/liquid-glass";
import {
  GlassButton,
  GlassToggleGroup,
  GlassSwitch,
  GlassSlider,
  GlassQRCode,
  GlassVideoPlayer,
} from "./glass/index.ts";

export default function App() {
  const [view, setView] = useState("week");
  const [notify, setNotify] = useState(true);
  const [airplane, setAirplane] = useState(false);
  const [volume, setVolume] = useState(64);
  const [bright, setBright] = useState(40);

  const [tune, setTune] = useState({
    scale: 60,
    chroma: 0.4,
    depth: 16,
    specular: 0.5,
    rimLight: 0.9,
  });

  return (
    <main className="page">
      <h1 className="title glass-fg">Liquid Glass</h1>
      <p className="subtitle glass-fg">
        An Apple-style liquid-glass effect for the web. The whole effect rests
        on a single SVG filter primitive, <strong>feDisplacementMap</strong> —
        nothing is sampled from underneath the glass; the content's own pixels
        are the ones moving. Surfaces an SVG filter can't read (the QR canvas,
        the playing video) fall back to a WebGL shader fed the same
        displacement.
      </p>

      <section className="section">
        <h2 className="glass-fg">Button</h2>
        <div className="demo-row">
          <GlassButton>Get started</GlassButton>
          <GlassButton glass={{ chroma: 0.7, specular: 0.7 }}>
            Strong chroma
          </GlassButton>
          <GlassButton glass={{ depth: 16, scale: 60 }}>Deep bevel</GlassButton>
        </div>
      </section>

      <section className="section">
        <h2 className="glass-fg">Toggle group</h2>
        <div className="demo-row">
          <GlassToggleGroup
            value={view}
            onChange={setView}
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
              { value: "year", label: "Year" },
            ]}
          />
          <span className="readout glass-fg">{view}</span>
        </div>
      </section>

      <section className="section">
        <h2 className="glass-fg">Switch</h2>
        <div className="demo-row">
          <GlassSwitch checked={notify} onChange={setNotify} />
          <span className="readout glass-fg">
            notifications {notify ? "on" : "off"}
          </span>
          <span style={{ width: 24 }} />
          <GlassSwitch checked={airplane} onChange={setAirplane} />
          <span className="readout glass-fg">
            airplane {airplane ? "on" : "off"}
          </span>
        </div>
      </section>

      <section className="section">
        <h2 className="glass-fg">Slider</h2>
        <div className="demo-row">
          <GlassSlider value={volume} onChange={setVolume} />
          <span className="readout glass-fg">{volume}</span>
        </div>
        <div className="demo-row" style={{ marginTop: 20 }}>
          <GlassSlider
            value={bright}
            onChange={setBright}
            glass={{ chroma: 0.5, scale: 30 }}
          />
          <span className="readout glass-fg">{bright}</span>
        </div>
      </section>

      <section className="section">
        <h2 className="glass-fg">QR code</h2>
        <div className="demo-row">
          <GlassQRCode />
          <span className="readout glass-fg">tap it</span>
        </div>
      </section>

      <section className="section">
        <h2 className="glass-fg">Video player — glass controls over video</h2>
        <div className="demo-row">
          <GlassVideoPlayer />
        </div>
      </section>

      <section className="section">
        <h2 className="glass-fg">Playground — tune the material</h2>
        <div className="demo-row" style={{ minHeight: 150 }}>
          <TunableGlass tune={tune} />
        </div>
        <div className="controls glass-fg">
          <Range
            label={`displacement ${tune.scale}`}
            min={0}
            max={160}
            value={tune.scale}
            onChange={(v) => setTune((t) => ({ ...t, scale: v }))}
          />
          <Range
            label={`chroma ${tune.chroma.toFixed(2)}`}
            min={0}
            max={1}
            step={0.01}
            value={tune.chroma}
            onChange={(v) => setTune((t) => ({ ...t, chroma: v }))}
          />
          <Range
            label={`depth ${tune.depth}`}
            min={1}
            max={40}
            value={tune.depth}
            onChange={(v) => setTune((t) => ({ ...t, depth: v }))}
          />
          <Range
            label={`specular ${tune.specular.toFixed(2)}`}
            min={0}
            max={1}
            step={0.01}
            value={tune.specular}
            onChange={(v) => setTune((t) => ({ ...t, specular: v }))}
          />
          <Range
            label={`rim ${tune.rimLight.toFixed(2)}`}
            min={0}
            max={1.5}
            step={0.01}
            value={tune.rimLight}
            onChange={(v) => setTune((t) => ({ ...t, rimLight: v }))}
          />
        </div>
      </section>
    </main>
  );
}

/* A standalone glass surface (backdrop-clone mode) whose material is tunable. */
function TunableGlass({ tune }) {
  const g = useGlass({ radius: 28, ...tune });
  return (
    <div ref={g.hostRef} className="playground-glass lq">
      <div ref={g.refractionRef} className="lq-refraction">
        <div ref={g.backdropRef} className="lq-backdrop" />
      </div>
      <div ref={g.sheenRef} className="lq-sheen" />
      <span className="lq-content glass-fg">Glass</span>
    </div>
  );
}

function Range({ label, ...rest }) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="range"
        {...rest}
        onChange={(e) => rest.onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}
