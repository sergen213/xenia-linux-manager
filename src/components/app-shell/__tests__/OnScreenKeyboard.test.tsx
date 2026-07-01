import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OnScreenKeyboard } from "../OnScreenKeyboard";
import { oskBackspace, oskCommit, oskInsert, oskMoveCaret } from "../oskEdit";

/** Mount the OSK over a plain text input with the caret/selection preset. */
function setup(value: string, selStart = value.length, selEnd = selStart) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  document.body.appendChild(input);
  input.setSelectionRange(selStart, selEnd);
  render(<OnScreenKeyboard target={input} onClose={() => {}} />);
  return input;
}

const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

describe("OnScreenKeyboard edits", () => {
  it("types at the caret", () => {
    const input = setup("ab", 1); // caret between a|b
    click("c");
    expect(input.value).toBe("acb");
  });

  it("backspace removes the char before the caret", () => {
    const input = setup("abc"); // caret at end
    click(/Back/);
    expect(input.value).toBe("ab");
  });

  it("caret-left then type inserts one position earlier", () => {
    const input = setup("ab"); // caret at end
    click("Move caret left");
    click("x");
    expect(input.value).toBe("axb");
  });
});

// A real keyboard drives the field directly while the OSK is up: printable keys
// type, Backspace deletes, Enter is Done. Capture-phase window keydowns so the
// physical key never leaks to AppShell's global handler.
describe("OnScreenKeyboard physical keyboard", () => {
  const key = (k: string) =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

  it("printable keys type into the field, Backspace deletes", () => {
    const input = setup("");
    key("H"); key("i"); key(" "); key("3");
    expect(input.value).toBe("Hi 3");
    key("Backspace");
    expect(input.value).toBe("Hi ");
  });

  it("Enter closes a single-line field (Done)", () => {
    const onClose = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    render(<OnScreenKeyboard target={input} onClose={onClose} />);
    key("Enter");
    expect(onClose).toHaveBeenCalledOnce();
    expect(input.value).toBe(""); // no char inserted
  });
});

// Done must APPLY the field, not just close: the on-screen keys mutate the value
// but the editor applies it on its own trigger — a form submit or an Enter press.
describe("oskCommit applies the field", () => {
  it("submits a surrounding form (Save-button editors)", () => {
    const form = document.createElement("form");
    const input = document.createElement("input");
    form.appendChild(input);
    form.appendChild(document.createElement("button")); // submit button
    document.body.appendChild(form);
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener("submit", onSubmit);
    oskCommit(input);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("sends one Enter to a form-less field (create/rename editors)", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const onKey = vi.fn();
    input.addEventListener("keydown", (e) => e.key === "Enter" && onKey());
    oskCommit(input);
    expect(onKey).toHaveBeenCalledOnce(); // exactly once — no recursion
  });
});

// The exported ops are what AppShell drives straight from gamepad buttons
// (X=Backspace, Y=Space, LB/RB=caret) without going through the on-screen keys.
describe("OnScreenKeyboard gamepad ops", () => {
  function field(value: string, selStart = value.length, selEnd = selStart) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    document.body.appendChild(input);
    input.setSelectionRange(selStart, selEnd);
    return input;
  }

  it("oskInsert(space) types a space at the caret", () => {
    const input = field("ab", 1);
    oskInsert(input, " ");
    expect(input.value).toBe("a b");
    expect(input.selectionStart).toBe(2);
  });

  it("oskBackspace removes the char before the caret", () => {
    const input = field("abc", 2);
    oskBackspace(input);
    expect(input.value).toBe("ac");
  });

  it("oskMoveCaret clamps at the edges", () => {
    const input = field("ab", 0);
    oskMoveCaret(input, -1); // already at start — stays
    expect(input.selectionStart).toBe(0);
    oskMoveCaret(input, 1);
    expect(input.selectionStart).toBe(1);
  });
});
