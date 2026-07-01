import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { useGlass } from "./useGlass.js";

const controller = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  refresh: vi.fn(),
  destroy: vi.fn(),
  reposition: vi.fn(),
}));

vi.mock("../core/liquid-glass.js", () => ({
  createGlassController: controller.create,
}));

function GlassFixture({ alignTo }: { alignTo: HTMLElement }) {
  const glass = useGlass({ radius: 16, alignTo });

  return (
    <div ref={glass.hostRef}>
      <div ref={glass.refractionRef}>
        <div ref={glass.backdropRef} />
      </div>
      <div ref={glass.sheenRef} />
    </div>
  );
}

describe("useGlass", () => {
  beforeAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    controller.create.mockReset();
    controller.update.mockReset();
    controller.refresh.mockReset();
    controller.destroy.mockReset();
    controller.reposition.mockReset();
    controller.create.mockReturnValue({
      update: controller.update,
      refresh: controller.refresh,
      destroy: controller.destroy,
      _reposition: controller.reposition,
    });
  });

  it("updates the controller when only alignTo identity changes", async () => {
    const targetA = document.createElement("button");
    const targetB = document.createElement("button");
    const container = document.createElement("div");
    document.body.append(targetA, targetB, container);
    const root: Root = createRoot(container);

    await act(async () => {
      root.render(<GlassFixture alignTo={targetA} />);
    });

    expect(controller.create).toHaveBeenCalledTimes(1);
    controller.update.mockClear();

    await act(async () => {
      root.render(<GlassFixture alignTo={targetB} />);
    });

    expect(controller.create).toHaveBeenCalledTimes(1);
    expect(controller.update).toHaveBeenCalledTimes(1);
    expect(controller.update).toHaveBeenCalledWith(
      expect.objectContaining({ alignTo: targetB }),
    );

    await act(async () => {
      root.unmount();
    });
    expect(controller.destroy).toHaveBeenCalledTimes(1);
  });
});
