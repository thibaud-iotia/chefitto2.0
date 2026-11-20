import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ChevronLeft = (p: P) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);
export const ChevronRight = (p: P) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);
export const Close = (p: P) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
export const Search = (p: P) => (
  <Svg stroke="#7C7C95" {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
export const Heart = ({ filled, ...p }: P & { filled: boolean }) => (
  <Svg size={17} stroke="#F5254A" fill={filled ? '#F5254A' : 'none'} {...p}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </Svg>
);
export const Plus = (p: P) => (
  <Svg size={24} stroke="#fff" strokeWidth={2.6} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const Camera = (p: P) => (
  <Svg size={20} {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </Svg>
);
export const Images = (p: P) => (
  <Svg size={20} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m21 16-5-5-9 8" />
  </Svg>
);
export const Download = (p: P) => (
  <Svg size={20} stroke="#fff" strokeWidth={2.2} {...p}>
    <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
  </Svg>
);
export const Check = (p: P) => (
  <Svg size={16} strokeWidth={3} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const Pencil = (p: P) => (
  <Svg size={16} {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
  </Svg>
);
export const Trash = (p: P) => (
  <Svg size={16} {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Svg>
);

export const NavIcon = ({ d, ...p }: P & { d: string }) => (
  <Svg size={22} {...p}>
    <path d={d} />
  </Svg>
);

/** Triangle « lecture », plein (bouton de lecture des vidéos). */
export const Play = (p: P) => (
  <Svg size={22} fill="currentColor" stroke="none" {...p}>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </Svg>
);
