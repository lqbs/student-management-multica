# 开发实施与验收对照表（LQB-17 交付）

对照 `docs/ui-design-spec.md` 第 9 节《开发实施与验收对照表》逐项说明实现情况；验证证据中的测试名可用 `npm test` 复现，手工步骤见 README《演示步骤》。

| # | 校验 / 交互场景 | 界面行为规范 | 实现位置 | 验证证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 新增 / 编辑学号唯一性 | 回显已填数据，学号下方红色提示“学号已存在” | `src/modules/students/service.ts`（`parseStudentInput` 中唯一性检查）、`src/views/students/form.ejs`（`is-invalid` + `.form-error`）、`src/shared/errors.ts`（422） | 测试：`学号大小写冲突时返回 422 并保留输入`（断言 422、提示文案、`value="S-01"` 与姓名回填、库中仍仅一条） | 已完成 |
| 2 | 学号前导零保留 | 表格 / 详情 / 编辑框严格按字符串渲染 | `src/shared/validation.ts`（`normalizeStudentNo` 仅 trim + 大写）、`src/modules/students/queries.ts`（TEXT 列直读） | 测试：`新增学生：学号转大写并完整保留前导零`（列表、详情、编辑页均断言 `001`）、`数据在进程重启…后保留` | 已完成 |
| 3 | 未分班筛选与展示 | `?classId=unassigned` 精确列出 `class_id IS NULL`，表格灰色“未分班”徽章 | `src/modules/students/queries.ts`（`buildWhere`）、`src/shared/validation.ts`（`parseClassIdFilter`）、`src/views/students/list.ejs`（`badge--neutral`） | 测试：`未分班筛选用 classId=unassigned 且展示灰色徽章`、`未分班学生在成绩列表显示未分班徽章` | 已完成 |
| 4 | 班级删除拦截 | 阻断删除并提示“该班级下有 N 名学生，请先转班或取消分班” | `src/modules/classes/service.ts`（`removeClass` → 409 + 人数）、列表现禁用态按钮、确认页拦截说明 | 测试：`班级内仍有学生时删除被拦截并返回 409`（断言 409、提示与人数、记录仍在）、`班级列表实时展示在读人数` | 已完成 |
| 5 | 空班级删除 | 确认后成功删除并重定向，带绿色成功提示 | `src/modules/classes/routes.ts`（303 → `/classes?flash=class-deleted`）、`src/shared/view.ts`（提示字典） | 测试：`空班级删除成功并重定向带回成功提示`（断言 303、Location、跟随页面出现“班级删除成功”、列表不再包含该班级） | 已完成 |
| 6 | 科目删除保护 | 已录入成绩的科目禁止删除，提示已包含的成绩条数 | `src/modules/subjects/service.ts`（`removeSubject` → 409 + 条数）、`src/views/subjects/delete-confirm.ejs` | 测试：`已关联成绩的科目删除被拦截（409），改名为允许操作`；`未关联成绩的科目可删除` | 已完成 |
| 7 | 成绩重复录入处理 | 提示“成绩记录已存在”并给出直达编辑链接（409） | `src/modules/scores/service.ts`（`parseScoreInput` 抛 409 并携带 `editUrl`）、`src/views/scores/form.ejs` + `partials/flash.ejs`（横幅链接） | 测试：`同一学生重复录入同一科目返回 409 并给出编辑直达链接`（断言 409、文案、`/scores/:id/edit` 链接、库中仅一条） | 已完成 |
| 8 | 成绩范围校验 | 字段标红并提示“请输入 0-100 之间且最多一位小数的数值”，保留输入 | `src/shared/validation.ts`（`validateScore` 十分值解析）、`src/views/scores/form.ejs`、数据库 `CHECK` | 测试：`接受 0、100 与一位小数`、`拒绝非法分值并保留输入`（空值 / 101 / -1 / 100.1 / 99.55 / 1e2 / NaN / abc）、`数据库 CHECK 约束兜底…` | 已完成 |
| 9 | 学生删除级联提示 | 二次确认明确警告“将同步删除该学生名下的全部成绩记录”，取消不写入 | `src/views/students/delete-confirm.ejs`、列表与详情页 `data-delete-warning`、`src/public/js/app.js`（模态确认）、`src/modules/students/service.ts`（事务内删成绩 + 学生） | 测试：`删除确认页明确提示级联删除成绩`、`删除学生后其成绩一并消失（级联删除）`、`删除确认页不会写入数据（取消路径）` | 已完成 |
| 10 | 搜索与分页保留 | 翻页链接携带原搜索参数 | `src/shared/http.ts`（`buildUrl` / `pageUrlFactory`）、`partials/pagination.ejs` | 测试：`分页默认 20 条且翻页保留查询参数`（断言链接含 `q`、`classId`、`pageSize`）、`页码越界收敛到最后一页而非报错` | 已完成 |
| 11 | 空搜索结果与空列表 | 明确区分“系统暂无数据”与“未搜索到匹配项”，并给出清空筛选入口 | 各模块 `list.ejs` 的空状态分支（依据 `pagination.total` 与筛选条件） | 测试：`区分“未搜索到匹配项”和“系统暂无数据”`（含空库时的成绩列表）；`LIKE 通配符按普通字符处理` | 已完成 |

## 规范其余章节的落地情况

| 章节 | 内容 | 实现情况 |
| --- | --- | --- |
| 1 | Design Tokens（颜色 / 字体 / 间距 / 阴影 / 圆角 / 过渡） | 全部落地于 `src/public/css/style.css` 的 `:root`，组件样式复用同一套变量 |
| 2 | 全局布局、品牌与导航、面包屑、页脚、1200px 容器与响应式 | `partials/header.ejs` / `partials/footer.ejs` / `style.css`（含 `768px` 断点） |
| 3.1 | 成功 / 错误 / 信息横幅与空状态 | `partials/flash.ejs`、`src/shared/view.ts` 提示字典、`.banner--*` 与 `.empty-state` |
| 3.2 | 表单内联校验与状态保留 | 所有表单模板均回填 `values` 并渲染 `.form-error`（422 响应） |
| 3.3 | 删除二次确认（JS 模态 + 无 JS 降级确认页） | `partials/footer.ejs` 模态 + `public/js/app.js`；`/students/:id/delete-confirm`、`/classes/:id/delete-confirm`、`/subjects/:id/delete-confirm`、`/scores/:id/delete-confirm` |
| 4 | 学生列表 / 表单 / 详情（含成绩面板、危险操作区） | `src/views/students/{list,form,detail,delete-confirm}.ejs`；详情页提供“录入此学生成绩”直达链接（带入 `studentId`） |
| 5 | 班级列表（人数可点击跳转、删除锁定） | `src/views/classes/list.ejs`；人数链接为 `/students?classId=<id>` |
| 6 | 科目列表与引用保护 | `src/views/subjects/{list,form,delete-confirm}.ejs` |
| 7 | 成绩表单 / 组合筛选 / 分数高亮 | `src/views/scores/{list,form,delete-confirm}.ejs`；`<60` 红色徽章、`>=90` 绿色徽章（`scoreLevel`） |
| 8 | 组件库（按钮 / 表单控件 / 表格 / 徽章 / 分页） | `style.css` 中 `.btn*`、`.form-control`、`.data-table`、`.badge*`、`.pagination*`，另按 WCAG AA 将主要按钮热区设为 44px |
| ADR-001 | 模块结构、参数化 SQL、版本化迁移、外键与事务、脚本契约、种子“仅空库写入” | `src/modules/{students,classes,subjects,scores}/{queries,service,routes}.ts`、`src/db/{index,migrations,seed}.ts`、`package.json` 脚本 |

## 未纳入首版（明确不做）

- 登录 / 角色权限、多用户并发与审计；
- 学期、考试维度与历史成绩（首版每学生每科仅一条当前成绩）；
- 真实学生数据导入、部署与对外发布。
