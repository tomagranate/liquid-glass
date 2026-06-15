import { useRef, useState } from "react";
import { GlassStage, useGlassLens } from "@tomagranate/liquid-glass";
import {
  GlassButton,
  GlassToggleGroup,
  GlassSwitch,
  GlassSlider,
  Magnifier,
} from "./glass/index.ts";
import Benchmark from "./Benchmark.jsx";

export default function App() {
  const [view, setView] = useState("week");
  const [notify, setNotify] = useState(true);
  const [airplane, setAirplane] = useState(false);
  const [volume, setVolume] = useState(64);
  const [bright, setBright] = useState(40);
  const [benchmark, setBenchmark] = useState(false);

  const [tune, setTune] = useState({
    scale: 70,
    chroma: 0.4,
    depth: 16,
    specular: 0.5,
    rimLight: 0.9,
  });

  return (
    <GlassStage>
      <main className="page">
        <h1 className="title glass-fg">Liquid Glass</h1>
        <p className="subtitle glass-fg">
          A WebGL recreation of Aave's liquid-glass effect. The background is a{" "}
          <strong>constantly changing gradient</strong>, and every control is a
          lens in one shared WebGL field — so they all refract whatever they're
          painted on, live, every frame. Toggle the{" "}
          <strong>magnifying glass</strong> (bottom-right) and drag it around.
        </p>

        <section className="section">
          <h2 className="glass-fg">Button</h2>
          <div className="demo-row">
            <GlassButton>Get started</GlassButton>
            <GlassButton glass={{ chroma: 0.7, specular: 0.7 }}>
              Strong chroma
            </GlassButton>
            <GlassButton glass={{ depth: 18, scale: 80 }}>
              Deep bevel
            </GlassButton>
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
              glass={{ chroma: 0.5, scale: 56 }}
            />
            <span className="readout glass-fg">{bright}</span>
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

      <Magnifier />

      <button className="bench-open" onClick={() => setBenchmark(true)}>
        ⚡ Benchmark: SVG vs WebGL
      </button>
      {benchmark && <Benchmark onClose={() => setBenchmark(false)} />}
    </GlassStage>
  );
}

/* A stage-driven glass surface whose material is live-tunable. */
function TunableGlass({ tune }) {
  const ref = useRef(null);
  const canvasRef = useGlassLens(ref, { radius: 28, ...tune });
  return (
    <div ref={ref} className="playground-glass">
      <canvas
        ref={canvasRef}
        className="glass-lens-canvas"
        aria-hidden="true"
      />
      <span className="glass-fg">Glass</span>
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
