import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client (uses service role — never sent to browser)
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only GET allowed
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Require Authorization header with Supabase JWT
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verify the JWT token against Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        // Check if user account is active
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_active')
            .eq('id', user.id)
            .maybeSingle();

        if (profile?.is_active === false) {
            return res.status(403).json({ error: 'Account is disabled' });
        }

        // Return the API key — it lives only in Vercel environment variables, never in the JS bundle
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(503).json({ error: 'Gemini API key not configured on server' });
        }

        // Cache-Control: private, short-lived (5 min) so it's not stored by intermediaries
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.status(200).json({ key: apiKey });

    } catch (err) {
        console.error('[gemini-key] Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
