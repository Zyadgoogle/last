import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, ShoppingBag, CreditCard, Wallet, Banknote } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CheckoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: any;
}

export function CheckoutModal({ isOpen, onClose, product }: CheckoutModalProps) {
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cod' | 'vodafone_cash' | 'instapay'>('cod');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Please log in to place an order.");

            const { error: orderError } = await supabase
                .from('orders')
                .insert({
                    user_id: user.id,
                    product_id: product.id,
                    address,
                    phone,
                    payment_method: paymentMethod,
                    status: 'pending'
                });

            if (orderError) throw new Error(orderError.message);

            setStep('success');

        } catch (err: any) {
            setError(err.message || 'Checkout failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !product) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="bg-white dark:bg-stone-900 w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden"
                >
                    <div className="flex justify-between items-center p-6 border-b border-stone-100 dark:border-stone-800">
                        <h2 className="text-xl font-bold text-[#3B302B] dark:text-stone-100 flex items-center gap-2 font-serif">
                            <ShoppingBag className="w-5 h-5 text-[#8C7A6E]" /> Checkout
                        </h2>
                        <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors text-stone-500 cursor-pointer border-none bg-transparent">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6">
                        {step === 'form' ? (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Product Summary */}
                                <div className="flex gap-4 p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-100 dark:border-stone-800">
                                    {product.image_url ? (
                                        <img src={product.image_url} alt={product.name} className="w-16 h-16 object-cover rounded-xl" />
                                    ) : (
                                        <div className="w-16 h-16 bg-stone-200 dark:bg-stone-700 rounded-xl" />
                                    )}
                                    <div>
                                        <h3 className="text-sm font-bold text-stone-800 dark:text-stone-200">{product.name}</h3>
                                        <p className="text-[#8C7A6E] font-bold mt-1">EGP {product.price}</p>
                                    </div>
                                </div>

                                {/* Shipping Info */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2">Delivery Address</label>
                                        <textarea required value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:border-[#8C7A6E] outline-none text-sm resize-none dark:text-white" placeholder="Full shipping address..." />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2">Phone Number</label>
                                        <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:border-[#8C7A6E] outline-none text-sm dark:text-white" placeholder="01X XXXX XXXX" />
                                    </div>
                                </div>

                                {/* Payment Method */}
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2">Payment Method</label>
                                    <div className="space-y-2">
                                        <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${paymentMethod === 'cod' ? 'border-[#8C7A6E] bg-stone-50 dark:bg-[#8C7A6E]/10' : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'}`}>
                                            <input type="radio" name="payment" value="cod" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} className="accent-[#8C7A6E]" />
                                            <Banknote className="w-5 h-5 text-stone-600 dark:text-stone-400" />
                                            <span className="text-sm font-medium text-stone-700 dark:text-stone-300">Cash on Delivery</span>
                                        </label>
                                        <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${paymentMethod === 'vodafone_cash' ? 'border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'}`}>
                                            <input type="radio" name="payment" value="vodafone_cash" checked={paymentMethod === 'vodafone_cash'} onChange={() => setPaymentMethod('vodafone_cash')} className="accent-red-500" />
                                            <Wallet className="w-5 h-5 text-red-500" />
                                            <span className="text-sm font-medium text-stone-700 dark:text-stone-300">Vodafone Cash</span>
                                        </label>
                                        <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${paymentMethod === 'instapay' ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/10' : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'}`}>
                                            <input type="radio" name="payment" value="instapay" checked={paymentMethod === 'instapay'} onChange={() => setPaymentMethod('instapay')} className="accent-purple-600" />
                                            <CreditCard className="w-5 h-5 text-purple-600" />
                                            <span className="text-sm font-medium text-stone-700 dark:text-stone-300">InstaPay</span>
                                        </label>
                                    </div>
                                </div>

                                {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

                                <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-[#4A3C31] text-white rounded-xl font-bold uppercase tracking-wider text-sm shadow-md hover:bg-[#3B302B] transition-colors disabled:opacity-70 cursor-pointer border-none">
                                    {isSubmitting ? 'Processing...' : 'Confirm Order'}
                                </button>
                            </form>
                        ) : (
                            <div className="text-center py-8 space-y-4">
                                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                                <div>
                                    <h3 className="text-2xl font-bold text-stone-800 dark:text-stone-100 font-serif mb-2">Order Placed!</h3>
                                    <p className="text-stone-500 dark:text-stone-400 text-sm">
                                        Your order for <span className="font-bold text-stone-700 dark:text-stone-300">{product.name}</span> has been received.
                                    </p>
                                </div>
                                
                                {paymentMethod !== 'cod' && (
                                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-xl mt-4 text-left">
                                        <p className="text-xs font-bold uppercase tracking-wider text-yellow-800 dark:text-yellow-500 mb-1">Action Required</p>
                                        <p className="text-sm text-yellow-700 dark:text-yellow-400">
                                            Please transfer <strong>EGP {product.price}</strong> via {paymentMethod === 'vodafone_cash' ? 'Vodafone Cash to 010XXXXXXXX' : 'InstaPay to skine@instapay'}. We will process your order once payment is confirmed.
                                        </p>
                                    </div>
                                )}

                                <button onClick={onClose} className="mt-6 px-8 py-3 bg-[#4A3C31] text-white rounded-xl font-bold text-sm hover:bg-[#3B302B] cursor-pointer border-none">
                                    Continue Shopping
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
