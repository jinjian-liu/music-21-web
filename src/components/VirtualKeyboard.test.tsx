import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { VirtualKeyboard } from "./VirtualKeyboard";

const audio = vi.hoisted(() => ({
  attack: vi.fn(async () => {}),
  release: vi.fn(),
  releaseAll: vi.fn(),
  dispose: vi.fn(),
  setTone: vi.fn(),
  setVolume: vi.fn(),
  setResonance: vi.fn(),
}));
vi.mock("../audio/synth", () => ({
  PianoEngine: class {
    constructor() {
      return audio;
    }
  },
}));
vi.mock("../lib/local-db", () => ({
  localDB: { setting: async (_: string, fallback: unknown) => fallback },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function down(key = "t", code = "KeyT", repeat = false) {
  fireEvent.keyDown(window, { key, code, repeat });
}
function up(key = "t", code = "KeyT") {
  fireEvent.keyUp(window, { key, code });
}
function Harness({
  onPress,
  stop = 0,
}: {
  onPress: (midi: number) => void;
  stop?: number;
}) {
  const [active, setActive] = useState(new Set<number>());
  return (
    <VirtualKeyboard
      activeNotes={active}
      stopSignal={stop}
      onNoteOn={(note) => {
        onPress(note.midi);
        setActive((current) => new Set(current).add(note.midi));
      }}
      onNoteOff={(note) =>
        setActive((current) => {
          const next = new Set(current);
          next.delete(note.midi);
          return next;
        })
      }
    />
  );
}

describe("physical piano input", () => {
  it("emits once per physical press and permits a fresh repeated note under sustain", () => {
    const press = vi.fn();
    render(<Harness onPress={press} />);
    down(" ", "Space");
    down();
    down("t", "KeyT", true);
    down();
    expect(press).toHaveBeenCalledTimes(1);
    up();
    down();
    expect(press).toHaveBeenCalledTimes(2);
    expect(press).toHaveBeenLastCalledWith(60);
    expect(audio.attack).toHaveBeenCalledTimes(2);
    up();
    up(" ", "Space");
  });
  it("silences on transport changes without converting held keys into fresh input", () => {
    const press = vi.fn();
    const view = render(<Harness onPress={press} />);
    down();
    view.rerender(<Harness onPress={press} stop={1} />);
    expect(audio.releaseAll).toHaveBeenCalled();
    down("t", "KeyT", true);
    down();
    expect(press).toHaveBeenCalledTimes(1);
    up();
    down();
    expect(press).toHaveBeenCalledTimes(2);
    fireEvent.blur(window);
    down("t", "KeyT", true);
    expect(press).toHaveBeenCalledTimes(2);
  });
  it("ignores text input and dialogs, and releases its engine when unmounted", () => {
    const press = vi.fn();
    const view = render(
      <>
        <input aria-label="文字" />
        <dialog open>
          <button>对话框</button>
        </dialog>
        <Harness onPress={press} />
      </>,
    );
    fireEvent.keyDown(view.getByLabelText("文字"), { key: "t", code: "KeyT" });
    fireEvent.keyDown(view.getByText("对话框"), { key: "t", code: "KeyT" });
    expect(press).not.toHaveBeenCalled();
    down();
    view.unmount();
    expect(audio.dispose).toHaveBeenCalledTimes(1);
  });
});
