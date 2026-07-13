'use client';

import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

export interface BuildingAddressPanelProps {
  value: string;
  onCommit: (address: string) => void;
}

export default function BuildingAddressPanel({ value, onCommit }: BuildingAddressPanelProps) {
  const [draft, setDraft] = useState(value);

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onCommit(trimmed);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-6 py-5 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-900">Building address required</h3>
          <p className="mt-1 text-sm text-amber-800">
            Building address could not be detected automatically. Please enter it manually below
            — it will be applied to all asset rows.
          </p>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitDraft();
              }
            }}
            placeholder="e.g. 52 North Lane, Aldershot, Hampshire"
            className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <p className="mt-2 text-xs font-medium text-amber-700">
            Address is required before you can view the import summary. Press Enter or click away
            to apply.
          </p>
        </div>
      </div>
    </div>
  );
}
