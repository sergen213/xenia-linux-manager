import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  id?: string;
  className?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CustomSelect({ id, className, value, options, onChange, disabled = false }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  // Keyboard roving position (gamepad uses the app's spatial nav instead). A ref,
  // not state — nothing renders from it.
  const activeIndexRef = useRef(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // When the menu opens, focus the selected option (or the first one).
  useEffect(() => {
    if (!open) return;
    const start = selectedIndex >= 0 ? selectedIndex : 0;
    // Note: we don't call setActiveIndex here to avoid cascading renders.
    // Focus is sufficient for accessibility without triggering a re-render.
    optionRefs.current[start]?.focus();
  }, [open, selectedIndex]);

  const closeAndReturnFocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveActive = (delta: number) => {
    if (options.length === 0) return;
    const current = activeIndexRef.current;
    const base = current < 0 ? (selectedIndex >= 0 ? selectedIndex : 0) : current;
    const next = (base + delta + options.length) % options.length;
    activeIndexRef.current = next;
    optionRefs.current[next]?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeAndReturnFocus();
        break;
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        e.preventDefault();
        activeIndexRef.current = 0;
        optionRefs.current[0]?.focus();
        break;
      case "End":
        e.preventDefault();
        activeIndexRef.current = options.length - 1;
        optionRefs.current[options.length - 1]?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div
      className={`custom-select${className ? ` ${className}` : ""}${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}`}
      ref={containerRef}
    >
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="custom-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => {
          if (!disabled) {
            setOpen((v) => !v);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
      >
        <span className="custom-select__value">{selected?.label ?? value}</span>
        <span className="custom-select__arrow" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul
          id={listboxId}
          className="custom-select__menu"
          role="listbox"
          onKeyDown={handleMenuKeyDown}
        >
          {options.map((opt, index) => (
            <li key={opt.value} role="none">
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                ref={(el) => { optionRefs.current[index] = el; }}
                // All options are focusable so the controller's spatial nav can
                // walk them (it ignores tabindex=-1). Keyboard roving still works
                // via the menu's own arrow handler.
                tabIndex={0}
                className={`custom-select__option${opt.value === value ? " is-active" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  closeAndReturnFocus();
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
