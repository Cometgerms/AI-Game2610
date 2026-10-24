# 测试说明：五人联机 v0.5

先构建 C++：`powershell -ExecutionPolicy Bypass -File scripts/check-server.ps1`。运行 `pnpm build`、`pnpm test`、`pnpm test:ui`。

## 手工试玩

按 [登录与联机说明](LOGIN-AND-LAN.md) 在同一浏览器打开五个标签，分别游客登录。创建房间、加入同一房间码、五人齐后开局。上方国家栏不能切换控制权。

分别测试投资、征兵、固守、科研和法令；在另一标签接受完全相同的条约；五人确认后房主结算。检查资源账本、军队、条约期限、科技、战报与分数。编辑已确认计划应撤销确认，刷新原标签应恢复身份与已保存草稿。完成回合后房主可结束并查看总排名。

国策模块切换应保留文字；语言切换应切到对应语言的同一模块。检查房间标题与按钮不重叠，手机不横向溢出，减少动画设置有效。

## 自动覆盖

- 前端与 C++：地图拓扑、模板迁移、经济、军令、科技、法令、条约、战争、计分、五地图各十回合。
- 房间：独立身份、私密密码、并发占位、权限、隐藏他国草稿、伪造军令/条约签名、旧版本拒绝、重复结算、原子失败、服务器重启恢复、邮箱身份重登恢复席位。
- HTTP：Supabase SDK 对本地模拟提供方发送 OTP/验证，正确与错误验证码，发信限流、跨站拒绝、请求体限制、未登录拒绝。不会发送真实邮件。
- 浏览器：同一 BrowserContext 内五个标签，游客身份隔离，复制标签清除继承身份，席位锁定，草稿自动保存与立即确认竞态，双签条约，两回合原生结算，刷新恢复、历史、结束计分、退出隔离。
- UI：八个图标模块、双语编辑保存、房间按钮宽度与标题间隔、390px 布局、五张二维 SVG 地图、缩放和标签避让、Anime.js 与减少动画。

浏览器测试默认自行启动 5180 端口的测试服务器，使用临时数据并在结束后清理，不改动实际游戏存档。`PREVIEW_URL` 可指向已运行服务（此时会在目标服务创建测试房间）；`BROWSER_CHANNEL` 默认 msedge。截图位于忽略的 `build/screenshots/`。

## 尚待实测

实际 Supabase 项目的邮件投递、跨物理设备/防火墙、长时间网络中断、公网部署、竞技平衡尚待验证。AI 的真实调用、延迟和用量另见本次玩法报告。

## 紧凑仪表盘回归

新增 `tests/dashboard/telemetry.test.ts`：历史模式不混入未来数据、最多八个真实快照、初始/零值/平坦趋势、GPU 顶点与实际地区归属映射。浏览器回归增加 1366×900 首屏数据和结算控件可见性、地图与数据无重叠、1150×650 滚动不悬停遮挡、五国名称和颜色标记、首次结算前不绘制虚构趋势。

## 小屏幕、条约与行动入口

`pnpm test:responsive` 在隔离的 5182 端口测试五张地图 × 四种视口（1440×800、1280×720、1024×768、390×844），检查地图最小高度、完整标签不重叠、国家图例、横向溢出和收支展开。不会使用现有房间存档。

`tests/treaties/lifecycle.test.ts` 检查拒绝与撤回的操作人、回合、权限、重复接受保护、撤销双方确认、结算及重启后保留记录；关闭的双签条约不能转移资源或阻止进攻。

行动面板通过「军事 / 发展与科研 / 法令 / 持续国政」切换。自动征兵设置档位、目标军力和每回合预算；也可手动单次征兵。移动与撤退需要相邻本国地区，进攻需要相邻外国地区。五人确认后房主统一结算。科研不足时先排入科研投资，再排科技升级。自然语言通过 AI 提议结构化指令，经玩家审阅后应用。

## v0.5 扩展玩法

`tests/strategy/` 覆盖自动补员、资源约束、持续预算按比例缩减、条约定期原子支付、违约、条件终止、还价重新签署、撕约一次扣分、AI 输出验证和持久化预算限制。

`tests/playtest/campaign.mjs` 启动隔离 5184 服务，以五个独立游客标签完成十回合，真实 AI 只用于开局条约与行动，后续为明确的脚本策略；最终仍通过 UI 确认、结算、结束。`tests/playtest/sweep.ts` 另做五地图×五角色轮换的和平对照及动员敏感性实验。真实 API 测试会消耗配置账户额度；常规 `pnpm test` 使用模拟提供方。

五标签浏览器测试还会实际点击征兵、工业投资、科研投资、科技升级和法令，检查队列提示、重复军令拦截及结算效果；从双方页面检查条约拒绝与撤回记录。

## STRAT 引导与诊断回归

`pnpm test:onboarding` 在隔离的 5188 端口运行桌面和 390px 手机完整教学：确认进入、取消、退出确认、地图选兵/目的地、自定调兵数量、投资、科研、自动补员、巡逻、自定贸易报价、防守、三回合通关。检查实际易手领地、制海权、战果、回放/跳过、近景裁切与拖动、中英文来袭提示；不设强制时限。

同时验证邮箱/游客顺序、右下角连接灯、真实网络中断与重连、服务器 404 请求编号、系统剪贴板和兼容复制回退、结算动画及减少动态效果。所有测试使用临时房间，正式存档不变。

`tests/strategy/practice.test.ts` 验证真实原生教学结算、玩家输入影响驻军、对手移动和占领、报价拒绝后重试、非法/超预算指令原子拒绝、玩家隔离、过期/并发步骤拒绝和科技费用、经济计分。


## 海洋回归

`tests/strategy/ocean.test.ts` 检查五地图的岛国多向联系、舰队守恒、建造与部署时间、费用、同源冲突、控制平局、科技优势、海运成本与容量、封锁与和平。`tests/network/rooms.test.ts` 验证旧档迁移保留草稿/历史、不修改结束局、不重复迁移。AI单元测试使用模拟提供方检查海军枚举、预备编号和非法部署拒绝。

`node tests/browser/maritime.mjs` 用5186隔离服务和同一浏览器上下文五个独立游客标签，完成3回合巡逻、封锁、造舰、开放通航及岛国登陆。截图位于build/screenshots/maritime-*.png，实际结算数据位于build/maritime-playtest.json。

## v0.9 聚光与兵力显示

`tests/atlas/representation.test.ts` 检查零驻军不生成点、点群随兵力增加且尺寸有界；等高线生成器仍作为未启用的候选展示保留有限数值检查，当前地图不渲染该层。

教学浏览器测试逐步经过四段基础聚光，再执行三个真实回合；检查上下文提示、Escape、重新查看引导、动画和减少动态效果。地图必须没有背景点阵和可见等高线。桌面和手机截图在 `build/screenshots/spotlight-intro-*.png`，全回合截图延续 `tactical-*.png`。


## v0.10 自然语言与输入限额

`tests/strategy/practice-intent.test.ts` 覆盖百万工业投资、全部调兵、多个投资共享预算、小数截取、负数/非有限值拒绝、敌方来源/非相邻目标拒绝、AI 模拟响应限额、预览不改变世界和贴近高亮的定位。

`pnpm test:onboarding` 桌面通过自然语言完成全部三个回合；手机通过手动微调完成。两者均实际输入 1000000 工业投资，检查 250 的截取结果，手机输入框也应回填 250。教学不依赖付费 AI 完成。

`tsx tests/playtest/practice-ai-smoke.ts` 是可选的真实 API 测试，会使用 `.env` 配置并消耗额度。只打印指令与实际结果，不打印密钥；输出位于 `build/playtest/`。当前单次中文自由表述测试包含全量调动、百万投资和科研，再执行真实结算。


## v0.11 回合交接与目标式指挥

- `tests/combat/details.test.ts`：缺粮/能源、固守组合的前端条件预估与 C++ 战力/存活结果一致，伤亡守恒。
- `tests/strategy/practice-intent.test.ts`：中英文加强首都，无源/目标参数；自动选取合法相邻部队并保留后方驻军。
- `tests/network/rooms.test.ts`：四人已读仍阻止新计划，第五人确认后解锁，重启保存进度，旧回合确认拒绝。
- `tests/browser/preparation.mjs`：同一浏览器五个独立游客标签，两个真实回合、逐人确认总结。
- `tests/browser/onboarding.mjs`：桌面/手机真实三回合、默认没有强制源/目标选择器、自动增援、超额截取、交战预估和结算弹窗。
- `tests/playtest/practice-ai-smoke.ts`：显式全军+百万投资、目标式防御保留后方、明确3人调动三种真实模型调用；检查合法指令并实际结算。输出到 `build/playtest/practice-ai-result.json`，开销日志不含密钥。

2026-10-23：75/75 自动测试、原生 CTest、生产构建通过；真实 AI 三个案例均通过。地图五预设×四尺寸布局检查通过。浏览器截图位于 `build/screenshots/turn-review-*.png` 和 `tactical-*.png`。
同日浏览器回归完成：五标签两回合、桌面/手机各三回合教学、五标签三回合海洋流程全部通过。


## v0.12 地图视觉回归
`node tests/cartography/preview.mjs` 启动隔离的5189端口，验证地理底图、25个紧凑步兵标记、移除独立光圈、首都/世界视角和手机横向边界。截图：`build/screenshots/atlas-world.png`、`atlas-capital.png`、`atlas-mobile.png`。细山脊纹理为渲染细节，不改变模拟数据。


## v0.13 水流与云互动
`node tests/atmosphere/browser.mjs` 使用隔离5190端口，检查河流、海浪、云漂移动画实际数值变化；鼠标点击移动云后散开且不选择领地，拖过云仍平移地图且不误点散；检查键盘、减少动态效果、云再生数量上限和手机边界。截图保存在 `build/screenshots/atmosphere-*.png`。

### Loading and teaching feedback regression (2026-10-23)
- `node tests/loading/browser.mjs`: isolated five-player room, noncontiguous actual readiness, moving loader, settlement/review acknowledgment barrier, military glyphs, mobile and reduced motion.
- `tsx --test tests/practice-feedback/server.test.ts tests/strategy/practice-intent.test.ts`: unsupported/mixed AI intent (stubbed provider), typed input guidance, provider failure, resource clipping and recovery. Included feedback tests in the standard test command.
- `node tests/practice-feedback/browser.mjs`: simulated unsupported response through real client handling; input retention/no partial preview, mobile layout, real local example preview, and aborted-network diagnostic.
