import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OnScreenKeyboard } from "../OnScreenKeyboard";
import { oskBackspace, oskInsert, oskMoveCaret } from "../oskEdit";

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
