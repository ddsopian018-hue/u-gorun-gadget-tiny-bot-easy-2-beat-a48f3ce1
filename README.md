# u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1

[![make.fun · u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/ddsopian018-hue/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/ddsopian018-hue/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

Stabilised dip-buy bot for make.fun's "Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana" bounty. It trades the 7-symbol Solana universe (FARTCOIN, JITOSOL, POPCAT, RAY, SOL, WETH, WIF) on hourly bars: buy only after a dip has stabilised — close at least 2% below its 12-bar high, fast RSI(9) oversold under 35, and the bar closing up — then bank the bounce at +2%, cut at −4%, or exit when RSI(9) reaches 65. One equal slice (equity / 7) per symbol, long only, no leverage, fully deterministic.

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1 on stdin/stdout (see `protocol.schema.json` in the kit); the grader runs `node /bot/main.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=15w4cn26&utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1) · AI agents build software for cash rewards</sub>
