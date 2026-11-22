import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, ADMIN_EMAIL } from '../context/AuthContext';
import type { ActivationFeeSettings } from '../types';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  X,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  LogOut,
  Check,
  AlertCircle,
  Settings,
  Receipt,
  RotateCcw,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  requested_role: string;
  payment_status: 'paid' | 'unpaid';
  activation_reference?: string | null;
  activation_amount?: number;
  expected_fee?: number;
  activation_paid_at?: string | null;
  status: string;
  balance: number;
  created_at: string;
}

interface DepositRecord {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  email?: string;
  amount: number;
  proof_url?: string;
  payment_method?: string;
  reference?: string;
  status: string;
  admin_note?: string | null;
  created_at: string;
}

interface WithdrawalRecord {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  email?: string;
  current_user_balance?: number;
  amount: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: string;
  admin_note?: string | null;
  created_at: string;
}

interface CloudinaryImageRow {
  id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  category: string;
  folder: string;
  public_id: string;
  secure_url: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  status: 'pending' | 'approved' | 'rejected' | string;
  related_id?: string | null;
  review_note?: string | null;
  created_at: string;
  reviewed_at?: string | null;
}

interface AdminTaskSubmissionRow {
  id: string;
  task_id: string;
  task_title: string;
  employer_id: string;
  earner_id: string;
  earner_name: string;
  earner_email: string;
  proof_url?: string | null;
  proof_link?: string | null;
  proof_text?: string | null;
  reward: number;
  status: string;
  created_at: string;
}

export const AdminActivationsPage: React.FC = () => {
  const { isAdmin, firebaseUser, authFetch, fetchActivationFees, navigate, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<'activations' | 'deposits' | 'withdrawals' | 'media'>('activations');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [cloudinaryImages, setCloudinaryImages] = useState<CloudinaryImageRow[]>([]);
  const [taskSubmissions, setTaskSubmissions] = useState<AdminTaskSubmissionRow[]>([]);
  const [mediaCategoryFilter, setMediaCategoryFilter] = useState<string>('all');
  const [mediaStatusFilter, setMediaStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Activation Fee Settings Form State
  const [earnerFeeInput, setEarnerFeeInput] = useState<string>('2000');
  const [employerFeeInput, setEmployerFeeInput] = useState<string>('5000');
  const [bonusEarnerInput, setBonusEarnerInput] = useState<string>('0');
  const [bonusEmployerInput, setBonusEmployerInput] = useState<string>('0');
  const [savingFees, setSavingFees] = useState<boolean>(false);

  // Filters
  const [activationFilter, setActivationFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [showAllQueueHistory, setShowAllQueueHistory] = useState<boolean>(false);

  // Modals
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [receiptUser, setReceiptUser] = useState<AdminUserRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{
    kind: 'deposit' | 'withdrawal';
    id: string;
    label: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 4500);
  };

  const loadOverview = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [res, mediaRes] = await Promise.all([
        authFetch('/api/admin/overview'),
        authFetch('/api/cloudinary/images').catch(() => null),
      ]);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Failed to load admin overview.', 'error');
        return;
      }
      setUsers(data.users || []);
      setDeposits(data.deposits || []);
      setWithdrawals(data.withdrawals || []);
      if (data.fees) {
        const f = data.fees as ActivationFeeSettings;
        setEarnerFeeInput(String(f.earner_fee ?? 2000));
        setEmployerFeeInput(String(f.employer_fee ?? 5000));
        setBonusEarnerInput(String(f.activation_bonus_earner ?? 0));
        setBonusEmployerInput(String(f.activation_bonus_employer ?? 0));
      }

      if (mediaRes && mediaRes.ok) {
        const mediaData = await mediaRes.json().catch(() => ({}));
        if (mediaData?.success) {
          setCloudinaryImages(mediaData.images || []);
          setTaskSubmissions(mediaData.task_submissions || []);
        }
      }
    } catch (err: any) {
      showFeedback(err?.message || 'Unable to connect to admin service.', 'error');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, authFetch]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  if (!firebaseUser || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900">Access Denied</h1>
          <p className="text-xs text-slate-500">This portal is restricted to {ADMIN_EMAIL}.</p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full py-2.5 bg-[#7C3AED] text-white text-xs font-bold rounded-xl"
          >
            Return
          </button>
        </div>
      </div>
    );
  }

  const handleSaveFeeSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const earner_fee = Math.max(100, Number(earnerFeeInput) || 2000);
    const employer_fee = Math.max(100, Number(employerFeeInput) || 5000);
    const activation_bonus_earner = Math.max(0, Number(bonusEarnerInput) || 0);
    const activation_bonus_employer = Math.max(0, Number(bonusEmployerInput) || 0);

    setSavingFees(true);
    try {
      const res = await authFetch('/api/admin/settings/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          earner_fee,
          employer_fee,
          activation_bonus_earner,
          activation_bonus_employer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Could not save fee settings.', 'error');
        return;
      }
      await fetchActivationFees();
      await loadOverview();
      showFeedback('Activation fee settings updated across the platform.');
    } catch (err: any) {
      showFeedback(err?.message || 'Save failed.', 'error');
    } finally {
      setSavingFees(false);
    }
  };

  const handleMarkPaidManually = async (u: AdminUserRow) => {
    setBusyId(u.id);
    try {
      const res = await authFetch('/api/admin/activation/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Failed to mark user paid.', 'error');
        return;
      }
      showFeedback(data.message || `${u.name || u.email} activated.`);
      await loadOverview();
    } catch (err: any) {
      showFeedback(err?.message || 'Action failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRefundRevoke = async (u: AdminUserRow) => {
    setBusyId(u.id);
    try {
      const res = await authFetch('/api/admin/activation/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Failed to revoke activation.', 'error');
        return;
      }
      showFeedback(data.message || `${u.name || u.email} set back to unpaid.`);
      await loadOverview();
    } catch (err: any) {
      showFeedback(err?.message || 'Action failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDeposit = async (dep: DepositRecord) => {
    setBusyId(dep.id);
    try {
      const res = await authFetch('/api/admin/deposits/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depositId: dep.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Failed to confirm deposit.', 'error');
        return;
      }
      showFeedback(`Deposit of ₦${Number(dep.amount).toLocaleString()} confirmed and credited.`);
      await loadOverview();
    } catch (err: any) {
      showFeedback(err?.message || 'Confirm deposit request failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveWithdrawal = async (wd: WithdrawalRecord) => {
    setBusyId(wd.id);
    try {
      const res = await authFetch('/api/admin/withdrawals/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawalId: wd.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Failed to approve withdrawal.', 'error');
        return;
      }
      showFeedback(`Withdrawal of ₦${Number(wd.amount).toLocaleString()} marked Paid.`);
      await loadOverview();
    } catch (err: any) {
      showFeedback(err?.message || 'Withdrawal approval failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleExecuteReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    const reason = rejectReason.trim() || 'Not confirmed by Admin';

    try {
      const url =
        rejectTarget.kind === 'deposit'
          ? '/api/admin/deposits/reject'
          : '/api/admin/withdrawals/reject';
      const payload =
        rejectTarget.kind === 'deposit'
          ? { depositId: rejectTarget.id, reason }
          : { withdrawalId: rejectTarget.id, reason };

      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Rejection failed.', 'error');
        return;
      }
      showFeedback(`Rejected ${rejectTarget.label}.`);
      setRejectTarget(null);
      setRejectReason('');
      await loadOverview();
    } catch (err: any) {
      showFeedback(err?.message || 'Rejection request failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReviewCloudinaryMedia = async (
    img: CloudinaryImageRow,
    status: 'approved' | 'rejected'
  ) => {
    setBusyId(img.id);
    try {
      const res = await authFetch('/api/cloudinary/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: img.id,
          public_id: img.public_id,
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Could not update image status.', 'error');
        return;
      }
      showFeedback(`Image ${status}.`);
      await loadOverview();
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteCloudinaryMedia = async (img: CloudinaryImageRow) => {
    setBusyId(img.id);
    try {
      const res = await authFetch('/api/cloudinary/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_id: img.public_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Could not delete Cloudinary image.', 'error');
        return;
      }
      showFeedback(`Deleted ${img.public_id} from Cloudinary.`);
      await loadOverview();
    } finally {
      setBusyId(null);
    }
  };

  const handleReviewTaskSubmission = async (
    sub: AdminTaskSubmissionRow,
    decision: 'approved' | 'rejected'
  ) => {
    setBusyId(sub.id);
    try {
      const endpoint =
        decision === 'approved' ? '/api/submissions/approve' : '/api/submissions/reject';
      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: sub.id,
          reason: decision === 'rejected' ? 'Rejected during Admin media review' : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Could not update task submission.', 'error');
        return;
      }
      showFeedback(
        decision === 'approved'
          ? `Approved submission by ${sub.earner_name} (₦${Number(sub.reward).toLocaleString()} credited).`
          : `Rejected submission by ${sub.earner_name}.`
      );
      await loadOverview();
    } finally {
      setBusyId(null);
    }
  };

  const paidUsersCount = users.filter((u) => u.payment_status === 'paid').length;
  const unpaidUsersCount = users.filter((u) => u.payment_status !== 'paid').length;
  const pendingDepositsCount = deposits.filter((d) => d.status === 'Pending').length;
  const pendingWithdrawalsCount = withdrawals.filter((w) => w.status === 'Pending').length;
  const pendingMediaCount =
    cloudinaryImages.filter((i) => i.status === 'pending').length +
    taskSubmissions.filter((s) => s.status === 'pending').length;

  const visibleUsers = users.filter((u) => {
    if (activationFilter === 'paid') return u.payment_status === 'paid';
    if (activationFilter === 'unpaid') return u.payment_status !== 'paid';
    return true;
  });
  const visibleDeposits = showAllQueueHistory ? deposits : deposits.filter((d) => d.status === 'Pending');
  const visibleWithdrawals = showAllQueueHistory ? withdrawals : withdrawals.filter((w) => w.status === 'Pending');
  const visibleCloudinaryImages = cloudinaryImages.filter((img) => {
    if (mediaCategoryFilter !== 'all' && img.category !== mediaCategoryFilter) return false;
    if (mediaStatusFilter !== 'all' && img.status !== mediaStatusFilter) return false;
    return true;
  });

  const formatDate = (val?: string | null) => {
    if (!val) return '—';
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? val : d.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* Top Navbar */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/earner-dashboard')}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition"
            title="Switch to App View"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
                CDSure Admin Panel
              </span>
              <span className="px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-[#7C3AED] text-[10px] font-bold uppercase tracking-wider">
                Authorized
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-mono">{ADMIN_EMAIL}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadOverview}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={logout}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {feedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
              feedback.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{feedback.text}</span>
            </div>
            <button type="button" onClick={() => setFeedback(null)} className="p-0.5 opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ACTIVATION FEE SETTINGS PANEL */}
        <form
          onSubmit={handleSaveFeeSettings}
          className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 text-[#7C3AED] flex items-center justify-center">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">Activation Fee Settings (Paystack Live)</h2>
                <p className="text-[11px] text-slate-500">
                  Changes apply immediately on Role Selection & Paystack Activation checkout.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingFees}
              className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50 self-start sm:self-auto"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{savingFees ? 'Saving...' : 'Save Fee Settings'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Earner / Worker Activation Fee (₦)
              </label>
              <input
                type="number"
                min="100"
                step="100"
                value={earnerFeeInput}
                onChange={(e) => setEarnerFeeInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-extrabold tabular-nums text-slate-900 focus:outline-none focus:border-[#7C3AED]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Employer Activation Fee (₦)
              </label>
              <input
                type="number"
                min="100"
                step="100"
                value={employerFeeInput}
                onChange={(e) => setEmployerFeeInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-extrabold tabular-nums text-slate-900 focus:outline-none focus:border-[#7C3AED]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Earner Welcome Bonus (₦)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={bonusEarnerInput}
                onChange={(e) => setBonusEarnerInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold tabular-nums text-slate-900 focus:outline-none focus:border-[#7C3AED]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Employer Welcome Bonus (₦)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={bonusEmployerInput}
                onChange={(e) => setBonusEmployerInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold tabular-nums text-slate-900 focus:outline-none focus:border-[#7C3AED]"
              />
            </div>
          </div>
        </form>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('activations')}
            className={`text-left bg-white rounded-2xl border p-5 transition ${
              activeTab === 'activations'
                ? 'border-[#7C3AED] ring-1 ring-[#7C3AED]'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Paid Activations</span>
              <Users className="w-4 h-4 text-[#7C3AED]" />
            </div>
            <p className="text-2xl font-black text-slate-900 mt-1.5 tabular-nums">{paidUsersCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{unpaidUsersCount} unpaid accounts</p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('deposits')}
            className={`text-left bg-white rounded-2xl border p-5 transition ${
              activeTab === 'deposits'
                ? 'border-[#7C3AED] ring-1 ring-[#7C3AED]'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Pending Bank Deposits</span>
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-slate-900 mt-1.5 tabular-nums">{pendingDepositsCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{deposits.length} total deposits</p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('withdrawals')}
            className={`text-left bg-white rounded-2xl border p-5 transition ${
              activeTab === 'withdrawals'
                ? 'border-[#7C3AED] ring-1 ring-[#7C3AED]'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Pending Withdrawals</span>
              <ArrowUpRight className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-black text-slate-900 mt-1.5 tabular-nums">{pendingWithdrawalsCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{withdrawals.length} total withdrawal requests</p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`text-left bg-white rounded-2xl border p-5 transition ${
              activeTab === 'media'
                ? 'border-[#7C3AED] ring-1 ring-[#7C3AED]'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Media & Screenshots</span>
              <ImageIcon className="w-4 h-4 text-[#7C3AED]" />
            </div>
            <p className="text-2xl font-black text-slate-900 mt-1.5 tabular-nums">{pendingMediaCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{cloudinaryImages.length} Cloudinary assets</p>
          </button>
        </div>

        {/* Tab Header & Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('activations')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === 'activations'
                  ? 'bg-[#7C3AED] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Activation Payments ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('deposits')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === 'deposits'
                  ? 'bg-[#7C3AED] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Deposits ({pendingDepositsCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('withdrawals')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === 'withdrawals'
                  ? 'bg-[#7C3AED] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Withdrawals ({pendingWithdrawalsCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('media')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === 'media'
                  ? 'bg-[#7C3AED] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Media & Screenshots ({pendingMediaCount})
            </button>
          </div>

          {activeTab === 'activations' ? (
            <div className="flex items-center gap-1.5">
              {(['all', 'paid', 'unpaid'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActivationFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                    activationFilter === f
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          ) : activeTab === 'media' ? (
            <div className="flex items-center gap-1.5">
              {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMediaStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                    mediaStatusFilter === s
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAllQueueHistory}
                onChange={(e) => setShowAllQueueHistory(e.target.checked)}
                className="rounded border-slate-300 text-[#7C3AED] focus:ring-[#7C3AED]"
              />
              <span>Show processed history</span>
            </label>
          )}
        </div>

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <div className="w-7 h-7 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-semibold text-slate-500">Loading admin records...</p>
          </div>
        ) : (
          <>
            {/* TAB 1: ACTIVATION PAYMENTS */}
            {activeTab === 'activations' && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                {visibleUsers.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-700">No users match this filter</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                          <th className="py-3 px-4">User</th>
                          <th className="py-3 px-4">Requested Role</th>
                          <th className="py-3 px-4">Fee</th>
                          <th className="py-3 px-4">Reference</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleUsers.map((u) => {
                          const isPaid = u.payment_status === 'paid';
                          const feeDisplay = Number(u.activation_amount || u.expected_fee || 0);
                          return (
                            <tr key={u.id} className="hover:bg-slate-50/70">
                              <td className="py-3.5 px-4">
                                <p className="font-extrabold text-slate-900">{u.name || 'Member'}</p>
                                <p className="font-mono text-[11px] text-slate-500">{u.email}</p>
                                {u.phone && <p className="font-mono text-[11px] text-slate-400">{u.phone}</p>}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                    u.requested_role === 'employer'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : u.requested_role === 'earner'
                                      ? 'bg-purple-50 text-[#7C3AED] border border-purple-200'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {u.requested_role || 'Not chosen'}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-black text-slate-900 tabular-nums whitespace-nowrap">
                                ₦{feeDisplay.toLocaleString()}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                                {u.activation_reference || '—'}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                    isPaid
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                                  }`}
                                >
                                  {isPaid ? 'Paid' : 'Unpaid'}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap text-[11px]">
                                {formatDate(u.activation_paid_at || u.created_at)}
                              </td>
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  {u.activation_reference && (
                                    <button
                                      type="button"
                                      onClick={() => setReceiptUser(u)}
                                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] inline-flex items-center gap-1"
                                    >
                                      <Receipt className="w-3 h-3" />
                                      <span>Receipt</span>
                                    </button>
                                  )}
                                  {!isPaid ? (
                                    <button
                                      type="button"
                                      disabled={busyId === u.id}
                                      onClick={() => handleMarkPaidManually(u)}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] inline-flex items-center gap-1 disabled:opacity-50"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Mark as Paid</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={busyId === u.id}
                                      onClick={() => handleRefundRevoke(u)}
                                      className="px-2.5 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-bold rounded-lg text-[11px] inline-flex items-center gap-1 disabled:opacity-50"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      <span>Revoke</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: DEPOSITS */}
            {activeTab === 'deposits' && (
              <div className="space-y-3">
                {visibleDeposits.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
                    <ArrowDownLeft className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-700">No pending deposit confirmations</p>
                  </div>
                ) : (
                  visibleDeposits.map((dep) => {
                    const isPending = dep.status === 'Pending';
                    return (
                      <div
                        key={dep.id}
                        className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-slate-900 tabular-nums">
                              ₦{Number(dep.amount).toLocaleString()}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                dep.status === 'Approved'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : dep.status === 'Rejected'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {dep.status}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700">
                            {dep.user_name || 'Member'} •{' '}
                            <span className="font-mono text-slate-500">{dep.user_email || dep.email || dep.user_id}</span>
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Method: {dep.payment_method || 'bank_transfer'} • Ref: {dep.reference || dep.id} •{' '}
                            {formatDate(dep.created_at)}
                          </p>
                          {dep.admin_note && <p className="text-[11px] text-slate-500">Note: {dep.admin_note}</p>}
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          {dep.proof_url ? (
                            <button
                              type="button"
                              onClick={() => setLightboxUrl(dep.proof_url || null)}
                              className="flex items-center gap-2 p-1.5 pr-3 rounded-xl border border-slate-200 hover:border-[#7C3AED] bg-slate-50 transition"
                            >
                              <img
                                src={dep.proof_url}
                                alt="Deposit proof"
                                className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                              />
                              <span className="text-xs font-bold text-[#7C3AED] flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5" />
                                Proof
                              </span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Paystack verified</span>
                          )}

                          {isPending && (
                            <>
                              <button
                                type="button"
                                disabled={busyId === dep.id}
                                onClick={() => handleConfirmDeposit(dep)}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Confirm Deposit</span>
                              </button>
                              <button
                                type="button"
                                disabled={busyId === dep.id}
                                onClick={() =>
                                  setRejectTarget({
                                    kind: 'deposit',
                                    id: dep.id,
                                    label: `₦${Number(dep.amount).toLocaleString()} deposit`,
                                  })
                                }
                                className="px-3.5 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 3: WITHDRAWALS */}
            {activeTab === 'withdrawals' && (
              <div className="space-y-3">
                {visibleWithdrawals.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
                    <ArrowUpRight className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-700">No pending withdrawal requests</p>
                  </div>
                ) : (
                  visibleWithdrawals.map((wd) => {
                    const isPending = wd.status === 'Pending';
                    return (
                      <div
                        key={wd.id}
                        className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-slate-900 tabular-nums">
                              ₦{Number(wd.amount).toLocaleString()}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                wd.status === 'Paid'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : wd.status === 'Rejected'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {wd.status}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700">
                            {wd.user_name || 'Member'} •{' '}
                            <span className="font-mono text-slate-500">{wd.user_email || wd.email || wd.user_id}</span>
                          </p>
                          <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 inline-block font-mono">
                            {wd.bank_name} • {wd.account_number} • {wd.account_name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            User Balance: ₦{Number(wd.current_user_balance || 0).toLocaleString()} • Requested:{' '}
                            {formatDate(wd.created_at)}
                          </p>
                        </div>

                        {isPending && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busyId === wd.id}
                              onClick={() => handleApproveWithdrawal(wd)}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve Withdraw</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyId === wd.id}
                              onClick={() =>
                                setRejectTarget({
                                  kind: 'withdrawal',
                                  id: wd.id,
                                  label: `₦${Number(wd.amount).toLocaleString()} withdrawal`,
                                })
                              }
                              className="px-3.5 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 4: CLOUDINARY MEDIA & TASK SCREENSHOTS */}
            {activeTab === 'media' && (
              <div className="space-y-6">
                {/* Category Pills */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'all', label: 'All Folders' },
                    { key: 'task-screenshots', label: 'Task Screenshots' },
                    { key: 'verification', label: 'Verification Docs' },
                    { key: 'payment-proofs', label: 'Payment Proofs' },
                    { key: 'campaign-images', label: 'Campaign Images' },
                    { key: 'product-images', label: 'Product Images' },
                    { key: 'support-attachments', label: 'Support Attachments' },
                    { key: 'profile-images', label: 'Profile Photos' },
                  ].map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setMediaCategoryFilter(cat.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                        mediaCategoryFilter === cat.key
                          ? 'bg-[#7C3AED] text-white border-[#7C3AED]'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Task Completion Screenshots Queue */}
                {(mediaCategoryFilter === 'all' || mediaCategoryFilter === 'task-screenshots') && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                      Submitted Task Completion Screenshots ({taskSubmissions.length})
                    </h3>
                    {taskSubmissions.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500">
                        No submitted task screenshots yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {taskSubmissions
                          .filter((s) => mediaStatusFilter === 'all' || s.status === mediaStatusFilter)
                          .map((sub) => (
                            <div
                              key={sub.id}
                              className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between gap-3"
                            >
                              <div className="flex items-start gap-3">
                                {sub.proof_url && (
                                  <button
                                    type="button"
                                    onClick={() => setLightboxUrl(sub.proof_url || null)}
                                    className="shrink-0 overflow-hidden rounded-xl border border-slate-200 hover:border-[#7C3AED] transition"
                                  >
                                    <img
                                      src={sub.proof_url}
                                      alt={sub.task_title}
                                      className="w-20 h-20 object-cover"
                                    />
                                  </button>
                                )}
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-extrabold text-slate-900 truncate">
                                      {sub.task_title}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                        sub.status === 'approved'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : sub.status === 'rejected'
                                          ? 'bg-red-50 text-red-700 border border-red-200'
                                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                                      }`}
                                    >
                                      {sub.status}
                                    </span>
                                  </div>
                                  <p className="text-[11px] font-semibold text-slate-700">
                                    {sub.earner_name} ({sub.earner_email}) • ₦{Number(sub.reward).toLocaleString()}
                                  </p>
                                  {sub.proof_text && (
                                    <p className="text-[11px] text-slate-500 line-clamp-2">{sub.proof_text}</p>
                                  )}
                                  <p className="text-[10px] text-slate-400">{formatDate(sub.created_at)}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                {sub.proof_url && (
                                  <button
                                    type="button"
                                    onClick={() => setLightboxUrl(sub.proof_url || null)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-[#7C3AED] flex items-center gap-1"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Preview</span>
                                  </button>
                                )}
                                {sub.status === 'pending' && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={busyId === sub.id}
                                      onClick={() => handleReviewTaskSubmission(sub, 'approved')}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Approve</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busyId === sub.id}
                                      onClick={() => handleReviewTaskSubmission(sub, 'rejected')}
                                      className="px-3 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>Reject</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Cloudinary Assets Library */}
                <div className="space-y-3">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Cloudinary Media Uploads ({visibleCloudinaryImages.length})
                  </h3>
                  {visibleCloudinaryImages.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500">
                      <ImageIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-700">No Cloudinary images match this filter</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {visibleCloudinaryImages.map((img) => (
                        <div
                          key={img.id || img.public_id}
                          className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col justify-between"
                        >
                          <button
                            type="button"
                            onClick={() => setLightboxUrl(img.secure_url)}
                            className="relative block w-full h-44 bg-slate-100 overflow-hidden group"
                          >
                            <img
                              src={img.secure_url}
                              alt={img.category}
                              className="w-full h-full object-cover group-hover:scale-[1.02] transition"
                            />
                            <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-900/80 text-white text-[10px] font-bold">
                              {img.folder}
                            </span>
                            <span
                              className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                img.status === 'approved'
                                  ? 'bg-emerald-600 text-white'
                                  : img.status === 'rejected'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-amber-500 text-white'
                              }`}
                            >
                              {img.status}
                            </span>
                          </button>

                          <div className="p-4 space-y-2">
                            <div>
                              <p className="text-xs font-extrabold text-slate-900 truncate">
                                {img.user_name || 'Member'}
                              </p>
                              <p className="text-[11px] font-mono text-slate-500 truncate">
                                {img.user_email || img.user_id}
                              </p>
                            </div>
                            <p className="text-[10px] font-mono text-slate-400 truncate" title={img.public_id}>
                              {img.public_id}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {(img.format || 'img').toUpperCase()} •{' '}
                              {img.bytes ? `${Math.round(img.bytes / 1024)} KB` : '—'} • {formatDate(img.created_at)}
                            </p>

                            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => setLightboxUrl(img.secure_url)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-bold text-[#7C3AED] flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Preview</span>
                              </button>
                              {img.status !== 'approved' && (
                                <button
                                  type="button"
                                  disabled={busyId === img.id}
                                  onClick={() => handleReviewCloudinaryMedia(img, 'approved')}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Approve</span>
                                </button>
                              )}
                              {img.status !== 'rejected' && (
                                <button
                                  type="button"
                                  disabled={busyId === img.id}
                                  onClick={() => handleReviewCloudinaryMedia(img, 'rejected')}
                                  className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-50 text-amber-800 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                                >
                                  <XCircle className="w-3 h-3" />
                                  <span>Reject</span>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busyId === img.id}
                                onClick={() => handleDeleteCloudinaryMedia(img)}
                                className="px-2.5 py-1.5 rounded-lg bg-white border border-red-200 hover:bg-red-50 text-red-600 text-[11px] font-bold flex items-center gap-1 ml-auto disabled:opacity-50"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Paystack Receipt Modal */}
      {receiptUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#7C3AED]" />
                <h3 className="text-sm font-extrabold text-slate-900">Activation Payment Receipt</h3>
              </div>
              <button type="button" onClick={() => setReceiptUser(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">User</span>
                <span className="font-bold text-slate-900">{receiptUser.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email</span>
                <span className="font-mono text-slate-800">{receiptUser.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Role</span>
                <span className="font-bold uppercase text-slate-900">
                  {receiptUser.requested_role || receiptUser.role}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reference</span>
                <span className="font-mono font-bold text-[#7C3AED]">{receiptUser.activation_reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount</span>
                <span className="font-black text-slate-900 tabular-nums">
                  ₦{Number(receiptUser.activation_amount || receiptUser.expected_fee || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="font-bold uppercase text-emerald-700">{receiptUser.payment_status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Timestamp</span>
                <span className="text-slate-700">{formatDate(receiptUser.activation_paid_at || receiptUser.created_at)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReceiptUser(null)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Lightbox Image Modal */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-xs font-extrabold text-slate-800">Payment Proof Preview</span>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-[#7C3AED] hover:underline flex items-center gap-1"
                >
                  <span>Open Original</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxUrl(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto flex items-center justify-center bg-slate-50 rounded-xl p-2">
              <img src={lightboxUrl} alt="Full payment proof" className="max-w-full max-h-[70vh] rounded-lg object-contain" />
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-red-600 flex items-center gap-1.5">
                <XCircle className="w-4 h-4" />
                <span>Reject {rejectTarget.label}</span>
              </h3>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Rejection</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Payment receipt not confirmed or invalid bank details"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-red-400"
              />
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === rejectTarget.id}
                onClick={handleExecuteReject}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs disabled:opacity-50"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
