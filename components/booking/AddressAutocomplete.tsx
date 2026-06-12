"use client";
import { useState, useEffect } from 'react';

type AddressSuggestion = {
  description: string;
  placeId?: string;
  mainText?: string;
  secondaryText?: string;
  types?: string[];
};

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  id: string;
  suggestionBias?: string;
  noResultsText?: string;
  onSelect?: (value: string, suggestion?: AddressSuggestion) => void;
}

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Enter address",
  label,
  id,
  suggestionBias,
  noResultsText = "No matching address found.",
  onSelect,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (value.length < 3) {
      setSuggestions([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const query = suggestionBias ? `${value} ${suggestionBias}` : value;
        const educationalParam = suggestionBias ? "&educational=1" : "";
        const response = await fetch(`/api/addresses/suggest?q=${encodeURIComponent(query)}${educationalParam}`);
        const data = await response.json();
        
        if (data.success) {
          const items = Array.isArray(data.suggestionItems)
            ? data.suggestionItems
            : Array.isArray(data.suggestions)
              ? data.suggestions.map((description: string) => ({ description }))
              : [];
          setSuggestions(items);
          setSearched(true);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error('Address autocomplete error:', error);
      } finally {
        setLoading(false);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(timer);
  }, [value, suggestionBias]);

  const handleSelect = (suggestion: AddressSuggestion) => {
    onChange(suggestion.description);
    onSelect?.(suggestion.description, suggestion);
    setShowSuggestions(false);
    setSuggestions([]);
    setSearched(false);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="text-[13px] font-semibold text-drivo-text-secondary mb-1.5 block">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        className="input w-full pr-10"
      />
      {loading && (
        <div className="absolute right-3 top-9">
          <div className="w-4 h-4 border-2 border-drivo-green border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-drivo-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.placeId || `${suggestion.description}-${index}`}
              onClick={() => handleSelect(suggestion)}
              className="px-4 py-3 cursor-pointer hover:bg-drivo-bg-soft border-b border-drivo-border-light last:border-0 text-[14px] text-drivo-text"
            >
              <span className="block font-semibold">{suggestion.mainText || suggestion.description}</span>
              {suggestion.secondaryText && (
                <span className="mt-0.5 block text-[12px] text-drivo-text-muted">
                  {suggestion.secondaryText}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {showSuggestions && searched && !loading && suggestions.length === 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-800 shadow-lg">
          {noResultsText}
        </div>
      )}
    </div>
  );
}
