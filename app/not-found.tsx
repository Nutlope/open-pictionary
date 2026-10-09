import { Creature } from "@/components/game/Creature";
import { RACERS } from "@/lib/racers";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <div className="flex justify-center gap-2">
          {RACERS.map((r) => (
            <Creature key={r.key} k={r.key} size={40} mood="sad" />
          ))}
        </div>
        <h1 className="tx-display mt-6">This doodle wandered off</h1>
        <p className="tx-body mt-2 text-ink-2">The link is old or mistyped. The race is still on, though.</p>
        <a href="/" className="pill pill-ink mt-6">
          Draw something
        </a>
      </div>
    </main>
  );
}
