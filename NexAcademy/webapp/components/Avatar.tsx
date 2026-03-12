import { useMemo } from 'react';

export function Avatar({
    name,
    className,
}: {
    name: string;
    className?: string;
}) {
    const gradients = [
        'from-purple-400 to-blue-400',
        'from-pink-500 to-yellow-500',
        'from-green-300 to-teal-400',
        'from-indigo-400 to-purple-500',
        'from-red-400 to-pink-400',
        'from-yellow-300 to-red-300',
        'from-blue-200 to-teal-300',
        'from-pink-300 to-purple-300',
        'from-orange-400 to-pink-300',
        'from-lime-400 to-green-600',
        'from-cyan-400 to-blue-600',
        'from-rose-500 to-indigo-500',
        'from-emerald-300 to-green-500',
        'from-fuchsia-400 to-pink-600',
        'from-sky-400 to-blue-500',
        'from-amber-400 to-orange-600',
        'from-violet-400 to-blue-500',
    ];

    const gradient = useMemo(() => {
        // Simple hash function for consistent gradient
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % gradients.length;
        return gradients[index];
    }, [name, gradients]);

    return (
        <div
            className={`${className} rounded-full bg-gradient-to-br ${gradient}`}
        />
    );
}
