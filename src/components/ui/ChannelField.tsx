import { Link2 } from "lucide-react";

/**
 * The one field: a pill on glass with the lime submit nested at its right end.
 * Lime is the owner's hand: this button is the screen's one decision.
 */
export function ChannelField({
  id,
  value,
  onChange,
  invalid,
  placeholder,
  label,
  button,
  busy,
  describedBy,
  onFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  placeholder: string;
  label: string;
  button: string;
  busy?: boolean;
  describedBy?: string;
  onFocus?: () => void;
}) {
  return (
    <div className="chan-field" data-invalid={invalid || undefined}>
      <Link2 className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        name="channel"
        className="h-full min-h-[50px] w-0 min-w-0 flex-1 bg-transparent text-[17px] text-ink placeholder:text-ink-3"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="submit" disabled={busy} className="btn !min-h-[50px] shrink-0 !px-5 max-[380px]:!px-4">
        {button}
      </button>
    </div>
  );
}
