import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

type NumberStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

export function NumberStepper({ value, onChange, min, max, step = 1 }: NumberStepperProps) {
  // The input keeps its own draft text while typing so the field can go through an empty/partial
  // state (e.g. clearing "19" to type "45") without every keystroke snapping back to the min value.
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function clamp(next: number) {
    let result = next;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    return result;
  }

  function commit(raw: string) {
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    const clamped = clamp(parsed);
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepperButton"
        onClick={() => onChange(clamp(value - step))}
        disabled={min !== undefined && value <= min}
        aria-label="Decrease"
      >
        <Minus size={16} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={text}
        onChange={(event) => setText(event.target.value.replace(/[^0-9]/g, ""))}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit((event.target as HTMLInputElement).value);
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
      <button
        type="button"
        className="stepperButton"
        onClick={() => onChange(clamp(value + step))}
        disabled={max !== undefined && value >= max}
        aria-label="Increase"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
