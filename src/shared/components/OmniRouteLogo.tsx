/**
 * EverSync logo SVG — multi-provider neural router hub with glowing directional arrows & brain core.
 * Matches the official app icon design.
 */
type OmniRouteLogoProps = {
  size?: number;
  className?: string;
};

export default function OmniRouteLogo({ size = 20, className = "" }: OmniRouteLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="32" height="32" rx="7" fill="url(#eversync-bg-gradient)" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="6.5"
        stroke="url(#eversync-border-gradient)"
        strokeWidth="1"
        opacity="0.85"
      />

      {/* Top-Left Orange Arrow */}
      <path
        d="M14 14L8 8M8 8H12M8 8V12"
        stroke="#FF9500"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="9.5" r="1" fill="#FFB74D" />

      {/* Top-Right Cyan Arrow */}
      <path
        d="M18 14L24 8M24 8H20M24 8V12"
        stroke="#00D2FF"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.5" cy="9.5" r="1" fill="#80E5FF" />

      {/* Bottom-Left Blue Arrow */}
      <path
        d="M14 18L8 24M8 24H12M8 24V20"
        stroke="#4265F6"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="22.5" r="1" fill="#829BFF" />

      {/* Bottom-Right Green Arrow */}
      <path
        d="M18 18L24 24M24 24H20M24 24V20"
        stroke="#27C93F"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.5" cy="22.5" r="1" fill="#69F0AE" />

      {/* Center Brain Node Core */}
      <circle cx="16" cy="16" r="4.5" fill="#081627" stroke="#00D2FF" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="2.2" fill="#8A5CF5" />
      <circle cx="14.8" cy="15.2" r="0.7" fill="#00D2FF" />
      <circle cx="17.2" cy="15.2" r="0.7" fill="#00D2FF" />
      <circle cx="16" cy="17.2" r="0.7" fill="#69F0AE" />

      <defs>
        <linearGradient
          id="eversync-bg-gradient"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0F223D" />
          <stop offset="0.5" stopColor="#081627" />
          <stop offset="1" stopColor="#030A12" />
        </linearGradient>
        <linearGradient
          id="eversync-border-gradient"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF9500" />
          <stop offset="0.33" stopColor="#8A5CF5" />
          <stop offset="0.66" stopColor="#00D2FF" />
          <stop offset="1" stopColor="#27C93F" />
        </linearGradient>
      </defs>
    </svg>
  );
}
