# 缁囧簭 AgentLoom 鈥?浜ゆ帴璇存槑

鏇存柊锛?026-11-08

褰撳墠鍒嗘敮锛歚ui/swiss-redesign`

鏈€鍚庢彁浜わ細`b7d4aff`锛堝伐鍏疯繍琛屾椂銆丳DF 鍏ュ簱銆佸洓鎬佹牳鏌ャ€佽繍琛屽浘蹇収銆佸洟闃熻鑹插彲鐢ㄥ寲銆佷粨搴撴竻鐞嗭級銆?鐘舵€侊細宸ヤ綔鍖哄共鍑€锛沗pnpm typecheck` / `pnpm smoke` / `pnpm build` 閫氳繃銆?
> 鎺ユ墜椤哄簭锛氬厛璇绘湰鏂?鈫?`docs/architecture.md` 鈫?`docs/verification.md` 鈫?`README.md`銆?> 瑙嗚楠屾敹鍥剧墖鍦?`docs/boardui/`锛屾棫鐗堟彁浜ゆ潗鏂欏湪 `deliverables/`銆?
## 1. 椤圭洰鐜扮姸

缁囧簭 AgentLoom 鏄潰鍚戝 Agent 鍗忎綔鐨勫彲瑙嗗寲缂栨帓銆佽皟搴︿笌楠岃瘉骞冲彴銆傞粯璁ゆ紨绀哄満鏅负鈥淎I 鐪奸暅浜т笟閾炬姇鐮斺€濓細

- 6 绡囨ā鎷熺煡璇嗚祫鏂欙紝14 涓?Agent 瑙掕壊锛堥粯璁ゅ伐浣滄祦鐢?8 涓級锛涘叾浣欒鑹插彲鍦ㄣ€屾坊鍔?Agent 鈫?鍥㈤槦搴撱€嶇洿鎺ユ彃鍏ワ紝涓嶆柊寤?Agent銆?- 涓夎矾鐮旂┒骞惰锛岄甯垎鏋愬笀灞曞紑涓夎瑙掑苟璋冪敤 `calculator`锛屾牳鏌ュ憳澶辫触鍚庢寜闂绫诲瀷璺敱骞跺洖鐜€?- 鐭ヨ瘑搴撴敮鎸?MD / TXT / PDF锛涙枃妗ｅ甫鏉ユ簮閾炬帴銆佺被鍨嬩笌鍙戝竷鏃堕棿銆?- 宸ュ叿杩愯鏃讹細`calculator` + `knowledge_search`锛汳ock 妯″紡涔熺湡鎵ц锛屼簨浠舵祦鍙 `tool.call` / `tool.result`銆?- 楠岃瘉锛氬洓鎬佽暣鍚?v2锛?2 鏉℃墜鏍囬毦渚嬪噯纭巼 88%锛宍supported` F1 100%锛岃 [verification.md](./verification.md)銆?- 璁粌锛? 涓彁绀鸿瘝鍊欓€?+ 鍥哄畾璇勬祴闆?+ 鐗堟湰鍚敤/鍥炴粴锛岃 `/training`銆?- 鍓嶇锛歊eact 19 + Vite 7 + TypeScript + React Router 7 + React Flow + BoardUI 婧愮粍浠?+ Tailwind CSS v4锛圥ostCSS锛夈€?- 鍚庣锛欶astify 5 + SQLite锛圢ode 鍐呯疆 `node:sqlite`锛? SSE銆?- 椤甸潰锛欻ome锛堥椤碉級銆佺煡璇嗗簱銆丄gent 鍥㈤槦銆佺紪鎺掔敾甯冦€佽繍琛岃鎯咃紙浜斾釜鏍囩锛夈€佽瘎娴嬨€佽缁冿紱闄ら椤靛浠?overlay 鎵撳紑銆?- 璁捐锛氶挍鐧?/ 鐭冲ⅷ / 鍗曚竴閾滆壊锛汢oardUI 璇箟 token + composite type utilities锛汻eact Flow 鐢诲竷涓庤嚜瀹氫箟鑺傜偣淇濈暀銆?- 涓嶄娇鐢?Next.js銆丼erver Component銆乶ext/font 鎴?next/navigation銆?
褰撳墠鏈満鏇炬湁婕旂ず鏈嶅姟杩愯鍦?5173 / 8787锛涜繖浜涜繘绋嬪拰 `data/` 閮芥槸鏈湴鐘舵€侊紝涓嶅睘浜?Git 鎻愪氦鍐呭銆?
## 2. 5 鍒嗛挓鍚姩

瑕佹眰锛歂ode.js 22.19+ 鎴?24+锛宲npm 10+銆?
```bash
cd D:\workspace\agentloom
pnpm install
pnpm reset       # 鍙€夛細閲嶅缓婕旂ず鏁版嵁搴擄紙淇濈暀 data/ 閲岀殑璇勬祴鍩哄噯锛?pnpm dev         # API 8787 + Web 5173
```

鏀瑰畬浠ｇ爜鑷冲皯璺戯細

```bash
pnpm typecheck
pnpm smoke       # 涓存椂搴撹窇瀹屾暣 Mock 娴佺▼锛屼笉姹℃煋 data/
```

- Web锛歨ttp://127.0.0.1:5173
- API锛歨ttp://127.0.0.1:8787
- 鐢熶骇棰勮锛?
```bash
pnpm build
pnpm start
# http://127.0.0.1:8787
```

### 绔彛鍐茬獊

`pnpm dev` 渚濊禆 **5173 鍜?8787 鍚屾椂绌洪棽**銆傚鏋滃凡鏈夋棫鏈嶅姟锛?
```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173,8787 | Select-Object LocalPort,OwningProcess
# 纭 PID 鍚庯細
Stop-Process -Id <pid> -Force
```

鍦?Windows 涓婂缓璁厛鍋?API 鍐嶆墽琛?`pnpm reset`锛岄伩鍏?SQLite 鏂囦欢琚崰鐢ㄣ€?
## 3. 杩愯妯″紡涓庨厤缃?
榛樿鏄?**Mock 婕旂ず妯″紡**锛屼笉闇€瑕?Key锛岄€傚悎绂荤嚎褰曞睆銆侻ock 涓嶆槸鍋囪建杩癸細`calculator` 涓?`knowledge_search` 浠嶇劧鐪熷疄鎵ц锛屼簨浠舵祦閲岃兘鐪嬪埌 `tool.call` / `tool.result`銆?
浣跨敤鐪熷疄妯″瀷锛?
```bash
AGENTLOOM_API_KEY=sk-...
AGENTLOOM_BASE_URL=https://api.deepseek.com/v1
AGENTLOOM_MODEL=deepseek-chat
pnpm dev
```

涔熷彲浠ュ湪椤甸潰鍙充笂瑙掋€岃缃€嶄腑濉啓 Key / Base URL / 妯″瀷銆?*璁剧疆鍙繚瀛樺湪褰撳墠鏈嶅姟杩涚▼鍐咃紝閲嶅惎鍚庝涪澶憋紝涓嶅啓鍏ユ暟鎹簱銆?* 褰撳墠杩涚▼濡傛灉閰嶇疆杩?Key锛屼細鏄剧ず Live锛涙柊鐜鍚姩鏃舵寜鐜鍙橀噺閲嶆柊鍒ゆ柇銆備氦鎺ユ椂涓嶈澶嶇敤浠栦汉鐨?Key銆?
## 4. 鏁版嵁涓庨噸缃?
- 鏁版嵁搴擄細`data/agentloom.db`锛沗data/` 琚?`.gitignore` 蹇界暐銆?- 棣栨鍚姩浼氳嚜鍔ㄥ缓搴撳苟鍐欏叆婕旂ず璧勬枡銆丄gent銆佹彃浠跺拰宸ヤ綔娴併€?- 閲嶇疆锛?
```bash
pnpm reset
# 鎴栧厛鍋滄湇鍔★紝鍐嶅垹闄?data/agentloom.db* 鍚庨噸鏂板惎鍔?```

- 杩愯璁板綍銆佽瘉鎹€佷簨浠堕兘瀛?SQLite銆傞噸缃細涓㈠け鎵€鏈夊巻鍙茶繍琛岋紝浣嗕細鎭㈠ 14 Agent / 10 鑺傜偣 / 6 璧勬枡鍒濆鐘舵€併€?- 鏃犺璇併€佹棤澶氱鎴凤紝杩欐槸鏈湴婕旂ず鍘熷瀷銆?
## 5. 浠ｇ爜鍦板浘

```text
src/
  server/
    index.ts      Fastify 璺敱銆丼SE銆侀潤鎬佹枃浠?    engine.ts     DAG 璋冨害銆丼elf-Loop銆佸伐鍏蜂簨浠?    llm.ts        Mock / DeepSeek銆乫unction calling銆佸彂鏁ｃ€佽鍒ゃ€佹牳鏌?    tools.ts      宸ュ叿娉ㄥ唽琛細calculator / knowledge_search
    entailment.ts 鍥涙€佷富寮犲垽瀹?    trainer.ts    鎻愮ず璇嶅€欓€夎缁冦€佺増鏈惎鐢?鍥炴粴
    retrieval.ts  涓枃 BM25
    seed.ts       婕旂ず鏁版嵁
    db.ts         SQLite 璁块棶
  web/
    App.tsx       Home + overlay 璺敱銆佽缃?Modal
    api.ts        REST 瀹㈡埛绔?    pages/        棣栭〉 / 鐭ヨ瘑搴?/ 鍥㈤槦 / 缂栨帓 / 杩愯 / 璇勬祴 / 璁粌
    components/
      Graph.tsx   React Flow 鐢诲竷銆佽嚜瀹氫箟鑺傜偣銆佽竟銆佽嚜鍔ㄥ钩绉?      ui.tsx      Modal 閫傞厤銆丳ageHeader銆丼urface銆丼tatusPill銆丼coreRing銆丮arkdown
  components/     BoardUI 婧愮粍浠讹紙Button/Modal/Tabs/Input/Textarea/Switch/Tooltip/Spinner 绛夛級
  styles/         BoardUI theme/typography/globals + agentloom-theme.css
  utils/          cx銆乨irectional-icon
  shared/         鍓嶅悗绔叡浜被鍨?docs/
  handover.md            鏈枃
  README.md              鏂囨。绱㈠紩
  architecture.md        鍚庣銆佽皟搴︺€佹彃浠躲€佸伐鍏疯繍琛屾椂銆侀獙璇佽璁?  verification.md        涓诲紶鍩哄噯銆佺鍒扮鍐掔儫銆佸伐鍏疯建杩?  demo-script.md         3 鍒嗛挓婕旂ず鑴氭湰
  white-paper.md         鐧界毊涔︽簮绋?  boardui/               褰撳墠 UI 鎴浘锛堟闈?3 寮?/ 绉诲姩 1 寮狅級
deliverables/            鐧界毊涔?PPT/鎻愪氦娓呭崟
boardui.json             BoardUI 婧愮洰褰曚笌鍒悕閰嶇疆
postcss.config.mjs       Tailwind v4 PostCSS 鎺ュ叆
AGENTS.md / .cursor/     BoardUI always-on 璁捐瑙勫垯
```

## 6. 椤甸潰涓庡姛鑳?
| 璺敱 | 鍔熻兘 |
|---|---|
| `/` | 棣栭〉锛?4 瑙掕壊缁熻銆佽繍琛屽叆鍙ｃ€佹渶杩戣繍琛屻€佽瘉鎹?鎻掍欢鍏ュ彛 |
| `/knowledge` | 璧勬枡鍏ュ簱锛圡arkdown/TXT/PDF锛夈€佹绱㈡祴璇曘€佽祫鏂欏崱銆佹煡鐪?鍒犻櫎 |
| `/team` | 14 涓?Agent銆佽兘鍔涙彃浠跺簱銆佹ā鍨?娓╁害/Prompt銆佹彃浠?Switch |
| `/workflow` | React Flow 鐢诲竷銆佹嫋鎷?杩炵嚎/鍒犻櫎銆佹坊鍔?Agent銆佹彃浠舵嫋鏀俱€佹鏌ュ櫒 |
| `/runs/:id` | 鎵ц鍥捐氨銆佺爺绌舵姤鍛娿€佽瘉鎹处鏈€佹牳鏌ヤ笌鍥炵幆銆佷簨浠舵祦锛堝惈 tool.call锛?|
| `/evals` | 绱鎸囨爣銆佸洖鐜墠鍚庡姣斻€佸叏閮ㄨ繍琛屽巻鍙?|
| `/plugins` | 14 涓彃浠躲€佸叏閮ㄥ彲杩愯銆佹寕杞界姸鎬?|
| `/training` | 鍥哄畾璇勬祴闆嗐€佸€欓€夋彁绀鸿瘝銆佺増鏈惎鐢?鍥炴粴 |

杩愯椤典簲涓爣绛剧敱 BoardUI `Tabs` 鐨?segmented 鍙樹綋鎻愪緵锛涚Щ鍔ㄧ瀵艰埅鐢?BoardUI `Modal` 鎻愪緵鎶藉眽褰㈡€併€?
## 7. 涓€娆¤繍琛岀殑閾捐矾

```text
椤甸潰銆岃繍琛屾娴佺▼銆? 椤舵爮銆屾柊寤鸿繍琛屻€?  鈫?POST /api/runs
  鈫?Fastify createRun + executeRun锛堝紓姝ワ級
  鈫?Scheduler 鎸?DAG 渚濊禆鍜屾繁搴︽墽琛岃妭鐐?  鈫?姣忎釜鍔ㄤ綔 appendEvent 鈫?SSE /api/runs/:id/events
  鈫?RunPage 浠?EventSource 澧為噺鎺ユ敹銆佹瘡 1800ms 杞鍏滃簳
  鈫?閫変腑鑺傜偣鏃舵墦寮€杈撳嚭 Modal
  鈫?run.completed 鍚庡叧闂?SSE锛屼繚鐣欏叏閮ㄤ簨浠跺彲鍥炴斁
```

鍓嶇涓嶈鎶?`run_events` 鐨?`seq` 褰撲綔鍏ㄥ眬鍞竴锛氬畠鏄崟搴撹嚜澧炲簭鍒楋紝璺ㄨ繍琛屼笉淇濊瘉浠?1 寮€濮嬨€傝繍琛岄〉宸叉寜 `runId` 杩囨护骞堕槻姝㈡棫璇锋眰瑕嗙洊鏂拌矾鐢便€?
## 8. 鍓嶇璁捐绯荤粺涓庣害瀹?
- **BoardUI 鏄簮缁勪欢**锛屼笉鏄?npm 杩愯鏃朵緷璧栵紱缁勪欢鍦?`src/components`銆?- 棰滆壊鍙蛋璇箟 token锛歚bg-background-*`銆乣text-text-*`銆乣border-separator-border`銆乣text-foreground-icon-*`銆乣accent-*`銆佺姸鎬?token銆備笉瑕佸啓 `text-gray-*`銆乣bg-white`銆乭ex 鎴?`dark:` 瑕嗙洊銆?- 绫诲瀷鍙敤 composite utilities锛歚text-body-regular`銆乣text-title-2-medium`銆乣text-caption-1-semibold` 绛夛紝閬垮厤鑷繁鎷?`text-sm font-medium`銆?- 鍥炬爣鍙敤 `@remixicon/react` 缁勪欢寮曠敤锛涚被鍚嶅悎骞剁敤 `@/utils/cx`銆?- 搴旂敤绾?token / 椤甸潰鍏ュ満 / 鎶ュ憡鎺掔増 / 鍝佺墝琛嚎鍦?`src/styles/agentloom-theme.css`銆?- `src/styles/theme.css` 鏄?BoardUI 鍘熷 token锛宍agentloom-theme.css` 瑕嗙洊 accent銆佽〃闈€佸瓧浣撱€佸渾瑙掋€侀槾褰便€備慨鏀逛富棰樺彧鏀瑰悗鑰呫€?- `src/web/theme-refresh.css` 鍙厑璁告壙杞?React Flow 鐢诲竷鐩稿叧瑙勫垯锛堢敾甯冮珮搴︺€乭andle銆乧ontrols銆乪dge锛夈€?- 鏃?`src/web/styles.css` 宸插垹闄わ紱涓嶈鍐嶅紩鍏ョ浜屽棰滆壊/鎸夐挳/Modal 鏍峰紡銆?- 鎶ュ憡姝ｆ枃浣跨敤 `.report-serif` / `.report-prose`锛涢〉闈㈡爣棰樸€佹帶浠朵繚鎸佹棤琛嚎銆?- 鍔ㄦ晥锛氶〉闈?fade + 4px + 2px blur锛沨over 150ms锛涙寜鍘嬪彧鍙樻殫锛屼笉鏀惧ぇ锛沗prefers-reduced-motion` 涓嬪叧闂姩鐢汇€?
### BoardUI CLI 鐨勫凡鐭ラ棶棰?
鏈満 `npx boardui@latest init -y` 鑳藉畨瑁呬緷璧栵紝浣嗘棤娉曡闂?`https://www.boardui.com/r/globals.json`锛堟湰鏈?DNS 闂锛夈€傛湰娆￠€氳繃 BoardUI MCP installer 钀界洏鍚屼竴鎵?registry 鏂囦欢锛沗boardui.json` 宸查厤缃細

```json
"paths": { "components": "src/components", "utils": "src/utils", "styles": "src/styles" }
```

濡傛灉涔嬪悗鍐嶆墽琛?BoardUI CLI `add`锛岃纭缃戠粶/registry锛涗笉瑕佹妸缁勪欢閲嶆柊瀹夎鍒版牴鐩綍锛屼篃涓嶈瑕嗙洊宸插畾鍒剁殑 `agentloom-theme.css` / `theme-refresh.css`銆?
## 9. 楠岃瘉鍩虹嚎

鍦ㄦ湰鏈哄綋鍓嶇増鏈凡閫氳繃锛?
```bash
pnpm typecheck  # 閫氳繃
pnpm smoke      # 閫氳繃锛歴core=1 路 loops=1 路 tools=2
pnpm build      # 閫氳繃锛圴ite 浠呮湁 >500 kB chunk 鎻愮ず锛?```

鏈€缁堟瀯寤猴細JS 绾?987 kB / gzip 绾?305 kB锛孋SS 绾?166 kB / gzip 绾?27 kB銆?
娴忚鍣ㄩ獙鏀惰鐩?1440脳900 涓?390脳844锛?
- `/`銆乣/knowledge`銆乣/team`銆乣/workflow`銆乣/evals`
- `/runs/:id` 鐨?graph / report / ledger / verify / events
- 鍏ㄩ儴椤甸潰 console error = 0锛?90px 涓嬮〉闈㈡棤妯悜婊氬姩
- SSE 瀹炴椂杩愯銆佽瘉鎹处鏈富寮犲垏鎹€佹彃浠?Switch / 鎷栨斁銆佹坊鍔?鍒犻櫎 Agent銆佸悎娉曡繛绾夸笌鐜矾鎷︽埅銆丮odal銆佽〃鍗曟彁浜ゃ€佺Щ鍔ㄥ鑸潎宸查獙璇併€?- 鎴浘锛歚docs/boardui/desktop/*.png`锛? 寮狅細棣栭〉/鎻掍欢/浜嬩欢娴侊級銆乣docs/boardui/mobile/*.png`锛? 寮狅級锛涘潎涓?11/8 娓呮磥婕旂ず鏁版嵁锛? 鏉¤繍琛屻€?00%锛夈€?
鑷姩鍖栨祴璇曞彧鏈?`pnpm smoke`锛氫复鏃跺簱璺戝畬鏁?Mock 娴佺▼锛屾柇瑷€鍥炵幆銆佸伐鍏疯皟鐢ㄤ笌缁堢寮曠敤銆傛祻瑙堝櫒楠屾敹浠嶆槸鎵嬪姩涓轰富锛屾柊鏀瑰姩璇疯嚦灏戦噸璺?typecheck / smoke / build銆?
## 10. 宸茬煡椋庨櫓 / 寰呭姙

1. **Bundle 浣撶Н**锛氫富鍖呯害 1.1 MB锛圱hree.js 鍙︽媶绾?486 kB锛夛紝Vite 鎻愮ず >500 kB銆傝嫢姣旇禌鎻愪氦鏈夐灞忚姹傦紝鎸夎矾鐢?`React.lazy` 鎷嗗寘銆?2. **BoardUI CLI registry**锛氭湰鏈?DNS 鏃犳硶璁块棶 BoardUI registry锛涘綋鍓嶆簮鏂囦欢宸茶惤鐩橈紝CLI 閲嶆柊 add 鍓嶉渶鎭㈠缃戠粶銆?3. **Dark mode 鏈惎鐢?*锛歵oken 鏀寔 `.dark`锛屼絾浜у搧鍙氦浠樻祬鑹茬晫闈紝娌℃湁鍒囨崲鍏ュ彛銆?4. **绉诲姩鐢诲竷**锛?90px 浣跨敤 0.62 鍒濆缂╂斁 + 骞崇Щ锛屼笉鑷姩 fit 鍏ㄥ浘锛涙闈㈡鏌ュ櫒鎵撳紑鏃朵細鑷姩骞崇Щ閫変腑鑺傜偣锛岀Щ鍔ㄧ涓哄簳閮ㄦ娊灞夈€?5. **鐪熷疄妯″瀷**锛歁ock 娴佺▼宸查獙鏀讹紱Live 鐨?function calling 宸ュ叿寰幆鍙仛浜嗕唬鐮佽矾寰勶紝鏈敤鐪熷疄 Key 鍥炲綊寤惰繜銆佸伐鍏疯皟鐢ㄥけ璐ヤ笌鎴愭湰銆?6. **鎴浘涓庢渶鏂颁唬鐮佸樊寮傚ぇ**锛欻ome 鏀圭増銆佽缁冮〉銆佸伐鍏蜂簨浠堕兘娌℃湁杩涘叆 `docs/boardui` 鎴浘锛涙寮忔彁浜ゅ墠閲嶆柊鎴彇棣栭〉銆佺紪鎺掋€佽繍琛屼簨浠舵祦銆佽缁冮〉銆?7. **寮€鍙戞湇鍔＄紦瀛?*锛歏ite 鍦ㄥ惎鍔ㄦ椂璇诲彇 `postcss.config.mjs`銆傚鏋滈〉闈㈡樉绀烘棤鏍峰紡瑁?HTML锛屽厛閲嶅惎 5173 鐨?Vite 杩涚▼锛岃€屼笉鏄敼椤甸潰浠ｇ爜銆?8. **鎻愪氦鏉愭枡浠嶆槸 11/5 鐗堝紡**锛氭暟瀛椾笌鈥滃伐鍏疯繍琛屾椂/鍥涙€佹牳鏌モ€濋檮褰曞凡鍦?11/8 琛ヨ繘 DOCX/PPTX/PDF锛屼絾鎴浘浠嶆槸鏃х晫闈紝鍥㈤槦淇℃伅浠嶆槸鍗犱綅锛涙彁浜ゅ墠鐢?`.screens/` 鏂版埅鍥鹃噸鏂板鍑哄苟鏇挎崲鍥㈤槦淇℃伅銆?9. **鍥㈤槦淇℃伅**锛氱櫧鐨功/PPT 閲岀殑鍥㈤槦鍚嶇О銆佹垚鍛樹粛鏄崰浣嶇锛屾彁浜ゅ墠鏇挎崲銆?10. **褰撳墠鍒嗘敮鏈悎骞?*锛氬凡鎻愪氦 `b7d4aff`锛屼絾 `ui/swiss-redesign` 灏氭湭鍚堝苟鍒?`main`锛涙瘮璧涙彁浜ゅ墠纭鎻愪氦鐐逛笌鏋勫缓鏉ユ簮銆?11. **宸ュ叿杈圭晫**锛氬凡鏈?`calculator`銆乣knowledge_search`銆乣data_stats`銆乣browser_fetch`锛沗tool.python` 鏄彈闄愮粺璁★紝涓嶆墽琛屼换鎰忎唬鐮侊紱MCP 鏄笅涓€闃舵銆俙browser_fetch` 闇€瑕佸缃戙€?12. **鍗曞伐浣滄祦**锛氬彧鏈変竴寮犳紨绀哄伐浣滄祦锛屾病鏈夊椤圭洰/澶氬伐浣滄祦閫夋嫨锛涘钩鍙板寲鍙欎簨涓嶈瓒呰繃瀹炵幇銆?
## 11. 浜ゆ帴妫€鏌ユ竻鍗?
- [ ] 纭鍒嗘敮锛歚git switch ui/swiss-redesign`锛涘闃?`git status` 涓?`git log --oneline main..HEAD`
- [ ] `pnpm install`
- [ ] 濡傞渶骞插噣婕旂ず鏁版嵁锛氬厛鍋滄湇鍔★紝鍐?`pnpm reset`
- [ ] `pnpm typecheck && pnpm smoke && pnpm build`
- [ ] `pnpm dev`锛岀‘璁?5173 涓?8787 鍙敤
- [ ] 娴忚鍣ㄩ€愰〉妫€鏌ワ紱390px 妫€鏌ョЩ鍔ㄥ鑸€佽繍琛岄〉 Tabs銆丮odal
- [ ] 纭杩愯妯″紡锛圡ock / Live锛夊拰 Key 褰掑睘锛屼笉娌跨敤涓汉 Key
- [ ] 纭鎴浘銆佺櫧鐨功銆丳PT銆佹紨绀鸿剼鏈殑鍥㈤槦淇℃伅鍜岀晫闈㈢増鏈?- [ ] 鎻愪氦鎴栧綊妗?`ui/swiss-redesign` 鍒嗘敮
- [ ] 姣旇禌鎴鍓嶅鏍?README 涓殑鎴鏃ユ湡/瀹樼綉閾炬帴

## 12. 鐩稿叧閾炬帴

- [鏂囨。绱㈠紩](./README.md)
- [鎶€鏈灦鏋刔(./architecture.md)
- [3 鍒嗛挓婕旂ず鑴氭湰](./demo-script.md)
- [鐧界毊涔︽簮绋縘(./white-paper.md)
- [褰撳墠 UI 鎴浘](./boardui/)
- [椤圭洰 README](../README.md)
