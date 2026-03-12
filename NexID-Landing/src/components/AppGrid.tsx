import React from 'react'
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel"

const apps = [
    {
        label: 'NexID Academy',
        badge: 'Learn & Earn',
        color: 'from-emerald-400 via-sky-400 to-indigo-500',
        url: 'https://academy.nexid.fun/',
        description: "Explore multilingual interactive AI Powered coursses powered by NexIDAgents"
    },
    /*  {
         label: 'NexIDPad',
         badge: 'Launch & Fund',
         color: 'from-orange-400 via-pink-500 to-rose-500',
         url: 'https://safupad.xyz',
         description: "Explore a new type of creator capital marketson BNB Chain with revenue share"
 
     }, */
    {
        label: 'NexID Domains',
        badge: 'Own Your Name',
        color: 'from-yellow-300 via-amber-400 to-emerald-400',
        url: 'https://names.nexid.fun/',
        description: "A unique Web3 digital identity that unlocks evrything in the NexID and beyond"
    },
]

const AppGrid = () => {
    const renderCard = (app: typeof apps[0]) => (
        <a
            key={app.label}
            href={app.url}
            className="group relative h-80 w-64 md:h-72 md:w-48 cursor-pointer overflow-visible rounded-3xl transition-transform duration-300 ease-out hover:-translate-y-3 hover:rotate-x-6 hover:-rotate-y-6 hover:scale-110 block mx-auto"
            style={{ transformStyle: 'preserve-3d' }}
        >
            <div className="absolute inset-0 -z-10 rounded-[24px] bg-gradient-to-br from-white/70 to-slate-100/10 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100 dark:from-white/10 dark:to-slate-900/10" />
            <div className="flex h-full flex-col rounded-3xl bg-gradient-to-br p-[2px] shadow-[0_28px_60px_rgba(0,0,0,0.22)]">
                <div
                    className={`flex h-full flex-col justify-between rounded-[22px] bg-gradient-to-br ${app.color} px-4 py-4 text-left text-slate-900 shadow-[0_28px_60px_rgba(0,0,0,0.3)]`}
                >
                    <div className="inline-flex items-center gap-2 rounded-full bg-black/10 px-3 py-1 text-[11px] font-medium text-slate-900/90">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                        <span>{app.badge}</span>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900 drop-shadow-sm md:text-2xl">
                            {app.label}
                        </h2>
                        <p className="mt-1 text-xs text-slate-900/80">
                            {app.description}
                        </p>
                    </div>
                </div>
            </div>
        </a>
    )

    return (
        <section className="mt-8 md:mt-16 w-full">
            <div className="mb-6 text-center text-xs font-semibold tracking-[0.25em] text-slate-500 dark:text-slate-400">
                .id UNLOCKS ACCESS TO
            </div>

            <div className="w-full px-4">
                {/* Mobile Carousel */}
                <div className="md:hidden">
                    <Carousel className="w-full max-w-xs mx-auto">
                        <CarouselContent>
                            {apps.map((app) => (
                                <CarouselItem key={app.label} className="flex justify-center py-4">
                                    {renderCard(app)}
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                        <CarouselPrevious className="hidden xs:flex" />
                        <CarouselNext className="hidden xs:flex" />
                    </Carousel>
                </div>

                {/* Desktop Grid */}
                <div className="hidden md:flex max-w-lg flex-row items-stretch justify-center gap-5 mx-auto">
                    {apps.map((app) => renderCard(app))}
                </div>
            </div>
        </section>
    )
}

export default AppGrid
