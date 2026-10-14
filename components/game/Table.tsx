import { DerbyWordmark, Makers, TogetherCredit } from "@/components/Brand";

/**
 * The table every screen sits at: a header and footer framed wide, and a
 * centered grid where the paper and the field share rows, so the field
 * starts level with the top of the paper and the strip under the field
 * lines up with the tools under the paper.
 *
 *   word  | field head
 *   paper | field
 *   below | field foot
 */
export function Table({
  nav,
  word,
  paper,
  below,
  fieldHead,
  field,
  fieldFoot,
  footer,
  children,
}: {
  nav?: React.ReactNode;
  word: React.ReactNode;
  paper: React.ReactNode;
  below?: React.ReactNode;
  fieldHead?: React.ReactNode;
  field: React.ReactNode;
  fieldFoot?: React.ReactNode;
  /** Beside the makers, bottom left. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <header className="relative z-30 mx-auto flex w-full max-w-[1680px] items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <DerbyWordmark />
        <nav className="flex items-center gap-2">{nav}</nav>
      </header>

      <main className="mx-auto grid w-full max-w-[1200px] flex-1 grid-cols-1 content-start gap-x-10 px-4 pt-4 pb-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_410px] lg:content-center lg:pt-2">
        <div className="paper-col min-w-0 justify-self-center pb-4 lg:col-start-1 lg:row-start-1 lg:justify-self-end">{word}</div>
        <div className="paper-col min-w-0 justify-self-center lg:col-start-1 lg:row-start-2 lg:justify-self-end">{paper}</div>
        <div className="paper-col min-w-0 justify-self-center pt-3 lg:col-start-1 lg:row-start-3 lg:justify-self-end">{below}</div>
        <div className="min-w-0 pt-5 pb-2.5 lg:col-start-2 lg:row-start-1 lg:self-end lg:pt-0">{fieldHead}</div>
        <div className="min-w-0 lg:col-start-2 lg:row-start-2">{field}</div>
        <div className="min-w-0 pt-3 lg:col-start-2 lg:row-start-3">{fieldFoot}</div>
      </main>

      <footer className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pb-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Makers />
          {footer}
        </div>
        <TogetherCredit />
      </footer>
      {children}
    </div>
  );
}
