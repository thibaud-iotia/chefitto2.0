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
export const Download = (p: P) => (
  <Svg size={20} stroke="#fff" strokeWidth={2.2} {...p}>
    <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
  </Svg>
);

export const NavIcon = ({ d, ...p }: P & { d: string }) => (
  <Svg size={22} {...p}>
    <path d={d} />
  </Svg>
);
