import React from 'react'

const socials = [
    {
        label: 'X',
        url: 'https://x.com/NexID',
        icon: (
            <svg role="img" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
            </svg>
        )
    },
    {
        label: 'Discord',
        url: 'https://discord.gg/zv9rWkBm',
        icon: (
            <svg role="img" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.772-.6083 1.1588a18.2915 18.2915 0 00-7.6511 0 7.9335 7.9335 0 00-.6132-1.1588.0775.0775 0 00-.0785-.0371 19.7186 19.7186 0 00-4.8852 1.5152.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.0991.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.419-2.1568 2.419zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.419-2.1568 2.419z" />
            </svg>
        )
    },
    {
        label: 'TikTok',
        url: 'https://tiktok.com/@level3ai',
        icon: (
            <img
                src="/tiktok.png"
                alt="TikTok"
                className="w-8 h-8 object-contain"
            />
        )
    }
]

const Dock = () => {
    return (
        <div className="pointer-events-auto fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 pb-2 sm:bottom-8">
            <div className="flex items-center gap-6 rounded-3xl border border-white/40 bg-white/25 px-6 py-3 shadow-dock backdrop-blur-xl transition-all duration-300 hover:translate-y-[-4px] hover:shadow-dock-hover dark:border-white/20 dark:bg-black/60">
                {socials.map((social) => (
                    <a
                        key={social.label}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white/30 text-slate-800 shadow-[0_20px_40px_rgba(0,0,0,0.25)] transition-transform duration-300 hover:-translate-y-2 hover:scale-110 hover:shadow-[0_35px_80px_rgba(0,0,0,0.35)] dark:border-white/30 dark:bg-white/10 dark:text-slate-50 hover:text-[#ffb000] dark:hover:text-[#ffb000]"
                        aria-label={social.label}
                    >
                        {social.icon}
                    </a>
                ))}
            </div>
        </div>
    )
}

export default Dock
