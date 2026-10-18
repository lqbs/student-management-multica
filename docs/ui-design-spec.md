> 说明：本文件为 LQB-16 界面与交互设计规范（Mika 于 2026-10-18 验收），供实现与测试验收对照；第 9 节对照表见 docs/acceptance-checklist.md。

# 学生管理系统：界面与交互设计规范（LQB-16）

**版本**：v1.0  
**日期**：2026-10-18  
**定位**：针对 LQB-14 首版需求及架构方案（ADR-001：Node.js 24 + TypeScript + Express 5 + EJS 模板 + 普通原生 CSS + SQLite）制定的界面设计与交互规范，供全栈开发工程师（LQB-17）直接实现与测试工程师（LQB-18）验收。  
**交付性质**：界面与交互规范（不含业务代码）。

---

## 目录
1. [全局设计规范与 Design Tokens](#1-全局设计规范与-design-tokens)
2. [信息架构与全局布局 (Layout)](#2-信息架构与全局布局-layout)
3. [通用反馈机制 (Feedback & Notifications)](#3-通用反馈机制-feedback--notifications)
4. [学生档案模块 (Students)](#4-学生档案模块-students)
5. [班级管理模块 (Classes)](#5-班级管理模块-classes)
6. [科目管理模块 (Subjects)](#6-科目管理模块-subjects)
7. [成绩管理模块 (Scores)](#7-成绩管理模块-scores)
8. [通用组件库与 HTML/CSS 规范 (Component Library)](#8-通用组件库与-htmlcss-规范-component-library)
9. [开发实施与验收对照表 (Developer Hand-off Checklist)](#9-开发实施与验收对照表-developer-hand-off-checklist)

---

## 1. 全局设计规范与 Design Tokens

基于无前端复杂打包（纯原生 CSS + 服务端 EJS 模板渲染）要求，提供标准 CSS Custom Properties 系统。设计遵循 **WCAG AA** 标准（正文对比度 ≥ 4.5:1，大文本/控制件对比度 ≥ 3:1，触控/点击热区 ≥ 44px）。

```css
:root {
  /* Brand / Primary Tokens (商务稳重蓝，符合管理系统心智) */
  --color-primary-50: #f0f7ff;
  --color-primary-100: #e0effe;
  --color-primary-500: #1d63ed;  /* 主操作色 */
  --color-primary-600: #154ec1;  /* Hover / Active */
  --color-primary-700: #0f398f;

  /* Neutral / Grayscale Tokens (中性色系统) */
  --color-neutral-0: #ffffff;
  --color-neutral-50: #f8fafc;   /* 页面主背景 */
  --color-neutral-100: #f1f5f9;  /* 容器/表头背景 */
  --color-neutral-200: #e2e8f0;  /* 边框色/分割线 */
  --color-neutral-300: #cbd5e1;  /* 输入框默认边框 */
  --color-neutral-400: #94a3b8;  /* 占位符、次要图标 */
  --color-neutral-500: #64748b;  /* 次要文本/辅助说明 */
  --color-neutral-700: #334155;  /* 正文次级文本 */
  --color-neutral-900: #0f172a;  /* 主标题、强调文字 (对比度 > 10:1) */

  /* Semantic Feedback Tokens */
  --color-success-bg: #ecfdf5;
  --color-success-border: #a7f3d0;
  --color-success-text: #065f46;

  --color-warning-bg: #fffbeb;
  --color-warning-border: #fde68a;
  --color-warning-text: #92400e;

  --color-danger-bg: #fef2f2;
  --color-danger-border: #fecaca;
  --color-danger-text: #991b1b;
  --color-danger-btn: #dc2626;
  --color-danger-btn-hover: #b91c1c;

  --color-info-bg: #eff6ff;
  --color-info-border: #bfdbfe;
  --color-info-text: #1e40af;

  /* Typography Tokens */
  --font-family-base: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --font-family-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

  --font-size-xs: 0.75rem;    /* 12px - 标签、提示 */
  --font-size-sm: 0.875rem;   /* 14px - 表格文字、次要信息 */
  --font-size-base: 1rem;     /* 16px - 主文本、表单输入框 */
  --font-size-lg: 1.125rem;   /* 18px - 小标题、卡片头 */
  --font-size-xl: 1.25rem;    /* 20px - 模块二级标题 */
  --font-size-2xl: 1.5rem;    /* 24px - 页面大标题 */

  --line-height-tight: 1.25;
  --line-height-base: 1.5;
  --line-height-relaxed: 1.75;

  /* Spacing Tokens (4px / 8px 网格体系) */
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-5: 1.25rem;  /* 20px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-10: 2.5rem;  /* 40px */
  --space-12: 3rem;    /* 48px */

  /* Elevation & Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05);

  /* Borders & Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;
  --border-width: 1px;

  /* Transitions */
  --transition-fast: 150ms ease-in-out;
  --transition-base: 200ms ease-in-out;
}
```

---

## 2. 信息架构与全局布局 (Layout)

系统采用典型的管理后台单页结构（服务端模板渲染），顶部为品牌与主导航，居中最大宽度为 `1200px`，页面自适应屏幕（响应式断点兼容 `768px` 移动/平板端与 `1024px+` 桌面端）。

### 2.1 全局线框与页面骨架 (ASCII Wireframe)

```
+-----------------------------------------------------------------------------------------+
| [LOGO] 学生管理系统                                    [学生档案]  [班级管理]  [成绩管理] |
+-----------------------------------------------------------------------------------------+
| > 面包屑导航: 首页 / 学生档案 / 新建学生                                                    |
|                                                                                         |
| [全局反馈 Banner: 操作成功 / 错误警告 (自动显示或携带参数渲染)]                              |
|                                                                                         |
| +-------------------------------------------------------------------------------------+ |
| | 页面标题: 学生档案列表                              [ + 新增学生 ]                    |
| | 辅助说明: 管理全校注册学生档案及所在班级关联。                                          |
| +-------------------------------------------------------------------------------------+ |
| | [搜索栏与筛选表单: 姓名/学号 [____]  班级: [ 全部班级 v ]  [ 查询 ]  [ 重置 ] ]          |
| +-------------------------------------------------------------------------------------+ |
| | [主要内容区: 数据表格 / 实体卡片 / 表单详情]                                          |
| |                                                                                     |
| |                                                                                     |
| +-------------------------------------------------------------------------------------+ |
| | [ 分页控制区: 共 42 条记录 | 每页 20 条 | [上一页] 第 1 / 3 页 [下一页] ]              |
| +-------------------------------------------------------------------------------------+ |
|                                                                                         |
|  © 2026 学生管理系统 (学习演示系统 · 基于 Node.js + Express + SQLite)                     |
+-----------------------------------------------------------------------------------------+
```

### 2.2 导航结构路由映射
- **学生档案**：`/students`（默认激活态）
  - 新增学生：`/students/new`
  - 学生详情：`/students/:id`
  - 编辑学生：`/students/:id/edit`
  - 删除学生：`POST /students/:id/delete`
- **班级管理**：`/classes`
  - 新增班级：`/classes/new`
  - 编辑班级：`/classes/:id/edit`
  - 删除班级：`POST /classes/:id/delete`
- **科目管理**：`/subjects`（成绩管理二级子模块，亦在成绩页提供快捷入口）
  - 新增科目：`/subjects/new`
  - 编辑科目：`/subjects/:id/edit`
  - 删除科目：`POST /subjects/:id/delete`
- **成绩管理**：`/scores`
  - 录入成绩：`/scores/new`
  - 编辑成绩：`/scores/:id/edit`
  - 删除成绩：`POST /scores/:id/delete`

---

## 3. 通用反馈机制 (Feedback & Notifications)

### 3.1 页面级状态反馈 Banner
在重定向后或表单提交后，顶部展示状态条：
1. **成功提示 (Success)**：
   - 背景：`--color-success-bg`，边框：`--color-success-border`，文字：`--color-success-text`。
   - 示例：“✔ 学生档案保存成功”、“✔ 班级删除成功”。
2. **全局错误警告 (Global Danger Alert)**：
   - 背景：`--color-danger-bg`，边框：`--color-danger-border`，文字：`--color-danger-text`。
   - 示例：“✖ 操作失败：该班级下仍有 3 名学生，请先转班或取消分班后重试”。
3. **空状态引导 (Empty State)**：
   - 当列表总记录为 0 时：居中图符展示，提示“暂无数据，请点击右上角新增”。
   - 当搜索筛选后记录为 0 时：提示“未找到符合条件的记录”，并提供“清空筛选条件”按钮。

### 3.2 表单内联校验与状态保留 (Form Validation & Inline Feedback)
服务端渲染规范（HTTP 422 校验失败响应）：
- **保留已填入的值**：EJS 模板必须将 `values[field]` 回填至对应的 `<input>` 或 `<select>` 中，杜绝用户重新填写的挫败感。
- **字段定位与红色警示**：
  - 边框置为红色：`border-color: var(--color-danger-btn);`
  - 输入框下方立即渲染错误提示文本 `<div class="form-error">`：“学号已存在，请更换其他学号”。
  - 光标或锚点默认聚焦于第一个出错字段。

### 3.3 危险删除二次确认机制 (Safe Deletion Confirm Modal / Dedicated Page)
针对服务端渲染（EJS）环境，推荐两种无缝降级方案：
1. **标准模态确认框 (JS 增强)**：点击“删除”按钮时，弹出遮罩模态框。
   - **标题**：“确认删除学生” / “确认删除班级”
   - **警告提示**：“此操作将永久删除学生 **张三 (学号: S001)**，**并同步删除该学生名下的全部 3 条学科成绩记录**！取消操作不会写入任何修改。”
   - **操作按钮**：“确认删除”（红色按钮 `btn--danger`）、“取消”（灰白按钮 `btn--secondary`）。
2. **纯 HTML 降级兜底**：若前端脚本禁用，提供独立删除确认页面 `/students/:id/delete-confirm`，列出即将级联影响的记录并包含提交确认表单。

---

## 4. 学生档案模块 (Students)

### 4.1 字段规范与数据字典
| 字段名称 | 英文标识 | 界面控件类型 | 必填 | 规范与限制规则 | 提示与占位符 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **学号** | `student_no` | 文本输入框 (Text) | 是 | 1–32 字符，字母数字连字符；**自动 Trim 并转大写；严格保留前导零（如 `001`）**；全局唯一 | “请输入唯一学号，如 001、S2026-01” |
| **姓名** | `name` | 文本输入框 (Text) | 是 | 1–50 字符，自动 Trim；不可为空白字符 | “请输入学生姓名” |
| **所属班级** | `class_id` | 下拉选择器 (Select) | 否 | 可为空（未分班）；非空时须为合法存在班级 | 下拉选项包含：“-- 暂未分班 --” 及各班级列表 |

### 4.2 学生列表与搜索筛选 (`/students`)
#### 线框布局：
```
+-----------------------------------------------------------------------------------------+
| [学生档案]                                                      [ + 添加新学生 ]         |
+-----------------------------------------------------------------------------------------+
| [表单筛选区]                                                                            |
| 姓名 / 学号: [ 关键字 (如: 001 或 张)     ]   班级: [ 全部班级 (含未分班) v ]              |
|                                            (全部班级 | 未分班 | 一班 | 二班)              |
|                                            [ 查询筛选 ]   [ 重置条件 ]                   |
+-----------------------------------------------------------------------------------------+
| [数据表格 Table]                                                                        |
| +----------+-----------+------------+--------------------+----------------------------+ |
| | 学号     | 姓名      | 所在班级   | 录入时间           | 操作                       | |
| +----------+-----------+------------+--------------------+----------------------------+ |
| | 001      | 张三      | 高一(1)班  | 2026-10-18 10:00   | [查看详情] [编辑] [删除]   | |
| | 002      | 李四      | 未分班(灰) | 2026-10-18 10:05   | [查看详情] [编辑] [删除]   | |
| +----------+-----------+------------+--------------------+----------------------------+ |
| 共 2 名学生 · 第 1/1 页                                                                 |
+-----------------------------------------------------------------------------------------+
```

#### 交互与状态规则：
- **组合搜索**：支持关键字（学号或姓名）与班级组合过滤，条件逻辑为 `AND`。
- **未分班筛选**：班级下拉提供专门选项 `未分班`（对应参数 `classId=unassigned`）。
- **保留前导零展示**：表格与详情展示学号时，严格原样呈现（如 `001`），禁止被转为数值 `1`。
- **“未分班”视觉区分**：显示为浅灰色徽章（Badge: `tag--unassigned`），醒目但不刺眼。
- **无搜索结果反馈**：显示空状态组件：“未找到匹配的学生，请尝试缩短关键字或重置筛选条件 [清空筛选]”。

### 4.3 新增 / 编辑学生表单 (`/students/new`, `/students/:id/edit`)
#### 表单字段排布：
```
+-------------------------------------------------------------------------+
| 面包屑: 学生档案 / 新建学生                                              |
|                                                                         |
| 容器卡片: [学生基础信息]                                                 |
|                                                                         |
|  学号 *                                                                  |
|  [ 001                              ]                                   |
|  (提示: 1-32位字符，系统将自动转为大写并严格保留前导零，保存后全局唯一)  |
|                                                                         |
|  学生姓名 *                                                              |
|  [ 张三                             ]                                   |
|  (提示: 1-50位字符，不可为空)                                            |
|                                                                         |
|  分配班级                                                                |
|  [ 高一(1)班                      v ]                                   |
|  (提示: 可暂不选择，后续随时可以转班或分班)                              |
|                                                                         |
|  [ 保存提交 ]        [ 取消并返回列表 ]                                  |
+-------------------------------------------------------------------------+
```
#### 交互与错误处理：
- **学号冲突**：服务端校验若发现学号重复，返回 422 状态码，在学号输入框下方提示：“学号已存在，请使用其他学号”。
- **空值拦截**：姓名或学号为空时，输入框加红边框，并提示“该字段为必填项”。

### 4.4 学生详情页与关联成绩面板 (`/students/:id`)
- **头部基础信息卡片**：展示学生姓名、学号（大号字体突出）、所属班级（提供快捷编辑入口）、创建时间。
- **下半部“已修科目与成绩”列表**：
  - 展示该学生当前所有已录入的成绩（科目名称、分数、录入时间、操作）。
  - 右上角提供快捷按钮 `[ + 录入此学生成绩 ]`（点击直接带入当前学生 ID）。
  - 若尚无成绩，展示引导提示：“该学生暂未录入任何成绩”。
- **危险操作区**：位于卡片最底部，提供红色“删除该学生”按钮，点击触发强二次确认提示。

---

## 5. 班级管理模块 (Classes)

### 5.1 字段规范与数据字典
| 字段名称 | 英文标识 | 界面控件类型 | 必填 | 规范与限制规则 | 提示与占位符 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **班级名称** | `name` | 文本输入框 (Text) | 是 | 1–50 字符，自动 Trim；不可重名 | “请输入班级全称，如：高一(1)班” |

### 5.2 班级列表与关联统计 (`/classes`)
#### 界面排布：
```
+-----------------------------------------------------------------------------------------+
| [班级管理]                                                      [ + 新建班级 ]           |
+-----------------------------------------------------------------------------------------+
| 提示卡片: 班级删除保护机制生效中：包含在读学生的班级无法直接删除，需先转移或清空学生。     |
+-----------------------------------------------------------------------------------------+
| +--------------------+--------------------+--------------------+----------------------+ |
| | 班级名称           | 在读学生人数       | 创建时间           | 操作                 | |
| +--------------------+--------------------+--------------------+----------------------+ |
| | 高一(1)班          | 25 人              | 2026-10-18 09:00   | [查看学生] [编辑]    | |
| |                    |                    |                    | [删除(禁用态/锁定)]  | |
| +--------------------+--------------------+--------------------+----------------------+ |
| | 竞赛特训班         | 0 人               | 2026-10-18 09:30   | [查看学生] [编辑]    | |
| |                    |                    |                    | [删除]               | |
| +--------------------+--------------------+--------------------+----------------------+ |
+-----------------------------------------------------------------------------------------+
```

#### 关键约束与删除防御设计：
1. **学生人数实时显式统计**：列表直接列出“在读学生人数”，人数大于 0 时，可直接点击数字跳转至筛选了该班级的学生列表。
2. **删除拦截与引导设计**：
   - **置灰/禁用或明确说明**：当在读学生 > 0 时，删除按钮附加说明或置为禁用状态；若用户提交删除请求，系统以 409 Conflict 状态码拦截，并弹出明确错误条：
     > **✖ 无法删除该班级**：该班级目前共有 **25 名学生**。请先在[学生档案]中将相关学生转入其他班级或设置为“未分班”后，再进行删除操作。
   - **空班级删除**：若在读学生为 0 人，弹出确认提示框：“确认删除班级【竞赛特训班】吗？此操作不可逆。” 确认后安全删除。

---

## 6. 科目管理模块 (Subjects)

### 6.1 字段规范与数据字典
| 字段名称 | 英文标识 | 界面控件类型 | 必填 | 规范与限制规则 | 提示与占位符 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **科目名称** | `name` | 文本输入框 (Text) | 是 | 1–50 字符，自动 Trim；全局唯一 | “请输入科目名称，如：高等数学、大学英语” |

### 6.2 科目列表与删除保护 (`/subjects`)
- **重名拦截**：新增或编辑重名科目时，报错提示：“科目名称已存在，请勿重复添加”。
- **引用保护机制**：
  - 系统实时统计已关联成绩记录数。
  - **有关联成绩的科目禁止删除**：若科目下已有成绩记录（关联数 > 0），删除操作将被阻断并提示：
    > **✖ 无法删除科目**：该科目已包含 **18 条成绩记录**。为了防止历史学业数据丢失，已有关联成绩的科目禁止删除。如需调整，可直接[编辑修改科目名称]。

---

## 7. 成绩管理模块 (Scores)

### 7.1 字段规范与业务规则
| 字段名称 | 英文标识 | 界面控件类型 | 必填 | 规范与限制规则 | 提示与占位符 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **关联学生** | `student_id` | 下拉选择器 / 联想输入 | 是 | 必须关联合法存在的学生 | “请选择学生（支持按学号/姓名检索）” |
| **考试科目** | `subject_id` | 下拉选择器 (Select) | 是 | 必须关联合法存在的科目 | “请选择考试科目” |
| **分数** | `score` | 数值文本框 (Number/Text) | 是 | **数值范围 0.0 ~ 100.0，最多 1 位小数**；拒绝负数、>100、空值、多位小数及非法格式 | “请输入 0~100 之间的分数，如 89.5” |

### 7.2 复合唯一性校验与引导体验 (No Duplicate Policy)
- **业务约束**：首版中，**每位学生针对每个科目只允许维护一条当前有效成绩**。
- **重复录入阻断与引导**：
  - 当录入已存在成绩的学生+科目组合时，服务端返回 409 Conflict。
  - **界面提示规范**：
    > ⚠️ **成绩记录已存在**：学生 **张三** 的 **大学语文** 成绩已录入为 **92.5 分**。无需重新新增，您可以直接 [👉 点击此处编辑该成绩记录](/scores/12/edit)。

### 7.3 成绩查询与多维筛选列表 (`/scores`)
#### 筛选器排布：
```
+-----------------------------------------------------------------------------------------+
| [成绩管理]                                   [ 科目设置入口 ]   [ + 录入新成绩 ]          |
+-----------------------------------------------------------------------------------------+
| [多维筛选栏]                                                                            |
| 学生检索: [ 姓名/学号关键字       ]                                                     |
| 所在班级: [ 全部班级            v ]                                                     |
| 考试科目: [ 全部科目 (语文/数学) v ]                                                     |
|                                            [ 立即筛选 ]   [ 重置条件 ]                   |
+-----------------------------------------------------------------------------------------+
| [成绩总表 Table]                                                                        |
| +----------+-----------+------------+------------+---------+--------------------------+ |
| | 学号     | 姓名      | 所在班级   | 考试科目   | 分数    | 操作                     | |
| +----------+-----------+------------+------------+---------+--------------------------+ |
| | 001      | 张三      | 高一(1)班  | 高等数学   | 98.5    | [编辑] [删除]            | |
| | 001      | 张三      | 高一(1)班  | 大学英语   | 100.0   | [编辑] [删除]            | |
| | 002      | 李四      | 未分班     | 高等数学   | 0.0     | [编辑] [删除]            | |
| +----------+-----------+------------+------------+---------+--------------------------+ |
| 共 3 条成绩 · 第 1/1 页                                                                 |
+-----------------------------------------------------------------------------------------+
```

#### 分数显示与边界值呈现：
- **精准展示**：十分值转回浮点展示，确保 `0` 显示为 `0` 或 `0.0`，`100` 显示为 `100`，`98.5` 保持一位小数。
- **高亮标色规则 (可选轻量视觉增强)**：
  - `< 60.0`：红色标签展示（不及格预警：`tag--danger`）。
  - `≥ 90.0`：绿色标签展示（优秀：`tag--success`）。

---

## 8. 通用组件库与 HTML/CSS 规范 (Component Library)

全套组件采用原生 CSS，可直接复制至 Express 的 `public/css/style.css` 中使用。

### 8.1 按钮系统 (Buttons)
```html
<!-- 主操作按钮 -->
<button type="submit" class="btn btn--primary">保存学生档案</button>

<!-- 次要/返回按钮 -->
<a href="/students" class="btn btn--secondary">取消并返回</a>

<!-- 危险操作按钮 (删除) -->
<button type="button" class="btn btn--danger" onclick="confirmDelete(...)">删除此记录</button>

<!-- 小尺寸表格内操作按钮 -->
<a href="/students/1/edit" class="btn btn--sm btn--outline">编辑</a>
```

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-family-base);
  font-size: var(--font-size-sm);
  font-weight: 500;
  line-height: var(--line-height-tight);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  text-decoration: none;
  min-height: 38px;
  box-sizing: border-box;
  transition: all var(--transition-fast);
}

.btn:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}

.btn--primary {
  background-color: var(--color-primary-500);
  color: var(--color-neutral-0);
}
.btn--primary:hover {
  background-color: var(--color-primary-600);
}

.btn--secondary {
  background-color: var(--color-neutral-0);
  border-color: var(--color-neutral-300);
  color: var(--color-neutral-700);
}
.btn--secondary:hover {
  background-color: var(--color-neutral-50);
  border-color: var(--color-neutral-400);
}

.btn--danger {
  background-color: var(--color-danger-btn);
  color: var(--color-neutral-0);
}
.btn--danger:hover {
  background-color: var(--color-danger-btn-hover);
}

.btn--sm {
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-2);
  min-height: 28px;
}
```

### 8.2 表单输入控件与校验高亮 (Form Fields)
```html
<div class="form-group">
  <label for="student_no" class="form-label">
    学号 <span class="form-required">*</span>
  </label>
  <input 
    type="text" 
    id="student_no" 
    name="student_no" 
    class="form-control <%= errors?.student_no ? 'is-invalid' : '' %>" 
    value="<%= values?.student_no || '' %>"
    placeholder="如 001"
    required
  >
  <% if (errors?.student_no) { %>
    <p class="form-error"><%= errors.student_no %></p>
  <% } else { %>
    <p class="form-help">字母、数字及连字符，系统将自动保留前导零。</p>
  <% } %>
</div>
```

```css
.form-group {
  margin-bottom: var(--space-5);
  display: flex;
  flex-direction: column;
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-neutral-900);
  margin-bottom: var(--space-2);
}

.form-required {
  color: var(--color-danger-btn);
  margin-left: 2px;
}

.form-control {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-base);
  font-family: var(--font-family-base);
  border: 1px solid var(--color-neutral-300);
  border-radius: var(--radius-md);
  background-color: var(--color-neutral-0);
  box-sizing: border-box;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.form-control:focus {
  outline: none;
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 3px rgba(29, 99, 237, 0.15);
}

.form-control.is-invalid {
  border-color: var(--color-danger-btn);
  background-color: #fffaf0;
}

.form-error {
  font-size: var(--font-size-xs);
  color: var(--color-danger-btn);
  margin-top: var(--space-1);
}

.form-help {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  margin-top: var(--space-1);
}
```

### 8.3 数据表格与徽章 (Tables & Badges)
```html
<table class="data-table">
  <thead>
    <tr>
      <th>学号</th>
      <th>姓名</th>
      <th>班级</th>
      <th class="text-right">操作</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="font-mono">001</td>
      <td class="font-bold">张三</td>
      <td><span class="badge badge--primary">高一(1)班</span></td>
      <td class="text-right">
        <a href="/students/1" class="btn btn--sm btn--secondary">详情</a>
        <a href="/students/1/edit" class="btn btn--sm btn--secondary">编辑</a>
      </td>
    </tr>
    <tr>
      <td class="font-mono">002</td>
      <td class="font-bold">李四</td>
      <td><span class="badge badge--neutral">未分班</span></td>
      <td class="text-right">...</td>
    </tr>
  </tbody>
</table>
```

```css
.data-table {
  width: 100%;
  border-collapse: collapse;
  background-color: var(--color-neutral-0);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-neutral-200);
  overflow: hidden;
}

.data-table th, .data-table td {
  padding: var(--space-3) var(--space-4);
  text-align: left;
  border-bottom: 1px solid var(--color-neutral-200);
  font-size: var(--font-size-sm);
}

.data-table th {
  background-color: var(--color-neutral-100);
  font-weight: 600;
  color: var(--color-neutral-700);
}

.data-table tr:last-child td {
  border-bottom: none;
}

.data-table tr:hover td {
  background-color: var(--color-neutral-50);
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: var(--font-size-xs);
  border-radius: var(--radius-full);
  font-weight: 500;
}
.badge--primary {
  background-color: var(--color-primary-50);
  color: var(--color-primary-600);
}
.badge--neutral {
  background-color: var(--color-neutral-100);
  color: var(--color-neutral-500);
}
```

### 8.4 分页组件 (Pagination)
```html
<nav class="pagination-wrapper" aria-label="分页导航">
  <span class="pagination-info">共 45 条记录 · 当前第 1 / 3 页</span>
  <ul class="pagination-list">
    <li><span class="pagination-link disabled">上一页</span></li>
    <li><a href="?page=1&q=张" class="pagination-link active">1</a></li>
    <li><a href="?page=2&q=张" class="pagination-link">2</a></li>
    <li><a href="?page=3&q=张" class="pagination-link">3</a></li>
    <li><a href="?page=2&q=张" class="pagination-link">下一页</a></li>
  </ul>
</nav>
```

---

## 9. 开发实施与验收对照表 (Developer Hand-off Checklist)

供 LQB-17（全栈开发）编码对照与 LQB-18（测试工程师）验收验证：

| 校验/交互场景 | 界面行为规范 | 预期 HTTP 响应与状态 |
| :--- | :--- | :--- |
| **新增/编辑学号唯一性** | 若输入已存在的学号，页面回显所有已填写数据，并在“学号”下方红色提示“学号已存在” | HTTP 422 状态码，表单值保留 |
| **学号前导零保留** | 输入 `001`、`089`，在详情页、编辑框及表格中必须完整保留前导零，禁止显示为 `1`、`89` | 字符型渲染 |
| **未分班筛选与展示** | 班级筛选选择“未分班”，准确列出 `class_id IS NULL` 的学生；表格中展示灰色“未分班”标签 | `?classId=unassigned` 参数 |
| **班级删除拦截** | 若班级内仍有学生，阻断删除，弹出明确警告：“该班级下有 N 名学生，请先转班或取消分班” | HTTP 409 Conflict 或禁用前端操作 |
| **空班级删除** | 人数为 0 的班级，弹出确认对话框，确认后成功删除并重定向回列表，附带绿色成功提示 | HTTP 303 重定向，带 Success 提示 |
| **科目删除保护** | 已录入成绩的科目禁止删除；提示“该科目已包含成绩记录，禁止删除” | HTTP 409 拦截 |
| **成绩重复录入处理** | 同一学生录入已有科目成绩时，提示“该成绩已存在”，并给出跳转编辑该记录的直达链接 | HTTP 409 状态码与友好操作链接 |
| **成绩范围校验** | 输入 `<0`、`>100` 或多于 1 位小数（如 `95.55`）时，字段标红并提示“请输入0-100之间且最多一位小数的数值” | HTTP 422 拦截并保留表单输入 |
| **学生删除级联提示** | 点击删除学生时，必须明确警告“将同步删除该学生名下的全部成绩记录”，取消则绝不写入 | 严格二次确认对话框或确认页 |
| **搜索与分页保留** | 在带有 `q` 或 `classId` 筛选的列表翻页时，分页链接必须携带原搜索参数，翻页不丢失条件 | URL Query 保留 |
| **空搜索结果与空列表** | 无数据时展示友好引导，明确区分“系统暂无数据”与“未搜索到匹配项” | 居中空状态组件展示 |

---
**UI 设计师**：完成交付，规范与代码无缝衔接。
