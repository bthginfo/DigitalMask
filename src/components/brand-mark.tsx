export const brandMaskPath = "M9 8Q20 12 31 8V20C31 29 25 34 20 36C15 34 9 29 9 20Z";
export function BrandMark() {
  return (
    <span className="brand-symbol">
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
        <path d={brandMaskPath} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path
          d="M13 19Q16 16 18 19M22 19Q25 16 28 19M16 26Q20 29 24 26"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
