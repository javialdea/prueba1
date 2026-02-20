import { useEffect, useRef } from 'react';

/**
 * useWakeLock — Prevents the mobile screen from turning off while `isActive` is true.
 * Uses the Screen Wake Lock API (natively supported in Chrome/Android and Safari 16.4+).
 * Silently falls back on unsupported browsers without throwing errors.
 */
export const useWakeLock = (isActive: boolean) => {
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);

    const requestWakeLock = async () => {
        if (!('wakeLock' in navigator)) return; // Not supported
        try {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
            console.log('[WakeLock] Screen wake lock acquired.');

            // Handle the case where the OS forcibly releases it (e.g. battery saver)
            wakeLockRef.current.addEventListener('release', () => {
                console.log('[WakeLock] Wake lock was released by the system.');
            });
        } catch (err) {
            // Ignore — can happen if document is not visible yet
            console.warn('[WakeLock] Could not acquire wake lock:', err);
        }
    };

    const releaseWakeLock = async () => {
        if (wakeLockRef.current) {
            try {
                await wakeLockRef.current.release();
                console.log('[WakeLock] Screen wake lock released.');
            } catch (err) {
                console.warn('[WakeLock] Error releasing wake lock:', err);
            }
            wakeLockRef.current = null;
        }
    };

    // Acquire/release based on isActive
    useEffect(() => {
        if (isActive) {
            requestWakeLock();
        } else {
            releaseWakeLock();
        }

        return () => {
            // Always release on unmount
            releaseWakeLock();
        };
    }, [isActive]);

    // Re-acquire if the page becomes visible again after the OS released the lock
    // (e.g. user switches tabs and comes back while still processing)
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (isActive && document.visibilityState === 'visible' && !wakeLockRef.current) {
                console.log('[WakeLock] Page visible again — re-acquiring wake lock.');
                await requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isActive]);
};
