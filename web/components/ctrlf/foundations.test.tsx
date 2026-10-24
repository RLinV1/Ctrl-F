// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anime = vi.hoisted(() => ({ animate: vi.fn(), revert: vi.fn(), createDrawable: vi.fn(() => [{}]) }));
vi.mock("animejs", () => ({
  animate: anime.animate,
  createDrawable: anime.createDrawable,
  createScope: () => {
    const scope = {
      add(fn: (s: unknown) => void) {
        fn(scope);
        return scope;
      },
      revert: anime.revert,
    };
    return scope;
  },
}));

import { Button } from "@/components/ui/button";
import SplitFlapText from "@/components/kokonutui/split-flap-text";
import { Gear } from "./gear";
import { boxStyle, SnapshotFrame } from "./snapshot-frame";

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setReducedMotion(false);
});
afterEach(cleanup);

describe("brand tokens (task 5.2)", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");

  it("maps shadcn's primary to brass and squares every corner", () => {
    expect(css).toMatch(/--primary:\s*var\(--brass\)/);
    expect(css).toMatch(/--radius:\s*0rem/);
    for (const size of ["sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]) {
      expect(css).toMatch(new RegExp(`--radius-${size}:\\s*0;`));
    }
  });

  it("renders a shadcn Button on the primary (brass) fill", () => {
    const { getByRole } = render(<Button>Ask</Button>);
    expect(getByRole("button").className).toContain("bg-primary");
  });
});

describe("anime.js foundation (task 5.3)", () => {
  it("animates inside a scope and reverts it on unmount", () => {
    const { unmount } = render(<Gear turning />);
    expect(anime.animate).toHaveBeenCalledTimes(1);
    unmount();
    expect(anime.revert).toHaveBeenCalled();
  });

  it("does not animate when reduced motion is preferred", () => {
    setReducedMotion(true);
    render(<Gear turning />);
    expect(anime.animate).not.toHaveBeenCalled();
  });

  it("does not turn the gear when nothing is in progress", () => {
    render(<Gear turning={false} />);
    expect(anime.animate).not.toHaveBeenCalled();
  });
});

describe("box overlay (task 7.2)", () => {
  it("places a box at its percentages of the image", () => {
    expect(boxStyle({ x: 0.48, y: 0.55, w: 0.1, h: 0.12 })).toEqual({
      left: "48.000%",
      top: "55.000%",
      width: "10.000%",
      height: "12.000%",
    });
  });

  it("labels the lens and draws its ring, complete under reduced motion", () => {
    setReducedMotion(true);
    const { getByRole } = render(
      <SnapshotFrame alt="desk" height={720} lens={{ box: { x: 0.48, y: 0.55, w: 0.1, h: 0.12 }, label: "wallet" }} src="/x.svg" width={1280} />,
    );
    const lens = getByRole("img", { name: "wallet marked" });
    expect(lens.style.left).toBe("48%");
    expect(anime.createDrawable).not.toHaveBeenCalled();
  });
});

describe("split-flap last seen (task 7.3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.animate = vi.fn(() => ({}) as Animation);
  });
  afterEach(() => vi.useRealTimers());

  it("does not flip on first paint, and flips when the value changes", () => {
    const { rerender } = render(<SplitFlapText announce={false} length={8} text="5 MIN" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(Element.prototype.animate).not.toHaveBeenCalled();
    rerender(<SplitFlapText announce={false} length={8} text="6 MIN" />);
    // One act per step, so each flap renders before the next timer fires.
    for (let i = 0; i < 20; i++) {
      act(() => {
        vi.advanceTimersByTime(20);
      });
    }
    expect(Element.prototype.animate).toHaveBeenCalled();
  });

  it("swaps text without flipping under reduced motion", () => {
    setReducedMotion(true);
    const { rerender, container } = render(<SplitFlapText announce={false} length={8} text="5 MIN" />);
    rerender(<SplitFlapText announce={false} length={8} text="6 MIN" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(Element.prototype.animate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("6");
  });
});
