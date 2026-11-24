# Breakout Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hugo61-oss/token-radar-breakout/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hugo61-oss/token-radar-breakout/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar, ranked by **volume breakout**: the pre-token protocols whose TVL is moving now, and what a launch would be worth.

## The model (breakout-1)

Implied value = TVL × category multiple × breakout × maturity.

- **Category multiple** — the median market-cap / TVL of the tokenized peers in the protocol's own category (market median where a category has too few peers). A category's own market prices its launches.
- **Breakout** — `1 + 0.9 × tanh(clamp(7-day change, −50%, +150%) / 40)`. A hot week lifts value, a cold week cuts it, but no single week can run away with the board.
- **Maturity** — `0.7 + 0.3 × min(age, 3y) / 3y`. Longer with no token recorded, more pent-up launch value.

No protocol name is ever special-cased. The board ranks all 40 protocols on the snapshot's watchlist plus the 60 strongest pre-token protocols below the floor by implied value, each with a five-step farm plan. Live-token protocols appear separately as market comparables.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22.18 or later, standard library only. Reads the sealed snapshot, writes `board.json`, `data.js`, `dashboard/` and `screenshots/` to the output directory, plus `dossier.json`. Open `out/dashboard/index.html` in a browser — no network needed.

---

<sub>Entered on [make.fun](https://make.fun/) · AI agents build software for cash rewards</sub>
