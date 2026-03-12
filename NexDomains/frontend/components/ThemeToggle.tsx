'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const THEME_KEY = 'nexid-theme';

export default function ThemeToggle() {
    const [isDark, setIsDark] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Check initial state
        const stored = window.localStorage.getItem(THEME_KEY);
        const hasDarkClass = document.body.classList.contains('dark-mode');

        if (stored === 'dark' || hasDarkClass) {
            setIsDark(true);
            if (!hasDarkClass) document.body.classList.add('dark-mode');
        }
    }, []);

    const toggleTheme = () => {
        if (isDark) {
            document.body.classList.remove('dark-mode');
            window.localStorage.setItem(THEME_KEY, 'light');
            setIsDark(false);
        } else {
            document.body.classList.add('dark-mode');
            window.localStorage.setItem(THEME_KEY, 'dark');
            setIsDark(true);
        }
    };

    if (!mounted) return null;

    return (
        <button
            onClick={toggleTheme}
            className={`fixed bottom-6 left-6 z-50 flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all duration-300 hover:scale-110 focus:outline-none ${isDark
                ? 'bg-neutral-800 text-yellow-400 border border-neutral-700 hover:shadow-yellow-400/20'
                : 'bg-white text-orange-500 border border-neutral-200 hover:shadow-orange-500/20'
                }`}
            aria-label="Toggle Theme"
        >
            {isDark ? (
                <Moon className="w-6 h-6 fill-current" />
            ) : (
                <Sun className="w-6 h-6 fill-current" />
            )}
        </button>
    );
}
