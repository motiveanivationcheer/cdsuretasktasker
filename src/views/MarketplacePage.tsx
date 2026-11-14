import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getPaystackMode } from '../utils/paystackClient';
import {
  ArrowLeft,
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  Download,
  Lock,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  Crown,
  Wrench,
  Trophy,
  GraduationCap,
  Image as ImageIcon,
  Users,
  FileText,
  X,
  ArrowRight,
  AlertCircle,
  KeyRound,
} from 'lucide-react';

interface ProductItem {
  id: string;
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  price_ngn: number;
  vendor_id: string;
  vendor_name: string;
  commission_rate: number;
  r2_file_key: string;
  delivery_type: 'download' | 'tool_access' | 'subscription';
  badge: string;
}

interface OrderItem {
  id: string;
  reference: string;
  product_id: string;
  product_title: string;
  category: string;
  amount: number;
  status: string;
  delivery_unlocked: number;
  download_url?: string;
  created_at: string;
  verified_at?: string;
}

const CATEGORIES = [
  { key: 'all', label: 'All Items' },
  { key: 'digital_product', label: 'Digital Products' },
  { key: 'premium_tool', label: 'Premium Tools' },
  { key: 'football_analysis', label: 'Football Analysis' },
  { key: 'casino_education', label: 'Casino Education' },
  { key: 'screenshot_package', label: 'Screenshot Packages' },
  { key: 'subscription', label: 'Subscriptions' },
  { key: 'vendor_package', label: 'Vendor Packages' },
];

export const MarketplacePage: React.FC = () => {
  const { firebaseUser, userProfile, navigate, initializePaystackPayment } = useAuth();
  const paystackMode = getPaystackMode();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'catalog' | 'purchases'>('catalog');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [checkoutProduct, setCheckoutProduct] = useState<ProductItem | null>(null);
  const [purchasing, setPurchasing] = useState<boolean>(false);
  const [deliveringRef, setDeliveringRef] = useState<string | null>(null);
  const [deliveredAsset, setDeliveredAsset] = useState<any | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadMarketplace = useCallback(async () => {
    setLoading(true);
    try {
      const token = await firebaseUser?.getIdToken().catch(() => '');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/marketplace/products', { headers });
      const data = await res.json();
      if (res.ok && data.success) {
        setProducts(data.products || []);
        setOrders(data.orders || []);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to load marketplace catalog.', 'error');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    loadMarketplace();
  }, [loadMarketplace]);

  const handleBack = () => {
    if (userProfile?.role === 'employer') {
      navigate('/employer-dashboard');
    } else {
      navigate('/earner-dashboard');
    }
  };

  const handleCheckout = async (product: ProductItem) => {
    if (!firebaseUser) {
      showToast('Please sign in first to purchase.', 'error');
      navigate('/login');
      return;
    }

    setPurchasing(true);
    try {
      const purpose = product.category === 'subscription' ? 'subscription' : 'marketplace_purchase';
      const result = await initializePaystackPayment(product.price_ngn, purpose, {
        productId: product.id,
        role: userProfile?.role || 'earner',
      });

      if (result.success && result.authorization_url) {
        showToast('Redirecting to Paystack Secure Checkout...');
        window.location.href = result.authorization_url;
      } else {
        showToast(result.error || 'Could not initialize Paystack checkout.', 'error');
        setPurchasing(false);
      }
    } catch (err: any) {
      showToast(err?.message || 'Checkout initialization error.', 'error');
      setPurchasing(false);
    }
  };

  const handleAccessDelivery = async (reference: string) => {
    if (!firebaseUser) return;
    setDeliveringRef(reference);
    try {
      const token = await firebaseUser.getIdToken().catch(() => '');
      const res = await fetch(`/api/marketplace/deliver?reference=${encodeURIComponent(reference)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Product access locked until payment verifies.', 'error');
        return;
      }

      if (contentType.includes('application/json')) {
        const data = await res.json();
        setDeliveredAsset(data);
        showToast('Verified package unlocked!');
      } else {
        // Direct R2 binary file download
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cdsure_${reference}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast('Package download started from Cloudflare R2!');
      }
    } catch (err: any) {
      showToast(err?.message || 'Delivery check failed.', 'error');
    } finally {
      setDeliveringRef(null);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'digital_product':
        return <FileText className="w-5 h-5 text-[#7C3AED]" />;
      case 'premium_tool':
        return <Wrench className="w-5 h-5 text-blue-600" />;
      case 'football_analysis':
        return <Trophy className="w-5 h-5 text-emerald-600" />;
      case 'casino_education':
        return <GraduationCap className="w-5 h-5 text-amber-600" />;
      case 'screenshot_package':
        return <ImageIcon className="w-5 h-5 text-pink-600" />;
      case 'subscription':
        return <Crown className="w-5 h-5 text-purple-600" />;
      case 'vendor_package':
        return <Users className="w-5 h-5 text-indigo-600" />;
      default:
        return <ShoppingBag className="w-5 h-5 text-[#7C3AED]" />;
    }
  };

  const filteredProducts =
    selectedCategory === 'all'
      ? products
      : products.filter((p) => p.category === selectedCategory);

  const unlockedProductIds = new Set(
    orders.filter((o) => o.delivery_unlocked === 1).map((o) => o.product_id)
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] pb-14 selection:bg-[#7C3AED] selection:text-white">
      {/* Top Navbar */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-base text-[#0f172a] tracking-tight">
                CDSure <span className="text-[#7C3AED]">Marketplace</span>
              </span>
              {paystackMode === 'live' && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  Paystack Live
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Digital Products, Tools, Analytics & Pro Subscriptions
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadMarketplace}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition flex items-center gap-1.5 text-xs font-semibold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Hero Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#4c1d95] p-6 sm:p-7 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-emerald-300 text-[11px] font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Paystack Server-Verified Instant Delivery (Cloudflare R2 + D1)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              CDSure Tasks Premium Marketplace
            </h1>
            <p className="text-xs sm:text-sm text-purple-100/90 leading-relaxed">
              Unlock verified digital playbooks, pro tools, football & probability analytics packages, screenshot kits, vendor toolkits, and VIP Pro memberships using Paystack NGN checkout.
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'catalog'
                  ? 'bg-white text-[#0f172a] shadow-md'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              Browse Catalog ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('purchases')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'purchases'
                  ? 'bg-[#00C3F7] text-white shadow-md'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>My Purchases ({orders.filter((o) => o.delivery_unlocked === 1).length})</span>
            </button>
          </div>
        </div>

        {/* CATALOG VIEW */}
        {activeTab === 'catalog' && (
          <>
            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition border ${
                    selectedCategory === cat.key
                      ? 'bg-[#7C3AED] text-white border-[#7C3AED] shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
                <div className="w-8 h-8 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs font-semibold text-slate-500">Loading Premium Marketplace...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredProducts.map((product) => {
                  const isOwned = unlockedProductIds.has(product.id);
                  const ownedOrder = orders.find((o) => o.product_id === product.id && o.delivery_unlocked === 1);

                  return (
                    <div
                      key={product.id}
                      className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                            {getCategoryIcon(product.category)}
                          </div>
                          <span className="px-2.5 py-1 rounded-full bg-purple-50 text-[#7C3AED] border border-purple-100 text-[10px] font-black uppercase tracking-wider">
                            {product.badge}
                          </span>
                        </div>

                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            {product.categoryLabel} • by {product.vendor_name}
                          </p>
                          <h3 className="text-base font-extrabold text-slate-900 mt-1 leading-snug">
                            {product.title}
                          </h3>
                          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                            {product.description}
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Price (NGN)</span>
                            <p className="text-xl font-black text-slate-900">
                              ₦{Number(product.price_ngn).toLocaleString()}
                            </p>
                          </div>
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                            Paystack Verified
                          </span>
                        </div>

                        {isOwned && ownedOrder ? (
                          <button
                            type="button"
                            onClick={() => handleAccessDelivery(ownedOrder.reference)}
                            disabled={deliveringRef === ownedOrder.reference}
                            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                            <span>
                              {deliveringRef === ownedOrder.reference ? 'Fetching Asset...' : 'Access Purchased Package'}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCheckoutProduct(product)}
                            className="w-full py-3 px-4 bg-[#00C3F7] hover:bg-[#00B4E3] text-white font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-md shadow-[#00C3F7]/20 transition cursor-pointer"
                          >
                            <CreditCard className="w-4 h-4" />
                            <span>Buy with Paystack — ₦{Number(product.price_ngn).toLocaleString()}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* MY PURCHASES & DELIVERIES VIEW */}
        {activeTab === 'purchases' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Verified Marketplace Purchases</h2>
                <p className="text-xs text-slate-500">
                  Products unlock strictly after server-side Paystack transaction verification.
                </p>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No marketplace purchases yet</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('catalog')}
                  className="px-4 py-2 bg-[#7C3AED] text-white text-xs font-bold rounded-xl"
                >
                  Explore Marketplace
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((ord) => {
                  const unlocked = ord.delivery_unlocked === 1 && (ord.status === 'delivered' || ord.status === 'paid');
                  return (
                    <div
                      key={ord.reference}
                      className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900">{ord.product_title}</span>
                          {unlocked ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Delivered
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              {ord.status}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                          Ref: {ord.reference} • ₦{Number(ord.amount).toLocaleString()}
                        </p>
                      </div>

                      {unlocked ? (
                        <button
                          type="button"
                          onClick={() => handleAccessDelivery(ord.reference)}
                          disabled={deliveringRef === ord.reference}
                          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shrink-0 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{deliveringRef === ord.reference ? 'Opening...' : 'Download / Access'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate(`/verify-payment?reference=${encodeURIComponent(ord.reference)}`)}
                          className="px-4 py-2.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs shrink-0 transition"
                        >
                          Verify Payment Status
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* CHECKOUT CONFIRMATION MODAL */}
      {checkoutProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#7C3AED]" />
                <h3 className="font-black text-base text-slate-900">Confirm Paystack Checkout</h3>
              </div>
              <button
                type="button"
                onClick={() => !purchasing && setCheckoutProduct(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <p className="font-extrabold text-sm text-slate-900">{checkoutProduct.title}</p>
              <p className="text-slate-500">Vendor: {checkoutProduct.vendor_name}</p>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-slate-600">
                <span>Platform Split (30%):</span>
                <span className="font-bold">
                  ₦{Math.round(checkoutProduct.price_ngn * 0.3).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Vendor Payout (70%):</span>
                <span className="font-bold">
                  ₦{Math.round(checkoutProduct.price_ngn * 0.7).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black text-[#7C3AED]">
                <span>Total Due (NGN):</span>
                <span>₦{Number(checkoutProduct.price_ngn).toLocaleString()}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed text-center">
              Delivery is unlocked immediately after Paystack verifies your payment server-side.
            </p>

            <div className="flex gap-2.5">
              <button
                type="button"
                disabled={purchasing}
                onClick={() => setCheckoutProduct(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={purchasing}
                onClick={() => handleCheckout(checkoutProduct)}
                className="flex-2 py-3 px-5 bg-[#00C3F7] hover:bg-[#00B4E3] text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {purchasing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <span>Pay ₦{Number(checkoutProduct.price_ngn).toLocaleString()}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VERIFIED DIGITAL DELIVERY ACCESS MODAL */}
      {deliveredAsset && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-black text-slate-900">Verified Package Unlocked</h3>
              <p className="text-xs text-slate-500 mt-1">{deliveredAsset.product?.title}</p>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-emerald-800 font-semibold">License Key:</span>
                <span className="font-mono font-black text-emerald-950">
                  {deliveredAsset.accessPayload?.licenseKey}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-800 font-semibold">R2 Asset Key:</span>
                <span className="font-mono text-emerald-900 truncate max-w-[180px]">
                  {deliveredAsset.product?.r2_file_key || 'Instant Access'}
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 pt-2 border-t border-emerald-200 leading-relaxed">
                {deliveredAsset.accessPayload?.instructions}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDeliveredAsset(null)}
              className="w-full py-3 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold text-white z-50 flex items-center gap-2 ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
};
