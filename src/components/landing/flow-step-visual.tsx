/** An illustrative example, never a claimed live result. */
export function FlowStepVisual({ step, label }: { step: number; label: string }) {
  return (
    <svg role="img" aria-label={label} viewBox="0 0 420 190" className="w-full rounded-lg bg-app text-accent-text" fill="none">
      <rect x="18" y="16" width="384" height="158" rx="12" className="fill-elevated stroke-line-strong" />
      <circle cx="36" cy="32" r="3" className="fill-cat-trigger" />
      <circle cx="48" cy="32" r="3" className="fill-cat-logic" />
      <circle cx="60" cy="32" r="3" className="fill-cat-output" />
      <path d="M18 48H402" className="stroke-line" />
      {step === 0 && <>
        <rect x="62" y="65" width="296" height="90" rx="8" className="fill-card stroke-line" />
        <circle cx="102" cy="100" r="17" className="fill-accent-bg" />
        <circle cx="102" cy="95" r="5" stroke="currentColor" strokeWidth="2" />
        <path d="M92 110Q102 96 112 110" stroke="currentColor" strokeWidth="2" />
        <path d="M138 86H300M138 105H270M138 124H230" className="stroke-med" strokeWidth="6" strokeLinecap="round" />
      </>}
      {step === 1 && [0, 1, 2].map((row) => <g key={row}>
        <rect x="62" y={65 + row * 30} width="296" height="24" rx="5" className="fill-card stroke-line" />
        <path d={`M77 ${77 + row * 30}H146`} className="stroke-muted" strokeWidth="4" strokeLinecap="round" />
        <path d={`M168 ${77 + row * 30}H312`} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d={`M329 ${76 + row * 30}l4 4 8-9`} className="stroke-cat-output" strokeWidth="2" />
      </g>)}
      {step === 2 && <>
        <path d="M105 105H162M210 105H263V79H306M263 105V133H306" className="stroke-line-strong" strokeWidth="3" />
        <path d="M210 105H263V79H306" stroke="currentColor" strokeWidth="3" />
        <rect x="68" y="88" width="48" height="34" rx="6" className="fill-card stroke-line-strong" />
        <path d="M186 79l26 26-26 26-26-26z" className="fill-accent-bg" stroke="currentColor" strokeWidth="2" />
        <rect x="306" y="62" width="48" height="34" rx="6" className="fill-accent-bg" stroke="currentColor" />
        <rect x="306" y="116" width="48" height="34" rx="6" className="fill-card stroke-line" />
      </>}
      {step === 3 && <>
        <rect x="62" y="65" width="296" height="90" rx="8" className="fill-card stroke-line" />
        <path d="M103 78l6 17 17 6-17 6-6 17-6-17-17-6 17-6z" className="fill-cat-ai" />
        <path d="M148 83H305M148 103H270" className="stroke-med" strokeWidth="5" strokeLinecap="round" />
        <rect x="148" y="121" width="70" height="17" rx="5" className="fill-accent-bg" />
        <rect x="229" y="121" width="70" height="17" rx="5" className="fill-cat-output-bg" />
      </>}
      {step >= 4 && <>
        <circle cx="105" cy="107" r="28" className="fill-cat-output-bg" />
        <path d="M91 106l10 10 19-22" className="stroke-cat-output" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M158 84H312M158 106H285M158 128H260" className="stroke-med" strokeWidth="5" strokeLinecap="round" />
      </>}
    </svg>
  );
}
