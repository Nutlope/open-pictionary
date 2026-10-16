import { BRAND } from "@/lib/brand";
import { GLYPH_PATH } from "@/lib/creatures";

/**
 * The Open Pictionary mark: a scribble loop that runs out to a finish dot, with
 * the creature colors as a striped flag at the end of the line.
 */
export function BrandGlyph({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <path
        d={GLYPH_PATH}
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25" cy="13.5" r="4.2" fill="#F2442E" />
      <circle cx="25" cy="13.5" r="1.6" fill="#16130f" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <a href="/" aria-label={BRAND.name} className="group flex shrink-0 items-center gap-1.5 rounded-xl text-ink">
      <BrandGlyph className="size-8 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-rotate-12" />
      <span className="text-[1.25rem] leading-none font-extrabold tracking-[-0.04em] [font-variation-settings:'opsz'_48,'wdth'_85]">
        open pictionary
      </span>
    </a>
  );
}

/** The Together AI pinwheel and wordmark, kept as the "served by" credit. */
export function TogetherMark({ className = "h-4 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 39 36" fill="none" role="img" aria-label="Together AI" className={className}>
      <path
        d="M37.1221 4.80181C34.4703 0.208794 28.6001 -1.36323 24.0071 1.28863C21.1134 2.95824 19.4311 5.8859 19.2338 8.98751L28.8123 9.00024V10.218H19.2338C19.3229 11.6521 19.726 13.0756 20.4939 14.4058C23.1458 18.9988 29.0159 20.5708 33.609 17.919C38.202 15.2671 39.774 9.39696 37.1221 4.80394V4.80181Z"
        fill="#EF2CC1"
      />
      <path
        d="M1.28817 4.81234C-1.36369 9.40536 0.210452 15.2755 4.80135 17.9274C7.69506 19.597 11.0725 19.5927 13.8537 18.2116L9.07615 9.91027L10.1305 9.30352L14.9187 17.5985C16.1152 16.8051 17.1484 15.7444 17.9164 14.4142C20.5682 9.82117 18.9941 3.95101 14.4032 1.29916C9.81018 -1.3527 3.94003 0.221439 1.28817 4.81234Z"
        fill="#CAAEF5"
      />
      <path
        d="M19.204 35.835C24.5056 35.835 28.8059 31.5368 28.8059 26.2331C28.8059 22.8939 27.1129 19.9705 24.5247 18.25L19.7259 26.5386L18.6715 25.9276L23.4597 17.6326C22.1741 16.994 20.7379 16.6292 19.204 16.6292C13.9024 16.6292 9.60217 20.9273 9.60217 26.231C9.60217 31.5326 13.9003 35.8328 19.204 35.8328V35.835Z"
        fill="#FC4C02"
      />
    </svg>
  );
}

export function TogetherCredit({ className = "" }: { className?: string }) {
  return (
    <a
      href={BRAND.togetherUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-1.5 rounded-full text-ink-2 transition-colors hover:text-ink ${className}`}
    >
      <TogetherMark className="h-4 w-auto transition-transform duration-500 ease-[var(--ease-spring)] group-hover:rotate-[120deg]" />
      <span className="tx-small">
        on <span className="font-semibold">Together AI</span>
      </span>
    </a>
  );
}

/** The header's credit: a frosted capsule like the dock, next to the wordmark. */
export function TogetherBadge({ className = "" }: { className?: string }) {
  return (
    <a
      href={BRAND.togetherUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Powered by Together AI"
      className={`dock group h-[42px] shrink-0 gap-2 px-3.5 text-[0.875rem] whitespace-nowrap text-ink transition-transform active:scale-95 ${className}`}
    >
      <TogetherMark className="h-[18px] w-auto transition-transform duration-500 ease-[var(--ease-spring)] group-hover:rotate-[120deg]" />
      <span>
        <span className="text-ink-2">Powered by</span> <span className="font-semibold">Together AI</span>
      </span>
    </a>
  );
}

export function Makers() {
  return (
    <p className="tx-small whitespace-nowrap text-ink-2">
      Made by{" "}
      {BRAND.makers.map((m, i) => (
        <span key={m.name}>
          {i > 0 ? " and " : null}
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-ink/20 underline-offset-4 transition-colors hover:decoration-ink">
            {m.name}
          </a>
        </span>
      ))}
    </p>
  );
}
