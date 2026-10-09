<p align="center">
  <a href="https://doodle-derby-eight.vercel.app"><img alt="doodle derby" src="docs/img/og.png"></a>
</p>

<h1 align="center">doodle derby</h1>

<p align="center">You draw a word, six open vision models race to guess it live, and the first right answer wins. <a href="https://doodle-derby-eight.vercel.app">doodle-derby-eight.vercel.app</a></p>

## Tech stack

- Next.js 16 (App Router, Node runtime), React 19, Tailwind 4, Motion for the springs, one typeface (Bricolage Grotesque)
- Six models on Together AI serverless: Kimi K3, DeepSeek V4.1 Flash, Qwen3.7 Plus, Qwen3.5 9B, GLM-5.3 Flash, MiniMax M3, each with its own thinking-off switch in `lib/racers.ts`
- Each look streams a 384px crop of the ink; slow looks are hedged with a twin request after 2.8s, and guesses come back as NDJSON so they land before the verdict
- Referee: a synonym list per word, then GLM-5.3 Flash for anything the list cannot settle; rounds are HMAC-signed tickets, so judging and the global board stay server side
- Share links replay the round stroke by stroke; with Redis they are short ids, without it the replay rides in the link, compressed and signed
- Optional Upstash Redis (REST) for the global board, rate limits and short links; local dev falls back to `.data/store.json`

## Cloning & running

1. Clone: `git clone https://github.com/Luffixos/doodle-derby.git && cd doodle-derby`
2. Install: `pnpm install`
3. Configure: `cp .env.example .env.local`, then set `TOGETHER_API_KEY` (without it the game runs on labelled demo guesses)
4. Run: `pnpm dev`, then open http://localhost:3000
5. Check: `pnpm typecheck && pnpm build`

## Roadmap

- [ ] hook up Upstash in production so the global board and short links persist
- [ ] add a daily word everyone draws, with its own board
- [ ] let me pick a pen color without changing what the models see
- [ ] re-run the model probe monthly and swap in new vision models as they land
- Multiplayer drawing is skipped on purpose: the race is you against the models, and a second artist muddies who made them guess.

## Security

`TOGETHER_API_KEY` is read on the server only; a visitor's own key stays in their browser's localStorage and rides along per request, never stored or logged. The free house key is capped per IP per hour (`FREE_GUESSES_PER_HOUR`) and per day in dollars (`DAILY_BUDGET_USD`). Private repository, all rights reserved.
