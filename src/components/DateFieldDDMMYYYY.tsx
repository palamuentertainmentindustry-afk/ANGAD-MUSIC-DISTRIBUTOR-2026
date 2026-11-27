import { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatDateDDMMYYYY, parseDateInputToIso } from '../lib/assets.ts';

interface DateFieldDDMMYYYYProps {
  id: string;
  value: string; // Canonical YYYY-MM-DD
  onChange: (isoDate: string) => void;
  minIso?: string;
  required?: boolean;
  label?: string;
}

export function DateFieldDDMMYYYY({
  id,
  value,
  onChange,
  minIso,
  required,
  label,
}: DateFieldDDMMYYYYProps) {
  const [text, setText] = useState(() => (value ? formatDateDDMMYYYY(value) : ''));
  const [inlineError, setInlineError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!value) return;
    if (parseDateInputToIso(text) !== value) {
      setText(formatDateDDMMYYYY(value));
    }
    setInlineError(null);
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d/]/g, '').slice(0, 10);
    setText(raw);
    setInlineError(null);

    const parsed = parseDateInputToIso(raw);
    if (parsed) {
      if (minIso && parsed < minIso) {
        setInlineError(`Must be ${formatDateDDMMYYYY(minIso)} or later`);
        onChange('');
        return;
      }
      onChange(parsed);
    } else if (value !== '') {
      onChange('');
    }
  };

  const handleBlur = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setInlineError('Date is required (DD/MM/YYYY)');
      if (value !== '') onChange('');
      return;
    }
    const parsed = parseDateInputToIso(trimmed);
    if (!parsed) {
      setInlineError('Use DD/MM/YYYY format');
      if (value !== '') onChange('');
      return;
    }
    if (minIso && parsed < minIso) {
      setInlineError(`Must be ${formatDateDDMMYYYY(minIso)} or later`);
      if (value !== '') onChange('');
      return;
    }
    setInlineError(null);
    setText(formatDateDDMMYYYY(parsed));
    if (parsed !== value) {
      onChange(parsed);
    }
  };

  const handleNativePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextIso = e.target.value;
    if (!nextIso) return;
    if (minIso && nextIso < minIso) {
      setInlineError(`Must be ${formatDateDDMMYYYY(minIso)} or later`);
      return;
    }
    setInlineError(null);
    onChange(nextIso);
    setText(formatDateDDMMYYYY(nextIso));
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // Fallback to native click below
      }
    }
    el.focus();
    el.click();
  };

  return (
    <div>
      <div
        className={`relative flex items-center w-full rounded-md bg-[#09090B] border transition-colors ${
          inlineError ? 'border-rose-700 focus-within:border-rose-500' : 'border-zinc-800 focus-within:border-[#D4AF37]'
        }`}
      >
        <input
          id={id}
          type="text"
          inputMode="numeric"
          required={required}
          value={text}
          onChange={handleTextChange}
          onBlur={handleBlur}
          placeholder="DD/MM/YYYY"
          aria-label={label || 'Date in DD/MM/YYYY format'}
          className="w-full px-3 py-2.5 min-h-[44px] bg-transparent text-sm font-mono tabular-nums text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />

        <div className="relative shrink-0 mr-1.5">
          <button
            type="button"
            onClick={openPicker}
            aria-label={`Choose ${label || 'date'} from calendar`}
            className="p-2 rounded text-zinc-400 hover:text-[#E5C158] transition-colors cursor-pointer"
          >
            <Calendar className="w-4 h-4" aria-hidden="true" />
          </button>
          <input
            ref={pickerRef}
            type="date"
            tabIndex={-1}
            min={minIso}
            value={value}
            onChange={handleNativePickerChange}
            aria-hidden="true"
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </div>
      </div>
      {inlineError && <p className="text-[11px] text-rose-400 mt-1">{inlineError}</p>}
    </div>
  );
}
