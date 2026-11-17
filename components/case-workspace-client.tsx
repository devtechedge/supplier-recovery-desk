'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileText,
  Plus,
  Send,
  Sparkles,
  Upload,
} from 'lucide-react';
import { formatCents } from '@/lib/domain/money';
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  DEFAULT_ALLOWED_TRANSITIONS,
  INCIDENT_TYPE_LABELS,
  STATUS_META,
  type CaseStatus,
  type CostCategory,
  type IncidentType,
} from '@/lib/domain/workflow';
import { CaseStatusLabel } from './status-badge';

interface CaseDetail {
  id: string;
  organizationName: string;
  isDemo: boolean;
  caseNumber: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  supplierContact: { name: string; role: string; email: string; phone: string | null } | null;
  supplierTerms: {
    agreementTitle: string;
    warrantyWindowDays: number;
    claimNoticeDays: number;
    allowsSortingChargeback: boolean;
    allowsFreightRecovery: boolean;
    allowsDowntimeRecovery: boolean;
    termsSummary: string;
  } | null;
  plantName: string | null;
  poNumber: string | null;
  receiptNumber: string | null;
  invoiceNumber: string | null;
  incidentType: IncidentType;
  title: string;
  description: string;
  responsibilityAssessment: string;
  claimBasis: string | null;
  incidentDate: string;
  discoveryDate: string;
  submissionDate: string | null;
  responseDeadline: string | null;
  status: CaseStatus;
  currency: string;
  grossLossCents: number;
  potentiallyRecoverableCents: number;
  submittedAmountCents: number;
  approvedAmountCents: number;
  expectedCreditCents: number;
  recoveredAmountCents: number;
  outstandingBalanceCents: number;
  ownerName: string;
  internalNotes: string;
  creditReference: string | null;
  recoveredDate: string | null;
  costItems: Array<{
    id: string;
    category: CostCategory;
    description: string;
    unitLabel: string;
    unitRateCents: number;
    calculatedAmountCents: number;
    recoverableAmountCents: number;
    isManualOverride: boolean;
    overrideReason: string | null;
    overrideByName: string | null;
    overrideAt: string | null;
    formulaText: string;
    currency: string;
  }>;
  evidence: Array<{
    id: string;
    checklistItemKey: string | null;
    title: string;
    evidenceType: string;
    fileName: string;
    fileSizeBytes: number;
    isCompleted: boolean;
    uploadedByName: string;
    notes: string | null;
    createdAt: string;
    signedDownloadUrl: string;
  }>;
  checklist: Array<{ key: string; label: string; required: boolean; completed: boolean }>;
  dossierIncomplete: boolean;
  communications: Array<{
    id: string;
    direction: string;
    recipientEmail: string | null;
    subject: string;
    body: string;
    isAiDrafted: boolean;
    approvedByName: string | null;
    approvedAt: string | null;
    sentAt: string | null;
    createdAt: string;
  }>;
  settlements: Array<{
    id: string;
    settlementType: string;
    referenceNumber: string;
    approvedAmountCents: number;
    expectedDate: string | null;
    currency: string;
    status: string;
    notes: string | null;
  }>;
  transactions: Array<{
    id: string;
    transactionDate: string;
    amountReceivedCents: number;
    currency: string;
    referenceNumber: string;
    notes: string | null;
    recordedByName: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    assignedToName: string;
    dueDate: string | null;
    isCompleted: boolean;
  }>;
  timeline: Array<{
    id: string;
    eventType: string;
    summary: string;
    actorName: string;
    createdAt: string;
  }>;
}

export function CaseWorkspaceClient({
  caseDetail,
  orgRates,
}: {
  caseDetail: CaseDetail;
  orgRates: {
    sortingHourlyCents: number;
    reworkHourlyCents: number;
    downtimeHourlyCents: number;
    overtimeHourlyCents: number;
  };
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'costs' | 'evidence' | 'communications' | 'settlements' | 'timeline'
  >('costs');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showDossierPreview, setShowDossierPreview] = useState(false);

  // Transition state
  const allowedNext = DEFAULT_ALLOWED_TRANSITIONS[caseDetail.status] ?? [];
  const [targetStatus, setTargetStatus] = useState<CaseStatus>(allowedNext[0] ?? caseDetail.status);
  const [transitionNote, setTransitionNote] = useState('');
  const [transitionAmount, setTransitionAmount] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Cost form
  const [costCategory, setCostCategory] = useState<CostCategory>('sorting_labour');
  const [costDesc, setCostDesc] = useState('');
  const [costQty, setCostQty] = useState('4');
  const [costUnit, setCostUnit] = useState('hour');
  const [costRate, setCostRate] = useState((orgRates.sortingHourlyCents / 100).toFixed(2));
  const [recoverableOverride, setRecoverableOverride] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  // Evidence form
  const [evTitle, setEvTitle] = useState('');
  const [evChecklistKey, setEvChecklistKey] = useState(
    caseDetail.checklist.find((i) => !i.completed)?.key ?? 'inspection_report'
  );
  const [evFile, setEvFile] = useState<File | null>(null);
  const [evNotes, setEvNotes] = useState('');

  // Communication draft form
  const [commTo, setCommTo] = useState(caseDetail.supplierContact?.email ?? '');
  const [commSubject, setCommSubject] = useState('');
  const [commBody, setCommBody] = useState('');
  const [commIsAi, setCommIsAi] = useState(false);
  const [inboundSubject, setInboundSubject] = useState('');
  const [inboundBody, setInboundBody] = useState('');

  // Settlement / Payment forms
  const [promiseRef, setPromiseRef] = useState('');
  const [promiseType, setPromiseType] = useState<'credit_memo' | 'bank_refund' | 'invoice_offset' | 'replacement_goods'>('credit_memo');
  const [promiseAmount, setPromiseAmount] = useState('');
  const [promiseDate, setPromiseDate] = useState(new Date().toISOString().slice(0, 10));

  const [recvRef, setRecvRef] = useState('');
  const [recvAmount, setRecvAmount] = useState('');
  const [recvDate, setRecvDate] = useState(new Date().toISOString().slice(0, 10));
  const [recvNotes, setRecvNotes] = useState('');

  // Notes & Task
  const [internalNotes, setInternalNotes] = useState(caseDetail.internalNotes);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  function notify(type: 'ok' | 'err', text: string) {
    setFeedback({ type, text });
  }

  async function handleTransition(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('transition');
    try {
      const payload: Record<string, unknown> = { targetStatus, note: transitionNote };
      if (targetStatus === 'submitted' && transitionAmount.trim()) {
        payload.submittedAmount = transitionAmount;
      } else if (
        (targetStatus === 'approved' || targetStatus === 'partially_approved') &&
        transitionAmount.trim()
      ) {
        payload.approvedAmount = transitionAmount;
      } else if (targetStatus === 'credit_expected' && transitionAmount.trim()) {
        payload.expectedCredit = transitionAmount;
      }

      const res = await fetch(`/api/cases/${caseDetail.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transition failed');
      notify('ok', `Status updated to ${STATUS_META[targetStatus].label}.`);
      setTransitionNote('');
      setTransitionAmount('');
      router.refresh();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Transition failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAddCost(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('cost');
    try {
      const res = await fetch(`/api/cases/${caseDetail.id}/costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: costCategory,
          description: costDesc,
          quantity: Number(costQty),
          unitLabel: costUnit,
          unitRate: costRate,
          recoverableOverride: recoverableOverride.trim() || undefined,
          overrideReason: overrideReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add cost line');
      setCostDesc('');
      setRecoverableOverride('');
      setOverrideReason('');
      notify('ok', 'Cost breakdown line recorded and case totals recalculated.');
      router.refresh();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to add cost line');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUploadEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!evFile) {
      notify('err', 'Please select a file to upload.');
      return;
    }
    setBusyAction('evidence');
    try {
      const fd = new FormData();
      fd.append('file', evFile);
      fd.append('title', evTitle || evFile.name);
      fd.append('evidenceType', evChecklistKey);
      fd.append('checklistItemKey', evChecklistKey);
      fd.append('notes', evNotes);

      const res = await fetch(`/api/cases/${caseDetail.id}/evidence`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setEvTitle('');
      setEvFile(null);
      setEvNotes('');
      notify('ok', `Stored "${data.fileName}" in private tenant evidence storage.`);
      router.refresh();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Evidence upload failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDraftWithAssist() {
    setBusyAction('draft_ai');
    try {
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'draft_communication', caseId: caseDetail.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Draft generation failed');
      setCommSubject(data.draftEmail.subject);
      setCommBody(data.draftEmail.body);
      setCommIsAi(data.provider === 'gemini');
      notify(
        'ok',
        data.provider === 'gemini'
          ? 'Draft prepared using Gemini AI. Review carefully and approve before using.'
          : 'Deterministic draft prepared from verified case data. Review before approving.'
      );
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Draft failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('save_draft');
    try {
      const res = await fetch(`/api/cases/${caseDetail.id}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_draft',
          recipientEmail: commTo,
          subject: commSubject,
          body: commBody,
          isAiDrafted: commIsAi,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save draft');
      setCommSubject('');
      setCommBody('');
      notify('ok', 'Communication draft saved for human review.');
      router.refresh();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApproveComm(commId: string, sendEmail: boolean) {
    setBusyAction('approve_comm');
    try {
      const res = await fetch(`/api/cases/${caseDetail.id}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_and_send', communicationId: commId, sendEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');
      notify('ok', data.note);
      router.refresh();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLogInbound(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('inbound');
    try {
      const res = await fetch(`/api/cases/${caseDetail.id}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'log_inbound',
          senderEmail: caseDetail.supplierContact?.email ?? '',
          subject: inboundSubject,
          body: inboundBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log supplier response');
      setInboundSubject('');
      setInboundBody('');
      notify('ok', 'Inbound supplier response recorded in case history.');
      router.refresh();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to log response');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSettlement(
    e: React.FormEvent,
    mode: 'promise_credit' | 'receive_payment'
  ) {
    e.preventDefault();
    setBusyAction(mode);
    try {
      const payload =
        mode === 'promise_credit'
          ? {
              mode,
              settlementType: promiseType,
              referenceNumber: promiseRef,
              amount: promiseAmount,
              date: promiseDate,
            }
          : {
              mode,
              referenceNumber: recvRef,
              amount: recvAmount,
              date: recvDate,
              notes: recvNotes,
            };
      const res = await fetch(`/api/cases/${caseDetail.id}/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record settlement');
      if (mode === 'promise_credit') {
        setPromiseRef('');
        setPromiseAmount('');
        notify('ok', 'Expected credit promise recorded (not yet counted as recovered cash).');
      } else {
        setRecvRef('');
        setRecvAmount('');
        setRecvNotes('');
        notify('ok', `Actual receipt reconciled. Updated status: ${data.status}.`);
      }
      router.refresh();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Settlement error');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveNotes() {
    setBusyAction('notes');
    try {
      const res = await fetch(`/api/cases/${caseDetail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNotes }),
      });
      if (!res.ok) throw new Error('Failed to save notes');
      notify('ok', 'Internal notes saved.');
      router.refresh();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('task');
    try {
      const res = await fetch(`/api/cases/${caseDetail.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', title: newTaskTitle, dueDate: newTaskDue }),
      });
      if (!res.ok) throw new Error('Failed to create task');
      setNewTaskTitle('');
      setNewTaskDue('');
      router.refresh();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Task error');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleTask(taskId: string, isCompleted: boolean) {
    await fetch(`/api/cases/${caseDetail.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', taskId, isCompleted }),
    });
    router.refresh();
  }

  async function handleSummarizeHistory() {
    setBusyAction('summarize');
    try {
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'summarize_case', caseId: caseDetail.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Summary failed');
      setAiSummary(data.summaryText);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Summary failed');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Link href="/app/cases" className="hover:underline">Recovery cases</Link>
            <span aria-hidden="true">/</span>
            <span className="font-mono font-semibold text-slate-900">{caseDetail.caseNumber}</span>
            <span aria-hidden="true">·</span>
            <CaseStatusLabel status={caseDetail.status} />
            <span aria-hidden="true">·</span>
            <span>{INCIDENT_TYPE_LABELS[caseDetail.incidentType]}</span>
          </div>
          <h1 className="mt-2 font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-950">
            {caseDetail.title}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>
              Supplier:{' '}
              <Link href={`/app/suppliers/${caseDetail.supplierId}`} className="font-medium text-sky-700 hover:underline">
                {caseDetail.supplierName} ({caseDetail.supplierCode})
              </Link>
            </span>
            {caseDetail.poNumber && <span className="font-mono">PO: {caseDetail.poNumber}</span>}
            {caseDetail.receiptNumber && <span className="font-mono">GR: {caseDetail.receiptNumber}</span>}
            {caseDetail.invoiceNumber && <span className="font-mono">Inv: {caseDetail.invoiceNumber}</span>}
            {caseDetail.plantName && <span>Plant: {caseDetail.plantName}</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowDossierPreview(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Preview Dossier</span>
          </button>
          <a
            href={`/api/cases/${caseDetail.id}/dossier`}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#0F172A] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1E293B]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Download PDF Dossier</span>
          </a>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-md border px-4 py-2.5 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {caseDetail.dossierIncomplete && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-semibold">Claim dossier incomplete:</span>{' '}
            Required evidence checklist items are still missing ({caseDetail.checklist.filter((c) => c.required && !c.completed).map((c) => c.label).join(', ')}). Attach documents under Evidence &amp; Checklist before formal submission.
          </div>
        </div>
      )}

      {/* 7-Stage Financial Reconciliation Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          ['Gross Loss', caseDetail.grossLossCents, 'text-slate-700'],
          ['Recoverable', caseDetail.potentiallyRecoverableCents, 'text-slate-900'],
          ['Submitted', caseDetail.submittedAmountCents, 'text-slate-900'],
          ['Approved', caseDetail.approvedAmountCents, 'text-sky-700'],
          ['Expected Credit', caseDetail.expectedCreditCents, 'text-amber-700'],
          ['Actual Recovered', caseDetail.recoveredAmountCents, 'text-emerald-700 font-bold'],
          ['Balance Due', caseDetail.outstandingBalanceCents, 'text-slate-950 font-bold'],
        ].map(([label, cents, colorClass]) => (
          <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-3.5">
            <p className="text-[11px] font-medium text-slate-500">{label}</p>
            <p className={`mt-1 font-mono text-base tabular-nums ${colorClass}`}>
              {formatCents(Number(cents), caseDetail.currency)}
            </p>
          </div>
        ))}
      </section>

      {/* Case Overview & Lifecycle Transition Bar */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Incident Summary &amp; Claim Basis
          </h2>
          <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-line">
            {caseDetail.description}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-3 text-xs">
            <div>
              <span className="font-medium text-slate-500 block">Responsibility Assessment</span>
              <span className="text-slate-800">{caseDetail.responsibilityAssessment}</span>
            </div>
            <div>
              <span className="font-medium text-slate-500 block">Claim Basis &amp; Supplier Terms</span>
              <span className="text-slate-800">
                {caseDetail.claimBasis || 'Standard PO / receiving record'}{' '}
                {caseDetail.supplierTerms ? `(${caseDetail.supplierTerms.agreementTitle})` : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Workflow Transition
          </h2>
          {allowedNext.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              Case is in terminal status ({STATUS_META[caseDetail.status].label}).
            </p>
          ) : (
            <form onSubmit={handleTransition} className="mt-3 space-y-2.5">
              <div>
                <label htmlFor="next-status" className="block text-[11px] font-medium text-slate-600">
                  Move status to
                </label>
                <select
                  id="next-status"
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as CaseStatus)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                >
                  {allowedNext.map((st) => (
                    <option key={st} value={st}>
                      {STATUS_META[st].label}
                    </option>
                  ))}
                </select>
              </div>
              {(targetStatus === 'submitted' ||
                targetStatus === 'approved' ||
                targetStatus === 'partially_approved' ||
                targetStatus === 'credit_expected') && (
                <div>
                  <label htmlFor="transition-amt" className="block text-[11px] font-medium text-slate-600">
                    Amount ({caseDetail.currency}) - optional override
                  </label>
                  <input
                    id="transition-amt"
                    type="text"
                    placeholder={(caseDetail.potentiallyRecoverableCents / 100).toFixed(2)}
                    value={transitionAmount}
                    onChange={(e) => setTransitionAmount(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
              )}
              <input
                type="text"
                aria-label="Transition audit note"
                placeholder="Reason / transition note (optional)"
                value={transitionNote}
                onChange={(e) => setTransitionNote(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <button
                type="submit"
                disabled={busyAction === 'transition'}
                className="w-full rounded-md bg-[#0F172A] px-3 py-2 text-xs font-medium text-white hover:bg-[#1E293B] cursor-pointer disabled:opacity-60"
              >
                {busyAction === 'transition' ? 'Updating...' : 'Apply Status Transition'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Segmented Workspace Tabs */}
      <div className="border-b border-slate-200 flex flex-wrap gap-1" role="tablist">
        {[
          ['costs', `Cost Breakdown (${caseDetail.costItems.length})`],
          ['evidence', `Evidence & Checklist (${caseDetail.evidence.length})`],
          ['communications', `Communications (${caseDetail.communications.length})`],
          ['settlements', `Settlements & Reconciliation (${caseDetail.transactions.length})`],
          ['timeline', `Tasks & Timeline (${caseDetail.timeline.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === key
                ? 'border-slate-950 text-slate-950'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab 1: Cost Breakdown Engine */}
      {activeTab === 'costs' && (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Description &amp; Formula</th>
                  <th className="px-4 py-3 font-medium text-right">Gross Loss</th>
                  <th className="px-4 py-3 font-medium text-right">Recoverable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {caseDetail.costItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No cost items recorded yet. Add the first cost line below.
                    </td>
                  </tr>
                ) : (
                  caseDetail.costItems.map((ci) => (
                    <tr key={ci.id}>
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                        {COST_CATEGORY_LABELS[ci.category] ?? ci.category}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-900">{ci.description}</p>
                        <p className="font-mono text-[11px] text-slate-500">{ci.formulaText}</p>
                        {ci.isManualOverride && (
                          <p className="mt-1 text-[11px] text-amber-800">
                            Override by {ci.overrideByName ?? 'User'}: {ci.overrideReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatCents(ci.calculatedAmountCents, ci.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-950">
                        {formatCents(ci.recoverableAmountCents, ci.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleAddCost} className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Add Inspectable Cost Line Item
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div>
                <label htmlFor="cost-cat" className="block text-[11px] font-medium text-slate-600">
                  Category
                </label>
                <select
                  id="cost-cat"
                  value={costCategory}
                  onChange={(e) => {
                    const cat = e.target.value as CostCategory;
                    setCostCategory(cat);
                    if (cat === 'sorting_labour') {
                      setCostUnit('hour');
                      setCostRate((orgRates.sortingHourlyCents / 100).toFixed(2));
                    } else if (cat === 'rework_labour') {
                      setCostUnit('hour');
                      setCostRate((orgRates.reworkHourlyCents / 100).toFixed(2));
                    } else if (cat === 'production_downtime') {
                      setCostUnit('hour');
                      setCostRate((orgRates.downtimeHourlyCents / 100).toFixed(2));
                    } else if (cat === 'overtime') {
                      setCostUnit('hour');
                      setCostRate((orgRates.overtimeHourlyCents / 100).toFixed(2));
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                >
                  {COST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {COST_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="cost-desc" className="block text-[11px] font-medium text-slate-600">
                  Description
                </label>
                <input
                  id="cost-desc"
                  required
                  value={costDesc}
                  onChange={(e) => setCostDesc(e.target.value)}
                  placeholder="e.g., QA containment sorting for lot 1042"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label htmlFor="cost-qty" className="block text-[11px] font-medium text-slate-600">
                  Qty &amp; Unit
                </label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    id="cost-qty"
                    type="number"
                    step="0.01"
                    required
                    value={costQty}
                    onChange={(e) => setCostQty(e.target.value)}
                    className="w-1/2 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-mono"
                  />
                  <input
                    type="text"
                    aria-label="Unit label"
                    required
                    value={costUnit}
                    onChange={(e) => setCostUnit(e.target.value)}
                    className="w-1/2 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="cost-rate" className="block text-[11px] font-medium text-slate-600">
                  Unit Rate ({caseDetail.currency})
                </label>
                <input
                  id="cost-rate"
                  type="text"
                  required
                  value={costRate}
                  onChange={(e) => setCostRate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 pt-3">
              <div>
                <label htmlFor="cost-override" className="block text-[11px] font-medium text-slate-600">
                  Recoverable override ({caseDetail.currency}) - optional
                </label>
                <input
                  id="cost-override"
                  type="text"
                  placeholder="Leave blank to claim 100%"
                  value={recoverableOverride}
                  onChange={(e) => setRecoverableOverride(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="cost-override-reason" className="block text-[11px] font-medium text-slate-600">
                  Override audit reason (required if overriding recoverable amount)
                </label>
                <input
                  id="cost-override-reason"
                  type="text"
                  placeholder="e.g., Excluded under MSA Section 9.3 consequential loss clause"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busyAction === 'cost'}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E293B] cursor-pointer disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{busyAction === 'cost' ? 'Calculating...' : 'Add Cost Line'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Evidence & Checklist */}
      {activeTab === 'evidence' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Incident Evidence Checklist
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Tailored to {INCIDENT_TYPE_LABELS[caseDetail.incidentType]}.
            </p>
            <ul className="mt-4 divide-y divide-slate-100 text-xs">
              {caseDetail.checklist.map((item) => (
                <li key={item.key} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`h-4 w-4 shrink-0 ${item.completed ? 'text-emerald-600' : 'text-slate-300'}`}
                      aria-hidden="true"
                    />
                    <span className={item.completed ? 'text-slate-900 font-medium' : 'text-slate-700'}>
                      {item.label}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">
                    {item.completed ? 'Complete' : item.required ? 'Required' : 'Optional'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <form onSubmit={handleUploadEvidence} className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Upload Private Evidence Document
              </h3>
              <p className="text-xs text-slate-500">
                Files are stored in private tenant-isolated storage and served only via short-lived signed URLs (PDF, PNG, JPEG, WEBP, CSV, TXT, max 10MB).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ev-checklist" className="block text-[11px] font-medium text-slate-600">
                    Checklist item
                  </label>
                  <select
                    id="ev-checklist"
                    value={evChecklistKey}
                    onChange={(e) => setEvChecklistKey(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                  >
                    {caseDetail.checklist.map((i) => (
                      <option key={i.key} value={i.key}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ev-title" className="block text-[11px] font-medium text-slate-600">
                    Document title
                  </label>
                  <input
                    id="ev-title"
                    type="text"
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    placeholder="e.g., Signed Receiving Exception Report"
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ev-file" className="block text-[11px] font-medium text-slate-600">
                    Select file
                  </label>
                  <input
                    id="ev-file"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt"
                    onChange={(e) => setEvFile(e.target.files?.[0] ?? null)}
                    className="mt-1 block w-full text-xs text-slate-700"
                  />
                </div>
                <div>
                  <label htmlFor="ev-notes" className="block text-[11px] font-medium text-slate-600">
                    Notes (optional)
                  </label>
                  <input
                    id="ev-notes"
                    type="text"
                    value={evNotes}
                    onChange={(e) => setEvNotes(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busyAction === 'evidence'}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E293B] cursor-pointer disabled:opacity-60"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{busyAction === 'evidence' ? 'Uploading...' : 'Upload Private Evidence'}</span>
                </button>
              </div>
            </form>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-3">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Attached Evidence ({caseDetail.evidence.length})
                </h3>
              </div>
              {caseDetail.evidence.length === 0 ? (
                <p className="px-5 py-6 text-xs text-slate-500">No evidence files uploaded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {caseDetail.evidence.map((ev) => (
                    <div key={ev.id} className="px-5 py-3 flex items-center justify-between gap-4 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{ev.title}</p>
                        <p className="text-[11px] text-slate-500 font-mono truncate">
                          {ev.fileName} · {(ev.fileSizeBytes / 1024).toFixed(1)} KB · Uploaded by {ev.uploadedByName}
                        </p>
                      </div>
                      <a
                        href={ev.signedDownloadUrl}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 shrink-0"
                      >
                        <Download className="h-3 w-3" aria-hidden="true" />
                        <span>Signed Download</span>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Supplier Communications */}
      {activeTab === 'communications' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <form onSubmit={handleSaveDraft} className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    Draft Supplier Communication
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Drafts are never sent automatically. Human review and explicit approval are required.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDraftWithAssist}
                  disabled={busyAction === 'draft_ai'}
                  className="inline-flex items-center gap-1.5 rounded border border-sky-700 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{busyAction === 'draft_ai' ? 'Drafting...' : 'Generate Draft from Case Data'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="comm-to" className="block text-[11px] font-medium text-slate-600">
                    Supplier contact email
                  </label>
                  <input
                    id="comm-to"
                    type="email"
                    value={commTo}
                    onChange={(e) => setCommTo(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="comm-subj" className="block text-[11px] font-medium text-slate-600">
                    Subject
                  </label>
                  <input
                    id="comm-subj"
                    required
                    value={commSubject}
                    onChange={(e) => setCommSubject(e.target.value)}
                    placeholder={`Recovery Claim ${caseDetail.caseNumber}`}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="comm-body" className="block text-[11px] font-medium text-slate-600">
                  Message body {commIsAi && '(AI-assisted draft - verify all numbers before saving)'}
                </label>
                <textarea
                  id="comm-body"
                  required
                  rows={8}
                  value={commBody}
                  onChange={(e) => setCommBody(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={busyAction === 'save_draft'}
                  className="rounded-md bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-[#1E293B] cursor-pointer"
                >
                  {busyAction === 'save_draft' ? 'Saving...' : 'Save Draft for Approval'}
                </button>
              </div>
            </form>

            <form onSubmit={handleLogInbound} className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Log Inbound Supplier Response / Dispute
              </h3>
              <input
                type="text"
                required
                aria-label="Inbound response subject"
                placeholder="Subject / email reference"
                value={inboundSubject}
                onChange={(e) => setInboundSubject(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <textarea
                required
                rows={3}
                aria-label="Inbound response body"
                placeholder="Paste supplier credit confirmation or dispute reasoning..."
                value={inboundBody}
                onChange={(e) => setInboundBody(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busyAction === 'inbound'}
                  className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  Log Supplier Response
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-3">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Correspondence Log ({caseDetail.communications.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {caseDetail.communications.length === 0 ? (
                <p className="px-5 py-6 text-xs text-slate-500">No supplier correspondence recorded yet.</p>
              ) : (
                caseDetail.communications.map((cm) => (
                  <div key={cm.id} className="p-4 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {cm.direction === 'inbound_response'
                          ? 'Inbound Supplier Response'
                          : cm.sentAt
                            ? 'Outbound Sent'
                            : cm.approvedAt
                              ? 'Approved Draft'
                              : 'Draft Awaiting Approval'}
                      </span>
                      {cm.isAiDrafted && (
                        <span className="text-[11px] text-sky-700 font-medium">AI-assisted</span>
                      )}
                    </div>
                    <p className="font-medium text-slate-800">{cm.subject}</p>
                    <p className="text-slate-600 whitespace-pre-line leading-relaxed">{cm.body}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(`Subject: ${cm.subject}\n\n${cm.body}`);
                          notify('ok', 'Email text copied to clipboard.');
                        }}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        <ClipboardCopy className="h-3 w-3" aria-hidden="true" />
                        <span>Copy</span>
                      </button>
                      {cm.direction === 'outbound_draft' && !cm.approvedAt && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApproveComm(cm.id, false)}
                            className="inline-flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-800 cursor-pointer"
                          >
                            <Check className="h-3 w-3" aria-hidden="true" />
                            <span>Approve Draft</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveComm(cm.id, true)}
                            className="inline-flex items-center gap-1 rounded border border-sky-700 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-900 hover:bg-sky-100 cursor-pointer"
                          >
                            <Send className="h-3 w-3" aria-hidden="true" />
                            <span>Approve &amp; Send Email</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Settlements & Partial Recovery Reconciliation */}
      {activeTab === 'settlements' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-6">
            <form onSubmit={(e) => handleSettlement(e, 'promise_credit')} className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                1. Record Approved / Promised Credit Memo
              </h3>
              <p className="text-xs text-slate-500">
                Logs expected credit or supplier approval. Does NOT increment &ldquo;Actual Recovered&rdquo; until settlement receipt is reconciled below.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  aria-label="Settlement instrument type"
                  value={promiseType}
                  onChange={(e) => setPromiseType(e.target.value as typeof promiseType)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                >
                  <option value="credit_memo">Credit Memo</option>
                  <option value="bank_refund">Bank Refund / Wire</option>
                  <option value="invoice_offset">AP Invoice Offset</option>
                  <option value="replacement_goods">Replacement Goods</option>
                </select>
                <input
                  type="text"
                  required
                  aria-label="Credit memo reference"
                  placeholder="Credit memo / RMA ref (e.g. CM-4091)"
                  value={promiseRef}
                  onChange={(e) => setPromiseRef(e.target.value)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="text"
                  required
                  aria-label="Promised credit amount"
                  placeholder={`Approved amount (${caseDetail.currency})`}
                  value={promiseAmount}
                  onChange={(e) => setPromiseAmount(e.target.value)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="date"
                  required
                  aria-label="Expected credit date"
                  value={promiseDate}
                  onChange={(e) => setPromiseDate(e.target.value)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busyAction === 'promise_credit'}
                  className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50 cursor-pointer"
                >
                  Record Expected Credit
                </button>
              </div>
            </form>

            <form onSubmit={(e) => handleSettlement(e, 'receive_payment')} className="rounded-lg border border-emerald-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-emerald-900">
                2. Reconcile Actual Cash / Applied Credit Received
              </h3>
              <p className="text-xs text-slate-600">
                Supports multiple partial installments. Updates Actual Recovered Amount and Remaining Balance immediately.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  aria-label="Settlement receipt reference"
                  placeholder="AP / Bank ref #"
                  value={recvRef}
                  onChange={(e) => setRecvRef(e.target.value)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="text"
                  required
                  aria-label="Amount actually received"
                  placeholder={`Received (${caseDetail.currency})`}
                  value={recvAmount}
                  onChange={(e) => setRecvAmount(e.target.value)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="date"
                  required
                  aria-label="Actual settlement date"
                  value={recvDate}
                  onChange={(e) => setRecvDate(e.target.value)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
              <input
                type="text"
                aria-label="Reconciliation notes"
                placeholder="Reconciliation notes (e.g., Applied to Oct AP batch)"
                value={recvNotes}
                onChange={(e) => setRecvNotes(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busyAction === 'receive_payment'}
                  className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 cursor-pointer"
                >
                  Record Received Recovery
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-3">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Promised Credits &amp; Agreements ({caseDetail.settlements.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {caseDetail.settlements.length === 0 ? (
                  <p className="px-5 py-5 text-slate-500">No credit memos or settlement agreements logged yet.</p>
                ) : (
                  caseDetail.settlements.map((s) => (
                    <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-mono font-semibold text-slate-900">{s.referenceNumber}</p>
                        <p className="text-[11px] text-slate-500">
                          {s.settlementType} · Expected {s.expectedDate ?? 'TBD'} · {s.status}
                        </p>
                      </div>
                      <span className="font-mono font-semibold text-sky-700 tabular-nums">
                        {formatCents(s.approvedAmountCents, s.currency)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-3">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Reconciled Recovery Transactions ({caseDetail.transactions.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {caseDetail.transactions.length === 0 ? (
                  <p className="px-5 py-5 text-slate-500">
                    No cash or applied credit received yet. Outstanding balance remains {formatCents(caseDetail.outstandingBalanceCents, caseDetail.currency)}.
                  </p>
                ) : (
                  caseDetail.transactions.map((t) => (
                    <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-mono font-semibold text-slate-900">{t.referenceNumber}</p>
                        <p className="text-[11px] text-slate-500">
                          {t.transactionDate} · Recorded by {t.recordedByName}
                        </p>
                        {t.notes && <p className="text-[11px] text-slate-600 mt-0.5">{t.notes}</p>}
                      </div>
                      <span className="font-mono font-bold text-emerald-700 tabular-nums">
                        +{formatCents(t.amountReceivedCents, t.currency)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Tasks, Internal Notes & Timeline */}
      {activeTab === 'timeline' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-slate-900">Internal Notes</h3>
              <textarea
                rows={4}
                aria-label="Internal case notes"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={busyAction === 'notes'}
                className="rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
              >
                Save Notes
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-slate-900">Follow-up Tasks</h3>
              <form onSubmit={handleAddTask} className="flex gap-2">
                <input
                  type="text"
                  required
                  aria-label="New task title"
                  placeholder="Add follow-up action..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                />
                <input
                  type="date"
                  aria-label="Task due date"
                  value={newTaskDue}
                  onChange={(e) => setNewTaskDue(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-mono"
                />
                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                >
                  Add
                </button>
              </form>
              <ul className="divide-y divide-slate-100 text-xs">
                {caseDetail.tasks.map((t) => (
                  <li key={t.id} className="py-2 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={t.isCompleted}
                        onChange={(e) => handleToggleTask(t.id, e.target.checked)}
                      />
                      <span className={t.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}>
                        {t.title}
                      </span>
                    </label>
                    {t.dueDate && <span className="font-mono text-[11px] text-slate-500">{t.dueDate}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Audit &amp; Activity Timeline
              </h3>
              <button
                type="button"
                onClick={handleSummarizeHistory}
                disabled={busyAction === 'summarize'}
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                <span>{busyAction === 'summarize' ? 'Summarizing...' : 'Summarize History'}</span>
              </button>
            </div>
            {aiSummary && (
              <div className="rounded-md border border-sky-200 bg-sky-50 p-3.5 text-xs text-slate-800 whitespace-pre-line">
                <p className="font-semibold text-sky-900 mb-1">Case History Summary (Review Only)</p>
                {aiSummary}
              </div>
            )}
            <div className="divide-y divide-slate-100 text-xs">
              {caseDetail.timeline.map((ev) => (
                <div key={ev.id} className="py-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">{ev.actorName}</span>
                    <span className="font-mono">{ev.createdAt}</span>
                  </div>
                  <p className="mt-1 text-slate-800">{ev.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dossier Preview Modal */}
      {showDossierPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Claim Dossier Preview"
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-lg border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-xs">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <p className="font-mono text-[11px] text-slate-500">CLAIM DOSSIER PREVIEW</p>
                <h2 className="font-display text-lg font-bold text-slate-950">
                  {caseDetail.caseNumber} - {caseDetail.supplierName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowDossierPreview(false)}
                className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>

            {caseDetail.isDemo && (
              <p className="font-semibold text-amber-800">
                GENERATED FROM SYNTHETIC DEMO DATA
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded border border-slate-200">
              <div><span className="text-slate-500">Organization:</span> {caseDetail.organizationName}</div>
              <div><span className="text-slate-500">Supplier:</span> {caseDetail.supplierName} ({caseDetail.supplierCode})</div>
              <div><span className="text-slate-500">PO / GR / Inv:</span> {[caseDetail.poNumber, caseDetail.receiptNumber, caseDetail.invoiceNumber].filter(Boolean).join(' / ') || 'Manual'}</div>
              <div><span className="text-slate-500">Submitted / Due:</span> {caseDetail.submissionDate ?? 'Not submitted'} / {caseDetail.responseDeadline ?? '-'}</div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900">Incident Summary</h3>
              <p className="mt-1 text-slate-700 leading-relaxed">{caseDetail.description}</p>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900">Itemized Cost Breakdown ({caseDetail.currency})</h3>
              <ul className="mt-1.5 divide-y divide-slate-100 border border-slate-200 rounded">
                {caseDetail.costItems.map((ci) => (
                  <li key={ci.id} className="px-3 py-2 flex justify-between gap-2">
                    <span>{COST_CATEGORY_LABELS[ci.category]}: {ci.description} ({ci.formulaText})</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatCents(ci.recoverableAmountCents, ci.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <div className="font-mono">
                <span className="text-slate-500">Claimable: </span>
                <strong>{formatCents(caseDetail.potentiallyRecoverableCents, caseDetail.currency)}</strong>
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-slate-500">Recovered: </span>
                <strong className="text-emerald-700">{formatCents(caseDetail.recoveredAmountCents, caseDetail.currency)}</strong>
              </div>
              <a
                href={`/api/cases/${caseDetail.id}/dossier`}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#0F172A] px-4 py-2 font-medium text-white"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Download PDF</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
