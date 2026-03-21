/*
 * Copyright (c) 2026 Javier Aldea
 * Todos los derechos reservados.
 * Este software es propiedad de Javier Aldea - Aldea Mas Innovación y Periodismo.
 * Queda prohibida su reproducción, distribución o uso sin autorización expresa.
 */
/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    console.warn("Supabase credentials missing. Cloud persistence will be disabled.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        flowType: 'implicit',
    }
});
