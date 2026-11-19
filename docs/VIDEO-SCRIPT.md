# Demo video script — ClaimCheck Hybrid (target 2:40, hard limit 3:00)

English narration for the video; Chinese notes (中文要点) are production
directions only and are NOT spoken.

---

**[0:00–0:20] The problem**
> "Every day, projects announce prize pools, partnerships and launch dates
> that aren't quite what the headline says. Checking them means digging
> through official docs by hand. ClaimCheck Hybrid does that check for you —
> starting right on your device."

中文要点：开场讲痛点——公告数字经常和细则对不上，人工核查慢。画面：应用首页。

**[0:20–0:55] On-device screen (Gemini Nano)**
> "I paste a claim: 'The QoreChain Developer Fest offers a twenty-thousand
> dollar prize pool.' The first pass runs on-device with Gemini Nano —
> no network, nothing leaves the machine. It immediately flags the problem:
> money is cited, but no payout asset is named anywhere."

中文要点：演示点「Load the sample case」→「Check this claim」；强调初筛在端侧、离线、隐私。画面：初筛结果与 flag。

**[0:55–1:25] Hybrid routing**
> "Because the screen raised a flag and its confidence is low, the router
> escalates automatically. Long documents, low confidence, red flags — any
> one of them sends the check to the cloud. A short claim the screen can
> settle never leaves the device at all."

中文要点：讲清路由五条触发规则（长文/低置信/红旗/UNVERIFIABLE/用户强制）。画面：结果卡上的升级理由一行。

**[1:25–2:10] Cloud deep check (Firebase AI Logic)**
> "In the cloud, Gemini — through Firebase AI Logic, with an
> only-in-cloud inference mode — applies the ClaimCheck methodology:
> primary sources first, verbatim quotes, and the negative space reported.
> The verdict: MISLEADING. The twenty thousand is real, but the organiser's
> own tokenomics pays prizes in its own token, QOR — and nowhere do the
> official materials name a dollar payout. Every finding quotes the source,
> ranked by authority."

中文要点：深核走 Firebase AI Logic 的 ONLY_IN_CLOUD；结论 MISLEADING 的证据链逐条指给观众看（引用原文+权威排序+「查了没找到」一节）。

**[2:10–2:30] Archive (Firestore)**
> "Every check is archived in Firestore — verdict, evidence, and which
> tier produced it — so the audit trail survives the session."

中文要点：切到历史列表/ Firestore 控制台一闪而过即可，证明存档真实落库。

**[2:30–2:40] Close**
> "ClaimCheck Hybrid: Nano screens on-device, Gemini deep-checks in the
> cloud, and every verdict comes with receipts."

中文要点：收尾一句口号 + 仓库地址画面。

---

Production notes:
- Record against the live Firebase-hosted URL after HOOKUP.md is done
  (demo mode is an acceptable fallback; say so on screen if used).
- Keep the cursor slow on the verdict card; judges skim.
- English subtitles on (contest allows EN or EN-subtitled video).
