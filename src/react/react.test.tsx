import { act, createRef, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  Glass,
  GlassMediaSurface,
  GlassRoot,
  GlassSurface,
  useGlass,
  useMediaSurface,
  useSurface,
} from "./index.js";

/* Mock the parallel core modules so these tests stay pure-React. Each factory
   records the element/options it was called with and returns a spied handle. */
const lens = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  geometryChanged: vi.fn(),
  refresh: vi.fn(),
  destroy: vi.fn(),
}));
const surface = vi.hoisted(() => ({
  create: vi.fn(),
  refresh: vi.fn(),
  destroy: vi.fn(),
}));
const media = vi.hoisted(() => ({
  create: vi.fn(),
  refresh: vi.fn(),
  destroy: vi.fn(),
}));
const scoped = vi.hoisted(() => ({
  glass: vi.fn(),
  createSurface: vi.fn(),
  createMediaSurface: vi.fn(),
  setBackground: vi.fn(),
  getDiagnostics: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("../core/api.js", () => ({
  glass: lens.create,
  createSurface: surface.create,
  createMediaSurface: media.create,
}));
vi.mock("../core/scope.js", () => ({
  createGlassScope: vi.fn(() => scoped),
}));

let container: HTMLElement;
let root: Root;

function render(node: React.ReactNode): void {
  act(() => {
    root.render(node);
  });
}

function unmount(): void {
  act(() => {
    root.unmount();
  });
}

describe("react bindings", () => {
  beforeAll(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(() => {
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    for (const g of [lens, surface, media, scoped]) {
      for (const fn of Object.values(g)) fn.mockReset();
    }
    lens.create.mockImplementation(() => ({
      update: lens.update,
      geometryChanged: lens.geometryChanged,
      refresh: lens.refresh,
      destroy: lens.destroy,
    }));
    scoped.glass.mockImplementation(() => ({
      update: lens.update,
      geometryChanged: lens.geometryChanged,
      refresh: lens.refresh,
      destroy: lens.destroy,
      backends: [],
    }));
    surface.create.mockImplementation((element: HTMLElement) => ({
      element,
      refresh: surface.refresh,
      destroy: surface.destroy,
    }));
    media.create.mockImplementation((element: HTMLElement) => ({
      element,
      refresh: media.refresh,
      destroy: media.destroy,
    }));

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  /* ── <Glass> ── */

  it("<Glass> renders host + bg + sheen layers before children", () => {
    render(
      <Glass className="panel" data-testid="host">
        <span className="content">hi</span>
      </Glass>,
    );

    const host = container.firstElementChild as HTMLElement;
    expect(host.tagName).toBe("DIV");
    expect(host.classList.contains("lg")).toBe(true);
    expect(host.classList.contains("panel")).toBe(true);
    expect(host.getAttribute("data-testid")).toBe("host");

    const [bg, sheen, content] = Array.from(host.children) as HTMLElement[];
    expect(bg.className).toBe("lg-bg");
    expect(bg.getAttribute("aria-hidden")).toBe("true");
    expect(sheen.className).toBe("lg-sheen");
    expect(sheen.getAttribute("aria-hidden")).toBe("true");
    expect(content.className).toBe("content");
  });

  it("<Glass as='nav'> honors the polymorphic host tag", () => {
    render(<Glass as="nav">nav</Glass>);
    const host = container.firstElementChild as HTMLElement;
    expect(host.tagName).toBe("NAV");
    expect(host.classList.contains("lg")).toBe(true);
  });

  it("<GlassRoot> routes descendants through its context and cleans up", async () => {
    render(
      <StrictMode>
        <GlassRoot quality="performance">
          <Glass>scoped</Glass>
        </GlassRoot>
      </StrictMode>,
    );
    expect(scoped.glass).toHaveBeenCalledTimes(2);
    expect(lens.create).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(scoped.destroy).not.toHaveBeenCalled();
    unmount();
    await Promise.resolve();
    expect(scoped.destroy).toHaveBeenCalledTimes(1);
  });

  it("<Glass> passes options to glass() and spreads DOM props on the host", () => {
    const onBackendChange = vi.fn();
    render(
      <Glass
        radius={20}
        chroma={0.5}
        tint="red"
        preset="thin"
        quality="performance"
        fallback="tint"
        onBackendChange={onBackendChange}
        id="p"
        title="t"
      >
        x
      </Glass>,
    );
    expect(lens.create).toHaveBeenCalledTimes(1);
    const [el, opts] = lens.create.mock.calls[0];
    expect((el as HTMLElement).classList.contains("lg")).toBe(true);
    expect(opts).toMatchObject({
      radius: 20,
      chroma: 0.5,
      tint: "red",
      preset: "thin",
      quality: "performance",
      fallback: "tint",
      onBackendChange,
    });
    // DOM props are NOT forwarded into glass options
    expect(opts).not.toHaveProperty("id");
    expect(opts).not.toHaveProperty("title");
    const host = container.firstElementChild as HTMLElement;
    expect(host.id).toBe("p");
    expect(host.getAttribute("title")).toBe("t");
  });

  it("<Glass> updates (not re-creates) on material change and destroys on unmount", () => {
    render(<Glass radius={16}>x</Glass>);
    expect(lens.create).toHaveBeenCalledTimes(1);
    lens.update.mockClear();

    render(<Glass radius={24}>x</Glass>);
    expect(lens.create).toHaveBeenCalledTimes(1); // never re-created
    expect(lens.update).toHaveBeenCalledTimes(1);
    expect(lens.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ radius: 24 }),
    );

    unmount();
    expect(lens.destroy).toHaveBeenCalledTimes(1);
  });

  /* ── <GlassSurface> ── */

  it("<GlassSurface> registers the host and destroys it on unmount", () => {
    render(
      <GlassSurface background className="s">
        <p>content</p>
      </GlassSurface>,
    );
    const host = container.firstElementChild as HTMLElement;
    expect(host.classList.contains("lgs-surface")).toBe(true);
    expect(host.classList.contains("s")).toBe(true);
    expect(host.querySelector("p")?.textContent).toBe("content");
    expect(surface.create).toHaveBeenCalledTimes(1);
    expect(surface.create.mock.calls[0][0]).toBe(host);
    expect(surface.create.mock.calls[0][1]).toEqual({ background: true });

    unmount();
    expect(surface.destroy).toHaveBeenCalledTimes(1);
  });

  /* ── <GlassMediaSurface> ── */

  it("<GlassMediaSurface> registers the first media descendant", () => {
    render(
      <GlassMediaSurface live>
        <video />
      </GlassMediaSurface>,
    );
    expect(media.create).toHaveBeenCalledTimes(1);
    const [el, opts] = media.create.mock.calls[0];
    expect((el as HTMLElement).tagName).toBe("VIDEO");
    expect(opts).toEqual({ live: true });

    unmount();
    expect(media.destroy).toHaveBeenCalledTimes(1);
  });

  it("<GlassMediaSurface> warns when there is no media descendant", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <GlassMediaSurface>
        <div>no media</div>
      </GlassMediaSurface>,
    );
    expect(media.create).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  /* ── hooks ── */

  it("useGlass creates a handle on mount and destroys it on unmount", () => {
    const ref = createRef<HTMLDivElement>();
    let handle: unknown = "unset";
    function Host() {
      handle = useGlass(ref, { radius: 12 });
      return <div ref={ref} />;
    }
    render(<Host />);
    expect(lens.create).toHaveBeenCalledTimes(1);
    expect(handle).not.toBeNull();
    expect(typeof (handle as { update: unknown }).update).toBe("function");

    unmount();
    expect(lens.destroy).toHaveBeenCalledTimes(1);
  });

  it("useGlass updates on option-key change without re-creating", () => {
    const ref = createRef<HTMLDivElement>();
    function Host({ r }: { r: number }) {
      useGlass(ref, { radius: r });
      return <div ref={ref} />;
    }
    render(<Host r={10} />);
    lens.update.mockClear();
    render(<Host r={20} />);
    expect(lens.create).toHaveBeenCalledTimes(1);
    expect(lens.update).toHaveBeenCalledTimes(1);
  });

  it("useSurface creates/destroys a surface handle", () => {
    const ref = createRef<HTMLDivElement>();
    let handle: unknown = "unset";
    function Host() {
      handle = useSurface(ref, { background: true });
      return <div ref={ref} />;
    }
    render(<Host />);
    expect(surface.create).toHaveBeenCalledTimes(1);
    expect(handle).not.toBeNull();

    unmount();
    expect(surface.destroy).toHaveBeenCalledTimes(1);
  });

  it("useMediaSurface creates/destroys a media handle", () => {
    const ref = createRef<HTMLVideoElement>();
    let handle: unknown = "unset";
    function Host() {
      handle = useMediaSurface(ref, { live: true });
      return <video ref={ref} />;
    }
    render(<Host />);
    expect(media.create).toHaveBeenCalledTimes(1);
    expect(media.create.mock.calls[0][1]).toEqual({ live: true });
    expect(handle).not.toBeNull();

    unmount();
    expect(media.destroy).toHaveBeenCalledTimes(1);
  });
});
