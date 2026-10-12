// 虚构职位、评分卡、候选人与面试官。用固定种子生成，刷新结果一致。
(function (root) {
  const TODAY = "2026-10-12";

  const STAGES = [
    { key: "applied", name: "新简历", sla: 3 },
    { key: "screen", name: "初筛通过", sla: 4 },
    { key: "phone", name: "电话面", sla: 5 },
    { key: "onsite", name: "现场面", sla: 7 },
    { key: "offer", name: "Offer", sla: 5 },
    { key: "hired", name: "已入职", sla: null },
  ];

  const REJECT_REASONS = ["硬性条件不符", "核心能力不足", "经验与岗位不匹配", "面试表现未达标", "候选人放弃", "薪资预期不匹配", "已接其他 Offer"];
  const SOURCES = ["内推", "招聘网站", "猎头", "校园招聘", "官网投递"];

  const JOBS = [
    {
      id: "J1", title: "AI 产品经理", team: "企业智能部", location: "上海", headcount: 3, owner: "招聘经理 · 何曼",
      attributes: [
        { key: "ai", name: "AI 产品落地", weight: 0.3, must: true, keywords: ["大模型", "LLM", "Agent", "RAG", "AI 产品", "智能客服", "知识库"] },
        { key: "data", name: "数据分析", weight: 0.2, keywords: ["SQL", "AB 实验", "指标体系", "数据分析", "漏斗", "Python"] },
        { key: "prd", name: "需求与方案", weight: 0.2, must: true, keywords: ["PRD", "需求", "原型", "Axure", "用户访谈", "竞品分析"] },
        { key: "drive", name: "跨团队推进", weight: 0.15, keywords: ["跨部门", "推动", "协调", "项目管理", "上线"] },
        { key: "tob", name: "企业服务经验", weight: 0.15, keywords: ["ToB", "企业服务", "SaaS", "B 端", "工作台", "HR 系统"] },
      ],
      knockouts: [
        { key: "degree", name: "本科及以上", test: (c) => ["本科", "硕士", "博士"].includes(c.degree) },
        { key: "notice", name: "60 天内可到岗", test: (c) => c.notice <= 60 },
        { key: "location", name: "可在上海工作", test: (c) => c.city === "上海" || c.relocate },
      ],
      kit: {
        phone: [
          { attr: "ai", q: "讲一个你负责的 AI 功能：用户是谁、为什么用大模型、上线后指标怎么变？" },
          { attr: "prd", q: "这个需求最初是怎么提出来的？你砍掉了哪些需求，为什么？" },
        ],
        onsite: [
          { attr: "ai", q: "知识库问答的回答不准，你会怎么定位是检索、知识还是模型的问题？" },
          { attr: "data", q: "设计一个 AB 实验验证「智能推荐话术」是否提升转化，样本怎么分、看什么指标？" },
          { attr: "drive", q: "说一次你推动其他团队改排期的经历，对方一开始为什么不同意？" },
          { attr: "tob", q: "企业客户和个人用户的需求优先级判断有什么不同？" },
        ],
      },
    },
    {
      id: "J2", title: "数据分析师", team: "经营分析部", location: "上海", headcount: 1, owner: "招聘经理 · 何曼",
      attributes: [
        { key: "sql", name: "SQL 与建模", weight: 0.3, must: true, keywords: ["SQL", "数据仓库", "建模", "Hive", "宽表"] },
        { key: "stats", name: "统计与实验", weight: 0.25, must: true, keywords: ["AB 实验", "假设检验", "回归", "统计", "显著性"] },
        { key: "viz", name: "可视化与看板", weight: 0.15, keywords: ["看板", "Tableau", "BI", "可视化", "驾驶舱"] },
        { key: "biz", name: "业务洞察", weight: 0.2, keywords: ["归因", "诊断", "经营分析", "增长", "策略"] },
        { key: "code", name: "Python", weight: 0.1, keywords: ["Python", "pandas", "自动化"] },
      ],
      knockouts: [
        { key: "degree", name: "本科及以上", test: (c) => ["本科", "硕士", "博士"].includes(c.degree) },
        { key: "notice", name: "60 天内可到岗", test: (c) => c.notice <= 60 },
      ],
      kit: {
        phone: [{ attr: "sql", q: "讲一个你写过最复杂的 SQL：业务问题是什么、表怎么关联、怎么验证结果对？" }],
        onsite: [
          { attr: "stats", q: "实验组转化率高了 2 个百分点，p = 0.08，你会怎么给业务方下结论？" },
          { attr: "biz", q: "某区域订单环比下降 15%，给你一小时，你会先看哪三张表？" },
          { attr: "viz", q: "给店长看的日报和给区域总看的周报，指标和呈现有什么不同？" },
        ],
      },
    },
  ];

  const SENTENCES = {
    ai: ["负责企业知识库问答产品，基于 RAG 架构把未命中率从 18% 降到 7%", "主导智能客服 Agent 从 0 到 1 上线，覆盖 6 类高频咨询",
      "参与大模型应用评测，搭建 LLM 回答质量的人工标注流程", "设计 AI 产品的兜底与转人工策略"],
    data: ["用 SQL 搭建转化漏斗，定位注册环节流失", "设计 AB 实验验证新引导页，转化提升 3.2 个百分点", "梳理业务指标体系，统一 12 个核心口径",
      "用 Python 做日常数据分析自动化"],
    prd: ["独立撰写 PRD 并组织评审，覆盖 40+ 页面", "通过用户访谈与竞品分析确定需求优先级", "使用 Axure 输出高保真原型", "把模糊的业务需求拆成可交付的迭代"],
    drive: ["跨部门协调研发、设计与运营按期上线", "推动 3 个业务团队统一流程", "负责项目管理与上线节奏把控"],
    tob: ["服务 200+ 企业客户的 SaaS 产品", "负责 B 端工作台的权限与审批模块", "参与 HR 系统的入转调离流程设计", "企业服务场景下的客户需求分级"],
    sql: ["日常编写复杂 SQL，搭建 Hive 数据仓库宽表", "负责数据建模，沉淀 30+ 张主题宽表", "优化慢查询，核心 SQL 从 45 秒降到 2 秒"],
    stats: ["设计 AB 实验并做显著性检验", "用回归分析识别影响复购的关键因素", "负责统计口径与假设检验方法的落地"],
    viz: ["搭建门店经营驾驶舱", "用 Tableau 制作区域周报看板", "负责 BI 可视化报表的设计"],
    biz: ["做经营分析与归因诊断，输出改进策略", "围绕增长目标拆解渠道策略", "建立门店诊断模型定位问题环节"],
    code: ["用 Python 和 pandas 做数据清洗", "编写自动化脚本替代手工报表"],
  };
  const FILLER = ["参与公司年度规划会议", "负责部门周会纪要", "协助组织团队活动", "获得季度优秀员工", "熟练使用办公软件"];
  const SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜".split("");
  const GIVEN = ["予安", "知行", "书瑶", "景川", "若溪", "明哲", "清禾", "亦舟", "芷若", "牧之", "思齐", "南星", "怀瑾", "语桐", "嘉树", "沐阳",
    "一鸣", "星辰", "可欣", "子墨", "雨萱", "浩然", "诗涵", "梓轩", "佳怡", "宇航", "欣然", "俊杰", "晓彤", "博文", "安琪", "天佑",
    "静怡", "泽宇", "梦洁", "文博", "思远", "雅琴", "昊天", "婉清", "睿哲", "心怡", "振宇", "晨曦", "家豪", "紫涵", "立诚", "慧敏",
    "承泽", "若彤", "致远", "嘉宁", "钧天", "念慈", "皓轩", "芊芊"];
  const SCHOOLS = ["复旦大学", "上海交通大学", "同济大学", "华东师范大学", "浙江大学", "南京大学", "上海财经大学", "苏州大学", "华东理工大学", "上海大学", "宁波大学"];
  const INTERVIEWERS = [
    { id: "I1", name: "林舟", title: "产品总监", bias: 0 },
    { id: "I2", name: "苏禾", title: "高级产品经理", bias: 0.9 },
    { id: "I3", name: "陆深", title: "算法负责人", bias: -0.7 },
    { id: "I4", name: "叶澄", title: "数据分析经理", bias: 0.1 },
    { id: "I5", name: "何曼", title: "招聘经理", bias: 0 },
  ];

  function rng(seed) {
    let s = ((seed * 2654435761) % 2147483646) + 1;
    const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5; i++) next();
    return next;
  }

  function addDays(date, n) {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function buildCandidates() {
    const r = rng(42);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const list = [];
    for (let i = 1; i <= 54; i++) {
      const job = i <= 36 ? JOBS[0] : JOBS[1];
      const quality = Math.min(1, Math.max(0, 0.15 + r() * 0.85));
      const source = pick(SOURCES);
      const lines = [];
      job.attributes.forEach((a) => {
        const pool = SENTENCES[a.key];
        const n = r() < quality ? (r() < quality ? 2 : 1) : 0;
        for (let k = 0; k < n; k++) lines.push(pool[(i + k) % pool.length]);
      });
      lines.push(pick(FILLER));
      for (let k = lines.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [lines[k], lines[j]] = [lines[j], lines[k]]; }
      const years = Math.round(1 + r() * 7);
      const degree = r() < 0.08 ? "大专" : r() < 0.45 ? "硕士" : "本科";
      list.push({
        id: "C" + String(i).padStart(3, "0"),
        job: job.id,
        name: pick(SURNAMES) + (r(), GIVEN[(i * 17) % GIVEN.length]),
        gender: r() < 0.5 ? "女" : "男",
        age: 22 + years + Math.floor(r() * 4),
        school: pick(SCHOOLS), degree, years,
        city: r() < 0.75 ? "上海" : pick(["杭州", "南京", "北京", "深圳"]),
        relocate: r() < 0.6,
        notice: pick([0, 15, 30, 30, 30, 30, 60, 60, 90]),
        source,
        quality: source === "内推" ? Math.min(1, quality + 0.1) : quality,
        resume: lines,
        applied: addDays("2026-08-17", Math.floor(Math.pow(r(), 0.55) * 56)),
        r: r(),
      });
    }
    return list;
  }

  root.HireData = { TODAY, STAGES, REJECT_REASONS, SOURCES, JOBS, INTERVIEWERS, buildCandidates, addDays, rng };
})(typeof window !== "undefined" ? window : globalThis);
