
const RegistrationSteps = ({ requiresCommit }: { requiresCommit: boolean }) => {
  const steps = requiresCommit
    ? [
      {
        number: 1,
        title: 'Complete a transaction to begin the timer',
      },
      {
        number: 2,
        title: 'Wait 60 seconds for the timer to complete',
      },
      {
        number: 3,
        title: 'Complete a second transaction to secure your name',
      },
    ]
    : [
      {
        number: 1,
        title: 'Sign a USDC permit for gas',
      },
      {
        number: 2,
        title: 'Complete the registration transaction',
      },
    ]

  return (
    <div>
      <h1 className="text-center text-2xl font-semibold text-foreground">Before we Start</h1>
      <p className="text-center font-semibold mt-7 text-sm text-muted-foreground">
        Registering your name takes {requiresCommit ? 'three' : 'two'} steps
      </p>
      <div className="w-full flex space-x-5 justify-center mt-5">
        {steps.map((s) => (
          <div
            key={s.number}
            className="rounded-lg p-3 border border-[var(--border)] w-25 md:w-48 h-38 flex-col flex items-center text-sm lg:text-md"
          >
            <div className="p-2 flex items-center w-10 h-10 bg-[var(--primary)] rounded-full justify-center text-[var(--primary-foreground)] font-bold">
              {s.number}
            </div>
            <p className="text-center text-[10px] lg:text-sm font-semibold mt-5 text-foreground">
              {s.title}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default RegistrationSteps
