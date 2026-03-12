'use client';

import { useState, useCallback } from 'react';

export interface Toast {
    id: string;
    title?: string;
    description?: string;
    action?: React.ReactNode;
    variant?: 'default' | 'destructive';
}

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback(({ title, description, variant = 'default', action }: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).slice(2);
        setToasts((prev) => [...prev, { id, title, description, variant, action }]);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);

        return { id, dismiss: () => setToasts((prev) => prev.filter((t) => t.id !== id)) };
    }, []);

    const dismiss = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return { toast, toasts, dismiss };
}
