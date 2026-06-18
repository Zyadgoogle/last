import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, Plus, Loader2, Tag, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { AddProductModal } from './AddProductModal';
import { CheckoutModal } from './CheckoutModal';

interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    image_url: string;
    category: string;
}

interface ProductStoreProps {
    recommendedCondition?: string | null;
}

export function ProductStore({ recommendedCondition }: ProductStoreProps) {
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdminOrDoctor, setIsAdminOrDoctor] = useState(false);
    
    // Modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [checkoutProduct, setCheckoutProduct] = useState<Product | null>(null);

    const loadProducts = async () => {
        setIsLoading(true);
        try {
            // First check user role
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.user_metadata?.role === 'admin' || user?.user_metadata?.role === 'doctor') {
                setIsAdminOrDoctor(true);
            }

            // Fetch products
            let query = supabase.from('products').select('*').order('created_at', { ascending: false });
            
            // If we have a recommended condition, we could filter or just sort them first.
            // For now, let's just fetch all and display them.
            
            const { data, error } = await query;
            if (error) throw error;
            
            setProducts(data || []);
        } catch (error) {
            console.error("Error loading products:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadProducts();
    }, []);

    // Filter products based on skin type recommendation if applicable
    // But we'll always show all products, just highlight the recommended ones
    const isRecommended = (product: Product) => {
        if (!recommendedCondition || !product.category) return false;
        return recommendedCondition.toLowerCase().includes(product.category.toLowerCase());
    };

    return (
        <div className="bg-white dark:bg-stone-900 border border-stone-150 dark:border-stone-800 rounded-[2.5rem] p-6 md:p-8 shadow-sm">
            <div className="flex justify-between items-end mb-6 border-b border-stone-100 dark:border-stone-800 pb-4">
                <div>
                    <h4 className="text-xl font-bold font-serif text-[#3B302B] dark:text-stone-100 flex items-center gap-2">
                        <ShoppingBag className="w-6 h-6 text-[#8C7A6E]" /> SkinE Pharmacy
                    </h4>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                        Professional clinical-grade products delivered to your door
                    </p>
                </div>
                
                {isAdminOrDoctor && (
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="px-4 py-2 bg-[#8C7A6E] text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[#7a6a5f] transition-colors cursor-pointer border-none"
                    >
                        <Plus className="w-4 h-4" /> Add Product
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-[#8C7A6E] animate-spin mb-4" />
                    <p className="text-sm text-stone-500">Loading products...</p>
                </div>
            ) : products.length === 0 ? (
                <div className="text-center py-12 bg-stone-50 dark:bg-stone-800/40 rounded-2xl border border-dashed border-stone-200 dark:border-stone-700">
                    <ShoppingBag className="w-12 h-12 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-stone-700 dark:text-stone-300">No products available yet</h3>
                    <p className="text-xs text-stone-500 mt-1">Check back soon for our curated clinical selection.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map(product => (
                        <motion.div 
                            key={product.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex flex-col bg-white dark:bg-stone-800 border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all ${isRecommended(product) ? 'border-[#8C7A6E]' : 'border-stone-100 dark:border-stone-700'}`}
                        >
                            <div className="h-48 bg-stone-50 dark:bg-stone-900 relative">
                                {isRecommended(product) && (
                                    <div className="absolute top-3 left-3 bg-[#8C7A6E] text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm z-10">
                                        <ShieldCheck className="w-3 h-3" /> Recommended
                                    </div>
                                )}
                                {product.image_url ? (
                                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <ShoppingBag className="w-12 h-12 text-stone-200 dark:text-stone-700" />
                                    </div>
                                )}
                            </div>
                            
                            <div className="p-4 flex flex-col flex-1">
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100 line-clamp-2">{product.name}</h3>
                                </div>
                                {product.category && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-stone-500 bg-stone-100 dark:bg-stone-700 px-2 py-0.5 rounded-md w-max mb-2">
                                        <Tag className="w-3 h-3" /> {product.category}
                                    </span>
                                )}
                                <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-3 mb-4 flex-1">
                                    {product.description || 'No description available.'}
                                </p>
                                
                                <div className="flex items-center justify-between mt-auto pt-4 border-t border-stone-100 dark:border-stone-700">
                                    <span className="text-lg font-bold text-[#3B302B] dark:text-stone-200">
                                        EGP {product.price}
                                    </span>
                                    <button 
                                        onClick={() => setCheckoutProduct(product)}
                                        className="px-4 py-2 bg-[#4A3C31] text-white rounded-xl text-xs font-bold hover:bg-[#3B302B] transition-colors shadow-sm cursor-pointer border-none"
                                    >
                                        Buy Now
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            <AddProductModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onProductAdded={loadProducts}
            />

            <CheckoutModal
                isOpen={!!checkoutProduct}
                onClose={() => setCheckoutProduct(null)}
                product={checkoutProduct}
            />
        </div>
    );
}
