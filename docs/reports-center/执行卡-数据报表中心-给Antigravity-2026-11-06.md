# 执行卡：SunnyBridge CRM 数据报表中心（给 Antigravity）

## 0. 前提（写死，不许自行"识别"）

- 仓库：**billow741/sub-crm**。技术栈：Cloudflare Workers（Hono）+ D1（SQLite），API 在 `api/src/`，React 管理端在 `src/`（JSX）。
- **billow741/sunnybridge-mvp 已弃用，与本项目无关，禁止参考、禁止往那里提 PR。**
- 动手前必读（按序）：①《阶段0勘察报告-数据报表中心-2026-11-06.md》（修订版）②《阶段1口径设计-数据报表中心-2026-11-06.md》③ 现有代码 `api/src/routes/dashboard.js`（聚合与预警的现行写法）、`api/src/middleware/auth.js`（orgContext：c.get('orgId') / c.get('userRole')，角色 super_admin | org_admin | teacher | parent）、`api/src/utils/response.js`（success 信封）、`api/src/routes/classComplete.js`（课时系数落地处）、`src/pages/Dashboard.jsx`（前端轻量图表的既有画法）。
- 本卡口径与必读文件冲突时，以《阶段1口径设计》为准，并停下来报告冲突，不要自行改口径。

## 1. 铁律

1. 新建 feature 分支（如 feat/reports-center）开发；不直推 main；每阶段一个 PR，PR 描述写明口径依据与自测结果。
2. **不部署、不合并**。每阶段完成即停，输出交付说明等确认后再继续。
3. 数据库只允许新增《阶段1口径设计》第三节的那一张 `report_fx_rates` 表（一份迁移文件）；**禁止修改任何业务表结构、禁止回填业务数据**。本地开发库先试跑迁移；生产执行不在本卡范围内。
4. 权限裁剪在后端做：org_admin 的财务响应里不下发全站教师课酬、直营毛利字段（不是前端隐藏）；org_admin 传别人的 org_id 必须被忽略/拒绝。
5. 不引入任何图表库；前端复用 Dashboard.jsx 的轻量 SVG/条形画法。
6. 不提交任何密钥、连接串；不改与本模块无关的文件。

## 2. 口径红线（错一条即验收不过）

- 消课课时直接 SUM(classes.hours)（已含 25 分钟课 0.66 系数），**禁止按 duration 二次折算**。
- 消课收入 = 已完成课时 × 学员混合单价（blended_price = 非 gift 实付总额 ÷ students.total_hours）；无单价学员的消课进 unpriced_hours 单独披露，**禁止用平均价顶替**。
- payments 中 gift 行不计现金收入，其课时经计数器摊薄单价。
- teacher_payments 金额是 **PHP**；与 CNY 相减前必须经 report_fx_rates 按结算期末月汇率折算；无汇率则成本/毛利返回 null + fx_missing，**禁止填 0**。
- 机构课（organization_id != 1 / is_self_paid=0）不走学员单价，机构收入以 org_settlements.amount_due_cny 为准，两个口径不得双算。
- 期间归属一律用业务日期字段（classes.date / payments.date / teacher_payments.period_end）+ strftime；**禁止用 created_at 分月**（UTC 偏差）；禁止出现 DATE_TRUNC。
- 流失预警的未上课天数用 MAX(classes.date) 现算，**禁止用 students.last_class_at**（维护不全）。

## 3. 分阶段任务（每阶段结束停，等确认）

### 阶段 A：学习分析（无争议，先行）
- 后端：GET /api/v1/reports/learning/summary、GET /api/v1/reports/learning/risk-students（挂 api/src/routes/reports.js，index.js 注册；参数与口径按设计文档）。
- 前端：src/pages/Reports.jsx + 路由/导航（先只做学习 Tab 与顶部时间/机构控制栏骨架）。
- 自测交付：两个接口的真实 curl 输出样例（本地 dev 数据）、risk-students 分页与 org_admin 锁定本机构的验证记录。

### 阶段 B：财务（先核查、后编码）
- 前置核查（先输出结论再写代码）：通读 api/src/routes/payments.js、hourChanges.js，确认运营实际的退款录入路径；复核 classes.organization_id 与 is_self_paid 区分直营/机构的一致性。结论与设计文档 D5/直营划分不符时，先报告再调整。
- 迁移：新增 033_report_fx_rates.sql（内容以设计文档为准），本地库试跑 + 回滚演练（DROP 后重跑）。
- 后端：financial/summary、financial/trend、fx-rates 的 GET/PUT（PUT 仅 super_admin）。
- 前端：财务 Tab（金额卡按双币展示规范；估算数字带"估算"角标；含汇率维护小节与缺失月份提示）。
- 自测交付：挑一节真实 25 分钟课验算消课课时=0.66；gift 不进现金收入的对照样例；某月删汇率后毛利返回 null + fx_missing 的样例。

### 阶段 C：教学分析
- 后端：teaching/summary（含 D6 试听 cohort 转化表）、teaching/workload。
- 前端：教学 Tab。
- 自测交付：cohort 表与手工数一遍某月试听人数对照；workload 排序/分页样例。

### 阶段 D：概览、导出与对账包
- 后端：overview（只拼装 A–C 已定口径的数字）、export（CSV；财务含 PHP 原额/汇率/CNY 三列）。
- 前端：概览 Tab + 各 Tab 导出按钮 + 口径说明区（D2–D6 的人话版注脚）。
- 交付对账包：选定一个完整自然月，按设计文档第五节列出逐项核对表（收款总额、教师结算 PHP 总额、消课节数、毛利误差），附核对方法，等人工用外部台账终核。

## 4. 全程验收标准（任一不过即返工）

- 报表数字能逐项追溯到原始表与字段；财务金额能追溯到 PHP 原额、所用汇率与汇率月份。
- org_admin 拿不到其他机构数据（改参数也不行），拿不到全站课酬/毛利字段；teacher 调报表接口 403。
- 全部接口带 from_date/to_date（有默认值）、明细分页；响应走现有 success 信封。
- 代码中不出现 DATE_TRUNC、不出现对 classes.hours 的二次系数折算、不出现 CNY 与 PHP 直接相减。
- 迁移只有 033 一份且可回滚；PR 未经确认不合并、不部署。
