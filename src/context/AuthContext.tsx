import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'user' | 'admin' | 'doctor';
    bio?: string;
    date?: string;
    lastActive?: string;
    count?: number;
    status?: string;
    phone?: string;
    gender?: 'male' | 'female' | 'other';
    dob?: string;
    avatar?: string;
    notifications?: {
        scanReminders: boolean;
        protocolNotifications: boolean;
        productUpdates: boolean;
    };
}

interface ScanResult {
    id: string;
    date: string;
    type: string;
    result: string;
    score: number;
}

export interface Activity {
    id: string;
    type: 'scan' | 'profile' | 'security' | 'admin';
    title: string;
    description: string;
    date: string;
    icon: 'Activity' | 'User' | 'Shield' | 'Settings';
}

interface AuthContextType {
    user: User | null;
    users: User[];
    history: ScanResult[];
    activities: Activity[];
    loading: boolean;
    refreshUsers: () => Promise<void>;
    refreshAdminData: () => Promise<void>;
    login: (email: string, password?: string) => Promise<User | null>;
    loginWithGoogle: () => Promise<void>;
    signup: (email: string, password?: string, name?: string, metadata?: Partial<User>) => Promise<any>;
    logout: () => Promise<void>;
    terminateAccount: () => Promise<void>;
    updateProfile: (newData: Partial<User>, activityTitle?: string) => Promise<void>;
    updateUserRole: (userId: string, newRole: 'user' | 'admin' | 'doctor') => Promise<void>;
    deleteUser: (userId: string) => void;
    addAnalysisResult: (result: Omit<ScanResult, 'id' | 'date'>) => Promise<void>;
    addActivity: (activity: Omit<Activity, 'id' | 'date'>) => Promise<void>;
    isAuthenticated: boolean;
    resetPassword: (email: string) => Promise<void>;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(() => {
        try {
            const savedUser = localStorage.getItem('auth_user');
            return savedUser ? JSON.parse(savedUser) : null;
        } catch {
            return null;
        }
    });
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<User[]>([]);
    const [history, setHistory] = useState<ScanResult[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);

    const getRoleFromEmail = (email?: string): User['role'] => {
        const normalizedEmail = email?.toLowerCase() || '';
        if (normalizedEmail.includes('admin')) return 'admin';
        if (normalizedEmail.endsWith('@clinical.com')) return 'doctor';
        return 'user';
    };

    const normalizeRole = (role?: string | null): User['role'] | null => {
        if (role === 'admin' || role === 'doctor' || role === 'user') return role;
        return null;
    };

    const resolveRole = (sbUser: SupabaseUser, dbProfile: any = null): User['role'] => {
        const emailRole = getRoleFromEmail(sbUser.email);
        const metadataRole = normalizeRole(sbUser.user_metadata?.role);
        const profileRole = normalizeRole(dbProfile?.role);

        if (emailRole === 'admin') return 'admin';
        if (metadataRole === 'admin') return 'admin';
        if (emailRole === 'doctor') return 'doctor';
        if (metadataRole === 'doctor') return 'doctor';

        return profileRole || metadataRole || emailRole;
    };

    const getFriendlyAuthMessage = (message: string) => {
        const normalizedMessage = message.toLowerCase();
        if (normalizedMessage.includes('invalid login credentials')) {
            return 'Invalid email or password.';
        }
        if (normalizedMessage.includes('email not confirmed')) {
            return 'Please confirm your email address before logging in.';
        }
        return message;
    };

    const withTimeout = async <T,>(promise: Promise<T>, message: string, ms = 15000): Promise<T> => {
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeout = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(message)), ms);
        });

        try {
            return await Promise.race([promise, timeout]);
        } finally {
            clearTimeout(timeoutId!);
        }
    };

    const mapProfileToUser = (profile: any): User => ({
        id: profile.id,
        name: profile.name || profile.email?.split('@')[0] || 'Clinical User',
        email: profile.email || '',
        role: normalizeRole(profile.role) || 'user',
        bio: profile.bio || '',
        date: profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown',
        lastActive: profile.last_sign_in_at ? new Date(profile.last_sign_in_at).toLocaleString() : 'Never',
        status: 'Active',
        phone: profile.phone || '',
        gender: profile.gender || undefined,
        dob: profile.dob || '',
        avatar: profile.avatar_url || 'female',
        notifications: profile.notifications || {
            scanReminders: true,
            protocolNotifications: true,
            productUpdates: true
        }
    });

    const refreshUsers = async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('User directory refresh failed:', error.message);
            throw error;
        }

        setUsers((data || []).map(mapProfileToUser));
    };

    const recordActivityForUser = async (userId: string, activity: Omit<Activity, 'id' | 'date'>) => {
        const { data, error } = await supabase.from('activities').insert({
            user_id: userId,
            type: activity.type,
            title: activity.title,
            description: activity.description,
            icon: activity.icon
        }).select().single();

        if (error) {
            console.warn('Activity logging failed:', error.message);
            return null;
        }

        return data;
    };

    const refreshAdminData = async () => {
        if (!user) return;
        await fetchPersistentData(user.id, user.role);
    };

    const fetchPersistentData = async (userId: string, role: string) => {
        try {
            // 1. Fetch History
            let historyQuery = supabase
                .from('analysis_history')
                .select('*')
                .order('date', { ascending: false });

            if (role !== 'admin') {
                historyQuery = historyQuery.eq('user_id', userId).limit(50);
            }

            const { data: historyData } = await historyQuery;

            if (historyData) setHistory(historyData);

            // 2. Fetch Activity Logs (limited)
            let activityQuery = supabase
                .from('activities')
                .select('*')
                .order('date', { ascending: false });

            if (role !== 'admin') {
                activityQuery = activityQuery.eq('user_id', userId).limit(50);
            }

            const { data: activityData } = await activityQuery;

            if (activityData) setActivities(activityData);

            // 3. Admin: Fetch All Users from Profiles Table
            if (role === 'admin') {
                await refreshUsers();
            }
        } catch (err) {
            console.warn('Persistence fetch failed.', err);
        }
    };

    useEffect(() => {
        const setupAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const mappedUser = mapSupabaseUser(session.user);
                if (mappedUser) {
                    hydrateSupabaseUserInBackground(session.user);
                }
            } else {
                setUser(null);
                localStorage.removeItem('auth_user');
            }
            setLoading(false);
        };

        setupAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                if (session.user.identities && session.user.identities.length === 0) {
                    setUser(null);
                    localStorage.removeItem('auth_user');
                    setLoading(false);
                    return;
                }

                const mappedUser = mapSupabaseUser(session.user);
                if (mappedUser) {
                    hydrateSupabaseUserInBackground(session.user);
                }
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
                setUsers([]);
                setHistory([]);
                setActivities([]);
                localStorage.removeItem('auth_user');
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const mapSupabaseUser = (sbUser: SupabaseUser, dbProfile: any = null) => {
        if (sbUser.identities && sbUser.identities.length === 0) return null;

        const finalRole = resolveRole(sbUser, dbProfile);

        const mappedUser: User = {
            id: sbUser.id,
            email: sbUser.email || '',
            name: dbProfile?.name || sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'Clinical User',
            role: finalRole,
            date: new Date(sbUser.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
            lastActive: sbUser.last_sign_in_at || new Date().toISOString(),
            count: 0,
            status: 'Active',
            phone: dbProfile?.phone || sbUser.user_metadata?.phone,
            gender: dbProfile?.gender || sbUser.user_metadata?.gender || sbUser.user_metadata?.avatar,
            dob: dbProfile?.dob || sbUser.user_metadata?.dob,
            avatar: dbProfile?.avatar_url || sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.avatar || 'female',
            notifications: dbProfile?.notifications || sbUser.user_metadata?.notifications || {
                scanReminders: true,
                protocolNotifications: true,
                productUpdates: true
            }
        };

        setUser(mappedUser);
        localStorage.setItem('auth_user', JSON.stringify(mappedUser));

        return mappedUser;
    };

    const hydrateSupabaseUser = async (sbUser: SupabaseUser) => {
        // Fetch database profile to obtain persistent role & settings
        let dbProfile: any = null;
        const { data, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', sbUser.id)
            .maybeSingle();

        if (!profileError) {
            dbProfile = data;
        } else {
            console.warn('Profile lookup failed:', profileError.message);
        }

        const mappedUser = mapSupabaseUser(sbUser, dbProfile);
        if (!mappedUser) return null;

        const { error: profileSyncError } = await supabase.from('profiles').upsert({
            id: sbUser.id,
            name: mappedUser.name,
            email: mappedUser.email,
            role: mappedUser.role,
            last_sign_in_at: new Date().toISOString(),
            // phone, gender, notifications, dob are stored in auth user_metadata, not in profiles table
            avatar_url: mappedUser.avatar
        });

        if (profileSyncError) {
            console.warn('Profile sync failed:', profileSyncError.message);
        }

        return mappedUser;
    };

    const hydrateSupabaseUserInBackground = (sbUser: SupabaseUser) => {
        setTimeout(() => {
            hydrateSupabaseUser(sbUser)
                .then(mappedUser => {
                    if (mappedUser) fetchPersistentData(sbUser.id, mappedUser.role);
                })
                .catch(err => console.warn('Profile hydration failed:', err));
        }, 0);
    };

    const login = async (email: string, password?: string) => {
        setLoading(true);
        try {
            const { data, error } = await withTimeout(
                supabase.auth.signInWithPassword({
                    email,
                    password: password || '',
                }),
                'Login is taking too long. Please check your internet connection and try again.'
            );

            if (error) {
                throw new Error(getFriendlyAuthMessage(error.message));
            }

            if (data.user) {
                const mappedUser = mapSupabaseUser(data.user);
                if (mappedUser) {
                    hydrateSupabaseUserInBackground(data.user);
                    recordActivityForUser(data.user.id, {
                        type: 'security',
                        title: 'User Login',
                        description: `${mappedUser.name} signed in as ${mappedUser.role}.`,
                        icon: 'Shield'
                    });
                    return mappedUser;
                }
            }
            throw new Error('Authentication failed. Please check your credentials.');
        } catch (err) {
            console.error('Login error:', err);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const loginWithGoogle = async () => {
        const redirectTo = `${window.location.origin}/dashboard`;
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo },
        });
        if (error) throw error;
    };

    const signup = async (email: string, password?: string, name?: string, metadata?: Partial<User>) => {
        setLoading(true);
        try {
            const role = getRoleFromEmail(email);
            const response = await supabase.auth.signUp({
                email,
                password: password,
                options: {
                    data: {
                        full_name: name,
                        role,
                        phone: metadata?.phone,
                        gender: metadata?.gender || metadata?.avatar,
                        dob: metadata?.dob,
                        avatar_url: metadata?.avatar || 'female'
                    }
                }
            });

            const { data, error } = response;

            if (error) {
                throw error;
            }

            if (data.user) {
                if (!data.user.identities || data.user.identities.length === 0) {
                    setUser(null);
                    localStorage.removeItem('auth_user');
                    throw new Error('This email is already registered. Please log in instead.');
                }
                const mappedUser = mapSupabaseUser(data.user);
                if (mappedUser) {
                    hydrateSupabaseUserInBackground(data.user);
                    await recordActivityForUser(data.user.id, {
                        type: 'profile',
                        title: 'Profile Created',
                        description: `${mappedUser.name} joined the network with ${mappedUser.phone || 'no phone'} recorded.`,
                        icon: 'User'
                    });
                }
            }

            return response;
        } catch (err) {
            console.error('Signup error:', err);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const resetPassword = async (email: string) => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/login`,
            });
            if (error) throw error;
        } catch (err) {
            console.error('Reset password error:', err);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        // Clear local state immediately for instant logout
        setUser(null);
        setUsers([]);
        setHistory([]);
        setActivities([]);
        localStorage.removeItem('auth_user');

        // Sign out from Supabase in background (non-blocking)
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error('Supabase sign out error:', err);
        }
    };

    const terminateAccount = async () => {
        if (!user) return;
        try {
            // Delete user profile and related data from database
            await supabase.from('profiles').delete().eq('id', user.id);
            await supabase.from('analysis_history').delete().eq('user_id', user.id);
            await supabase.from('activities').delete().eq('user_id', user.id);

            // Sign out and delete auth user
            await supabase.auth.admin.deleteUser(user.id);

            // Clear local state
            setUser(null);
            setUsers([]);
            setHistory([]);
            setActivities([]);
            localStorage.removeItem('auth_user');
        } catch (err: any) {
            // If admin delete fails (e.g., in browser), try regular signout
            console.warn('Account termination error:', err.message);
            // Fallback: just sign out since we deleted the profile data
            await supabase.auth.signOut();
            setUser(null);
            setUsers([]);
            setHistory([]);
            setActivities([]);
            localStorage.removeItem('auth_user');
            throw new Error('Account termination initiated. Your account and data will be removed.');
        }
    };

    const updateProfile = async (newData: Partial<User>, activityTitle?: string) => {
        if (!user) return;
        try {
            await supabase.auth.updateUser({
                email: newData.email || user.email,
                data: {
                    full_name: newData.name || user.name,
                    bio: newData.bio || user.bio,
                    notifications: newData.notifications || user.notifications,
                    phone: newData.phone || user.phone,
                    gender: newData.gender || user.gender,
                    dob: newData.dob || user.dob,
                    avatar_url: newData.avatar || user.avatar
                }
            });
            await supabase.from('profiles').update({
                name: newData.name || user.name,
                email: newData.email || user.email,
                bio: newData.bio || user.bio,
                // phone, gender, notifications, dob are stored in auth user_metadata, not in profiles table
                avatar_url: newData.avatar || user.avatar
            }).eq('id', user.id);

            const updated = { ...user, ...newData };
            setUser(updated);
            if (activityTitle) addActivity({ type: 'profile', title: activityTitle, description: 'Synchronized.', icon: 'User' });
        } catch (err) {
            console.error('Persistence update failed:', err);
        }
    };

    const updateUserRole = async (userId: string, newRole: 'user' | 'admin' | 'doctor') => {
        try {
            const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
            if (error) throw error;
            const targetUser = users.find(u => u.id === userId);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
            if (user) {
                await recordActivityForUser(user.id, {
                    type: 'admin',
                    title: 'Access Role Updated',
                    description: `${user.name} changed ${targetUser?.email || userId} to ${newRole}.`,
                    icon: 'Settings'
                });
            }
            if (user && user.id === userId) {
                const updatedUser = { ...user, role: newRole };
                setUser(updatedUser);
                localStorage.setItem('auth_user', JSON.stringify(updatedUser));
            }
        } catch (err) {
            console.error('Role update failed:', err);
            throw err;
        }
    };

    const deleteUser = async (userId: string) => {
        const targetUser = users.find(u => u.id === userId);
        const { error } = await supabase.from('profiles').delete().eq('id', userId);
        if (error) throw error;
        setUsers(prev => prev.filter(u => u.id !== userId));
        if (user) {
            await recordActivityForUser(user.id, {
                type: 'admin',
                title: 'Profile Removed',
                description: `${user.name} removed ${targetUser?.email || userId} from the directory.`,
                icon: 'Settings'
            });
        }
    };

    const addActivity = async (activity: Omit<Activity, 'id' | 'date'>) => {
        if (!user) return;
        const data = await recordActivityForUser(user.id, activity);

        if (true) {
            const newAct: Activity = {
                id: data.id,
                type: data.type,
                title: data.title,
                description: data.description,
                date: new Date(data.date).toLocaleDateString(),
                icon: data.icon
            };
            setActivities(prev => [newAct, ...prev]);
        }
    };

    const addAnalysisResult = async (result: Omit<ScanResult, 'id' | 'date'>) => {
        if (!user) return;
        
        try {
            const { data, error } = await supabase.from('analysis_history').insert({
                user_id: user.id,
                type: result.type,
                result: result.result,
                score: result.score
            }).select().single();

            if (error) {
                console.error("Database Error inserting scan result:", error.message);
                // Fallback to local only if DB fails
                const newRes: ScanResult = {
                    id: `local-${Date.now()}`,
                    date: new Date().toLocaleDateString(),
                    type: result.type,
                    result: result.result,
                    score: result.score
                };
                setHistory(prev => [newRes, ...prev]);
                return;
            }

            if (data) {
                const newRes: ScanResult = {
                    id: data.id,
                    date: new Date(data.date || data.created_at || Date.now()).toLocaleDateString(),
                    type: data.type || result.type,
                    result: data.result || result.result,
                    score: data.score || result.score
                };
                setHistory(prev => [newRes, ...prev]);
                await recordActivityForUser(user.id, {
                    type: 'scan',
                    title: 'Clinical Analysis Recorded',
                    description: `${result.type} analysis saved with score ${result.score}.`,
                    icon: 'Activity'
                });
            }
        } catch (err) {
            console.error("Exception saving analysis result:", err);
        }
    };

    return (
        <AuthContext.Provider value={{
            user, users, history, activities, loading, refreshUsers, refreshAdminData, login, signup, logout, terminateAccount, resetPassword,
            loginWithGoogle, updateProfile, updateUserRole, deleteUser, addAnalysisResult, addActivity,
            isAuthenticated: !!user, isAdmin: user?.role === 'admin'
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
    return context;
}
