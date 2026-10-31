import { INSTAGRAM_URL, NEWSLETTER_URL, YOUTUBE_URL } from "@/shared/links";

const TONES = {
  onPlum: "text-white/70 hover:text-white",
  onCream: "text-sub hover:text-purple",
} as const;

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const LINKS = [
  {
    href: INSTAGRAM_URL,
    label: "Amplifica Wealth on Instagram",
    icon: (
      <Icon>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" />
      </Icon>
    ),
  },
  {
    href: YOUTUBE_URL,
    label: "Amplifica Wealth on YouTube",
    icon: (
      <Icon>
        <rect x="2.5" y="5" width="19" height="14" rx="4" />
        <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
      </Icon>
    ),
  },
  {
    // Stand-in hexagon: beehiiv's brand page offers no monochrome mark.
    href: NEWSLETTER_URL,
    label: "Amplifica Wealth newsletter on beehiiv",
    icon: (
      <Icon>
        <path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" />
        <path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z" />
      </Icon>
    ),
  },
];

export default function SocialLinks({ tone }: { tone: keyof typeof TONES }) {
  return (
    <div className="flex items-center gap-1">
      {LINKS.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={l.label}
          className={`min-h-[44px] min-w-[44px] grid place-items-center transition-colors ${TONES[tone]}`}
        >
          {l.icon}
        </a>
      ))}
    </div>
  );
}
