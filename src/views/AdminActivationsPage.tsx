import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type { ActivationPayment, PlatformEarningsSummary } from '../types';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Eye,
  X,
  AlertTriangle,
  ArrowLeft,
  ShieldCheck,
  Check,
  Copy,
  Sparkles,
  TrendingUp,
  Building,
  UserCheck,
  DollarSign,
  Layers,
  ArrowDownLeft,
  Download,
} from 'lucide-react';

export const AdminActivationsPage: React.FC = () => {
  const { navigate, confirmActivation, releaseActivation, rejectActivation, fetchPlatformEarnings, verifyPaystackPayment } = useAuth();

  const [activeTab, setActiveTab] = useState<'activations' | 'earnings'>('activations');
  const [activations, setActivations] = useState<ActivationPayment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [earningsSummary, setEarningsSummary] = useState<PlatformEarningsSummary | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [selectedProof, setSelectedProof] = useState<string | null>(null);
  const [releaseModalItem, setReleaseModalItem] = useState<ActivationPayment | null>(null);
  const [rejectModalItem, setRejectModalItem] = useState<ActivationPayment | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('Invalid transaction or payment not confirmed');
  const [customReason, setCustomReason] = useState<string>('');

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const copyToClipboard = (text: string, key: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  // Export CSV Function
  const exportTransactionsCSV = () => {
    if (!activations || activations.length === 0) {
      showToast('No records to export', 'error');
      return;
    }

    const headers = ['Reference', 'Email', 'Amount (NGN)', 'Fee (30%)', 'Net Amount', 'Status', 'Gateway', 'Type', 'Date'];
    const rows = activations.map((item: any) => {
      const amt = Number(item.amount || 0);
      const fee = Number(item.fee_amount) > 0 ? Number(item.fee_amount) : Math.round(amt * 0.3 * 100) / 100;
      const net = Number(item.net_amount) > 0 ? Number(item.net_amount) : Math.round((amt - fee) * 100) / 100;
      return [
        `"${item.reference || ''}"`,
        `"${item.email || ''}"`,
        amt,
        fee,
        net,
        `"${item.status || ''}"`,
        `"${item.payment_gateway || item.method || 'Paystack'}"`,
        `"${item.transaction_type || (item.role === 'employer' ? 'deposit' : 'activation')}"`,
        `"${new Date(item.created_at || item.createdAt || Date.now()).toISOString()}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `cdsure_paystack_transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported CSV successfully!');
  };

  // Verify directly on Paystack
  const handleVerifyPaystackOnline = async (item: ActivationPayment) => {
    if (!item.reference) return;
    setActionLoadingId(item.id);
    try {
      const res = await verifyPaystackPayment(item.reference);
      if (res.success) {
        showToast(`Verified on Paystack! Status: ${res.status || 'success'}. Account updated.`);
        await fetchActivations();
        await loadEarnings();
      } else {
        showToast(res.error || 'Paystack verification was not successful yet', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error verifying with Paystack', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const fetchActivations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/admin/activations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setActivations(data.activations || []);
      }
    } catch (err: any) {
      console.warn('Failed to load admin activations:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, roleFilter, searchQuery]);

  const loadEarnings = useCallback(async () => {
    try {
      const data = await fetchPlatformEarnings();
      if (data) {
        setEarningsSummary(data);
      }
    } catch (_e) {}
  }, [fetchPlatformEarnings]);

  useEffect(() => {
    fetchActivations();
    loadEarnings();
  }, [fetchActivations, loadEarnings]);

  // Button 1: CONFIRM PAYMENT
  const handleConfirm = async (item: ActivationPayment) => {
    setActionLoadingId(item.id);
    try {
      const res = await confirmActivation(item.id, item.user_id || item.userId);
      if (res.success) {
        showToast(`Payment confirmed for ${item.email}. Status is now Confirmed (Awaiting Release).`);
        await fetchActivations();
      } else {
        showToast(res.error || 'Confirmation failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error executing confirmation', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Button 2: DEVELOPER RELEASE (THE MAIN FIX)
  const handleExecuteRelease = async () => {
    if (!releaseModalItem) return;
    setActionLoadingId(releaseModalItem.id);
    try {
      const res = await releaseActivation(releaseModalItem.id, releaseModalItem.user_id || releaseModalItem.userId);
      if (res.success) {
        showToast(
          `Released successfully! ₦${Number(res.fee_amount || 0).toLocaleString()} (30%) retained, ₦${Number(res.net_amount || 0).toLocaleString()} net credited.`
        );
        setReleaseModalItem(null);
        await fetchActivations();
        await loadEarnings();
      } else {
        showToast(res.error || 'Release failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error executing release', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Button 3: REJECT
  const handleExecuteReject = async () => {
    if (!rejectModalItem) return;
    const finalReason = customReason.trim() ? customReason.trim() : rejectReason;
    setActionLoadingId(rejectModalItem.id);
    try {
      const res = await rejectActivation(rejectModalItem.id, rejectModalItem.user_id || rejectModalItem.userId, finalReason);
      if (res.success) {
        showToast(`Rejected payment for ${rejectModalItem.email}`);
        setRejectModalItem(null);
        setCustomReason('');
        await fetchActivations();
      } else {
        showToast(res.error || 'Rejection failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error executing rejection', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Counts
  const totalCount = activations.length;
  const pendingCount = activations.filter((a) => a.status === 'pending').length;
  const confirmedCount = activations.filter((a) => a.status === 'confirmed').length;
  const releasedCount = activations.filter((a) => a.status === 'released' || a.status === 'approved').length;
  const rejectedCount = activations.filter((a) => a.status === 'rejected').length;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800">
      {/* Top Navbar */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/employer-dashboard')}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base text-[#0f172a] tracking-tight">CDSure Tasks</span>
              <span className="px-2 py-0.5 rounded-md bg-[#7C3AED]/10 text-[#7C3AED] text-[10px] font-bold uppercase tracking-wider">
                Developer Admin
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Paystack Transaction & Activation Portal (30% Platform Retention)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportTransactionsCSV}
            className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#7C3AED] border border-purple-200 transition flex items-center gap-1.5 text-xs font-bold"
            title="Export CSV"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => {
              fetchActivations();
              loadEarnings();
            }}
            disabled={loading}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition flex items-center gap-1.5 text-xs font-semibold"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('activations')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'activations'
                ? 'border-[#7C3AED] text-[#7C3AED]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Activation Payments & Releases</span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('earnings')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'earnings'
                ? 'border-[#7C3AED] text-[#7C3AED]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Platform 30% Earnings</span>
            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black">
              ₦{Number(earningsSummary?.totalCombined || 0).toLocaleString()}
            </span>
          </button>
        </div>

        {/* =========================================================================
            TAB 1: ACTIVATION PAYMENTS & DEVELOPER RELEASE
        ========================================================================== */}
        {activeTab === 'activations' && (
          <div className="space-y-6">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <p className="text-xs text-slate-500 font-semibold">Total Requests</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{totalCount}</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs bg-amber-50/30">
                <p className="text-xs text-amber-700 font-semibold">Pending Verification</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-2xl font-black text-amber-900">{pendingCount}</p>
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-blue-200 shadow-xs bg-blue-50/30">
                <p className="text-xs text-blue-700 font-semibold">Confirmed (Wait Release)</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-2xl font-black text-blue-900">{confirmedCount}</p>
                  <ShieldCheck className="w-5 h-5 text-blue-500" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs bg-emerald-50/30">
                <p className="text-xs text-emerald-700 font-semibold">Released & Active</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-2xl font-black text-emerald-900">{releasedCount}</p>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-red-200 shadow-xs bg-red-50/30">
                <p className="text-xs text-red-700 font-semibold">Rejected</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-2xl font-black text-red-900">{rejectedCount}</p>
                  <XCircle className="w-5 h-5 text-red-500" />
                </div>
              </div>
            </div>

            {/* Paystack Official Integration Banner for Developer */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-bold">
                  <DollarSign className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-purple-200 font-medium">Payment Infrastructure:</p>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      Paystack Online
                    </span>
                  </div>
                  <p className="text-sm font-bold">
                    Automated Verification • Webhook Support • Direct Checkout
                  </p>
                </div>
              </div>
              <div className="text-xs text-purple-200 bg-white/10 px-3 py-1.5 rounded-xl">
                <span>Formula: </span>
                <span className="font-mono text-emerald-300 font-bold">Fee = Amount * 0.30</span> •{' '}
                <span className="font-mono text-white font-bold">Net = Amount - Fee</span>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by Email, Reference, Sender Name, Phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#7C3AED]"
                />
              </div>

              {/* Status and Role Filters */}
              <div className="flex items-center gap-2">
                {/* Role filter */}
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#7C3AED]"
                >
                  <option value="all">All Roles</option>
                  <option value="employer">Employer Mode</option>
                  <option value="earner">Earner Mode</option>
                </select>

                {/* Status filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#7C3AED]"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="released">Released</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            {/* Requests Table / Cards */}
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <div className="w-8 h-8 border-3 border-[#7C3AED] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-slate-500 font-semibold">Loading Paystack payments...</p>
              </div>
            ) : activations.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
                <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">No payment records found</p>
                <p className="text-xs text-slate-400 mt-1">Try resetting the status or role filters</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activations.map((item) => {
                  const amt = Number(item.amount || 0);
                  const fee = Number(item.fee_amount) > 0 ? Number(item.fee_amount) : Math.round(amt * 0.3 * 100) / 100;
                  const net = Number(item.net_amount) > 0 ? Number(item.net_amount) : Math.round((amt - fee) * 100) / 100;
                  const isPending = item.status === 'pending';
                  const isConfirmed = item.status === 'confirmed';
                  const isReleased = item.status === 'released' || item.status === 'approved';
                  const isRejected = item.status === 'rejected';

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs transition hover:shadow-sm space-y-4"
                    >
                      {/* Top Row: User details & Status Badge */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-50 text-[#7C3AED] font-black text-sm flex items-center justify-center shrink-0 border border-purple-100">
                            {(item.userName || item.user_name || item.email || 'U')[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-extrabold text-sm text-slate-900">
                                {item.userName || item.user_name || 'Member'}
                              </h3>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-black uppercase rounded-full tracking-wider ${
                                  item.role === 'employer'
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'bg-purple-100 text-purple-800 border border-purple-200'
                                }`}
                              >
                                {item.role === 'employer' ? 'Employer' : 'Earner'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-mono">{item.email}</p>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-2">
                          {isPending && (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5 animate-pulse">
                              <Clock className="w-3.5 h-3.5" />
                              Pending Verification
                            </span>
                          )}
                          {isConfirmed && (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300 flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Confirmed (Wait Release)
                            </span>
                          )}
                          {isReleased && (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Released & Active
                            </span>
                          )}
                          {isRejected && (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-900 border border-red-300 flex items-center gap-1.5">
                              <XCircle className="w-3.5 h-3.5" />
                              Rejected
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle Grid: Payment Breakdown, Gateway Info, Proof */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                        {/* 1. Amounts & 30% Fee Box */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              Payment Summary
                            </p>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                              {(item as any).payment_gateway || 'Paystack'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Gross Paid:</span>
                            <span className="font-extrabold text-slate-900">₦{amt.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-purple-700">
                            <span>CDSure 30% Fee:</span>
                            <span className="font-bold">- ₦{fee.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-emerald-700 font-black border-t border-slate-200 pt-1">
                            <span>Net Credited:</span>
                            <span>₦{net.toLocaleString()}</span>
                          </div>
                        </div>

                        {/* 2. Sender Details & Reference */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Transaction Info
                          </p>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Type:</span>
                            <span className="font-semibold text-slate-800 capitalize">
                              {(item as any).transaction_type?.replace('_', ' ') || (item.role === 'employer' ? 'Deposit' : 'Activation')}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Customer:</span>
                            <span className="font-mono font-semibold text-slate-800 truncate max-w-[130px]">{item.email}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                            <span className="text-slate-600">Reference:</span>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[11px] font-bold text-purple-700 max-w-[120px] truncate">
                                {item.reference}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(item.reference, item.id)}
                                className="p-1 hover:bg-slate-200 rounded text-slate-500"
                                title="Copy Reference"
                              >
                                {copiedKey === item.id ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 3. Proof Preview or Gateway Record */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              Gateway Verification
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {new Date(item.created_at || item.createdAt).toLocaleString()}
                            </p>
                            {(item.proofImageUrl || item.proof_image) ? (
                              <button
                                type="button"
                                onClick={() => setSelectedProof(item.proofImageUrl || item.proof_image || null)}
                                className="text-xs font-bold text-[#7C3AED] hover:underline flex items-center gap-1 pt-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Enlarge Proof</span>
                              </button>
                            ) : (
                              <span className="inline-block text-[11px] text-emerald-600 font-semibold pt-1">
                                Paystack Direct API
                              </span>
                            )}
                          </div>

                          {(item.proofImageUrl || item.proof_image) ? (
                            <img
                              src={item.proofImageUrl || item.proof_image}
                              alt="Proof thumbnail"
                              onClick={() => setSelectedProof(item.proofImageUrl || item.proof_image || null)}
                              className="w-14 h-14 rounded-lg object-cover border border-slate-200 cursor-pointer hover:opacity-80 transition shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-purple-100 text-[#7C3AED] flex items-center justify-center font-black text-xs shrink-0">
                              PAY
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Admin Note / Feedback if any */}
                      {(item.adminNote || item.admin_note) && (
                        <div className="p-2.5 rounded-xl bg-slate-100 text-xs text-slate-700 border border-slate-200">
                          <span className="font-semibold text-slate-800">Admin Note: </span>
                          <span>{item.adminNote || item.admin_note}</span>
                        </div>
                      )}

                      {/* Action Buttons Row: Paystack Verify, Developer Release, Reject */}
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        {/* 1-Click Paystack Verification */}
                        {isPending && item.reference && (
                          <button
                            type="button"
                            disabled={actionLoadingId === item.id}
                            onClick={() => handleVerifyPaystackOnline(item)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition disabled:opacity-50"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>Verify via Paystack API</span>
                          </button>
                        )}

                        {/* Developer Release (Retains 30% Fee) */}
                        {!isReleased && (
                          <button
                            type="button"
                            disabled={actionLoadingId === item.id}
                            onClick={() => setReleaseModalItem(item)}
                            className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                          >
                            <Sparkles className="w-4 h-4 text-amber-300" />
                            <span>Developer Release & Unlock (30% Fee)</span>
                          </button>
                        )}

                        {/* Reject */}
                        {!isReleased && (
                          <button
                            type="button"
                            disabled={actionLoadingId === item.id}
                            onClick={() => setRejectModalItem(item)}
                            className="px-3.5 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>Reject</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 2: PLATFORM 30% EARNINGS OVERVIEW
        ========================================================================== */}
        {activeTab === 'earnings' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-purple-900 to-indigo-950 p-6 rounded-3xl text-white shadow-md">
                <p className="text-xs font-semibold text-purple-200 uppercase tracking-wider">Total Combined 30% Charge</p>
                <p className="text-3xl font-black mt-2 text-amber-300">
                  ₦{Number(earningsSummary?.totalCombined || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-purple-300 mt-1">Platform earnings from Employers & Earners</p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Employer 30% Fees</p>
                <p className="text-2xl font-black mt-2 text-blue-700">
                  ₦{Number(earningsSummary?.totalEmployer || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">From wallet deposits, task creation & payouts</p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Earner 30% Fees</p>
                <p className="text-2xl font-black mt-2 text-purple-700">
                  ₦{Number(earningsSummary?.totalEarner || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">From activations, deposits & bank withdrawals</p>
              </div>
            </div>

            {/* Recent Platform Earnings Table */}
            <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-extrabold text-sm text-slate-900">Recent 30% Fee Deductions Log</h3>
                <button
                  type="button"
                  onClick={loadEarnings}
                  className="text-xs font-semibold text-[#7C3AED] hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Log</span>
                </button>
              </div>

              {!earningsSummary?.recentEarnings || earningsSummary.recentEarnings.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No platform earnings recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px]">
                        <th className="pb-2.5 font-bold">Transaction / Ref</th>
                        <th className="pb-2.5 font-bold">User / Role</th>
                        <th className="pb-2.5 font-bold">Source Description</th>
                        <th className="pb-2.5 font-bold">Gross Amount</th>
                        <th className="pb-2.5 font-bold text-purple-700">30% CDSure Fee</th>
                        <th className="pb-2.5 font-bold">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {earningsSummary.recentEarnings.map((earn) => (
                        <tr key={earn.id} className="hover:bg-slate-50/60 transition">
                          <td className="py-3 font-mono font-bold text-slate-700">{earn.transactionId}</td>
                          <td className="py-3">
                            <span className="font-semibold text-slate-800 block">{earn.userName || earn.userEmail || earn.userId}</span>
                            <span
                              className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                earn.role === 'employer' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {earn.role}
                            </span>
                          </td>
                          <td className="py-3 text-slate-600">{earn.source}</td>
                          <td className="py-3 font-semibold text-slate-900">
                            ₦{Number(earn.grossAmount || 0).toLocaleString()}
                          </td>
                          <td className="py-3 font-black text-purple-700">
                            + ₦{Number(earn.feeAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 text-slate-400 text-[11px]">
                            {new Date(earn.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* =========================================================================
          MODAL 1: DEVELOPER RELEASE CONFIRMATION POPUP (THE MAIN FIX)
      ========================================================================== */}
      {releaseModalItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 text-[#7C3AED] flex items-center justify-center mx-auto shadow-sm">
              <Sparkles className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-black text-slate-900">Developer Release & Activation</h3>
              <p className="text-xs text-slate-500 mt-1">
                Release funds for <strong>{releaseModalItem.email}</strong> and deduct the 30% CDSure platform charge.
              </p>
            </div>

            {/* 30% Fee Breakdown Card */}
            {(() => {
              const amt = Number(releaseModalItem.amount || 0);
              const fee = Math.round(amt * 0.3 * 100) / 100;
              const net = Math.round((amt - fee) * 100) / 100;
              return (
                <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-4 text-xs space-y-2">
                  <div className="flex justify-between text-slate-600">
                    <span>Payment Gross:</span>
                    <span className="font-extrabold text-slate-900">₦{amt.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-purple-700 font-bold">
                    <span>CDSure Charge (30%):</span>
                    <span>- ₦{fee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-black border-t border-purple-200 pt-1.5 text-sm">
                    <span>Net Credited to Wallet / Active:</span>
                    <span>₦{net.toLocaleString()}</span>
                  </div>
                </div>
              );
            })()}

            <p className="text-[11px] text-slate-500 text-center">
              CDSure will deduct 30% charge and activate user account immediately. Continue?
            </p>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setReleaseModalItem(null)}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoadingId === releaseModalItem.id}
                onClick={handleExecuteRelease}
                className="flex-1 py-2.5 px-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition disabled:opacity-50"
              >
                {actionLoadingId === releaseModalItem.id ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm & Release</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: REJECTION MODAL
      ========================================================================== */}
      {rejectModalItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-red-600 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                <span>Reject Payment Proof</span>
              </h3>
              <button
                onClick={() => setRejectModalItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              User: <strong>{rejectModalItem.email}</strong> • Reference:{' '}
              <span className="font-mono">{rejectModalItem.reference}</span>
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Rejection Reason</label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-400"
              >
                <option value="Payment not confirmed on Paystack / Unmatched reference">
                  Payment not confirmed on Paystack / Unmatched reference
                </option>
                <option value="Amount sent is less than required activation/funding fee">
                  Amount sent is less than required fee
                </option>
                <option value="Illegible or blurry transfer screenshot">
                  Illegible or blurry transfer screenshot
                </option>
                <option value="Invalid transaction reference / Session ID">
                  Invalid transaction reference / Session ID
                </option>
                <option value="custom">Other (write custom note below)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Feedback Note to User</label>
              <textarea
                rows={2}
                placeholder="Optional explanation shown to user..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-400"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalItem(null)}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoadingId === rejectModalItem.id}
                onClick={handleExecuteReject}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                {actionLoadingId === rejectModalItem.id ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Reject Payment</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: FULL SCREENSHOT ENLARGE VIEWER
      ========================================================================== */}
      {selectedProof && (
        <div
          onClick={() => setSelectedProof(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-2xl w-full p-4 relative shadow-2xl flex flex-col items-center"
          >
            <button
              onClick={() => setSelectedProof(null)}
              className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h4 className="text-sm font-bold text-slate-800 mb-3">Payment Proof Screenshot</h4>
            <div className="max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
              <img src={selectedProof} alt="Enlarged Proof" className="max-w-full max-h-[70vh] object-contain" />
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold text-white z-50 animate-in slide-in-from-bottom flex items-center gap-2 ${
            toastMsg.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {toastMsg.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          <span>{toastMsg.text}</span>
        </div>
      )}
    </div>
  );
};
