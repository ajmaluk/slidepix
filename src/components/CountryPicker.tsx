import { useEffect, useMemo, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COUNTRY_NAMES } from "@/lib/countries";

type CountryPickerProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  errorMessage?: string;
  className?: string;
  inputClassName?: string;
  dropdownZIndexClassName?: string;
};

export function CountryPicker({
  id = "country",
  label = "Country",
  value,
  onChange,
  required,
  placeholder = "Search your country...",
  errorMessage,
  className,
  inputClassName,
  dropdownZIndexClassName = "z-[120]",
}: CountryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasPickedSuggestion, setHasPickedSuggestion] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const filteredCountries = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return COUNTRY_NAMES.slice(0, 6);
    return COUNTRY_NAMES.filter((country) => country.toLowerCase().includes(query)).slice(0, 6);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={rootRef} className={`space-y-2 relative ${className ?? ""}`.trim()}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setHasPickedSuggestion(false);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            if (!hasPickedSuggestion) return;
            setHasPickedSuggestion(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsOpen(false);
            }
          }}
          required={required}
          className={`bg-background/50 pl-10 ${inputClassName ?? ""}`.trim()}
          autoComplete="off"
        />
        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      </div>

      {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}

      {isOpen && filteredCountries.length > 0 && (
        <div
          className={`absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden ${dropdownZIndexClassName}`.trim()}
        >
          {filteredCountries.map((country) => (
            <button
              key={country}
              type="button"
              className="w-full px-4 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2"
              onMouseDown={(e) => {
                e.preventDefault();
                setHasPickedSuggestion(true);
                onChange(country);
                setIsOpen(false);
              }}
            >
              <Globe className="w-3 h-3 text-muted-foreground" />
              {country}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
