import Image from "next/image";

export function Logo() {
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 40 24" fill="none">
        <path d="M10 4C4.5 4 1 8.3 1 13.5 1 18.2 4.7 20 9.2 20c4.8 0 7.3-2.5 8.8-6.1.7-1.6 1.3-2.5 2.7-2.9-1.4-.4-2-1.3-2.7-2.9C16.5 4.5 13.8 4 10 4Z" fill="currentColor" />
        <path d="M30 2c5.5 0 9 4.3 9 9.5 0 4.7-3.7 6.5-8.2 6.5-4.8 0-7.3-2.5-8.8-6.1-.7-1.6-1.3-2.5-2.7-2.9 1.4-.4 2-1.3 2.7-2.9C23.5 2.5 26.2 2 30 2Z" fill="currentColor" />
      </svg>
    </span>
  );
}

type NexMarketsLogoProps = {
  className?: string;
};

export function NexMarketsLogo({ className = "" }: NexMarketsLogoProps) {
  const classes = ["nmx-logo-mark", className].filter(Boolean).join(" ");

  return (
    <span className={classes} aria-hidden="true">
      <Image
        className="nmx-logo-mark-img nmx-logo-mark-light"
        src="/nexmarkets-logo-light.png"
        alt=""
        width={64}
        height={64}
        sizes="44px"
        priority
      />
      <Image
        className="nmx-logo-mark-img nmx-logo-mark-dark"
        src="/nexmarkets-logo-dark.png"
        alt=""
        width={64}
        height={64}
        sizes="44px"
        priority
      />
    </span>
  );
}
