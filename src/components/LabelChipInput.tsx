import { useMemo, useState, type KeyboardEvent } from "react";

type LabelChipInputProps = {
  labels: string[];
  onChange: (labels: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/^#/, "");
}

export function LabelChipInput({
  labels,
  onChange,
  placeholder,
  disabled = false,
}: LabelChipInputProps) {
  const [draft, setDraft] = useState("");
  const normalizedLabels = useMemo(() => labels.map((label) => normalizeLabel(label)).filter(Boolean), [labels]);

  const commitDraft = () => {
    const next = normalizeLabel(draft);
    setDraft("");
    if (!next || normalizedLabels.includes(next)) return;
    onChange([...normalizedLabels, next]);
  };

  const removeLabel = (label: string) => {
    onChange(normalizedLabels.filter((entry) => entry !== label));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Backspace" && !draft && normalizedLabels.length > 0) {
      event.preventDefault();
      onChange(normalizedLabels.slice(0, -1));
    }
  };

  return (
    <div className={`label-chip-input${disabled ? " is-disabled" : ""}`}>
      <div className="label-chip-list">
        {normalizedLabels.map((label) => (
          <span key={label} className="tag tag-compact">
            #{label}
            {!disabled ? (
              <button
                type="button"
                className="tag-delete"
                onClick={() => removeLabel(label)}
                aria-label={`Remove ${label}`}
                title={`Remove ${label}`}
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
        <input
          className="label-chip-field"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commitDraft}
          placeholder={normalizedLabels.length === 0 ? placeholder : ""}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
