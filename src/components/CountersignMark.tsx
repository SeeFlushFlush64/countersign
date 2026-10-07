// Inline render of the "2a Nest" mark (see the brand asset kit's README
// for construction/colour rules). Uses currentColor so it inherits
// text color from its parent — pass text-signal for the standard
// violet-on-dark treatment.
export function CountersignMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="10"
      strokeLinecap="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Countersign</title>
      <path d="M71.86 23.96 A34 34 0 1 0 71.86 76.04" />
      <path d="M31.57 51.61 A18.5 18.5 0 0 0 61.39 64.58" />
    </svg>
  );
}
