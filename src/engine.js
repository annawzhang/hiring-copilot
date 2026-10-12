// 招聘引擎：可解释初筛、管道状态机、结构化面试反馈与分析。纯函数为主，便于测试。
(function (root) {
  const D = root.HireData;
  const STAGE_KEYS = D.STAGES.map((s) => s.key);
  const RATING = { 1: "强烈不推荐", 2: "不推荐", 3: "推荐", 4: "强烈推荐" };
  const HIRING_MANAGER = "I5";
  const PANEL = { phone: ["I2"], onsite: ["I1", "I3", "I4"] };

  const jobOf = (id) => D.JOBS.find((j) => j.id === id);
  const stageName = (k) => (D.STAGES.find((s) => s.key === k) || { name: k }).name;
  const days = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);

  // ---------- 初筛 ----------
  function weightsFor(state, job) {
    const custom = (state && state.weights && state.weights[job.id]) || {};
    const raw = job.attributes.map((a) => (custom[a.key] != null ? custom[a.key] : a.weight));
    const sum = raw.reduce((s, w) => s + w, 0) || 1;
    return Object.fromEntries(job.attributes.map((a, i) => [a.key, raw[i] / sum]));
  }

  function screen(cand, job, weights) {
    weights = weights || weightsFor(null, job);
    const attrs = job.attributes.map((a) => {
      const evidence = cand.resume
        .map((line) => ({ line, terms: a.keywords.filter((k) => line.includes(k)) }))
        .filter((e) => e.terms.length);
      const level = evidence.length >= 2 ? 1 : evidence.length === 1 ? 0.6 : 0;
      return { key: a.key, name: a.name, must: !!a.must, weight: weights[a.key], evidence, level,
        points: Math.round(weights[a.key] * level * 1000) / 10 };
    });
    const total = Math.round(attrs.reduce((s, a) => s + a.points, 0));
    const knockouts = job.knockouts.map((k) => ({ name: k.name, pass: k.test(cand) }));
    const failed = knockouts.filter((k) => !k.pass);
    const missing = attrs.filter((a) => a.must && a.level === 0);
    let rec, reason;
    if (failed.length) { rec = "不推荐"; reason = "硬性条件不符：" + failed.map((k) => k.name).join("、"); }
    else if (missing.length) { rec = "待定"; reason = "简历中未找到必备能力：" + missing.map((a) => a.name).join("、"); }
    else if (total >= 60) { rec = "推荐推进"; reason = "主要匹配：" + attrs.filter((a) => a.level).sort((x, y) => y.points - x.points).slice(0, 2).map((a) => a.name).join("、"); }
    else if (total >= 40) { rec = "待定"; reason = "匹配度一般，建议电话沟通确认"; }
    else { rec = "不推荐"; reason = "与评分卡匹配度低"; }
    return { total, attrs, knockouts, rec, reason };
  }

  function highlight(line, terms, esc) {
    let out = esc(line);
    terms.forEach((t) => { out = out.split(esc(t)).join(`<mark>${esc(t)}</mark>`); });
    return out;
  }

  function blindView(cand, on) {
    if (!on) return { name: cand.name, meta: `${cand.gender} · ${cand.age} 岁 · ${cand.school} · ${cand.degree}` };
    return { name: "候选人 " + cand.id, meta: `${cand.degree} · ${cand.years} 年经验（已隐藏姓名、性别、年龄、学校）` };
  }

  // ---------- 生成初始管道 ----------
  function rating(r, quality, bias) {
    const v = 1 + quality * 3 + bias + (r() - 0.5) * 1.2;
    return Math.max(1, Math.min(4, Math.round(v)));
  }

  function makeFeedback(r, cand, job, stage, interviewer, date) {
    const iv = D.INTERVIEWERS.find((x) => x.id === interviewer);
    const ratings = {};
    job.kit[stage].forEach((q) => { ratings[q.attr] = rating(r, cand.quality, iv.bias); });
    const vals = Object.values(ratings);
    const overall = Math.max(1, Math.min(4, Math.round(vals.reduce((a, b) => a + b, 0) / vals.length + (r() - 0.5) * 0.6)));
    const notes = { 1: "核心问题回答不到点，缺少具体案例", 2: "有相关经历但深度不够，追问后细节含糊",
      3: "案例完整，能讲清楚取舍和结果", 4: "思路清晰，案例有数据支撑，主动讲了复盘" };
    return { cand: cand.id, stage, interviewer, ratings, overall, note: notes[overall], submitted: date };
  }

  function initState() {
    const candidates = D.buildCandidates();
    const feedback = [];
    const state = { weights: {}, candidates, feedback, log: [], blind: false };
    const offered = Object.fromEntries(D.JOBS.map((j) => [j.id, 0]));
    [...candidates].sort((a, b) => a.applied.localeCompare(b.applied)).forEach((c) => {
      const r = D.rng(1000 + Number(c.id.slice(1)));
      const job = jobOf(c.job);
      const s = screen(c, job);
      c.history = [{ stage: "applied", enter: c.applied }];
      c.status = "active";
      let date = c.applied;
      const advance = (stage, gap) => {
        const next = D.addDays(date, gap + (r() < 0.15 ? 6 : 0));
        if (next > D.TODAY) return false;
        c.history[c.history.length - 1].exit = next;
        c.history.push({ stage, enter: next });
        date = next;
        return true;
      };
      const reject = (reason, gap) => {
        const at = D.addDays(date, gap);
        if (at > D.TODAY) return;
        c.history[c.history.length - 1].exit = at;
        c.status = "rejected";
        c.rejectReason = reason;
        c.rejectedAt = at;
      };
      const pass = s.rec === "推荐推进" || (s.rec === "待定" && s.total >= 35 && r() < 0.6);
      if (!pass) { reject(s.knockouts.some((k) => !k.pass) ? "硬性条件不符" : "经验与岗位不匹配", 2 + Math.floor(r() * 3)); }
      else if (advance("screen", 2 + Math.floor(r() * 3)) && advance("phone", 1 + Math.floor(r() * 5))) {
        const fbDate = D.addDays(date, 1 + Math.floor(r() * 3));
        if (fbDate <= D.TODAY) {
          const fb = makeFeedback(r, c, job, "phone", PANEL.phone[0], fbDate);
          feedback.push(fb);
          if (fb.overall <= 2) { date = fbDate; reject("核心能力不足", 0); }
          else if (advance("onsite", 2 + Math.floor(r() * 4))) {
            const fbs = PANEL.onsite.map((iv, k) => makeFeedback(r, c, job, "onsite", iv, D.addDays(date, 1 + k)))
              .filter((f) => f.submitted <= D.TODAY);
            feedback.push(...fbs);
            if (fbs.length === PANEL.onsite.length) {
              const avg = fbs.reduce((s2, f) => s2 + f.overall, 0) / fbs.length;
              date = fbs[fbs.length - 1].submitted;
              if (avg < 2.7) reject("面试表现未达标", 1);
              else if (offered[c.job] < job.headcount && advance("offer", 1 + Math.floor(r() * 2))) {
                offered[c.job] += 1;
                if (r() < 0.3) { reject(r() < 0.5 ? "已接其他 Offer" : "薪资预期不匹配", 3 + Math.floor(r() * 3)); if (c.status === "rejected") offered[c.job] -= 1; }
                else if (advance("hired", 7 + Math.floor(r() * 10))) c.status = "hired";
              }
            }
          }
        }
      }
      delete c.r;
    });
    return state;
  }

  // ---------- 管道状态机 ----------
  const current = (c) => c.history[c.history.length - 1];
  const panelFor = (stage) => PANEL[stage] || [];
  const feedbackFor = (state, candId, stage) => state.feedback.filter((f) => f.cand === candId && f.stage === stage);

  function feedbackComplete(state, cand, stage) {
    const done = new Set(feedbackFor(state, cand.id, stage).map((f) => f.interviewer));
    return panelFor(stage).every((iv) => done.has(iv));
  }

  function advance(state, candId, date) {
    const c = state.candidates.find((x) => x.id === candId);
    if (c.status !== "active") throw new Error("候选人已不在流程中");
    const cur = current(c).stage;
    const next = STAGE_KEYS[STAGE_KEYS.indexOf(cur) + 1];
    if (!next) throw new Error("已是最后一个阶段");
    if (PANEL[cur] && !feedbackComplete(state, c, cur)) throw new Error(`${stageName(cur)}的面试反馈还没收齐，不能推进`);
    if (cur === "onsite") {
      const agg = aggregate(feedbackFor(state, c.id, "onsite"));
      if (agg.decision !== "建议录用") throw new Error(`面试结论为「${agg.decision}」，先开复盘会再决定是否发 Offer`);
      const job = jobOf(c.job);
      const used = state.candidates.filter((x) => x.job === c.job && (x.status === "hired" || (x.status === "active" && current(x).stage === "offer"))).length;
      if (used >= job.headcount) throw new Error(`招聘名额 ${job.headcount} 人已占满（已入职加待接受 Offer ${used} 人），需要先申请加编`);
    }
    current(c).exit = date;
    c.history.push({ stage: next, enter: date });
    if (next === "hired") c.status = "hired";
    state.log.unshift({ at: date, cand: c.id, msg: `推进到「${stageName(next)}」` });
    return c;
  }

  function reject(state, candId, reason, date) {
    const c = state.candidates.find((x) => x.id === candId);
    if (c.status !== "active") throw new Error("候选人已不在流程中");
    if (!D.REJECT_REASONS.includes(reason)) throw new Error("请选择淘汰原因");
    current(c).exit = date;
    c.status = "rejected";
    c.rejectReason = reason;
    c.rejectedAt = date;
    state.log.unshift({ at: date, cand: c.id, msg: `淘汰：${reason}` });
    return c;
  }

  function slaBreaches(state, today) {
    return state.candidates.filter((c) => c.status === "active").map((c) => {
      const cur = current(c);
      const sla = D.STAGES.find((s) => s.key === cur.stage).sla;
      const d = days(cur.enter, today);
      return { cand: c, stage: cur.stage, days: d, sla, over: sla != null && d > sla };
    }).filter((x) => x.over).sort((a, b) => b.days - b.sla - (a.days - a.sla));
  }

  // ---------- 结构化面试反馈 ----------
  function submitFeedback(state, fb) {
    const c = state.candidates.find((x) => x.id === fb.cand);
    const job = jobOf(c.job);
    if (current(c).stage !== fb.stage || c.status !== "active") throw new Error("候选人当前不在这个面试阶段");
    if (!panelFor(fb.stage).includes(fb.interviewer)) throw new Error("你不在这一轮的面试官名单里");
    if (feedbackFor(state, c.id, fb.stage).some((f) => f.interviewer === fb.interviewer)) throw new Error("你已经提交过这一轮的反馈");
    const need = job.kit[fb.stage].map((q) => q.attr);
    if (need.some((a) => !(fb.ratings[a] >= 1 && fb.ratings[a] <= 4))) throw new Error("每个考察维度都需要打分");
    if (!(fb.overall >= 1 && fb.overall <= 4)) throw new Error("请给出总体结论");
    if (!fb.note || fb.note.trim().length < 15) throw new Error("请写至少 15 字的依据：候选人具体说了或做了什么");
    state.feedback.push({ ...fb, note: fb.note.trim() });
    state.log.unshift({ at: fb.submitted, cand: c.id, msg: `${D.INTERVIEWERS.find((i) => i.id === fb.interviewer).name} 提交${stageName(fb.stage)}反馈` });
  }

  // 面试官在提交自己的反馈前看不到别人的，避免被带偏；招聘经理始终可见
  function canSeeOthers(state, candId, stage, viewer) {
    if (viewer === HIRING_MANAGER) return true;
    return feedbackFor(state, candId, stage).some((f) => f.interviewer === viewer);
  }

  function aggregate(fbs) {
    if (!fbs.length) return { n: 0, decision: "暂无反馈" };
    const overall = fbs.map((f) => f.overall);
    const avg = overall.reduce((a, b) => a + b, 0) / overall.length;
    const spread = Math.max(...overall) - Math.min(...overall);
    const attrs = {};
    fbs.forEach((f) => Object.entries(f.ratings).forEach(([k, v]) => { (attrs[k] = attrs[k] || []).push(v); }));
    const byAttr = Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
    const flags = [];
    if (spread >= 2) flags.push("面试官意见分歧大（相差 ≥ 2 档）");
    if (overall.includes(1)) flags.push("有面试官强烈不推荐");
    let decision;
    if (flags.length) decision = "需要复盘会";
    else if (avg >= 2.7) decision = "建议录用";
    else decision = "建议不通过";
    return { n: fbs.length, avg, spread, byAttr, flags, decision };
  }

  // ---------- 分析 ----------
  function analytics(state, jobId) {
    const cands = state.candidates.filter((c) => !jobId || c.job === jobId);
    const reached = (k) => cands.filter((c) => c.history.some((h) => h.stage === k)).length;
    const funnel = D.STAGES.map((s) => ({ key: s.key, name: s.name, n: reached(s.key) }));
    const stageDays = D.STAGES.filter((s) => s.sla != null).map((s) => {
      const spans = cands.flatMap((c) => c.history.filter((h) => h.stage === s.key && h.exit).map((h) => days(h.enter, h.exit)));
      return { name: s.name, avg: spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : null, sla: s.sla };
    });
    const sources = D.SOURCES.map((src) => {
      const list = cands.filter((c) => c.source === src);
      const sc = list.map((c) => screen(c, jobOf(c.job), weightsFor(state, jobOf(c.job))).total);
      return { source: src, n: list.length,
        screenRate: list.length ? list.filter((c) => c.history.some((h) => h.stage === "screen")).length / list.length : 0,
        onsite: list.filter((c) => c.history.some((h) => h.stage === "onsite")).length,
        hired: list.filter((c) => c.status === "hired").length,
        avgScore: sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : 0 };
    }).filter((s) => s.n);
    const reasons = {};
    cands.filter((c) => c.status === "rejected").forEach((c) => { reasons[c.rejectReason] = (reasons[c.rejectReason] || 0) + 1; });
    const ids = new Set(cands.map((c) => c.id));
    const interviewers = D.INTERVIEWERS.map((iv) => {
      const fbs = state.feedback.filter((f) => f.interviewer === iv.id && ids.has(f.cand));
      return { ...iv, n: fbs.length, avg: fbs.length ? fbs.reduce((a, f) => a + f.overall, 0) / fbs.length : null,
        yes: fbs.length ? fbs.filter((f) => f.overall >= 3).length / fbs.length : null };
    }).filter((x) => x.n);
    const allAvg = interviewers.reduce((s, x) => s + x.avg * x.n, 0) / (interviewers.reduce((s, x) => s + x.n, 0) || 1);
    interviewers.forEach((x) => { x.calibration = x.avg - allAvg > 0.4 ? "偏宽松" : x.avg - allAvg < -0.4 ? "偏严格" : "正常"; });
    const bins = [[0, 40], [40, 60], [60, 101]].map(([lo, hi]) => {
      const list = cands.filter((c) => { const t = screen(c, jobOf(c.job), weightsFor(state, jobOf(c.job))).total; return t >= lo && t < hi; });
      const done = list.filter((c) => c.history.some((h) => h.stage === "onsite") && feedbackComplete(state, c, "onsite"));
      const passed = done.filter((c) => aggregate(feedbackFor(state, c.id, "onsite")).avg >= 2.7);
      return { label: hi > 100 ? `≥ ${lo}` : `${lo}–${hi - 1}`, n: list.length, onsiteDone: done.length,
        passRate: done.length ? passed.length / done.length : null };
    });
    return { funnel, stageDays, sources, reasons, interviewers, bins,
      active: cands.filter((c) => c.status === "active").length,
      hired: cands.filter((c) => c.status === "hired").length,
      offerAccept: (() => { const o = cands.filter((c) => c.history.some((h) => h.stage === "offer") && c.status !== "active");
        return o.length ? o.filter((c) => c.status === "hired").length / o.length : null; })() };
  }

  // ---------- 沟通模板 ----------
  const TEMPLATES = {
    invite: "{name} 你好，感谢关注{job}岗位。想邀请你参加{stage}，大约 {minutes} 分钟。方便的话请从下面时间里选一个：{slots}。",
    reject: "{name} 你好，感谢你投入时间了解{job}岗位。经过认真评估，这次我们决定不继续推进。你的资料会保留在人才库，后续有合适机会会再联系你。",
    offer: "{name} 你好，很高兴通知你通过了{job}岗位的全部面试！HR 会在今天内电话沟通 Offer 细节。",
  };
  function message(kind, cand, extra = {}) {
    const job = jobOf(cand.job);
    const vars = { name: cand.name, job: job.title, stage: "", minutes: 45, slots: "", ...extra };
    return TEMPLATES[kind].replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  }

  root.Hire = { RATING, PANEL, HIRING_MANAGER, STAGE_KEYS, jobOf, stageName, days, weightsFor, screen, highlight, blindView,
    initState, current, feedbackFor, feedbackComplete, advance, reject, slaBreaches, submitFeedback, canSeeOthers,
    aggregate, analytics, message, makeFeedback };
})(typeof window !== "undefined" ? window : globalThis);
