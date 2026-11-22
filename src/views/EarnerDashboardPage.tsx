import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  uploadCloudinaryAsset,
  deleteCloudinaryAsset,
  type UploadedCloudinaryAsset,
} from '../lib/uploadProof';
import { SupportSection } from '../components/SupportSection';
import {
  Menu,
  Check,
  X,
  CheckCircle2,
  Clock,
  Wallet,
  TrendingUp,
  ShieldCheck,
  LogOut,
  Upload,
  ExternalLink,
  Briefcase,
  AlertCircle,
  MessageSquare,
  ShoppingBag,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Eye,
  User,
  Camera,
  CreditCard,
  Trash2,
  FileCheck2,
} from 'lucide-react';

interface TaskItem {
  id: string;
  employer_id: string;
  employer_name: string;
  title: string;
  description: string;
  category: string;
  reward: number;
  workers_needed: number;
  workers_completed: number;
  deadline: string;
  proof_required: string;
  campaign_image_url?: string | null;
  status: string;
  created_at: string;
}

interface ApplicationItem {
  id: string;
  task_id: string;
  title: string;
  category: string;
  reward: number;
  employer_name: string;
  deadline: string;
  description: string;
  proof_required: string;
  status: string;
  submission_id?: string | null;
  proof_url?: string | null;
  proof_link?: string | null;
  proof_text?: string | null;
  submission_status?: string | null;
  submitted_at?: string | null;
  created_at: string;
}

export const EarnerDashboardPage: React.FC = () => {
  const {
    userProfile,
    firebaseUser,
    isAdmin,
    authFetch,
    logout,
    switchUserRole,
    navigate,
    saveAvatarUrl,
    submitDeposit,
    submitWithdrawal,
    fetchWalletData,
    initializePaystackPayment,
    verifyPaystackPayment,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'browse' | 'my-tasks' | 'wallet'>('browse');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState<boolean>(true);

  const [walletStats, setWalletStats] = useState({
    balance: Number(userProfile?.balance || 0),
    total_deposited: Number(userProfile?.total_deposited || 0),
    total_withdrawn: Number(userProfile?.total_withdrawn || 0),
    total_earned: Number(userProfile?.total_earned || 0),
  });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingWallet, setLoadingWallet] = useState<boolean>(false);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // UI Drawer & Modals
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Task Proof Upload Modal State
  const [submitTarget, setSubmitTarget] = useState<ApplicationItem | null>(null);
  const [taskProofUrl, setTaskProofUrl] = useState<string>('');
  const [taskProofAsset, setTaskProofAsset] = useState<UploadedCloudinaryAsset | null>(null);
  const [taskProofLink, setTaskProofLink] = useState<string>('');
  const [taskProofNote, setTaskProofNote] = useState<string>('');
  const [taskUploading, setTaskUploading] = useState<boolean>(false);
  const [taskUploadProgress, setTaskUploadProgress] = useState<number>(0);
  const [taskSubmitting, setTaskSubmitting] = useState<boolean>(false);

  // Deposit Modal State
  const [depositModalOpen, setDepositModalOpen] = useState<boolean>(false);
  const [depositMethod, setDepositMethod] = useState<'paystack' | 'bank_transfer'>('paystack');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositProofUrl, setDepositProofUrl] = useState<string>('');
  const [depositProofAsset, setDepositProofAsset] = useState<UploadedCloudinaryAsset | null>(null);
  const [depositUploading, setDepositUploading] = useState<boolean>(false);
  const [depositProgress, setDepositProgress] = useState<number>(0);
  const [depositSubmitting, setDepositSubmitting] = useState<boolean>(false);

  // Withdraw Modal State
  const [withdrawModalOpen, setWithdrawModalOpen] = useState<boolean>(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawBank, setWithdrawBank] = useState<string>('OPay');
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState<string>('');
  const [withdrawAccountName, setWithdrawAccountName] = useState<string>(userProfile?.name || '');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState<boolean>(false);

  // Avatar & Account Verification Upload State
  const [avatarUploading, setAvatarUploading] = useState<boolean>(false);
  const [verificationAsset, setVerificationAsset] = useState<{
    public_id: string;
    secure_url: string;
    status?: string;
    firestoreDocId?: string;
  } | null>(null);
  const [verificationUploading, setVerificationUploading] = useState<boolean>(false);
  const [verificationProgress, setVerificationProgress] = useState<number>(0);
  const [removingAssetKey, setRemovingAssetKey] = useState<string | null>(null);

  // Inline feedback toast
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const uid = userProfile?.uid || firebaseUser?.uid || '';
  const isApprovedEmployer =
    userProfile?.payment_status === 'paid' &&
    (userProfile?.role === 'employer' || userProfile?.employer_approved === 1);

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const url = uid ? `/api/tasks?earner_id=${encodeURIComponent(uid)}` : '/api/tasks';
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
        setApplications(data.applications || []);
      }
    } catch (err) {
      console.warn('Could not load tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  }, [uid, authFetch]);

  const loadWallet = useCallback(async () => {
    if (!uid) return;
    setLoadingWallet(true);
    try {
      const data = await fetchWalletData(uid);
      if (data?.wallet) {
        setWalletStats({
          balance: Number(data.wallet.balance || 0),
          total_deposited: Number(data.wallet.total_deposited || 0),
          total_withdrawn: Number(data.wallet.total_withdrawn || 0),
          total_earned: Number(data.wallet.total_earned || 0),
        });
        setTransactions(data.transactions || []);
      }
    } finally {
      setLoadingWallet(false);
    }
  }, [uid, fetchWalletData]);

  const loadVerificationDoc = useCallback(async () => {
    if (!uid) return;
    try {
      const res = await authFetch('/api/cloudinary/images?category=verification');
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const latest = (data.images || [])[0];
        if (latest?.secure_url && latest?.public_id) {
          setVerificationAsset({
            public_id: latest.public_id,
            secure_url: latest.secure_url,
            status: latest.status || 'pending',
          });
        } else {
          setVerificationAsset(null);
        }
      }
    } catch {
      // ignore non-fatal load failure
    }
  }, [uid, authFetch]);

  useEffect(() => {
    loadTasks();
    loadWallet();
    loadVerificationDoc();
  }, [loadTasks, loadWallet, loadVerificationDoc]);

  // Accept Task
  const handleAcceptTask = async (task: TaskItem) => {
    try {
      const res = await authFetch('/api/tasks/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: task.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Could not accept task.', 'error');
        return;
      }
      showFeedback(`Accepted task: ${task.title}`);
      setSelectedTask(null);
      await loadTasks();
      setActiveTab('my-tasks');
    } catch (err: any) {
      showFeedback(err?.message || 'Error accepting task.', 'error');
    }
  };

  // Upload / Replace Task Proof Screenshot -> Cloudinary (cdsure/task-screenshots/)
  const handleTaskProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const previousAsset = taskProofAsset;
    setTaskUploading(true);
    setTaskUploadProgress(0);
    try {
      const asset = await uploadCloudinaryAsset(file, 'task-screenshots', {
        relatedId: submitTarget?.task_id,
        onProgress: (pct) => setTaskUploadProgress(pct),
      });
      if (previousAsset?.public_id) {
        await deleteCloudinaryAsset(previousAsset.public_id, previousAsset.firestoreDocId).catch(() => {});
      }
      setTaskProofAsset(asset);
      setTaskProofUrl(asset.secure_url);
      showFeedback('Proof screenshot uploaded to Cloudinary.');
    } catch (err: any) {
      showFeedback(err?.message || 'Could not upload proof screenshot.', 'error');
    } finally {
      setTaskUploading(false);
    }
  };

  const handleRemoveTaskProof = async () => {
    if (!taskProofUrl) return;
    setRemovingAssetKey('task-proof');
    try {
      if (taskProofAsset?.public_id) {
        const res = await deleteCloudinaryAsset(taskProofAsset.public_id, taskProofAsset.firestoreDocId);
        if (!res.success) {
          showFeedback(res.error || 'Could not remove screenshot.', 'error');
          return;
        }
      }
      setTaskProofAsset(null);
      setTaskProofUrl('');
      showFeedback('Screenshot removed.');
    } finally {
      setRemovingAssetKey(null);
    }
  };

  // Submit Task Proof
  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitTarget) return;
    if (!taskProofUrl && !taskProofLink.trim()) {
      showFeedback('Please upload a proof screenshot or provide a proof link.', 'error');
      return;
    }

    setTaskSubmitting(true);
    try {
      const res = await authFetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: submitTarget.task_id,
          proof_url: taskProofUrl,
          proof_link: taskProofLink.trim(),
          proof_text: taskProofNote.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Could not submit proof.', 'error');
        return;
      }
      showFeedback('Task proof submitted! Waiting for review.');
      setSubmitTarget(null);
      setTaskProofAsset(null);
      setTaskProofUrl('');
      setTaskProofLink('');
      setTaskProofNote('');
      await loadTasks();
    } catch (err: any) {
      showFeedback(err?.message || 'Submission failed.', 'error');
    } finally {
      setTaskSubmitting(false);
    }
  };

  // Upload Deposit Proof -> Cloudinary (cdsure/payment-proofs/)
  const handleDepositProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const previousAsset = depositProofAsset;
    setDepositUploading(true);
    setDepositProgress(0);
    try {
      const asset = await uploadCloudinaryAsset(file, 'payment-proofs', {
        onProgress: (pct) => setDepositProgress(pct),
      });
      if (previousAsset?.public_id) {
        await deleteCloudinaryAsset(previousAsset.public_id, previousAsset.firestoreDocId).catch(() => {});
      }
      setDepositProofAsset(asset);
      setDepositProofUrl(asset.secure_url);
      showFeedback('Deposit receipt uploaded.');
    } catch (err: any) {
      showFeedback(err?.message || 'Could not upload deposit receipt.', 'error');
    } finally {
      setDepositUploading(false);
    }
  };

  const handleRemoveDepositProof = async () => {
    if (!depositProofUrl) return;
    setRemovingAssetKey('deposit-proof');
    try {
      if (depositProofAsset?.public_id) {
        const res = await deleteCloudinaryAsset(depositProofAsset.public_id, depositProofAsset.firestoreDocId);
        if (!res.success) {
          showFeedback(res.error || 'Could not remove deposit receipt.', 'error');
          return;
        }
      }
      setDepositProofAsset(null);
      setDepositProofUrl('');
      showFeedback('Deposit receipt removed.');
    } finally {
      setRemovingAssetKey(null);
    }
  };

  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(depositAmount);
    if (!amt || Number.isNaN(amt) || amt < 100) {
      showFeedback('Minimum deposit amount is ₦100.', 'error');
      return;
    }

    if (depositMethod === 'paystack') {
      setDepositSubmitting(true);
      try {
        const callbackUrl = `${window.location.origin}/verify-payment`;
        const initRes = await initializePaystackPayment(amt, 'deposit', { callback_url: callbackUrl });
        if (!initRes.success || !initRes.authorization_url) {
          console.error('[Deposit Paystack Init Failed]', initRes);
          showFeedback(`Payment init failed: ${initRes.error || 'Missing Paystack authorization URL.'}`, 'error');
          setDepositSubmitting(false);
          return;
        }
        window.location.href = initRes.authorization_url;
      } catch (err: any) {
        console.error('[Deposit Paystack Init Error]', err);
        showFeedback(`Payment init failed: ${err?.message || 'Paystack connection failed.'}`, 'error');
        setDepositSubmitting(false);
      }
      return;
    }

    if (!depositProofUrl) {
      showFeedback('Please upload your payment receipt screenshot.', 'error');
      return;
    }

    setDepositSubmitting(true);
    try {
      const res = await submitDeposit(amt, depositProofUrl, 'bank_transfer');
      if (res.success) {
        showFeedback('Deposit submitted as Pending. Balance updates once Admin confirms.');
        setDepositModalOpen(false);
        setDepositAmount('');
        setDepositProofUrl('');
        await loadWallet();
      } else {
        showFeedback(res.error || 'Failed to submit deposit.', 'error');
      }
    } finally {
      setDepositSubmitting(false);
    }
  };

  const handleSubmitWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(withdrawAmount);
    if (!amt || Number.isNaN(amt) || amt <= 0) {
      showFeedback('Enter a valid withdrawal amount.', 'error');
      return;
    }
    if (amt > walletStats.balance) {
      showFeedback('Insufficient balance', 'error');
      return;
    }
    if (!withdrawBank.trim() || !withdrawAccountNumber.trim() || !withdrawAccountName.trim()) {
      showFeedback('Please enter complete bank account details.', 'error');
      return;
    }

    setWithdrawSubmitting(true);
    try {
      const res = await submitWithdrawal(
        amt,
        withdrawBank.trim(),
        withdrawAccountNumber.trim(),
        withdrawAccountName.trim()
      );
      if (res.success) {
        showFeedback('Withdrawal request submitted as Pending.');
        setWithdrawModalOpen(false);
        setWithdrawAmount('');
        await loadWallet();
      } else {
        showFeedback(res.error || 'Withdrawal failed.', 'error');
      }
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    try {
      const asset = await uploadCloudinaryAsset(file, 'profile-images');
      const saved = await saveAvatarUrl(asset.secure_url);
      if (saved.success) {
        showFeedback('Profile photo updated.');
      } else {
        showFeedback(saved.error || 'Could not update profile photo.', 'error');
      }
    } catch (err: any) {
      showFeedback(err?.message || 'Photo upload failed.', 'error');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleVerificationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const prev = verificationAsset;
    setVerificationUploading(true);
    setVerificationProgress(0);
    try {
      const asset = await uploadCloudinaryAsset(file, 'verification', {
        onProgress: (pct) => setVerificationProgress(pct),
      });
      if (prev?.public_id) {
        await deleteCloudinaryAsset(prev.public_id, prev.firestoreDocId).catch(() => {});
      }
      setVerificationAsset({
        public_id: asset.public_id,
        secure_url: asset.secure_url,
        status: 'pending',
        firestoreDocId: asset.firestoreDocId,
      });
      showFeedback('Account verification image uploaded for admin review.');
    } catch (err: any) {
      showFeedback(err?.message || 'Verification upload failed.', 'error');
    } finally {
      setVerificationUploading(false);
    }
  };

  const handleRemoveVerificationDoc = async () => {
    if (!verificationAsset?.public_id) return;
    setRemovingAssetKey('verification');
    try {
      const res = await deleteCloudinaryAsset(verificationAsset.public_id, verificationAsset.firestoreDocId);
      if (!res.success) {
        showFeedback(res.error || 'Could not remove verification image.', 'error');
        return;
      }
      setVerificationAsset(null);
      showFeedback('Verification image removed.');
    } finally {
      setRemovingAssetKey(null);
    }
  };

  const acceptedIds = new Set(applications.map((a) => a.task_id));
  const filteredTasks = tasks.filter((t) => {
    if (selectedCategory !== 'All' && t.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const categories = ['All', ...Array.from(new Set(tasks.map((t) => t.category).filter(Boolean)))];

  const handleSwitchEmployer = async () => {
    const res = await switchUserRole('employer');
    if (!res.success && res.message) {
      showFeedback(res.message, 'error');
    }
  };

  const formatTxType = (t: string) => {
    if (t === 'activation_payment') return 'Account Activation';
    if (t === 'activation_credit') return 'Activation Credit';
    if (t === 'deposit') return 'Deposit';
    if (t === 'withdrawal') return 'Withdrawal';
    if (t === 'task_earning') return 'Task Earning';
    return t || 'Transaction';
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSideMenuOpen(true)}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-700"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#7C3AED] flex items-center justify-center">
              <Check className="w-4 h-4 text-white stroke-[3]" />
            </div>
            <div>
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900">
                CDSure <span className="text-[#7C3AED]">Tasks</span>
              </span>
              <span className="ml-2 px-2 py-0.5 rounded-md bg-purple-50 text-[#7C3AED] border border-purple-200 text-[10px] font-bold uppercase">
                EARNER
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('wallet')}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-extrabold text-slate-900 tabular-nums flex items-center gap-1.5 transition"
          >
            <Wallet className="w-3.5 h-3.5 text-[#7C3AED]" />
            <span>₦{walletStats.balance.toLocaleString()}</span>
          </button>

          <button
            type="button"
            onClick={() => setAccountModalOpen(true)}
            className="w-9 h-9 rounded-full bg-purple-100 border border-purple-200 text-[#7C3AED] font-bold text-xs flex items-center justify-center overflow-hidden"
            title="Account Settings"
          >
            {userProfile?.avatar_url ? (
              <img src={userProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              (userProfile?.name || 'W')[0].toUpperCase()
            )}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 space-y-6">
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
            <button type="button" onClick={() => setFeedback(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Activated Earner strip */}

        {/* Approved Employer Banner (if viewing Earner mode) */}
        {isApprovedEmployer && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-purple-900">
              Your Employer account is approved. You can switch to Employer Dashboard anytime.
            </p>
            <button
              type="button"
              onClick={() => navigate('/employer-dashboard')}
              className="px-3.5 py-2 bg-[#7C3AED] text-white text-xs font-bold rounded-xl shrink-0"
            >
              Open Employer Dashboard
            </button>
          </div>
        )}

        {/* Real Wallet KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-semibold text-slate-500">Wallet Balance</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tabular-nums">
              ₦{walletStats.balance.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-semibold text-slate-500">Total Earned</p>
            <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 tabular-nums">
              ₦{walletStats.total_earned.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-semibold text-slate-500">Total Deposited</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tabular-nums">
              ₦{walletStats.total_deposited.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-semibold text-slate-500">Total Withdrawn</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tabular-nums">
              ₦{walletStats.total_withdrawn.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'browse'
                ? 'bg-[#7C3AED] text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Available Tasks ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('my-tasks')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'my-tasks'
                ? 'bg-[#7C3AED] text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            My Submissions ({applications.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('wallet');
              loadWallet();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'wallet'
                ? 'bg-[#7C3AED] text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Wallet & History
          </button>
        </div>

        {/* TAB 1: BROWSE TASKS */}
        {activeTab === 'browse' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-[#7C3AED]"
              />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {loadingTasks ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                <div className="w-7 h-7 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Loading tasks...</p>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-2">
                <Briefcase className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No open tasks posted yet</p>
                <p className="text-xs text-slate-400">
                  Tasks posted by approved Employers will appear here immediately.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTasks.map((task) => {
                  const alreadyAccepted = acceptedIds.has(task.id);
                  return (
                    <div
                      key={task.id}
                      className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2.5 py-0.5 rounded-md bg-purple-50 text-[#7C3AED] border border-purple-100 text-[11px] font-bold">
                            {task.category}
                          </span>
                          <span className="text-base font-black text-emerald-700 tabular-nums">
                            ₦{Number(task.reward).toLocaleString()}
                          </span>
                        </div>
                        <h3 className="text-sm font-extrabold text-slate-900">{task.title}</h3>
                        <p className="text-xs text-slate-500 line-clamp-2">{task.description}</p>
                        {task.campaign_image_url && (
                          <button
                            type="button"
                            onClick={() => setLightboxUrl(task.campaign_image_url || null)}
                            className="mt-1 block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 hover:border-[#7C3AED] transition"
                          >
                            <img
                              src={task.campaign_image_url}
                              alt={`${task.title} preview`}
                              className="w-full h-32 object-cover"
                            />
                          </button>
                        )}
                        <p className="text-[11px] text-slate-400">
                          By {task.employer_name} • Deadline: {task.deadline} •{' '}
                          {task.workers_completed}/{task.workers_needed} done
                        </p>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setSelectedTask(task)}
                          className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
                        >
                          View Details
                        </button>
                        {alreadyAccepted ? (
                          <button
                            type="button"
                            onClick={() => setActiveTab('my-tasks')}
                            className="flex-1 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-xl text-xs"
                          >
                            Accepted
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAcceptTask(task)}
                            className="flex-1 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs transition"
                          >
                            Accept Task
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

        {/* TAB 2: MY TASKS & PROOF SUBMISSIONS */}
        {activeTab === 'my-tasks' && (
          <div className="space-y-3">
            {applications.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-2">
                <Clock className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No accepted tasks yet</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('browse')}
                  className="px-4 py-2 bg-[#7C3AED] text-white text-xs font-bold rounded-xl"
                >
                  Browse Tasks
                </button>
              </div>
            ) : (
              applications.map((app) => {
                const subStatus = app.submission_status || app.status;
                return (
                  <div
                    key={app.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-extrabold text-slate-900">{app.title}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            subStatus === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : subStatus === 'rejected'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : subStatus === 'submitted' || subStatus === 'pending'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {subStatus}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Reward: <span className="font-bold text-slate-800 tabular-nums">₦{Number(app.reward).toLocaleString()}</span> • By {app.employer_name}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {app.proof_url && (
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(app.proof_url || null)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-[#7C3AED]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Proof</span>
                        </button>
                      )}

                      {(!app.submission_id || subStatus === 'rejected') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitTarget(app);
                            setTaskProofAsset(null);
                            setTaskProofUrl('');
                            setTaskProofLink('');
                            setTaskProofNote('');
                          }}
                          className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs transition"
                        >
                          Submit Proof
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: WALLET & TRANSACTION HISTORY */}
        {activeTab === 'wallet' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-500">Available Wallet Balance</p>
                <p className="text-3xl font-black text-slate-900 mt-1 tabular-nums">
                  ₦{walletStats.balance.toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setDepositModalOpen(true)}
                  className="px-4 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>Deposit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWithdrawModalOpen(true)}
                  className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Withdraw</span>
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">Wallet History</h3>
                <button
                  type="button"
                  onClick={loadWallet}
                  disabled={loadingWallet}
                  className="text-xs font-bold text-[#7C3AED] flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingWallet ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {transactions.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">No wallet transactions recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                        <th className="py-2.5 pr-4">Date</th>
                        <th className="py-2.5 pr-4">Type</th>
                        <th className="py-2.5 pr-4">Details</th>
                        <th className="py-2.5 pr-4 text-right">Amount</th>
                        <th className="py-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">
                            {new Date(tx.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 font-bold text-slate-800 whitespace-nowrap">
                            {formatTxType(tx.type)}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">{tx.description || tx.reference}</td>
                          <td className="py-3 pr-4 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">
                            ₦{Number(tx.amount || 0).toLocaleString()}
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                tx.status === 'Approved' || tx.status === 'Paid'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : tx.status === 'Rejected'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {tx.status}
                            </span>
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

        <SupportSection />
      </main>

      {/* Sidebar Drawer */}
      {sideMenuOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex">
          <div className="w-72 bg-white h-full p-5 flex flex-col justify-between shadow-2xl">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#7C3AED] flex items-center justify-center">
                    <Check className="w-4 h-4 text-white stroke-[3]" />
                  </div>
                  <span className="font-extrabold text-sm text-slate-900">CDSure Tasks</span>
                </div>
                <button type="button" onClick={() => setSideMenuOpen(false)} className="p-1 text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs font-extrabold text-slate-900 truncate">{userProfile?.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{userProfile?.email}</p>
              </div>

              <nav className="space-y-1.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('browse');
                    setSideMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 flex items-center gap-2.5"
                >
                  <Briefcase className="w-4 h-4 text-[#7C3AED]" />
                  <span>Browse Tasks</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('wallet');
                    setSideMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 flex items-center gap-2.5"
                >
                  <Wallet className="w-4 h-4 text-[#7C3AED]" />
                  <span>Wallet & History</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/marketplace')}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 flex items-center gap-2.5"
                >
                  <ShoppingBag className="w-4 h-4 text-[#7C3AED]" />
                  <span>Marketplace</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/chat')}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 flex items-center gap-2.5"
                >
                  <MessageSquare className="w-4 h-4 text-[#7C3AED]" />
                  <span>Support</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountModalOpen(true);
                    setSideMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 flex items-center gap-2.5"
                >
                  <User className="w-4 h-4 text-[#7C3AED]" />
                  <span>Account Settings</span>
                </button>

                {isApprovedEmployer && (
                  <button
                    type="button"
                    onClick={() => {
                      setSideMenuOpen(false);
                      handleSwitchEmployer();
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-purple-50 text-[#7C3AED] flex items-center gap-2.5"
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>Switch to Employer Mode</span>
                  </button>
                )}

                {/* Strict Admin-Only Navigation Link */}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setSideMenuOpen(false);
                      navigate('/admin');
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-900 text-white flex items-center gap-2.5"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Admin Panel</span>
                  </button>
                )}
              </nav>
            </div>

            <button
              type="button"
              onClick={logout}
              className="w-full py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-700 text-xs font-bold flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
          <div className="flex-1" onClick={() => setSideMenuOpen(false)} />
        </div>
      )}

      {/* Task Details Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold text-[#7C3AED] uppercase">{selectedTask.category}</span>
                <h3 className="text-base font-extrabold text-slate-900 mt-0.5">{selectedTask.title}</h3>
              </div>
              <button type="button" onClick={() => setSelectedTask(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
              {selectedTask.campaign_image_url && (
                <button
                  type="button"
                  onClick={() => setLightboxUrl(selectedTask.campaign_image_url || null)}
                  className="block w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <img
                    src={selectedTask.campaign_image_url}
                    alt={`${selectedTask.title} campaign`}
                    className="w-full max-h-48 object-cover"
                  />
                </button>
              )}
              <p className="text-slate-700 leading-relaxed">{selectedTask.description}</p>
              <p className="text-slate-600 pt-2 border-t border-slate-200">
                <strong className="text-slate-900">Proof Required:</strong> {selectedTask.proof_required}
              </p>
              <p className="font-extrabold text-emerald-700 tabular-nums">
                Reward: ₦{Number(selectedTask.reward).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs"
              >
                Close
              </button>
              {!acceptedIds.has(selectedTask.id) && (
                <button
                  type="button"
                  onClick={() => handleAcceptTask(selectedTask)}
                  className="flex-1 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs"
                >
                  Accept Task
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Submit Task Proof Modal */}
      {submitTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitProof}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Submit Task Proof</h3>
              <button type="button" onClick={() => setSubmitTarget(null)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 font-semibold">{submitTarget.title}</p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Upload Proof Screenshot (JPG, PNG, WEBP — max 10MB)
              </label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-[#7C3AED] rounded-xl p-4 cursor-pointer text-center bg-slate-50">
                <Upload className="w-5 h-5 text-[#7C3AED] mb-1.5" />
                <span className="text-xs font-bold text-slate-700">
                  {taskUploading
                    ? `Uploading... ${taskUploadProgress}%`
                    : taskProofUrl
                    ? 'Replace Screenshot'
                    : 'Choose Screenshot from Phone or Computer'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={handleTaskProofFile}
                  disabled={taskUploading}
                  className="hidden"
                />
              </label>
              {taskProofUrl && (
                <div className="mt-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={taskProofUrl}
                      alt="Uploaded proof"
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-emerald-700">Screenshot ready</p>
                      <p className="text-[10px] text-slate-400 truncate font-mono">
                        {taskProofAsset?.public_id || 'Cloudinary stored'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(taskProofUrl)}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-[#7C3AED] hover:bg-purple-50 flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Preview</span>
                    </button>
                    <button
                      type="button"
                      disabled={removingAssetKey === 'task-proof'}
                      onClick={handleRemoveTaskProof}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Proof Link (Optional)</label>
              <input
                type="url"
                value={taskProofLink}
                onChange={(e) => setTaskProofLink(e.target.value)}
                placeholder="https://..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Note for Employer</label>
              <textarea
                rows={2}
                value={taskProofNote}
                onChange={(e) => setTaskProofNote(e.target.value)}
                placeholder="Username or completion note..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={taskUploading || taskSubmitting}
              className="w-full py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs disabled:opacity-50"
            >
              {taskSubmitting ? 'Submitting...' : 'Submit Proof for Approval'}
            </button>
          </form>
        </div>
      )}

      {/* Deposit Modal (Paystack Instant OR Bank Transfer + Cloudinary Receipt) */}
      {depositModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitDeposit}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Deposit Funds</h3>
              <button type="button" onClick={() => setDepositModalOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDepositMethod('paystack')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition ${
                  depositMethod === 'paystack'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                Paystack Instant
              </button>
              <button
                type="button"
                onClick={() => setDepositMethod('bank_transfer')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition ${
                  depositMethod === 'bank_transfer'
                    ? 'border-[#7C3AED] bg-purple-50 text-[#7C3AED]'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                Bank Transfer + Proof
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Amount (₦)</label>
              <input
                type="number"
                min="100"
                required
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="e.g. 1000"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold tabular-nums"
              />
            </div>

            {depositMethod === 'paystack' ? (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                Instant wallet credit via Paystack (Card, Bank Transfer, USSD).
              </div>
            ) : (
              <>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <p className="font-bold text-slate-800">Bank / OPay Transfer</p>
                  <p className="text-slate-600">Upload your receipt screenshot below. Pending until Admin confirms.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Upload Payment Receipt (JPG, PNG, WEBP — max 10MB)
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-[#7C3AED] rounded-xl p-4 cursor-pointer text-center bg-slate-50">
                    <Upload className="w-5 h-5 text-[#7C3AED] mb-1.5" />
                    <span className="text-xs font-bold text-slate-700">
                      {depositUploading ? `Uploading... ${depositProgress}%` : depositProofUrl ? 'Replace Receipt' : 'Upload Receipt Screenshot'}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      onChange={handleDepositProofFile}
                      disabled={depositUploading}
                      className="hidden"
                    />
                  </label>
                  {depositProofUrl && (
                    <div className="mt-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <img src={depositProofUrl} alt="Receipt" className="w-11 h-11 rounded-lg object-cover border border-slate-200" />
                        <span className="text-xs font-semibold text-emerald-700">Receipt attached</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(depositProofUrl)}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-[#7C3AED]"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          disabled={removingAssetKey === 'deposit-proof'}
                          onClick={handleRemoveDepositProof}
                          className="px-2 py-1 rounded-lg bg-white border border-red-200 text-[11px] font-bold text-red-600 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={depositUploading || depositSubmitting}
              className={`w-full py-2.5 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                depositMethod === 'paystack'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-[#7C3AED] hover:bg-[#6D28D9]'
              }`}
            >
              {depositMethod === 'paystack' && <CreditCard className="w-3.5 h-3.5" />}
              <span>
                {depositSubmitting
                  ? 'Processing...'
                  : depositMethod === 'paystack'
                  ? 'Pay with Paystack'
                  : 'Submit Deposit Request'}
              </span>
            </button>
          </form>
        </div>
      )}

      {/* Withdraw Modal */}
      {withdrawModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitWithdrawal}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3.5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Request Withdrawal</h3>
              <button type="button" onClick={() => setWithdrawModalOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Available Balance: <strong className="text-slate-900 tabular-nums">₦{walletStats.balance.toLocaleString()}</strong>
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₦)</label>
              <input
                type="number"
                min="1"
                required
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="e.g. 500"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
              <input
                type="text"
                required
                value={withdrawBank}
                onChange={(e) => setWithdrawBank(e.target.value)}
                placeholder="e.g. OPay, Access Bank, GTBank"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
              <input
                type="text"
                required
                value={withdrawAccountNumber}
                onChange={(e) => setWithdrawAccountNumber(e.target.value)}
                placeholder="10-digit account number"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Account Name</label>
              <input
                type="text"
                required
                value={withdrawAccountName}
                onChange={(e) => setWithdrawAccountName(e.target.value)}
                placeholder="Account holder name"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={withdrawSubmitting}
              className="w-full py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs disabled:opacity-50"
            >
              {withdrawSubmitting ? 'Submitting...' : 'Submit Withdrawal Request'}
            </button>
          </form>
        </div>
      )}

      {/* Account Settings Modal (with Cloudinary Profile Photo upload) */}
      {accountModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Account Profile</h3>
              <button type="button" onClick={() => setAccountModalOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 text-[#7C3AED] font-black text-xl flex items-center justify-center overflow-hidden border border-purple-200">
                {userProfile?.avatar_url ? (
                  <img src={userProfile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  (userProfile?.name || 'W')[0].toUpperCase()
                )}
              </div>
              <label className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-[#7C3AED]" />
                <span>{avatarUploading ? 'Uploading...' : 'Change Photo'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={handleAvatarUpload}
                  disabled={avatarUploading}
                  className="hidden"
                />
              </label>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Name:</span>
                <span className="font-bold text-slate-900">{userProfile?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="font-mono text-slate-800">{userProfile?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone:</span>
                <span className="font-mono text-slate-800">{userProfile?.phone || 'Not provided'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Mode:</span>
                <span className="font-bold text-[#7C3AED] uppercase">{userProfile?.role}</span>
              </div>
            </div>

            {/* Account Verification Image Upload (Cloudinary cdsure/verification/) */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-[#7C3AED]" />
                  <span className="text-xs font-extrabold text-slate-800">Account Verification Image</span>
                </div>
                {verificationAsset && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                      verificationAsset.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : verificationAsset.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {verificationAsset.status || 'pending'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Upload your valid ID card or verification selfie (JPG, PNG, WEBP up to 10MB).
              </p>

              {verificationAsset ? (
                <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(verificationAsset.secure_url)}
                    className="flex items-center gap-2 min-w-0 text-left"
                  >
                    <img
                      src={verificationAsset.secure_url}
                      alt="Verification document"
                      className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                    <span className="text-xs font-bold text-[#7C3AED] truncate">Preview Document</span>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer">
                      <span>{verificationUploading ? `${verificationProgress}%` : 'Replace'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                        onChange={handleVerificationUpload}
                        disabled={verificationUploading}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={removingAssetKey === 'verification'}
                      onClick={handleRemoveVerificationDoc}
                      className="px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-[11px] font-bold disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#7C3AED] bg-white cursor-pointer text-xs font-bold text-slate-700">
                  <Upload className="w-4 h-4 text-[#7C3AED]" />
                  <span>
                    {verificationUploading ? `Uploading... ${verificationProgress}%` : 'Upload Verification Image'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    onChange={handleVerificationUpload}
                    disabled={verificationUploading}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <button
              type="button"
              onClick={() => setAccountModalOpen(false)}
              className="w-full py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Lightbox Image Preview */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-xs font-extrabold text-slate-800">Uploaded Proof Preview</span>
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
                <button type="button" onClick={() => setLightboxUrl(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto flex items-center justify-center bg-slate-50 rounded-xl p-2">
              <img src={lightboxUrl} alt="Proof" className="max-w-full max-h-[70vh] rounded-lg object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
