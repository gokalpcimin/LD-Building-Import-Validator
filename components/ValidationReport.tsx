import type { ValidationSummary } from '../types';
import { AlertTriangle, Building2, Package, ShieldAlert } from 'lucide-react';

export interface ValidationReportProps {
  summary: ValidationSummary;
}

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: 'error' | 'warning';
}

function KpiCard({ label, value, icon, highlight }: KpiCardProps) {
  const styles =
    highlight === 'error'
      ? 'border-red-200 bg-red-50'
      : highlight === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-white';

  const labelStyles =
    highlight === 'error'
      ? 'text-red-700'
      : highlight === 'warning'
        ? 'text-amber-800'
        : 'text-slate-500';

  const valueStyles =
    highlight === 'error'
      ? 'text-red-900'
      : highlight === 'warning'
        ? 'text-amber-900'
        : 'text-slate-900';

  const iconStyles =
    highlight === 'error'
      ? 'bg-red-100 text-red-600'
      : highlight === 'warning'
        ? 'bg-amber-100 text-amber-600'
        : 'bg-slate-100 text-slate-600';

  return (
    <div className={`rounded-2xl border p-6 shadow-sm transition-colors ${styles}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-sm font-medium ${labelStyles}`}>{label}</p>
          <p className={`mt-2 text-3xl font-semibold tracking-tight ${valueStyles}`}>
            {value.toLocaleString()}
          </p>
        </div>
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconStyles}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function ValidationReport({ summary }: ValidationReportProps) {
  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Validation Review</h2>
        <p className="mt-1 text-sm text-slate-500">
          Assets imported, distinct locations, critical errors, and uncertainties requiring
          human review before import.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Assets Imported"
          value={summary.totalImported}
          icon={<Package className="h-6 w-6" />}
        />
        <KpiCard
          label="Distinct Locations"
          value={summary.distinctLocationsCount}
          icon={<Building2 className="h-6 w-6" />}
        />
        <KpiCard
          label="Critical Errors"
          value={summary.totalErrors}
          icon={<ShieldAlert className="h-6 w-6" />}
          highlight={summary.totalErrors > 0 ? 'error' : undefined}
        />
        <KpiCard
          label="Uncertainties (Warnings)"
          value={summary.totalWarnings}
          icon={<AlertTriangle className="h-6 w-6" />}
          highlight={summary.totalWarnings > 0 ? 'warning' : undefined}
        />
      </div>
    </div>
  );
}
