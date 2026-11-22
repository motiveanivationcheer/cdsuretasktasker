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
  Plus,
  ShieldCheck,
  Briefcase,
  LogOut,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Clock,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  ShoppingBag,
  CheckCircle2,
  XCircle,
  Eye,
  Upload,
  ExternalLink,
  User,
  Camera,
  CreditCard,
  Trash2,
  Image as ImageIcon,
  FileCheck2,
} from 'lucide-react';

interface EmployerTask {
  id: string;
  title: string;
  category: string;
  reward: number;
  workers_needed: number;
  workers_completed: number;
  deadline: string;
  description: string;
  proof_required: string;
  campaign_image_url?: string | null;
  status: string;
  created_at: string;
}

interface SubmissionItem {
  id: string;
  task_id: string;
  task_title: string;
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

export const EmployerDashboardPage: React.FC = () => {
  const {
    userProfile,
    firebaseUser,
    isAdmin,
    authFetch,
    logout,
    switchUserRole,
    navigate,
    submitDeposit,
    submitWithdrawal,
    fetchWalletData,
    saveAvatarUrl,
    initializePaystackPayment,
    verifyPaystackPayment,
  } = useAuth();

  const uid = userProfile?.uid || firebaseUser?.uid || '';

  const [activeTab, setActiveTab] = useState<'tasks' | 'submissions' | 'wallet'>('tasks');
  const [tasks, setTasks] = useState<EmployerTask[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState<boolean>(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [walletStats, setWalletStats] = useState({
    balance: Number(userProfile?.balance || 0),
    total_deposited: Number(userProfile?.total_deposited || 0),
    total_withdrawn: Number(userProfile?.total_withdrawn || 0),
    total_earned: Number(userProfile?.total_earned || 0),
  });
  const [transactions, setTransactions] = useState<any[]>([]);

  // Modals
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [postTaskModalOpen, setPostTaskModalOpen] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Post Task Form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState('Social Media');
  const [taskReward, setTaskReward] = useState('500');
  const [taskWorkers, setTaskWorkers] = useState('10');
  const [taskDeadline, setTaskDeadline] = useState('3 days');
  const [taskInstructions, setTaskInstructions] = useState('');
  const [taskProofReq, setTaskProofReq] = useState('Screenshot of completed action');
  const [taskCampaignAsset, setTaskCampaignAsset] = useState<UploadedCloudinaryAsset | null>(null);
  const [campaignUploading, setCampaignUploading] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState(0);
  const [postingTask, setPostingTask] = useState(false);

  // Deposit Form
  const [depositMethod, setDepositMethod] = useState<'paystack' | 'bank_transfer'>('paystack');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositProofUrl, setDepositProofUrl] = useState('');
  const [depositProofAsset, setDepositProofAsset] = useState<UploadedCloudinaryAsset | null>(null);
  const [depositUploading, setDepositUploading] = useState(false);
  const [depositProgress, setDepositProgress] = useState(0);
  const [depositSubmitting, setDepositSubmitting] = useState(false);

  // Withdraw Form
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBank, setWithdrawBank] = useState('OPay');
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState('');
  const [withdrawAccountName, setWithdrawAccountName] = useState(userProfile?.name || '');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  // Avatar & Account Verification Upload
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [verificationAsset, setVerificationAsset] = useState<{
    public_id: string;
    secure_url: string;
    status?: string;
    firestoreDocId?: string;
  } | null>(null);
  const [verificationUploading, setVerificationUploading] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [removingAssetKey, setRemovingAssetKey] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 4500);
  };

  const loadTasks = useCallback(async () => {
    if (!uid) return;
    setLoadingTasks(true);
    try {
      const res = await authFetch(`/api/tasks?employer_id=${encodeURIComponent(uid)}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } finally {
      setLoadingTasks(false);
    }
  }, [uid, authFetch]);

  const loadSubmissions = useCallback(async () => {
    if (!uid) return;
    setLoadingSubmissions(true);
    try {
      const res = await authFetch(`/api/submissions?employer_id=${encodeURIComponent(uid)}`);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
      }
    } finally {
      setLoadingSubmissions(false);
    }
  }, [uid, authFetch]);

  const loadWallet = useCallback(async () => {
    if (!uid) return;
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
      // non-fatal
    }
  }, [uid, authFetch]);

  useEffect(() => {
    loadTasks();
    loadSubmissions();
    loadWallet();
    loadVerificationDoc();
  }, [loadTasks, loadSubmissions, loadWallet, loadVerificationDoc]);

  const handleCampaignImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const prev = taskCampaignAsset;
    setCampaignUploading(true);
    setCampaignProgress(0);
    try {
      const asset = await uploadCloudinaryAsset(file, 'campaign-images', {
        onProgress: (pct) => setCampaignProgress(pct),
      });
      if (prev?.public_id) {
        await deleteCloudinaryAsset(prev.public_id, prev.firestoreDocId).catch(() => {});
      }
      setTaskCampaignAsset(asset);
      showFeedback('Campaign image uploaded to Cloudinary.');
    } catch (err: any) {
      showFeedback(err?.message || 'Could not upload campaign image.', 'error');
    } finally {
      setCampaignUploading(false);
    }
  };

  const handleRemoveCampaignImage = async () => {
    if (!taskCampaignAsset?.public_id) {
      setTaskCampaignAsset(null);
      return;
    }
    setRemovingAssetKey('campaign');
    try {
      const res = await deleteCloudinaryAsset(taskCampaignAsset.public_id, taskCampaignAsset.firestoreDocId);
      if (!res.success) {
        showFeedback(res.error || 'Could not remove campaign image.', 'error');
        return;
      }
      setTaskCampaignAsset(null);
      showFeedback('Campaign image removed.');
    } finally {
      setRemovingAssetKey(null);
    }
  };

  const handlePostTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const rewardNum = Number(taskReward);
    const workersNum = parseInt(taskWorkers, 10) || 10;
    if (!taskTitle.trim() || !rewardNum || rewardNum <= 0) {
      showFeedback('Please provide a valid task title and reward amount.', 'error');
      return;
    }

    setPostingTask(true);
    try {
      const res = await authFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle.trim(),
          category: taskCategory,
          reward: rewardNum,
          workersNeeded: workersNum,
          deadline: taskDeadline.trim() || '3 days',
          description: taskInstructions.trim(),
          proofRequired: taskProofReq.trim(),
          campaign_image_url: taskCampaignAsset?.secure_url || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Could not post task.', 'error');
        return;
      }
      showFeedback('Task posted and published to Workers.');
      setPostTaskModalOpen(false);
      setTaskTitle('');
      setTaskInstructions('');
      setTaskCampaignAsset(null);
      await loadTasks();
    } catch (err: any) {
      showFeedback(err?.message || 'Error posting task.', 'error');
    } finally {
      setPostingTask(false);
    }
  };

  const handleApproveSubmission = async (sub: SubmissionItem) => {
    setBusyId(sub.id);
    try {
      const res = await authFetch('/api/submissions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: sub.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Approval failed.', 'error');
        return;
      }
      showFeedback(`Approved ${sub.earner_name} and credited ₦${Number(sub.reward).toLocaleString()}.`);
      await loadSubmissions();
      await loadTasks();
    } catch (err: any) {
      showFeedback(err?.message || 'Approval error.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectSubmission = async (sub: SubmissionItem) => {
    setBusyId(sub.id);
    try {
      const res = await authFetch('/api/submissions/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: sub.id, reason: 'Proof did not meet task requirements' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showFeedback(data?.error || 'Rejection failed.', 'error');
        return;
      }
      showFeedback(`Rejected submission from ${sub.earner_name}.`);
      await loadSubmissions();
    } catch (err: any) {
      showFeedback(err?.message || 'Rejection error.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDepositProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const prev = depositProofAsset;
    setDepositUploading(true);
    setDepositProgress(0);
    try {
      const asset = await uploadCloudinaryAsset(file, 'payment-proofs', {
        onProgress: (pct) => setDepositProgress(pct),
      });
      if (prev?.public_id) {
        await deleteCloudinaryAsset(prev.public_id, prev.firestoreDocId).catch(() => {});
      }
      setDepositProofAsset(asset);
      setDepositProofUrl(asset.secure_url);
      showFeedback('Deposit receipt uploaded.');
    } catch (err: any) {
      showFeedback(err?.message || 'Could not upload receipt.', 'error');
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
          showFeedback(res.error || 'Could not remove receipt.', 'error');
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
    if (!amt || Number.isNaN(amt) || amt <= 0) {
      showFeedback('Enter a valid deposit amount.', 'error');
      return;
    }

    if (depositMethod === 'paystack') {
      setDepositSubmitting(true);
      try {
        const callbackUrl = `${window.location.origin}/verify-payment`;
        const initRes = await initializePaystackPayment(amt, 'deposit', { callback_url: callbackUrl });
        if (!initRes.success || !initRes.authorization_url) {
          console.error('[Employer Deposit Paystack Init Failed]', initRes);
          showFeedback(`Payment init failed: ${initRes.error || 'Missing Paystack authorization URL.'}`, 'error');
          setDepositSubmitting(false);
          return;
        }
        window.location.href = initRes.authorization_url;
      } catch (err: any) {
        console.error('[Employer Deposit Paystack Init Error]', err);
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
        showFeedback(res.error || 'Deposit failed.', 'error');
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
      showFeedback('Please complete bank account details.', 'error');
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
        showFeedback(saved.error || 'Could not save profile photo.', 'error');
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
      showFeedback('Verification document uploaded for admin review.');
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
        showFeedback(res.error || 'Could not remove verification document.', 'error');
        return;
      }
      setVerificationAsset(null);
      showFeedback('Verification document removed.');
    } finally {
      setRemovingAssetKey(null);
    }
  };

  const pendingSubmissionsCount = submissions.filter((s) => s.status === 'pending').length;

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
      {/* Header */}
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
              <span className="ml-2 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold uppercase">
                Employer
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setPostTaskModalOpen(true)}
            className="px-3.5 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Post Task</span>
          </button>

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
            className="w-9 h-9 rounded-full bg-blue-100 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center overflow-hidden"
            title="Account Profile"
          >
            {userProfile?.avatar_url ? (
              <img src={userProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              (userProfile?.name || 'E')[0].toUpperCase()
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

        {/* Wallet & KPI Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-semibold text-slate-500">Wallet Balance</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tabular-nums">
              ₦{walletStats.balance.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-semibold text-slate-500">Total Deposited</p>
            <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 tabular-nums">
              ₦{walletStats.total_deposited.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-semibold text-slate-500">Posted Tasks</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tabular-nums">{tasks.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-semibold text-slate-500">Pending Reviews</p>
            <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1 tabular-nums">
              {pendingSubmissionsCount}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'tasks'
                ? 'bg-[#7C3AED] text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            My Tasks ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('submissions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'submissions'
                ? 'bg-[#7C3AED] text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Worker Submissions ({pendingSubmissionsCount} pending)
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

        {/* TAB 1: EMPLOYER POSTED TASKS */}
        {activeTab === 'tasks' && (
          <div className="space-y-3">
            {loadingTasks ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                <div className="w-7 h-7 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Loading your tasks...</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
                <Briefcase className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">You have not posted any tasks yet</p>
                <button
                  type="button"
                  onClick={() => setPostTaskModalOpen(true)}
                  className="px-4 py-2 bg-[#7C3AED] text-white text-xs font-bold rounded-xl"
                >
                  Post Your First Task
                </button>
              </div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-extrabold text-slate-900">{task.title}</h3>
                      <span className="px-2 py-0.5 rounded-md bg-purple-50 text-[#7C3AED] text-[10px] font-bold">
                        {task.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{task.description}</p>
                    <p className="text-[11px] text-slate-400">
                      Reward: ₦{Number(task.reward).toLocaleString()} • Progress: {task.workers_completed}/
                      {task.workers_needed} workers • Deadline: {task.deadline}
                    </p>
                  </div>
                  {task.campaign_image_url && (
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(task.campaign_image_url || null)}
                      className="shrink-0 overflow-hidden rounded-xl border border-slate-200 hover:border-[#7C3AED] transition"
                      title="Preview campaign image"
                    >
                      <img
                        src={task.campaign_image_url}
                        alt={task.title}
                        className="w-20 h-16 object-cover"
                      />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: WORKER SUBMISSIONS */}
        {activeTab === 'submissions' && (
          <div className="space-y-3">
            {loadingSubmissions ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                <div className="w-7 h-7 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Loading worker submissions...</p>
              </div>
            ) : submissions.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
                <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">No worker submissions yet</p>
              </div>
            ) : (
              submissions.map((sub) => (
                <div
                  key={sub.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-extrabold text-slate-900">{sub.earner_name}</h3>
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
                    <p className="text-xs font-semibold text-slate-700">{sub.task_title}</p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      Reward: ₦{Number(sub.reward).toLocaleString()} • Submitted:{' '}
                      {new Date(sub.created_at).toLocaleString()}
                    </p>
                    {sub.proof_text && <p className="text-xs text-slate-600">Note: {sub.proof_text}</p>}
                    {sub.proof_link && (
                      <a
                        href={sub.proof_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#7C3AED] hover:underline inline-flex items-center gap-1"
                      >
                        <span>Open Proof Link</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {sub.proof_url && (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(sub.proof_url || null)}
                        className="flex items-center gap-2 p-1.5 pr-3 rounded-xl border border-slate-200 hover:border-[#7C3AED] bg-slate-50"
                      >
                        <img
                          src={sub.proof_url}
                          alt="Worker Proof"
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                        />
                        <span className="text-xs font-bold text-[#7C3AED] flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          <span>Proof</span>
                        </span>
                      </button>
                    )}

                    {sub.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === sub.id}
                          onClick={() => handleApproveSubmission(sub)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === sub.id}
                          onClick={() => handleRejectSubmission(sub)}
                          className="px-3.5 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: WALLET & HISTORY */}
        {activeTab === 'wallet' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-500">Available Balance</p>
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
                  className="text-xs font-bold text-[#7C3AED] flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
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
                    setPostTaskModalOpen(true);
                    setSideMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl bg-[#7C3AED] text-white flex items-center gap-2.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Post New Task</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('submissions');
                    setSideMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 flex items-center gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#7C3AED]" />
                  <span>Review Submissions</span>
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
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    switchUserRole('earner');
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 flex items-center gap-2.5"
                >
                  <Briefcase className="w-4 h-4 text-slate-600" />
                  <span>Switch to Worker Mode</span>
                </button>

                {/* Strictly shown ONLY for bunnysusanfabio@gmail.com */}
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

      {/* Post Task Modal */}
      {postTaskModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handlePostTask}
            className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3.5 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Post New Task</h3>
              <button type="button" onClick={() => setPostTaskModalOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Task Title</label>
              <input
                type="text"
                required
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g. Follow Instagram Page & Like Last 2 Posts"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={taskCategory}
                  onChange={(e) => setTaskCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                >
                  <option value="Social Media">Social Media</option>
                  <option value="App Testing">App Testing</option>
                  <option value="Review & Rating">Review & Rating</option>
                  <option value="Surveys">Surveys</option>
                  <option value="Content Creation">Content Creation</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reward per Worker (₦)</label>
                <input
                  type="number"
                  min="50"
                  required
                  value={taskReward}
                  onChange={(e) => setTaskReward(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Workers Needed</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={taskWorkers}
                  onChange={(e) => setTaskWorkers(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deadline</label>
                <input
                  type="text"
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  placeholder="3 days"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Instructions</label>
              <textarea
                rows={3}
                required
                value={taskInstructions}
                onChange={(e) => setTaskInstructions(e.target.value)}
                placeholder="Step-by-step instructions for workers..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Proof Required</label>
              <input
                type="text"
                value={taskProofReq}
                onChange={(e) => setTaskProofReq(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            {/* Advertiser Campaign Image (Cloudinary cdsure/campaign-images/) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Campaign Banner / Reference Image (Optional — JPG, PNG, WEBP, max 10MB)
              </label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-[#7C3AED] rounded-xl p-3.5 cursor-pointer text-center bg-slate-50">
                <ImageIcon className="w-5 h-5 text-[#7C3AED] mb-1" />
                <span className="text-xs font-bold text-slate-700">
                  {campaignUploading
                    ? `Uploading Campaign Image... ${campaignProgress}%`
                    : taskCampaignAsset
                    ? 'Replace Campaign Image'
                    : 'Upload Campaign Image'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={handleCampaignImageFile}
                  disabled={campaignUploading}
                  className="hidden"
                />
              </label>
              {taskCampaignAsset?.secure_url && (
                <div className="mt-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={taskCampaignAsset.secure_url}
                      alt="Campaign"
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                    <span className="text-xs font-bold text-emerald-700 truncate">Campaign image attached</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setLightboxUrl(taskCampaignAsset.secure_url)}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-[#7C3AED]"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      disabled={removingAssetKey === 'campaign'}
                      onClick={handleRemoveCampaignImage}
                      className="px-2.5 py-1 rounded-lg bg-white border border-red-200 text-[11px] font-bold text-red-600 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={postingTask || campaignUploading}
              className="w-full py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs disabled:opacity-50"
            >
              {postingTask ? 'Publishing Task...' : 'Publish Task'}
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

      {/* Account Profile Modal */}
      {accountModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Employer Profile</h3>
              <button type="button" onClick={() => setAccountModalOpen(false)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-700 font-black text-xl flex items-center justify-center overflow-hidden border border-blue-200">
                {userProfile?.avatar_url ? (
                  <img src={userProfile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  (userProfile?.name || 'E')[0].toUpperCase()
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
                <span className="text-slate-500">Status:</span>
                <span className="font-bold text-emerald-700 uppercase">Approved Employer</span>
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
                Upload business registration or government ID image (JPG, PNG, WEBP up to 10MB).
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
              <span className="text-xs font-extrabold text-slate-800">Proof Image Preview</span>
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
