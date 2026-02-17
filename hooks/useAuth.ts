import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Session } from '@supabase/supabase-js';

export const useAuth = () => {
    const [session, setSession] = useState<Session | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) setIsAuthOpen(false);
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            if (session) setIsAuthOpen(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!session?.user) {
                const storedKey = localStorage.getItem('GEMINI_API_KEY');
                if (storedKey) setApiKey(storedKey);
                setIsAdmin(false);
                return;
            }

            const { data, error } = await supabase
                .from('profiles')
                .select('gemini_api_key, is_admin, is_active')
                .eq('id', session.user.id)
                .maybeSingle();

            if (!error && data) {
                // Priority 1: User API Key (Legacy/Backup)
                if (data.gemini_api_key) {
                    setApiKey(data.gemini_api_key);
                    localStorage.setItem('GEMINI_API_KEY', data.gemini_api_key);
                } else {
                    const storedKey = localStorage.getItem('GEMINI_API_KEY');
                    if (storedKey) setApiKey(storedKey);
                }

                setIsAdmin(data.is_admin || false);

                // Priority 2: Global API Key (Overrides user-specific if exists)
                const { data: appData } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('id', 'gemini_api_key')
                    .maybeSingle();

                if (appData?.value) {
                    setApiKey(appData.value);
                }

                if (data.is_active === false) {
                    await supabase.auth.signOut();
                    setSession(null);
                    setIsAdmin(false);
                    alert('Tu cuenta ha sido desactivada. Contacta con un administrador.');
                    window.location.href = '/';
                }
            } else {
                const storedKey = localStorage.getItem('GEMINI_API_KEY');
                if (storedKey) setApiKey(storedKey);
                setIsAdmin(false);
            }
        };

        fetchProfile();
    }, [session]);

    const logout = async () => {
        await supabase.auth.signOut();
        setSession(null);
        setIsAdmin(false);
        setIsAuthOpen(false);
        window.location.reload();
    };

    return {
        session,
        isAdmin,
        apiKey,
        setApiKey,
        isAuthOpen,
        setIsAuthOpen,
        logout,
        loading
    };
};
