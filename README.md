# 不鸽 / BuGe

不鸽是一个运行在 Monad 上的活动到场保证金协议：报名者锁定保证金，到场者在签到窗口内获得链上到场资格；窗口关闭后，爽约者留下的资金按规则归到场者领取。

## demo地址
报名端
https://buge-omega.vercel.app/
签到端（短码 URL，写入 NFC）
https://buge-omega.vercel.app/tap?code=buge2
管理端
https://buge-omega.vercel.app/admin


## 今晚 Demo 的真实边界

- 链上：保证金、报名、到场状态、截止时间、结算和领取。
- 物理世界：NFC 是到场触发器，不是魔法证明。普通写 URL 的 NFC 标签等同可复制的二维码。
- 生产方案：使用安全动态 NFC（例如 NTAG 424 DNA）验证每次 tap 的 MAC/counter；服务端验证后，由 attestor/relayer 调用 `attestCheckIn`。
- 本项目提供 `checkInSelf` 作为无 relayer 的演示回退，提供 `api/checkin.js` 作为 Vercel relayer 样例。

## 本地运行

```bash
npm install
npm run build
npm run dev
```

没有 `.env` 时，页面以离线 Demo 模式运行。它用于录制和验收 UI，不伪装为真实链上交易。

## 部署合约

1. 复制 `.env.example` 为 `.env`，填写 Monad 官方网络 RPC。
2. 使用只含测试金额的钱包私钥：

```bash
MONAD_RPC_URL="..." DEPLOYER_PRIVATE_KEY="..." npm run deploy
```

3. 将输出的合约地址填写为 `VITE_BUGE_CONTRACT_ADDRESS`。
4. 通过合约的 `createEvent(attestor, stake, registrationDeadline, checkInDeadline, claimDeadline)` 创建活动；将活动编号填入 `VITE_BUGE_EVENT_ID`。
5. 重新构建并部署前端。

## 无工作人员 Demo

这里的“无工作人员”指活动现场不需要扫码员或人工逐一确认，不是把物理世界的验证凭空变成链上事实。完整闭环是：报名时钱包锁定保证金 -> 到场时碰触 NFC -> relayer 代表活动提交链上到场 -> Monad 最终确认 -> 截止后合约按规则结算。

部署后的界面按参与者任务拆分：

- `/`：报名并锁入保证金。
- `/tap?code=现场短码`：NFC 打开的自动签到页，仅显示确认中与成功状态。如果自动签到失败，页面会展示"连接钱包签到"和"自行签名签到"两个手动按钮。
- `/admin?contract=0x...&event=1`：组织者查看到场人数并在窗口关闭后触发结算。

1. 报名者在同一域名先连接钱包并调用 `register()` 锁定保证金。钱包对该域名的授权会被浏览器保留。
2. Vercel 配置 `MONAD_RPC_URL`、`ATTESTOR_PRIVATE_KEY`、`BUGE_CONTRACT_ADDRESS`、`NFC_TAP_TOKEN` 与 `TAP_CODES`。`ATTESTOR_PRIVATE_KEY` 必须是活动创建时配置的 `attestor` 地址，且应使用仅含演示资金的专用 relayer 钱包。`TAP_CODES` 格式为 `{"短码":{"eventId":活动编号,"token":"令牌值"}}`。
3. NFC 标签写入 `https://你的域名/tap?code=短码`（例如 `https://你的域名/tap?code=buge2`）。短码由 Vercel 环境变量 `TAP_CODES` 配置，格式为 `{"短码":{"eventId":活动编号,"token":"NFC_TAP_TOKEN"}}`。
4. 现场碰触后，页面无须再次弹钱包；它以 `eth_accounts` 恢复此前授权的钱包地址，调用 `/api/checkin`。relayer 代付 gas 并发送 `attestCheckIn()`，页面只在 Monad `finalized` 状态后显示”已到场”。因此现场没有排队的扫码动作，也没有每人一次的钱包确认。
5. 如果自动签到失败（例如换了浏览器、钱包未授权），页面会展示两个手动按钮：
   - **连接钱包签到**：唤起 MetaMask 授权后由 relayer 代付 gas 完成签到。
   - **自行签名签到**：直接调用合约 `checkInSelf()`，由用户自己支付 gas。

