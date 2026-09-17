import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { BookingField, SUGGESTED_BOOKING_FIELDS, slugifyFieldKey } from '../../lib/bookingFields';

interface BookingFieldsEditorProps {
  fields: BookingField[];
  onChange: (fields: BookingField[]) => void;
}

/**
 * Lets an admin pick which details to collect from attendees when booking a
 * meeting: choose from common suggestions, define a custom field manually,
 * and mark any non-core field as required or optional.
 */
export const BookingFieldsEditor: React.FC<BookingFieldsEditorProps> = ({ fields, onChange }) => {
  const [customInput, setCustomInput] = useState('');

  const coreFields = fields.filter((f) => f.core);
  const selectedFields = fields.filter((f) => !f.core);

  const isSelected = (label: string) =>
    fields.some((f) => f.label.toLowerCase() === label.trim().toLowerCase());

  const addField = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || isSelected(trimmed)) return;
    onChange([...fields, { key: slugifyFieldKey(trimmed), label: trimmed, required: false }]);
  };

  const removeField = (key: string) => {
    onChange(fields.filter((f) => f.core || f.key !== key));
  };

  const toggleRequired = (key: string) => {
    onChange(fields.map((f) => (!f.core && f.key === key ? { ...f, required: !f.required } : f)));
  };

  const suggestions = SUGGESTED_BOOKING_FIELDS.filter((s) => !isSelected(s.label));

  return (
    <div className="pt-2 border-t border-slate-100">
      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1">
        Booking Intake Fields
      </span>
      <p className="text-[11px] text-slate-500 mb-2.5">
        Choose what details to collect from attendees, and mark each as required or optional.
      </p>

      {/* Currently selected fields */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {coreFields.map((field) => (
          <span
            key={field.key}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
          >
            <span>{field.label}</span>
            <span className="text-[10px] text-slate-400 font-semibold">(Required)</span>
          </span>
        ))}
        {selectedFields.map((field) => (
          <span
            key={field.key}
            className="inline-flex items-center space-x-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-medium bg-cyan-50 text-cyan-800 border border-cyan-200"
          >
            <span>{field.label}</span>
            <button
              type="button"
              onClick={() => toggleRequired(field.key)}
              title="Click to toggle required / optional"
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                field.required
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {field.required ? 'Required' : 'Optional'}
            </button>
            <button
              type="button"
              onClick={() => removeField(field.key)}
              className="text-cyan-600 hover:text-red-600 transition-colors"
              title={`Remove ${field.label} field`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {selectedFields.length === 0 && (
          <span className="text-[11px] text-slate-400 italic">No additional fields selected yet.</span>
        )}
      </div>

      {/* Suggested common fields not yet added */}
      {suggestions.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Suggested fields
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.key}
                type="button"
                onClick={() => addField(suggestion.label)}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white text-slate-600 border border-dashed border-slate-300 hover:border-cyan-400 hover:text-cyan-700 hover:bg-cyan-50/50 transition-colors"
              >
                <Plus className="h-3 w-3" />
                <span>{suggestion.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual custom field not on the suggested list */}
      <div className="flex items-center space-x-2">
        <input
          type="text"
          placeholder="Add a field not on the list (e.g. Budget, Referral code...)"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addField(customInput);
              setCustomInput('');
            }
          }}
          className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs flex-1 focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
        />
        <button
          type="button"
          onClick={() => {
            addField(customInput);
            setCustomInput('');
          }}
          className="inline-flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors"
        >
          <Plus className="h-3 w-3" />
          <span>Add Field</span>
        </button>
      </div>
    </div>
  );
};
