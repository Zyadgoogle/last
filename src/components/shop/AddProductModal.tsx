import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Loader2, ImagePlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AddProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProductAdded: () => void;
}

export function AddProductModal({ isOpen, onClose, onProductAdded }: AddProductModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [category, setCategory] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Must be logged in");

            let imageUrl = null;

            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError, data } = await supabase.storage
                    .from('products')
                    .upload(filePath, imageFile);

                if (uploadError) {
                    console.error("Storage upload error:", uploadError);
                    throw new Error(`Image upload failed: ${uploadError.message}`);
                }
                
                const { data: { publicUrl } } = supabase.storage
                    .from('products')
                    .getPublicUrl(filePath);
                imageUrl = publicUrl;
            }

            const { error: insertError } = await supabase
                .from('products')
                .insert({
                    name,
                    description,
                    price: parseFloat(price),
                    category,
                    image_url: imageUrl,
                    created_by: user.id
                });

            if (insertError) {
                console.error("DB insert error:", insertError);
                throw new Error(`Failed to save product: ${insertError.message}`);
            }

            // Reset form
            setName('');
            setDescription('');
            setPrice('');
            setCategory('');
            setImageFile(null);
            setImagePreview(null);
            
            onProductAdded();
            onClose();

        } catch (err: any) {
            setError(err.message || "An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white dark:bg-stone-900 w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[90vh]"
                >
                    <div className="flex justify-between items-center p-6 border-b border-stone-100 dark:border-stone-800">
                        <h2 className="text-xl font-bold text-[#3B302B] dark:text-stone-100 font-serif">Add New Product</h2>
                        <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors text-stone-500 cursor-pointer border-none bg-transparent">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Image Upload */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">Product Image</label>
                                <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
                                <button 
                                    type="button" 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full h-40 border-2 border-dashed border-stone-200 dark:border-stone-700 hover:border-[#8C7A6E] rounded-2xl flex flex-col items-center justify-center gap-2 overflow-hidden transition-colors cursor-pointer bg-stone-50 dark:bg-stone-800/40"
                                >
                                    {imagePreview ? (
                                        <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                                    ) : (
                                        <>
                                            <ImagePlus className="w-8 h-8 text-stone-400" />
                                            <span className="text-sm font-medium text-stone-500">Click to upload image</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Name */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">Product Name</label>
                                <input 
                                    type="text" 
                                    required
                                    value={name} 
                                    onChange={e => setName(e.target.value)} 
                                    className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:border-[#8C7A6E] focus:ring-1 focus:ring-[#8C7A6E] outline-none transition-colors dark:text-white"
                                    placeholder="e.g. CeraVe Hydrating Cleanser"
                                />
                            </div>

                            {/* Category & Price */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">Category (Skin Type)</label>
                                    <select 
                                        value={category} 
                                        onChange={e => setCategory(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:border-[#8C7A6E] outline-none transition-colors dark:text-white"
                                    >
                                        <option value="">General</option>
                                        <option value="Normal">Normal</option>
                                        <option value="Dry">Dry</option>
                                        <option value="Oily">Oily</option>
                                        <option value="Combination">Combination</option>
                                        <option value="Acne">Acne</option>
                                        <option value="Sensitive">Sensitive</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">Price (EGP)</label>
                                    <input 
                                        type="number" 
                                        required
                                        min="0"
                                        step="0.01"
                                        value={price} 
                                        onChange={e => setPrice(e.target.value)} 
                                        className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:border-[#8C7A6E] outline-none transition-colors dark:text-white"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">Description</label>
                                <textarea 
                                    rows={3}
                                    value={description} 
                                    onChange={e => setDescription(e.target.value)} 
                                    className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:border-[#8C7A6E] outline-none transition-colors resize-none dark:text-white"
                                    placeholder="Product description..."
                                />
                            </div>

                            {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

                            <div className="pt-4 flex gap-3">
                                <button 
                                    type="button" 
                                    onClick={onClose}
                                    className="flex-1 py-3 px-4 border border-stone-200 dark:border-stone-700 rounded-xl text-stone-600 dark:text-stone-300 font-bold text-sm bg-transparent cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="flex-1 py-3 px-4 bg-[#4A3C31] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer border-none"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    Save Product
                                </button>
                            </div>
                        </form>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
