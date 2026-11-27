import { AlertCircle, CheckCircle2, Clock, FileSignature, Send, ShieldCheck, XCircle } from 'lucide-react';

export function StatusText({ status }: { status: string }) {
  const normalized = status.trim();

  if (['Live', 'LIVE', 'Paid', 'Resolved', 'Verified', 'Credited', 'Studio Master Passed'].includes(normalized)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{normalized}</span>
      </span>
    );
  }

  if (['Approved', 'Processing', 'In Progress', 'Approved Compressed'].includes(normalized)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E5C158] whitespace-nowrap">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{normalized}</span>
      </span>
    );
  }

  if (normalized === 'Sent') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 whitespace-nowrap">
        <Send className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{normalized}</span>
      </span>
    );
  }

  if (normalized === 'Signed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 whitespace-nowrap">
        <FileSignature className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{normalized}</span>
      </span>
    );
  }

  if (['Rejected', 'Declined', 'Takedown'].includes(normalized)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{normalized}</span>
      </span>
    );
  }

  if (
    [
      'Pending',
      'Pending Verification',
      'Pending Review',
      'Queued for Partner',
      'In Review',
      'Requested',
      'Open',
      'Quality Warning',
    ].includes(normalized)
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{normalized}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 whitespace-nowrap">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{normalized}</span>
    </span>
  );
}
