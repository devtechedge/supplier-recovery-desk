import { AlertTriangle, CheckCircle2, Clock, FileText, XCircle } from 'lucide-react';
import { STATUS_META, type CaseStatus } from '@/lib/domain/workflow';

export function CaseStatusLabel({ status }: { status: CaseStatus }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'neutral' as const };

  const toneStyles = {
    positive: 'text-emerald-700',
    warning: 'text-amber-700',
    info: 'text-sky-700',
    danger: 'text-red-700',
    neutral: 'text-slate-600',
  }[meta.tone];

  const Icon =
    meta.tone === 'positive'
      ? CheckCircle2
      : meta.tone === 'danger'
        ? XCircle
        : meta.tone === 'warning'
          ? AlertTriangle
          : meta.tone === 'info'
            ? Clock
            : FileText;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${toneStyles}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}
