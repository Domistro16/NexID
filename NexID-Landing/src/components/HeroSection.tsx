import React from 'react'

const HeroSection = () => {
  return (
    <section className="flex w-full flex-col items-center text-center mt-8 md:mt-0">
      <h1 className="mb-4 text-4xl font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50 sm:text-5xl md:text-6xl">
        Where Learning And Earning Meets
        <br />
        <span className="whitespace-nowrap">Digital Identity</span>
      </h1>
      <p className="max-w-xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
        The NexID unifies education, Capital Market, Synthetic AI, and Web3 identity. All by your unique <span className="font-semibold text-[#ffb000]">.id</span> domain.
      </p>
    </section>
  )
}

export default HeroSection