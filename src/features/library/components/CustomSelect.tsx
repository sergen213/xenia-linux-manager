import { useEffect, useRef, useState } from "react";

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
}

export function CustomSelect({ id, className, value, options, onChange }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`custom-select${className ? ` ${className}` : ""}`} ref={containerRef}>
      <button
        id={id}
        type="button"
        className="custom-select__trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="custom-select__value">{selected?.label ?? value}</span>
        <span className="custom-select__arrow">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="custom-select__menu">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                className={`custom-select__option${opt.value === value ? " is-active" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
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
