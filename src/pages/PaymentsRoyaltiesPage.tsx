import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Banknote, BarChart3, Download, Save, Wallet } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { StatusText } from '../components/StatusText.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { SUPPORTED_STORES, formatDateDDMMYYYY, formatINR } from '../lib/assets.ts';
import type { AppView, ArtistBalanceSummary, PayoutRequest, RoyaltyEntry } from '../types.ts';

interface PaymentsRoyaltiesPageProps {
  onNavigate: (view: AppView) => void;
}

type BreakdownTab = 'daily' | 'monthly' | 'yearly' | 'platform' | 'song';

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function PaymentsRoyaltiesPage({ onNavigate }: PaymentsRoyaltiesPageProps) {
  const { token, user, refreshProfile } = useAuth();
  const [balance, setBalance] = useState<ArtistBalanceSummary>({
    verifiedEarnings: 0,
    totalPaidOut: 0,
    pendingPayouts: 0,
    availableBalance: 0,
  });
  const [entries, setEntries] = useState<RoyaltyEntry[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeFilter, setStoreFilter] = useState<string>('All');
  const [breakdownTab, setBreakdownTab] = useState<BreakdownTab>('monthly');

  const [payoutMethod, setPayoutMethod] = useState(user?.payout_method || 'UPI');
  const [payoutDetails, setPayoutDetails] = useState(user?.payout_details || '');
  const [savingSettings, setSavingSettings] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [requestingPayout, setRequestingPayout] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<{
        balance: ArtistBalanceSummary;
        entries: RoyaltyEntry[];
        payouts: PayoutRequest[];
      }>('/api/artist/royalties', { token });
      setBalance(res.balance);
      setEntries(res.entries);
      setPayouts(res.payouts);
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load royalty ledger.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const filteredEntries = useMemo(() => {
    if (storeFilter === 'All') return entries;
    return entries.filter((e) => e.store_name === storeFilter);
  }, [entries, storeFilter]);

  const breakdownRows = useMemo(() => {
    const map = new Map<string, { label: string; streams: number; amount: number; count: number }>();
    for (const e of entries) {
      const dateStr = e.entry_date && /^\d{4}-\d{2}-\d{2}/.test(e.entry_date)
        ? e.entry_date.slice(0, 10)
        : e.created_at.slice(0, 10);
      let key = '';
      let label = '';
      if (breakdownTab === 'daily') {
        key = dateStr;
        label = formatDateDDMMYYYY(dateStr);
      } else if (breakdownTab === 'monthly') {
        key = e.period || dateStr.slice(0, 7);
        label = key;
      } else if (breakdownTab === 'yearly') {
        key = (e.period || dateStr).slice(0, 4);
        label = key;
      } else if (breakdownTab === 'platform') {
        key = e.store_name;
        label = e.store_name;
      } else {
        key = e.release_title || 'General Catalog Settlement';
        label = key;
      }
      const prev = map.get(key) || { label, streams: 0, amount: 0, count: 0 };
      prev.streams += Number(e.streams || 0);
      prev.amount += Number(e.amount_inr || 0);
      prev.count += 1;
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [entries, breakdownTab]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (payoutDetails.trim().length < 4) {
      setFeedback({ type: 'error', text: 'Please enter a valid UPI ID, Bank Account + IFSC, or PayPal email.' });
      return;
    }
    setFeedback(null);
    setSavingSettings(true);
    try {
      await apiFetch('/api/artist/profile', {
        method: 'PATCH',
        token,
        body: { payoutMethod, payoutDetails },
      });
      await refreshProfile();
      setFeedback({ type: 'success', text: 'Payout destination saved to your artist account.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not save payout settings.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFeedback(null);
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount < 500) {
      setFeedback({ type: 'error', text: 'Minimum withdrawal threshold is ₹500.00.' });
      return;
    }
    if (amount > balance.availableBalance) {
      setFeedback({
        type: 'error',
        text: `Requested withdrawal exceeds your verified available balance (${formatINR(balance.availableBalance)}).`,
      });
      return;
    }
    if (!payoutDetails.trim() || payoutDetails.trim().length < 4) {
      setFeedback({ type: 'error', text: 'Save a valid Payout Destination before requesting withdrawal.' });
      return;
    }

    setRequestingPayout(true);
    try {
      const res = await apiFetch<{ payout: PayoutRequest; balance: ArtistBalanceSummary }>('/api/artist/payouts', {
        method: 'POST',
        token,
        body: {
          amountInr: amount,
          paymentMethod: payoutMethod,
          accountSummary: payoutDetails,
        },
      });
      setPayouts((prev) => [res.payout, ...prev]);
      setBalance(res.balance);
      setWithdrawAmount('');
      setFeedback({ type: 'success', text: 'Payout request submitted to Palamu Entertainment Industry accounting.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Could not submit payout request.' });
    } finally {
      setRequestingPayout(false);
    }
  };

  return (
    <DashboardLayout currentView="payments" onNavigate={onNavigate} title="Payments & Royalties">
      {feedback && (
        <div
          className={`mb-6 p-4 rounded-lg border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Balance KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-5 rounded-xl border border-zinc-800 bg-[#111114]">
          <p className="text-xs text-zinc-400 mb-2">Available Balance</p>
          <p className="font-mono text-2xl font-semibold text-[#E5C158] tabular-nums">
            {loading ? '—' : formatINR(balance.availableBalance)}
          </p>
        </div>
        <div className="p-5 rounded-xl border border-zinc-800 bg-[#111114]">
          <p className="text-xs text-zinc-400 mb-2">Verified Lifetime Earnings</p>
          <p className="font-mono text-2xl font-semibold text-zinc-100 tabular-nums">
            {loading ? '—' : formatINR(balance.verifiedEarnings)}
          </p>
        </div>
        <div className="p-5 rounded-xl border border-zinc-800 bg-[#111114]">
          <p className="text-xs text-zinc-400 mb-2">Pending Withdrawals</p>
          <p className="font-mono text-2xl font-semibold text-zinc-100 tabular-nums">
            {loading ? '—' : formatINR(balance.pendingPayouts)}
          </p>
        </div>
        <div className="p-5 rounded-xl border border-zinc-800 bg-[#111114]">
          <p className="text-xs text-zinc-400 mb-2">Total Paid Out</p>
          <p className="font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
            {loading ? '—' : formatINR(balance.totalPaidOut)}
          </p>
        </div>
      </div>

      {/* Payout Destination + Request Withdrawal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        <form
          onSubmit={handleSaveSettings}
          className="lg:col-span-6 p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-zinc-100">Payout Destination</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="pay-method">
                Preferred Method
              </label>
              <select
                id="pay-method"
                value={payoutMethod}
                onChange={(e) => setPayoutMethod(e.target.value)}
                className="w-full px-3 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              >
                <option value="UPI">UPI ID</option>
                <option value="Bank Transfer (IMPS/NEFT)">Bank Transfer (IMPS/NEFT)</option>
                <option value="PayPal">PayPal (International)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="pay-details">
                UPI ID / Bank Account &amp; IFSC
              </label>
              <input
                id="pay-details"
                type="text"
                required
                value={payoutDetails}
                onChange={(e) => setPayoutDetails(e.target.value)}
                placeholder="e.g. artist@upi or A/C + IFSC"
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingSettings}
            className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-md text-xs font-semibold bg-zinc-900 border border-zinc-700 hover:border-[#D4AF37] text-zinc-100 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-[#D4AF37]" aria-hidden="true" />
            <span>{savingSettings ? 'Saving...' : 'Save Payout Method'}</span>
          </button>
        </form>

        <form
          onSubmit={handleRequestPayout}
          className="lg:col-span-6 p-6 rounded-xl border border-zinc-800 bg-[#111114] space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-zinc-100">Request Withdrawal</h2>
            <span className="text-xs text-zinc-400">Minimum ₹500.00</span>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5" htmlFor="withdraw-amt">
              Amount (INR)
            </label>
            <input
              id="withdraw-amt"
              type="number"
              min={500}
              step="0.01"
              required
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="500.00"
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-md bg-[#09090B] border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
          <button
            type="submit"
            disabled={requestingPayout || balance.availableBalance < 500}
            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-md text-xs sm:text-sm font-semibold bg-[#D4AF37] text-[#09090B] hover:bg-[#E5C158] disabled:opacity-50 cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            <span>{requestingPayout ? 'Submitting...' : 'Request Payout'}</span>
          </button>
          {balance.availableBalance < 500 && (
            <p className="text-xs text-zinc-500">
              Available verified balance must reach ₹500.00 before submitting a withdrawal request.
            </p>
          )}
        </form>
      </div>

      {/* Verified Earnings Breakdown (Daily, Monthly, Yearly, Platform-wise, Song-wise) */}
      <div className="rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#E5C158]" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-zinc-100">Verified Earnings Breakdown</h2>
          </div>
          <div className="flex flex-wrap gap-1 p-1 bg-[#09090B] border border-zinc-800 rounded-lg">
            {[
              { id: 'daily' as const, label: 'Daily' },
              { id: 'monthly' as const, label: 'Monthly' },
              { id: 'yearly' as const, label: 'Yearly' },
              { id: 'platform' as const, label: 'Platform-wise' },
              { id: 'song' as const, label: 'Song-wise' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setBreakdownTab(item.id)}
                className={`px-3 py-1.5 min-h-[34px] rounded text-xs font-medium transition-colors cursor-pointer ${
                  breakdownTab === item.id
                    ? 'bg-[#D4AF37] text-[#09090B] font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {breakdownRows.length === 0 ? (
          <div className="p-6 text-xs text-zinc-400">
            No verified royalty statements posted yet. Daily, monthly, yearly, platform-wise, and song-wise totals
            populate automatically from real store reports.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
                  <th className="py-3 px-6 font-medium">
                    {breakdownTab === 'daily'
                      ? 'Statement Date'
                      : breakdownTab === 'monthly'
                        ? 'Month / Period'
                        : breakdownTab === 'yearly'
                          ? 'Year'
                          : breakdownTab === 'platform'
                            ? 'Music Platform'
                            : 'Song / Release'}
                  </th>
                  <th className="py-3 px-4 font-medium text-right">Statements</th>
                  <th className="py-3 px-4 font-medium text-right">Verified Streams</th>
                  <th className="py-3 px-6 font-medium text-right">Verified Earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {breakdownRows.map((row) => (
                  <tr key={row.label} className="hover:bg-zinc-900/40">
                    <td className="py-3 px-6 font-medium text-zinc-100">{row.label}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-400">{row.count}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-300">
                      {row.streams.toLocaleString()}
                    </td>
                    <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-emerald-400">
                      {formatINR(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Royalty Statements Table */}
      <div className="rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-zinc-100">Verified Royalty Ledger</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Filter royalties by store"
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="px-3 py-1.5 min-h-[36px] rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-200"
            >
              <option value="All">All Stores ({entries.length})</option>
              {SUPPORTED_STORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {filteredEntries.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    'angad-royalty-ledger.csv',
                    ['Period', 'Store', 'Release', 'Streams', 'Status', 'Amount (INR)', 'Reference Note'],
                    filteredEntries.map((e) => [
                      e.period,
                      e.store_name,
                      e.release_title || 'Catalog Settlement',
                      e.streams,
                      e.status,
                      e.amount_inr,
                      e.reference_note,
                    ])
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-md text-xs font-medium bg-[#09090B] border border-zinc-800 hover:border-[#D4AF37] text-zinc-200 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Download CSV</span>
              </button>
            )}
          </div>
        </div>
        {filteredEntries.length === 0 ? (
          <div className="p-10 text-center">
            <Wallet className="w-8 h-8 text-zinc-600 mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm font-medium text-zinc-200 mb-1">No verified royalty entries yet</p>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Palamu Entertainment Industry posts verified store royalty statements here once official streaming payouts
              clear. No synthetic or estimated earnings are displayed.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
                  <th className="py-3 px-6 font-medium">Period</th>
                  <th className="py-3 px-4 font-medium">Store</th>
                  <th className="py-3 px-4 font-medium">Release</th>
                  <th className="py-3 px-4 font-medium text-right">Streams</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-6 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-zinc-900/40">
                    <td className="py-3 px-6 font-mono text-zinc-300">{entry.period}</td>
                    <td className="py-3 px-4 text-zinc-100 font-medium">{entry.store_name}</td>
                    <td className="py-3 px-4 text-zinc-400">{entry.release_title || 'Catalog Settlement'}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-300">
                      {entry.streams.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={entry.status} />
                    </td>
                    <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-emerald-400">
                      {formatINR(entry.amount_inr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payout Requests Table */}
      <div className="rounded-xl border border-zinc-800 bg-[#111114] overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-zinc-100">Payment History</h2>
          {payouts.length > 0 && (
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  'angad-payment-history.csv',
                  ['Requested Date', 'Method', 'Destination', 'UTR / Reference', 'Status', 'Amount (INR)'],
                  payouts.map((p) => [
                    p.created_at.slice(0, 10),
                    p.payment_method,
                    p.account_summary,
                    p.admin_reference || '',
                    p.status,
                    p.amount_inr,
                  ])
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-md text-xs font-medium bg-[#09090B] border border-zinc-800 hover:border-[#D4AF37] text-zinc-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Download CSV</span>
            </button>
          )}
        </div>
        {payouts.length === 0 ? (
          <div className="p-10 text-center">
            <Banknote className="w-8 h-8 text-zinc-600 mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm font-medium text-zinc-200 mb-1">No payout requests yet</p>
            <p className="text-xs text-zinc-400">Your withdrawal requests and UTR references will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
                  <th className="py-3 px-6 font-medium">Requested</th>
                  <th className="py-3 px-4 font-medium">Method</th>
                  <th className="py-3 px-4 font-medium">Destination</th>
                  <th className="py-3 px-4 font-medium">Reference / UTR</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-6 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-900/40">
                    <td className="py-3 px-6 font-mono text-xs text-zinc-400">{p.created_at.slice(0, 10)}</td>
                    <td className="py-3 px-4 text-zinc-200">{p.payment_method}</td>
                    <td className="py-3 px-4 text-zinc-400">{p.account_summary}</td>
                    <td className="py-3 px-4 font-mono text-xs text-zinc-300">{p.admin_reference || '—'}</td>
                    <td className="py-3 px-4">
                      <StatusText status={p.status} />
                    </td>
                    <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-zinc-100">
                      {formatINR(p.amount_inr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
