(function () {
  const KEY = "hiring-copilot-v1";
  const D = HireData;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  let state = load();
  let jobId = "J1";
  let me = defaultInterviewer();
  let selected = null;
  let ivSelected = null;
  let showClosed = false;
  let flash = { where: "", err: "", ok: "" };
  const flashHtml = (where) => (flash.where !== where ? "" : flash.err ? `<div class="err">${esc(flash.err)}</div>` : flash.ok ? `<div class="ok-msg">${esc(flash.ok)}</div>` : "");

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.candidates) return s;
    } catch (e) { /* 本地数据损坏时重新生成 */ }
    return Hire.initState();
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  const today = () => D.TODAY;
  const job = () => Hire.jobOf(jobId);
  const cands = () => state.candidates.filter((c) => c.job === jobId);
  const byId = (id) => state.candidates.find((c) => c.id === id);
  const ivName = (id) => D.INTERVIEWERS.find((i) => i.id === id).name;
  const scoreOf = (c) => Hire.screen(c, Hire.jobOf(c.job), Hire.weightsFor(state, Hire.jobOf(c.job)));
  const scoreCls = (t) => (t >= 60 ? "s-hi" : t >= 40 ? "s-mid" : "s-lo");
  const view = (c) => Hire.blindView(c, state.blind);

  function pendingFor(iv) {
    return state.candidates.filter((c) => c.status === "active" && (Hire.PANEL[Hire.current(c).stage] || []).includes(iv)
      && !Hire.feedbackFor(state, c.id, Hire.current(c).stage).some((f) => f.interviewer === iv));
  }
  function defaultInterviewer() {
    const counts = D.INTERVIEWERS.map((i) => [i.id, pendingFor(i.id).length]).sort((a, b) => b[1] - a[1]);
    return counts[0][1] ? counts[0][0] : "I1";
  }

  // ---------- 顶栏 ----------
  function renderHeader() {
    $("#job").innerHTML = D.JOBS.map((j) => `<option value="${j.id}" ${j.id === jobId ? "selected" : ""}>${j.title} · ${j.team}</option>`).join("");
    $("#me").innerHTML = D.INTERVIEWERS.map((i) => {
      const n = pendingFor(i.id).length;
      return `<option value="${i.id}" ${i.id === me ? "selected" : ""}>我是 ${i.name} · ${i.title}${n ? `（待评 ${n}）` : ""}</option>`;
    }).join("");
    $("#blind").checked = !!state.blind;
  }

  // ---------- 候选人管道 ----------
  function renderSla() {
    const late = Hire.slaBreaches(state, today()).filter((x) => x.cand.job === jobId);
    $("#sla").innerHTML = (late.length ? `<b style="color:#9a3412">超时提醒 ${late.length}</b>` : `<span class="muted">没有超时停留的候选人</span>`)
      + late.slice(0, 6).map((x) => `<span class="chip" data-pick="${x.cand.id}">${esc(view(x.cand).name)} 在「${Hire.stageName(x.stage)}」${x.days} 天（时限 ${x.sla}）</span>`).join("")
      + `<label class="switch" style="margin-left:auto"><input type="checkbox" id="closed" ${showClosed ? "checked" : ""}/> 显示已淘汰</label>`;
  }

  function card(c) {
    const s = scoreOf(c);
    const cur = Hire.current(c);
    const d = Hire.days(cur.enter, c.status === "active" ? today() : (cur.exit || today()));
    const sla = D.STAGES.find((x) => x.key === cur.stage).sla;
    const late = c.status === "active" && sla != null && d > sla;
    const tag = c.status === "rejected" ? `<span class="muted">已淘汰 · ${esc(c.rejectReason)}</span>` : `<span class="${late ? "late" : ""}">${d} 天</span>`;
    return `<div class="cc ${c.id === selected ? "sel" : ""}" data-pick="${c.id}" style="${c.status === "rejected" ? "opacity:.55" : ""}">
      <div class="n"><span>${esc(view(c).name)}</span><span class="score ${scoreCls(s.total)}">${s.total}</span></div>
      <div class="m"><span>${c.source}</span>${tag}</div></div>`;
  }

  function renderBoard() {
    const list = cands();
    $("#board").innerHTML = D.STAGES.map((st) => {
      const here = list.filter((c) => Hire.current(c).stage === st.key && (c.status !== "rejected" || showClosed))
        .sort((a, b) => (a.status === "rejected") - (b.status === "rejected") || scoreOf(b).total - scoreOf(a).total);
      const active = here.filter((c) => c.status !== "rejected").length;
      return `<div class="col"><h4 title="${st.sla ? `停留时限 ${st.sla} 天` : ""}">${st.name}<span>${active}</span></h4>${here.map(card).join("") || '<div class="muted" style="padding:6px">—</div>'}</div>`;
    }).join("");
  }

  function feedbackBlock(c, stage) {
    const fbs = Hire.feedbackFor(state, c.id, stage);
    const panel = Hire.PANEL[stage];
    if (!fbs.length && !(Hire.current(c).stage === stage && c.status === "active")) return "";
    const head = `<h3>${Hire.stageName(stage)}反馈（${fbs.length}/${panel.length}）</h3>`;
    if (!Hire.canSeeOthers(state, c.id, stage, me)) {
      return head + `<div class="locked">🔒 你还没提交这一轮的反馈，提交前看不到其他面试官的评价，避免被带偏。<br/>招聘经理（何曼）可以随时查看。</div>`;
    }
    const agg = Hire.aggregate(fbs);
    const names = Object.fromEntries(Hire.jobOf(c.job).attributes.map((a) => [a.key, a.name]));
    return head + fbs.map((f) => `<div class="fb"><div class="h"><span>${ivName(f.interviewer)}</span><span class="r${f.overall}">${Hire.RATING[f.overall]}</span></div>
        <div class="muted">${Object.entries(f.ratings).map(([k, v]) => `${names[k]} <span class="r${v}">${v}</span>`).join(" · ")}</div>
        <div style="margin-top:4px">${esc(f.note)}</div></div>`).join("")
      + (fbs.length ? `<div class="agg">平均 ${agg.avg.toFixed(1)} 分 · 结论：<b>${agg.decision}</b>${agg.flags.map((x) => `<div class="flag">⚠ ${x}</div>`).join("")}</div>` : "");
  }

  function renderDetail() {
    const c = byId(selected);
    if (!c || c.job !== jobId) { $("#detail").innerHTML = `<div class="muted">点击左侧候选人卡片查看初筛依据、面试反馈和操作。</div>`; return; }
    const j = Hire.jobOf(c.job);
    const s = scoreOf(c);
    const v = view(c);
    const cur = Hire.current(c);
    const idx = Hire.STAGE_KEYS.indexOf(cur.stage);
    const next = Hire.STAGE_KEYS[idx + 1];
    const terms = j.attributes.flatMap((a) => a.keywords);
    const resume = c.resume.map((line) => {
      const hit = terms.filter((t) => line.includes(t));
      return `<li>${Hire.highlight(line, hit, esc)}</li>`;
    }).join("");
    let actions = "";
    if (c.status === "active" && next) {
      actions = `<div class="actions">
        <button data-act="advance">推进到「${Hire.stageName(next)}」</button>
        <select id="reason"><option value="">淘汰原因…</option>${D.REJECT_REASONS.map((r) => `<option>${r}</option>`).join("")}</select>
        <button class="danger" data-act="reject">淘汰</button></div>`;
    }
    const msgKind = c.status === "rejected" ? "reject" : next === "offer" ? "offer" : "invite";
    const msg = Hire.message(msgKind, c, { name: state.blind ? "{姓名}" : c.name, stage: Hire.stageName(next || cur.stage), slots: "周三 14:00 / 周四 10:30 / 周五 16:00" });
    $("#detail").innerHTML = `
      <h1>${esc(v.name)}</h1>
      <div class="sub">${esc(v.meta)} · ${c.years} 年经验 · ${c.source} · ${c.applied} 投递</div>
      <div class="sub">当前：<b>${Hire.stageName(cur.stage)}</b>${c.status === "rejected" ? ` · 已淘汰（${esc(c.rejectReason)}）` : c.status === "hired" ? " · 已入职" : ""}</div>
      <div class="rec r-${s.rec}"><b>初筛 ${s.total} 分 · ${s.rec}</b>${esc(s.reason)}</div>
      ${actions}
      ${flashHtml("detail")}
      <h3>评分卡匹配（每一分都有简历原文依据）</h3>
      ${s.attrs.map((a) => `<div class="attr"><div class="h"><span>${a.name}${a.must ? '<span class="must">必备</span>' : ""}</span><span>${a.points} / ${Math.round(a.weight * 100)}</span></div>
        <div class="bar"><i style="width:${a.level * 100}%"></i></div>
        ${a.evidence.length ? `<ul>${a.evidence.map((e) => `<li>${Hire.highlight(e.line, e.terms, esc)}</li>`).join("")}</ul>` : '<div class="muted">简历中未找到相关经历</div>'}</div>`).join("")}
      <div class="ko">${s.knockouts.map((k) => `<span class="${k.pass ? "p" : "f"}">${k.pass ? "✓" : "✕"} ${k.name}</span>`).join("")}</div>
      <h3>简历原文</h3><ul class="muted" style="padding-left:16px;margin:0">${resume}</ul>
      ${feedbackBlock(c, "phone")}${feedbackBlock(c, "onsite")}
      <h3>候选人沟通（模板预览）</h3><pre class="msg">${esc(msg)}</pre>
      <h3>流程记录</h3><ul class="tl">${c.history.map((h) => `<li><span>${h.enter}</span><span>进入「${Hire.stageName(h.stage)}」${h.exit ? `，停留 ${Hire.days(h.enter, h.exit)} 天` : ""}</span></li>`).join("")}
        ${c.status === "rejected" ? `<li><span>${c.rejectedAt}</span><span>淘汰：${esc(c.rejectReason)}</span></li>` : ""}</ul>`;
  }

  function act(kind) {
    const c = byId(selected);
    flash = { where: "detail", err: "", ok: "" };
    try {
      if (kind === "advance") { Hire.advance(state, c.id, today()); flash.ok = `已推进到「${Hire.stageName(Hire.current(c).stage)}」`; }
      if (kind === "reject") { Hire.reject(state, c.id, $("#reason").value, today()); flash.ok = "已淘汰，拒信模板见下方"; }
      save();
    } catch (e) { flash.err = e.message; }
    renderAll();
  }

  // ---------- 我的面试 ----------
  function renderInterviews() {
    const todo = pendingFor(me);
    const done = state.candidates.filter((c) => state.feedback.some((f) => f.cand === c.id && f.interviewer === me)).slice(0, 12);
    const list = [...todo.map((c) => [c, true]), ...done.filter((c) => !todo.includes(c)).map((c) => [c, false])];
    if (!list.some(([c]) => c.id === ivSelected)) ivSelected = list[0] ? list[0][0].id : null;
    const isHM = me === Hire.HIRING_MANAGER;
    const left = `<div class="card"><h2>${ivName(me)} 的面试</h2>
      ${isHM ? '<p class="muted">招聘经理不在面试官名单里，但可以查看所有反馈。</p>' : ""}
      <ul class="ivl">${list.map(([c, pending]) => `<li data-iv="${c.id}" class="${c.id === ivSelected ? "sel" : ""}">
        <div class="t"><span>${esc(view(c).name)}</span><span class="pill ${pending ? "p-todo" : "p-done"}">${pending ? "待提交" : "已提交"}</span></div>
        <div class="muted">${Hire.jobOf(c.job).title} · ${Hire.stageName(Hire.current(c).stage)}</div></li>`).join("") || '<li class="muted">没有分配给你的面试。可以在右上角切换身份。</li>'}</ul></div>`;
    const c = byId(ivSelected);
    let right = `<div class="card muted">选择左侧候选人</div>`;
    if (c) {
      const stage = (() => {
        const mine = state.feedback.find((f) => f.cand === c.id && f.interviewer === me);
        return mine ? mine.stage : Hire.current(c).stage;
      })();
      const j = Hire.jobOf(c.job);
      const names = Object.fromEntries(j.attributes.map((a) => [a.key, a.name]));
      const submitted = Hire.feedbackFor(state, c.id, stage).some((f) => f.interviewer === me);
      const form = submitted ? `<div class="ok-msg">你已提交这一轮反馈。</div>` : `
        <h3>面试工具包 · ${Hire.stageName(stage)}</h3>
        <p class="muted">每个问题对应评分卡里的一个维度。按候选人的回答打分，不要凭整体印象。</p>
        ${j.kit[stage].map((q, i) => `<div class="q"><div class="qt">${i + 1}. ${esc(q.q)}</div><div class="qa">考察：${names[q.attr]}</div>
          <div class="rates">${[1, 2, 3, 4].map((v) => `<label><input type="radio" name="r-${q.attr}" value="${v}"/>${v} ${Hire.RATING[v]}</label>`).join("")}</div></div>`).join("")}
        <h3>总体结论</h3><div class="rates">${[1, 2, 3, 4].map((v) => `<label><input type="radio" name="overall" value="${v}"/>${Hire.RATING[v]}</label>`).join("")}</div>
        <h3>评价依据</h3><textarea id="note" placeholder="写候选人具体说了或做了什么（至少 15 字），不写「感觉不错」这类印象"></textarea>
        <div style="margin-top:10px"><button id="fb-submit" data-stage="${stage}">提交反馈</button></div>`;
      right = `<div class="card"><h2>${esc(view(c).name)} · ${j.title}</h2><div class="muted">${esc(view(c).meta)} · 初筛 ${scoreOf(c).total} 分</div>
        ${flashHtml("iv")}
        ${isHM ? "" : form}${feedbackBlock(c, stage)}</div>`;
    }
    $("#p-interviews").innerHTML = `<div class="iv-layout">${left}${right}</div>`;
  }

  function submitFeedback(stage) {
    const c = byId(ivSelected);
    const j = Hire.jobOf(c.job);
    const ratings = {};
    j.kit[stage].forEach((q) => { const el = document.querySelector(`input[name="r-${q.attr}"]:checked`); if (el) ratings[q.attr] = +el.value; });
    const ov = document.querySelector('input[name="overall"]:checked');
    flash = { where: "iv", err: "", ok: "" };
    try {
      Hire.submitFeedback(state, { cand: c.id, stage, interviewer: me, ratings, overall: ov ? +ov.value : 0, note: $("#note").value, submitted: today() });
      save();
      flash.ok = "已提交，现在可以看到其他面试官的反馈了";
    } catch (e) { flash.err = e.message; }
    renderAll();
  }

  // ---------- 职位与评分卡 ----------
  function renderScorecard() {
    const j = job();
    const w = Hire.weightsFor(state, j);
    const pool = cands();
    const base = Object.fromEntries(pool.map((c) => [c.id, Hire.screen(c, j).total]));
    const baseRank = Object.fromEntries([...pool].sort((a, b) => base[b.id] - base[a.id]).map((c, i) => [c.id, i]));
    const ranked = pool.map((c) => ({ c, s: Hire.screen(c, j, w) })).sort((a, b) => b.s.total - a.s.total);
    const raw = (state.weights[j.id]) || {};
    $("#p-scorecard").innerHTML = `<div class="grid g2">
      <div class="card"><h2>${j.title} · 评分卡</h2>
        <div class="muted">${j.team} · ${j.location} · 招聘 ${j.headcount} 人 · ${j.owner}</div>
        <h3>考察维度与权重（拖动调整，右侧排序实时变化）</h3>
        ${j.attributes.map((a) => `<div class="wrow"><span>${a.name}${a.must ? '<span class="must">必备</span>' : ""}</span>
          <input type="range" min="0" max="50" value="${Math.round((raw[a.key] != null ? raw[a.key] : a.weight) * 100)}" data-w="${a.key}"/>
          <span>${Math.round(w[a.key] * 100)}%</span></div>`).join("")}
        <div class="muted">权重自动归一化为 100%。每个维度按简历中的证据条数计分：0 条 0 分，1 条 60%，2 条及以上满分。</div>
        <button class="ghost" id="w-reset" style="margin-top:8px">恢复默认权重</button>
        <h3>硬性条件（不满足直接不推荐，不参与打分）</h3>
        <ul class="muted" style="padding-left:16px;margin:0">${j.knockouts.map((k) => `<li>${k.name}</li>`).join("")}</ul>
        <h3>面试工具包</h3>
        ${["phone", "onsite"].map((st) => `<div class="muted" style="margin-top:6px"><b>${Hire.stageName(st)}</b>（面试官：${Hire.PANEL[st].map(ivName).join("、")}）</div>
          <ol style="margin:4px 0;padding-left:20px;font-size:0.82rem">${j.kit[st].map((q) => `<li>${esc(q.q)} <span class="muted">· ${j.attributes.find((a) => a.key === q.attr).name}</span></li>`).join("")}</ol>`).join("")}
      </div>
      <div class="card"><h2>全部简历按评分卡排序（前 15 / 共 ${ranked.length} 份）</h2>
        <ul class="rank">${ranked.slice(0, 15).map(({ c, s }, i) => {
          const moved = baseRank[c.id] - i;
          return `<li><span>${i + 1}</span><span>${esc(view(c).name)} <span class="muted">· ${s.rec}</span></span>
            <span class="score ${scoreCls(s.total)}">${s.total}</span>
            <span class="moved ${moved < 0 ? "down" : ""}">${moved ? (moved > 0 ? "↑" : "↓") + Math.abs(moved) : ""}</span></li>`;
        }).join("")}</ul>
        <p class="muted">箭头表示相对默认权重的名次变化。评分卡由招聘经理和用人经理在开岗时一起确定，之后所有人按同一把尺子评估。</p>
      </div></div>`;
  }

  // ---------- 招聘分析 ----------
  function renderAnalytics() {
    const a = Hire.analytics(state, jobId);
    const j = job();
    const hiredList = cands().filter((c) => c.status === "hired");
    const tth = hiredList.length ? hiredList.reduce((s, c) => s + Hire.days(c.applied, c.history.find((h) => h.stage === "hired").enter), 0) / hiredList.length : null;
    const top = a.funnel[0].n || 1;
    const reasons = Object.entries(a.reasons).sort((x, y) => y[1] - x[1]);
    $("#p-analytics").innerHTML = `
      <div class="grid g4" style="margin-bottom:14px">
        <div class="card kpi"><div class="label">在流程中</div><div class="value">${a.active}</div><div class="sub">共 ${a.funnel[0].n} 份简历</div></div>
        <div class="card kpi"><div class="label">已入职 / 招聘目标</div><div class="value">${a.hired} / ${j.headcount}</div><div class="sub">Offer 接受率 ${pct(a.offerAccept)}</div></div>
        <div class="card kpi"><div class="label">平均招聘周期</div><div class="value">${tth == null ? "—" : Math.round(tth) + " 天"}</div><div class="sub">投递到入职</div></div>
        <div class="card kpi"><div class="label">超时停留</div><div class="value">${Hire.slaBreaches(state, today()).filter((x) => x.cand.job === jobId).length}</div><div class="sub">超过阶段时限的候选人</div></div>
      </div>
      <div class="grid g2">
        <div class="card"><h2>招聘漏斗</h2>
          ${a.funnel.map((f, i) => `<div class="fun"><span class="nm">${f.name}</span><span class="tr"><i style="width:${(f.n / top) * 100}%"></i><b>${f.n}</b></span>
            <span class="cv">${i ? `上一步转化 ${pct(a.funnel[i - 1].n ? f.n / a.funnel[i - 1].n : null)}` : ""}</span></div>`).join("")}
          <h3>各阶段平均停留</h3>
          <table><thead><tr><th>阶段</th><th class="num">平均天数</th><th class="num">时限</th></tr></thead><tbody>
          ${a.stageDays.map((s) => `<tr><td>${s.name}</td><td class="num" style="${s.avg > s.sla ? "color:#b91c1c;font-weight:600" : ""}">${s.avg == null ? "—" : s.avg.toFixed(1)}</td><td class="num">${s.sla}</td></tr>`).join("")}</tbody></table>
        </div>
        <div class="card"><h2>渠道质量</h2>
          <table><thead><tr><th>渠道</th><th class="num">简历</th><th class="num">初筛均分</th><th class="num">初筛通过率</th><th class="num">进现场面</th><th class="num">入职</th></tr></thead><tbody>
          ${a.sources.sort((x, y) => y.screenRate - x.screenRate).map((s) => `<tr><td>${s.source}</td><td class="num">${s.n}</td><td class="num">${Math.round(s.avgScore)}</td><td class="num">${pct(s.screenRate)}</td><td class="num">${s.onsite}</td><td class="num">${s.hired}</td></tr>`).join("")}</tbody></table>
          <h3>初筛分有没有用？</h3>
          <table><thead><tr><th>初筛分</th><th class="num">候选人</th><th class="num">完成现场面</th><th class="num">现场面通过率</th></tr></thead><tbody>
          ${a.bins.map((b) => `<tr><td>${b.label}</td><td class="num">${b.n}</td><td class="num">${b.onsiteDone}</td><td class="num">${pct(b.passRate)}</td></tr>`).join("")}</tbody></table>
          <p class="muted">现场面由 3 位面试官独立打分，和初筛完全分开。初筛分越高、现场面通过率越高，说明评分卡确实能预测面试表现；如果某一档反常，就该回头检查评分卡。</p>
        </div>
        <div class="card"><h2>面试官校准</h2>
          <table><thead><tr><th>面试官</th><th class="num">反馈数</th><th class="num">平均总评</th><th class="num">推荐率</th><th>判断</th></tr></thead><tbody>
          ${a.interviewers.map((x) => `<tr><td>${x.name}<div class="muted">${x.title}</div></td><td class="num">${x.n}</td><td class="num">${x.avg.toFixed(2)}</td><td class="num">${pct(x.yes)}</td>
            <td style="color:${x.calibration === "正常" ? "#047857" : "#b45309"}">${x.calibration}</td></tr>`).join("")}</tbody></table>
          <p class="muted">平均总评比全体高或低 0.4 分以上的面试官，需要在复盘会上对齐打分标准。</p>
        </div>
        <div class="card"><h2>淘汰原因</h2>
          ${reasons.map(([r, n]) => `<div class="fun"><span class="nm" style="width:120px">${r}</span><span class="tr"><i style="width:${(n / reasons[0][1]) * 100}%;background:#fca5a5"></i><b>${n}</b></span></div>`).join("") || '<div class="muted">暂无</div>'}
        </div>
      </div>`;
  }

  // ---------- 总渲染与事件 ----------
  function renderAll() {
    renderHeader();
    renderSla();
    renderBoard();
    renderDetail();
    renderInterviews();
    renderScorecard();
    renderAnalytics();
    flash = { where: "", err: "", ok: "" };
  }

  $("#tabs").addEventListener("click", (e) => {
    const tab = e.target.dataset.tab;
    if (!tab) return;
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b === e.target));
    document.querySelectorAll(".page").forEach((p) => { p.hidden = p.id !== "p-" + tab; });
    history.replaceState(null, "", "#" + tab);
  });
  $("#job").addEventListener("change", (e) => { jobId = e.target.value; selected = null; renderAll(); });
  $("#me").addEventListener("change", (e) => { me = e.target.value; ivSelected = null; renderAll(); });
  $("#blind").addEventListener("change", (e) => { state.blind = e.target.checked; save(); renderAll(); });
  $("#reset").addEventListener("click", () => { localStorage.removeItem(KEY); state = Hire.initState(); me = defaultInterviewer(); selected = null; renderAll(); });
  document.body.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-pick]");
    if (pick) { selected = pick.dataset.pick; renderAll(); return; }
    if (e.target.dataset.act) { act(e.target.dataset.act); return; }
    const iv = e.target.closest("[data-iv]");
    if (iv) { ivSelected = iv.dataset.iv; renderInterviews(); return; }
    if (e.target.id === "fb-submit") submitFeedback(e.target.dataset.stage);
    if (e.target.id === "w-reset") { delete state.weights[jobId]; save(); renderAll(); }
  });
  document.body.addEventListener("change", (e) => {
    if (e.target.id === "closed") { showClosed = e.target.checked; renderSla(); renderBoard(); }
  });
  document.body.addEventListener("input", (e) => {
    if (e.target.dataset.w) {
      const j = job();
      const cur = state.weights[j.id] || Object.fromEntries(j.attributes.map((a) => [a.key, a.weight]));
      cur[e.target.dataset.w] = +e.target.value / 100;
      state.weights[j.id] = cur;
      save();
      renderScorecard();
      renderBoard();
      document.querySelector(`[data-w="${e.target.dataset.w}"]`).focus();
    }
  });

  const firstLate = Hire.slaBreaches(state, today()).find((x) => x.cand.job === jobId);
  selected = firstLate ? firstLate.cand.id : null;
  renderAll();
  const tab = location.hash.slice(1);
  if (tab) { const b = document.querySelector(`#tabs [data-tab="${tab}"]`); if (b) b.click(); }
  window.addEventListener("load", () => window.scrollTo(0, 0));
})();
