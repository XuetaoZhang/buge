import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Fingerprint,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  Radio,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import {
  connectMonadWallet,
  contractAddress,
  deployBuGe,
  eventId,
  getContract,
  loadEvent,
  loadParticipant,
  monad,
  parseEther,
  recoverMonadWallet,
  shortAddress
} from "./contract";
import "./styles.css";

const demoAttendees = ["林一", "陈默", "吴青", "周临", "赵禾"];

function App() {
  const query = new URLSearchParams(window.location.search);
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const page = path === "/admin" ? "admin" : path === "/tap" || query.has("tap") ? "tap" : "register";
  const [account, setAccount] = useState("");
  const [provider, setProvider] = useState(null);
  const [activeAddress, setActiveAddress] = useState(query.get("contract") || contractAddress);
  const [activeEventId, setActiveEventId] = useState(Number(query.get("event") || eventId));
  const [event, setEvent] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [demoPresent, setDemoPresent] = useState(["林一", "陈默"]);
  const [demoRegistered, setDemoRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const [tapAttempted, setTapAttempted] = useState(false);
  const [tapState, setTapState] = useState("checking");
  const live = Boolean(activeAddress && event);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refresh = async (currentProvider = provider, currentAccount = account) => {
    if (!currentProvider || !activeAddress) return;
    try {
      const eventData = await loadEvent(currentProvider, activeAddress, activeEventId);
      setEvent(eventData);
      if (currentAccount) {
        setParticipant(await loadParticipant(currentProvider, activeAddress, activeEventId, currentAccount));
      }
    } catch (error) {
      setNotice(`读取链上状态失败：${error.shortMessage || error.message}`);
    }
  };

  const connect = async () => {
    setBusy(true);
    try {
      const wallet = await connectMonadWallet();
      setAccount(wallet.address);
      setProvider(wallet.provider);
      await refresh(wallet.provider, wallet.address);
      setNotice(activeAddress ? "钱包已连接到 Monad。" : "本地预览已连接钱包；部署后将使用真实 Monad 合约。 ");
    } catch (error) {
      setNotice(error.shortMessage || error.message);
    } finally {
      setBusy(false);
    }
  };

  const write = async (action) => {
    if (!activeAddress) {
      setNotice("请先在 /admin 部署不鸽合约并创建活动。");
      return;
    }
    setBusy(true);
    try {
      const wallet = await connectMonadWallet();
      setAccount(wallet.address);
      setProvider(wallet.provider);
      const contract = getContract(wallet.signer, activeAddress);
      const transaction = await action(contract);
      setNotice(`交易已发送：${shortAddress(transaction.hash)}，等待 Monad 最终确认。`);
      await transaction.wait();
      await refresh(wallet.provider, wallet.address);
      setNotice("Monad 已确认。规则和资金状态已更新。");
    } catch (error) {
      setNotice(error.shortMessage || error.reason || error.message);
    } finally {
      setBusy(false);
    }
  };

  const preserveDeploymentLink = (address, id = activeEventId) => {
    const next = new URL(window.location.href);
    next.searchParams.set("contract", address);
    next.searchParams.set("event", String(id));
    window.history.replaceState({}, "", next);
  };

  const deploy = async () => {
    setBusy(true);
    try {
      const wallet = await connectMonadWallet();
      setAccount(wallet.address);
      setProvider(wallet.provider);
      setNotice("正在部署不鸽合约到 Monad...");
      const deployed = await deployBuGe(wallet.signer);
      const address = await deployed.getAddress();
      setActiveAddress(address);
      preserveDeploymentLink(address, 1);
      setNotice(`不鸽合约已部署：${shortAddress(address)}。现在创建活动。`);
    } catch (error) {
      setNotice(error.shortMessage || error.reason || error.message);
    } finally {
      setBusy(false);
    }
  };

  const createTonightEvent = async () => {
    if (!activeAddress) return deploy();
    setBusy(true);
    try {
      const wallet = await connectMonadWallet();
      const contract = getContract(wallet.signer, activeAddress);
      const start = Math.floor(Date.now() / 1000);
      let attestor = wallet.address;
      try {
        const relay = await fetch("/api/relay-info");
        const relayInfo = await relay.json();
        if (relay.ok && relayInfo.attestorAddress) attestor = relayInfo.attestorAddress;
      } catch {
        // Local Vite preview has no serverless relayer. The connected wallet is only a development fallback.
      }
      const transaction = await contract.createEvent(attestor, parseEther("0.01"), start + 180, start + 420, start + 7200);
      setNotice("正在创建今晚活动...");
      await transaction.wait();
      setActiveEventId(1);
      preserveDeploymentLink(activeAddress, 1);
      await refresh(wallet.provider, wallet.address);
      setNotice(`活动已创建，签到 relayer：${shortAddress(attestor)}。将 /tap?token=现场令牌 写入 NFC。`);
    } catch (error) {
      setNotice(error.shortMessage || error.reason || error.message);
    } finally {
      setBusy(false);
    }
  };

  const status = useMemo(() => {
    if (live) {
      return {
        registered: event.registered,
        present: event.present,
        noShow: Math.max(0, event.registered - event.present),
        stake: event.stake,
        seconds: Math.ceil(Math.max(0, event.checkInDeadline * 1000 - now) / 1000),
        finalized: event.finalized,
        payout: event.payout
      };
    }
    return { registered: 5, present: demoPresent.length, noShow: 5 - demoPresent.length, stake: "0.01", seconds: 42, finalized: false, payout: "0.0166" };
  }, [demoPresent, event, live, now]);

  const register = async () => {
    if (live) return write((contract) => contract.register(activeEventId, { value: parseEther(event.stake) }));
    if (activeAddress) {
      setNotice("请先连接钱包，读取这场活动的链上状态。");
      return;
    }
    setBusy(true);
    setNotice("正在锁定保证金...");
    window.setTimeout(() => {
      setDemoRegistered(true);
      setNotice("本地预览：保证金已锁定。真实部署后，这里是 Monad 交易确认。 ");
      setBusy(false);
    }, 800);
  };

  const submitNfcTap = async (wallet) => {
    const tapToken = query.get("token");
    if (!tapToken) throw new Error("此 NFC 标签缺少现场令牌。");
    const response = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: activeEventId, attendee: wallet.address, tapToken })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "现场确认失败");
    await refresh(wallet.provider, wallet.address);
    setTapState("success");
    setNotice(result.alreadyCheckedIn ? "你已确认到场。" : "已到场，Monad 已最终确认。");
  };

  useEffect(() => {
    if (page !== "tap" || tapAttempted) return;
    setTapAttempted(true);
    const checkInFromNfc = async () => {
      setBusy(true);
      try {
        if (!activeAddress) {
          await new Promise((resolve) => window.setTimeout(resolve, 820));
          setDemoPresent((current) => current.includes("吴青") ? current : [...current, "吴青"]);
          setTapState("success");
          setNotice("本地预览：已模拟 Monad 到场确认。");
          return;
        }
        const wallet = await recoverMonadWallet();
        if (!wallet) throw new Error("未找到已授权的报名钱包。请使用报名时的同一浏览器打开 NFC 标签。");
        setAccount(wallet.address);
        setProvider(wallet.provider);
        await submitNfcTap(wallet);
      } catch (error) {
        setTapState("failed");
        setNotice(error.shortMessage || error.message || "无法确认到场");
      } finally {
        setBusy(false);
      }
    };
    checkInFromNfc();
  }, [activeAddress, page, tapAttempted]);

  const shared = { account, activeAddress, activeEventId, busy, connect, event, live, notice, participant, register, status, write };
  if (page === "tap") return <TapPage tapState={tapState} notice={notice} />;
  if (page === "admin") return <AdminPage {...shared} createTonightEvent={createTonightEvent} deploy={deploy} />;
  return <RegistrationPage {...shared} demoRegistered={demoRegistered} />;
}

function Topbar({ account, busy, connect, admin = false, activeAddress, event, deploy, createTonightEvent }) {
  return <nav className="topbar">
    <a className="brand" href="/" aria-label="不鸽首页"><span>不</span>鸽</a>
    <div className="network"><Radio size={14} /> {monad.name}</div>
    {admin && !activeAddress && <button className="setup-button" onClick={deploy} disabled={busy}><Landmark size={15} /> 部署合约</button>}
    {admin && activeAddress && !event && <button className="setup-button" onClick={createTonightEvent} disabled={busy}><ChevronRight size={15} /> 创建活动</button>}
    {connect && <button className="wallet-button" onClick={connect} disabled={busy}><WalletCards size={16} /> {account ? shortAddress(account) : "连接钱包"}</button>}
  </nav>;
}

function RegistrationPage({ account, activeAddress, activeEventId, busy, connect, demoRegistered, event, live, notice, participant, register, status, write }) {
  const registered = live ? participant?.registered : demoRegistered;
  return <main className="registration-page">
    <Topbar account={account} busy={busy} connect={connect} />
    <section className="registration-shell">
      <header className="registration-intro">
        <p className="eyebrow">MONAD BLITZ · WUHAN</p>
        <h1>把约定，<br />锁进链上。</h1>
        <p>报名时锁入一笔极小保证金。到场碰一下现场 NFC；爽约者的保证金由到场者按规则领取。</p>
      </header>
      <section className="deposit-layout">
        <article className="deposit-card">
          <div className="panel-label"><LockKeyhole size={16} /> 活动保证金</div>
          <h2>{registered ? "保证金已锁定" : "确认报名"}</h2>
          <dl className="deposit-details">
            <div><dt>活动</dt><dd>Monad Blitz · Wuhan</dd></div>
            <div><dt>锁入金额</dt><dd>{status.stake} MON</dd></div>
            <div><dt>资金托管</dt><dd>不鸽 Monad 合约</dd></div>
          </dl>
          <button className="deposit-button" onClick={register} disabled={busy || registered}>
            {busy ? <LoaderCircle className="spin" size={21} /> : registered ? <Check size={21} /> : <LockKeyhole size={20} />}
            {registered ? "保证金已锁定" : `报名并锁定 ${status.stake} MON`}
          </button>
          <p className="deposit-note">报名完成后，到活动现场碰触 NFC 即可确认到场，无需工作人员扫码。</p>
          {live && event.finalized && participant?.present && <button className="claim-button" onClick={() => write((contract) => contract.claim(activeEventId))} disabled={busy || participant.claimed}>{participant.claimed ? "爽约池份额已领取" : `领取 ${status.payout} MON`}</button>}
        </article>
        <aside className="arrival-explainer">
          <div className="panel-label"><Fingerprint size={16} /> 到场方式</div>
          <ol>
            <li><span>01</span><div><b>报名锁金</b><small>你的钱包与本次活动绑定</small></div></li>
            <li><span>02</span><div><b>现场碰触 NFC</b><small>不扫二维码，不再签一次钱包</small></div></li>
            <li><span>03</span><div><b>Monad 最终确认</b><small>到场资格和结算份额同时锁定</small></div></li>
          </ol>
        </aside>
      </section>
      {notice && <div className="notice">{notice}</div>}
      {!activeAddress && <p className="preview-caption">本地预览模式。部署后，保证金将由 Monad 合约实际托管。</p>}
    </section>
  </main>;
}

function TapPage({ tapState, notice }) {
  const success = tapState === "success";
  const failed = tapState === "failed";
  return <main className="tap-page">
    <nav className="topbar"><a className="brand" href="/" aria-label="不鸽首页"><span>不</span>鸽</a><div className="network"><Radio size={14} /> Monad</div></nav>
    <section className="tap-shell">
      <div className={`tap-mark ${success ? "success" : failed ? "failed" : ""}`}>{success ? <BadgeCheck size={48} /> : failed ? <ShieldCheck size={48} /> : <LoaderCircle className="spin" size={48} />}</div>
      <p className="eyebrow">NFC 现场标签已识别</p>
      <h1>{success ? "已确认到场" : failed ? "暂未完成确认" : "正在确认到场"}</h1>
      <p className="tap-copy">{success ? "你的到场资格已经写入 Monad。签到窗口关闭后，你可领取保证金返还与爽约池份额。" : failed ? notice : "无需工作人员操作，活动 relayer 正在代付 gas 并写入 Monad。"}</p>
      <div className="tap-status"><span className={success ? "done" : ""}>{success ? <Check size={16} /> : <LoaderCircle className="spin" size={16} />}</span><div><b>{success ? "Monad 已最终确认" : "等待 Monad 最终确认"}</b><small>{success ? "到场资格已锁定" : "通常约 0.8 秒"}</small></div></div>
      {success && <p className="tap-finish">现在可以直接进入会场。</p>}
    </section>
  </main>;
}

function AdminPage({ account, activeAddress, activeEventId, busy, connect, createTonightEvent, deploy, event, live, notice, status, write }) {
  return <main>
    <Topbar account={account} activeAddress={activeAddress} busy={busy} connect={connect} admin event={event} deploy={deploy} createTonightEvent={createTonightEvent} />
    <section className="shell admin-shell">
      <header className="event-header">
        <div><p className="eyebrow">ORGANIZER CONSOLE</p><h1>活动总览</h1><p className="subtitle">参与者报名与 NFC 签到已拆为独立页面。</p></div>
        <div className="deadline"><Clock3 size={18} /><span>{status.seconds}s</span><small>签到窗口</small></div>
      </header>
      <section className="metrics" aria-label="活动状态">
        <Metric value={`${status.present}/${status.registered}`} label="已到场" accent />
        <Metric value={`${status.noShow}`} label="待确认爽约" />
        <Metric value={`${status.stake} MON`} label="每人保证金" />
        <Metric value={`${status.payout} MON`} label="预计到场返还" />
      </section>
      <section className="admin-grid">
        <article className="admin-panel"><div className="panel-label"><Fingerprint size={16} /> 无人值守签到</div><h2>现场只有一块 NFC 标签。</h2><p>参与者碰触后自动进入 /tap 页面，由 relayer 写入 Monad；这里无需出现“模拟碰触”按钮。</p><div className="tap-flow"><span>报名<br /><b>锁定保证金</b></span><i>→</i><span>到场<br /><b>碰触 NFC</b></span><i>→</i><span>Monad<br /><b>最终确认</b></span></div></article>
        <article className="roster-panel"><div className="panel-label"><BadgeCheck size={16} /> 到场名单</div><div className="roster">{demoAttendees.map((name, index) => { const present = index < status.present; return <div className="person" key={name}><span className={`dot ${present ? "present" : ""}`} /><span>{name}</span><small>{present ? "已确认到场" : "未签到"}</small></div>; })}</div></article>
      </section>
      <section className="settlement"><div className="settlement-copy"><div className="panel-label"><Landmark size={16} /> 链上结算</div><h2>{status.finalized ? "爽约池已结算" : "窗口关闭后，由合约结算"}</h2><p>组织者不能触碰保证金。每位到场者独立领取保证金与爽约池份额。</p></div><button className="finalize-button" onClick={() => write((contract) => contract.finalize(activeEventId))} disabled={busy || !live || status.finalized}><ArrowRight size={18} /> 结算活动</button></section>
      {notice && <div className="notice">{notice}</div>}
      <footer><span>保证金不经过平台钱包</span>{activeAddress && <a href={`${monad.explorer}/address/${activeAddress}`} target="_blank" rel="noreferrer">查看合约 <ExternalLink size={13} /></a>}</footer>
    </section>
  </main>;
}

function Metric({ value, label, accent }) {
  return <div className={`metric ${accent ? "accent" : ""}`}><strong>{value}</strong><span>{label}</span></div>;
}

createRoot(document.getElementById("root")).render(<App />);
