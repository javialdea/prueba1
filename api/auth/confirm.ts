import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { token_hash, type } = req.query;

    // Validate required parameters
    if (!token_hash || !type || type !== 'recovery') {
        return res.redirect(303, '/#/auth-error?error=invalid_token');
    }

    // Create Supabase client with service role key (server-side only)
    const supabase = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        // Verify the OTP token
        const { error } = await supabase.auth.verifyOtp({
            token_hash: token_hash as string,
            type: 'recovery',
        });

        if (error) {
            console.error('[Auth Confirm] Token verification failed:', error);
            return res.redirect(303, '/#/auth-error?error=token_expired');
        }

        // Token valid → redirect to password reset page
        return res.redirect(303, '/#/reset-password');
    } catch (err) {
        console.error('[Auth Confirm] Server error:', err);
        return res.redirect(303, '/#/auth-error?error=server_error');
    }
}
