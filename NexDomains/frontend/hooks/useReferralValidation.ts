'use client';

import { useState, useEffect } from 'react';

export function useReferralValidation(code: string) {
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [owner, setOwner] = useState<string | null>(null);

    useEffect(() => {
        if (!code || code.trim() === '') {
            setIsValid(null);
            setOwner(null);
            return;
        }

        const timer = setTimeout(async () => {
            setIsChecking(true);
            try {
                const res = await fetch(`/api/referral/validate/${encodeURIComponent(code)}`);
                const data = await res.json();
                setIsValid(data.valid);
                setOwner(data.owner);
            } catch {
                setIsValid(false);
                setOwner(null);
            }
            setIsChecking(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [code]);

    return { isValid, isChecking, owner };
}
