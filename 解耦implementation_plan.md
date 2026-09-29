# 前端代码模块化解耦重构实施方案

## 目标与背景

当前 `index.html` 为单体文件，共计约 **3700 行**代码，其中包含约 3250 行大型内嵌 `<script>`。
该脚本同时承担了底层二进制位流解码、暗黑2角色/仓库数据反序列化、内存网格碰撞计算、属性公式运算、多语言汉化翻译、Tooltip悬浮卡片、IndexedDB持久化、Tauri Rust原生IPC桥接、撤销重试事务等几乎所有功能。

这导致在修改某一项功能（如调整警告弹窗或汉化显示）时，不容易快速定位影响范围，也容易因全局作用域和隐式依赖产生回归。

本方案旨在将大型单体脚本按现有职责拆分为 **8 个职责相对清晰的模块**，降低维护成本，同时尽量保留当前代码的运行方式和业务逻辑。不追求一次性彻底重写，也不把“完全没有副作用”作为不现实的保证。

---

## 模块化架构设计与目录结构

所有拆分出的功能模块统一置于 `js/` 目录下，按 `core/`、`engine/`、`store/`、`ui/` 分层。模块之间仍可通过现有全局变量和函数协作，不在本阶段强行引入新的状态管理或事件总线。

```text
g:\game\median-xl\webrepo\
├── index.html                  # 主要保留 HTML、CSS 和脚本引用
├── data_tables.js              # 自动构建生成的游戏数据字典
├── assets/                     # 图标与引擎数据 (icons_manifest, engine_data)
├── js/                         # [NEW] 解耦后的功能模块体系
│   ├── core/
│   │   ├── bitstream.js        # 底层位流读取器与暗黑2校验和计算
│   │   ├── parser.js           # 角色与多页仓库二进制解析器
│   │   └── writer.js           # 存档修改、网格空位计算与区段重构
│   ├── engine/
│   │   └── props.js            # 属性计算、中文本地化与富文本显示
│   ├── store/
│   │   ├── storage.js          # 本地持久化、IndexedDB缓存、审计日志
│   │   └── transfers.js         # 存取事务管理
│   ├── ui/
│   │   ├── tooltip.js          # 悬浮窗卡片、定位与复制
│   │   └── modals.js            # 日志、警告弹窗与 Toast
│   └── app.js                  # 主控制器、筛选、渲染和 Tauri 桥接
└── scripts/
    └── prepare_dist.js         # [MODIFY] 同步复制 js/ 至构建目录
```

本次不要求 `index.html` 必须达到某个固定行数。只要大型业务脚本被移出、功能保持正常即可。

---

## 模块职责与依赖关系

模块按下面的顺序加载和协作：

```text
外部数据字典
    ↓
core/bitstream.js
    ↓
core/parser.js ─────┐
    ↓               │
core/writer.js      │
                    ↓
engine/props.js  →  ui/tooltip.js
                    ↓
store/storage.js → store/transfers.js
                    ↓
ui/modals.js    → app.js
```

这张图表示主要职责关系，不要求每个文件都成为完全独立的纯函数模块。现有代码中已经存在较多全局常量和函数依赖，因此第一阶段优先使用**固定脚本顺序 + 现有全局作用域**，不为形式上的单向依赖大规模改写调用接口。

---

## 拟实施变更清单

### 1. 核心底层层 (Core)

#### [NEW] `js/core/bitstream.js`

- **提取范围**：现有 `BitReader`、位流辅助和校验和相关代码；以函数定义为准，不机械依赖旧行号。
- **包含功能**：
  - `BitReader` 连续位流读取器类（LSB-first，指定位宽读取、跳位、对齐）；
  - 大小端转换 `u32le(v)`、`u16le(v)`；
  - 暗黑2循环移位累加校验和 `d2Checksum(b)` 与文件头修正 `fixHeader(bytes)`；
  - 二进制 Base64 编解码 `b64enc(u8)`、`b64dec(str)`；
  - 位直接改写 `setBits(data, bitOffset, width, value)`。
- **实现要求**：先保持浏览器普通 `<script>` 加载和全局函数名，不要求 `module.exports` 或 ES Module。

#### [NEW] `js/core/parser.js`

- **提取范围**：现有物品、角色和仓库解析相关函数。
- **包含功能**：
  - 核心品质与槽位字典：`QUALITY_NAMES`、`QUALITY_CLASS`、`CLASS_NAMES`、`LOC_NAMES`、`STOR_NAMES`、`EQUIP_SLOTS`；
  - 属性解码辅助：`propTable(id)`、`itemName(code)`、`isTomeCode(code)`；
  - `parseProps(br, ctx)`：魔法属性位流解析；
  - `parseItem(br, result, depth)`：完整物品解码、暗金/套装分支、镶孔物递归解码；
  - `parseD2s(bytes)`：`.d2s` 角色存档解析、物品区边界 `region` 锁定、佣兵/铁傀儡尽力解析；
  - `parseStashBytes(bytes, sourceLabel)`：`.stash` / `.shared` 多页仓库扫描与解码。

#### [NEW] `js/core/writer.js`

- **提取范围**：现有物品位置修改、区段插入/删除和保存前验证代码。
- **包含功能**：
  - `patchItemPos(raw, bitOff, loc, we, col, row, stor)`：按精确位偏移改写物品位置与网格坐标；
  - `freeInventoryCell(items, w, h)`：背包 10x10 网格空位计算；
  - `freeStashCell(itemsInPage, w, h, maxCols, maxRows)`：多页仓库网格空位计算；
  - `removeItemRanges(bytes, region, ranges)`、`removeStashItemRanges(bytes, itemsToRemove)`；
  - `insertItemBytes(bytes, region, newItems)`、`insertItemIntoStashBytes(bytes, newItemRaw, targetPageIdx)`；
  - `verifySave(bytes)`：写入磁盘前的已有合法性自检；
  - `downloadBytes(filename, u8)`：浏览器备用下载工具。

---

### 2. 属性与显示引擎层 (Engine)

#### [NEW] `js/engine/props.js`

- **包含功能**：
  - 常量定义：`PROP`、`QUALITY_ZH`、`QUALITY_EN`、`SKILL_TABS`；
  - 图标与职业判定：`iconSrc(it)`、`classRestriction(it)`；
  - 颜色与文本处理：`d2Colorize(s)`、`stripD2(s)`、`formatItemDesc(desc)`、`stripColorCodes(s)`；
  - 属性描述分发：`descFuncText(p)`；
  - 属性列表编译器：`displayPropsList(props)`，包括已有的属性排序和伤害合并逻辑。

保留对 `DATA_TABLES`、`ENGINE_DATA` 和现有字符串字典的全局访问方式，不在本阶段重新设计属性数据接口。

---

### 3. 数据与事务存储层 (Store)

#### [NEW] `js/store/storage.js`

- **包含功能**：
  - 全局存储状态对象：`REPO`、`GAME_STASH`、`SAVE`、`CURRENT`、`CHAR`；
  - 角色辅助：`getCurCharName()`；
  - 存取审计日志：`OPERATION_LOGS`、`loadLogs()`、`saveLogs()`、`addLog(...)`、`updateLogBadge()`、`renderLogs()`；
  - 离线 IndexedDB 缓存：已有 `openStashDB()`、`saveStashToCache(...)`、`loadStashFromCache(...)`；
  - 未保存脏标记保护：`HAS_UNSAVED_CHANGES`、`markUnsavedChanges(changed)` 和 `beforeunload` 处理；
  - 本地写回：`writeRepo()`、`backupSave()`、`writeSave(bytes)`。

#### [NEW] `js/store/transfers.js`

- **包含功能**：
  - `doStore()`：物品存入云仓库；
  - `doRetrieve()`：云仓库物品取回至背包；
  - `doRetrieveToStash(targetType)`：云仓库物品取回至个人仓库或共享仓库；
  - `saveAllToDisk(silent)`：统一保存流程，继续调用现有 Rust 写盘桥接和备份逻辑。

存取函数与页面状态耦合较多，拆分时允许继续读取 `STATE`、`SAVE`、`CURRENT` 等全局对象，不额外增加事务抽象层。

---

### 4. 界面交互与模态框层 (UI)

#### [NEW] `js/ui/tooltip.js`

- **包含功能**：
  - `popupHtml(it)`：物品富文本卡片；
  - `popupText(it)`：结构化纯文本复制；
  - `positionPopup(el)`：视口边界定位；
  - `initPopupEventsOnce()`：悬浮窗防抖、折叠面板和复制代理；
  - `bindPopups(selector)`：胶囊/表格行的悬浮和多选交互。

#### [NEW] `js/ui/modals.js`

- **包含功能**：
  - `openWarnModal(warns)`、`closeWarnModal()` 和警告复制；
  - 存取日志弹窗的打开、关闭、复制和清空；
  - 全局 ESC 关闭模态框；
  - `showToast(msg, ok)` 等轻量反馈。

---

### 5. 应用主控制器与入口整合

#### [NEW] `js/app.js`

- **包含功能**：
  - 全局交互与多选集合：`STATE`、`charSel`、`personalSel`、`sharedSel`、`repoSel`、`currentSel()`；
  - 多维筛选引擎和列表/表格渲染；
  - 存档载入调度：`showResult(result)`、`loadBytes(bytes)`、`openSave(entry)`、`loadSingleD2S(...)`、`handleLoadedFiles(...)`；
  - 深度文件与目录拖拽；
  - Tauri 桌面环境桥接与自启动：`IS_TAURI`、`tauriInvoke(...)`、资源提示、自动扫描和 F5 刷新；
  - 页面初始化和事件绑定。

#### [MODIFY] `index.html`

- 移除原有大型业务 `<script>`；
- 保留 HTML 结构、CSS、数据资源引用和必要的启动标记；
- 按以下顺序引入模块：

```html
<script src="assets/strings_indexed.js?v=2"></script>
<script src="assets/icons_manifest.js?v=2"></script>
<script src="data_tables.js?v=2"></script>
<script src="assets/engine_data.js?v=1"></script>
<script src="js/core/bitstream.js"></script>
<script src="js/core/parser.js"></script>
<script src="js/core/writer.js"></script>
<script src="js/engine/props.js"></script>
<script src="js/store/storage.js"></script>
<script src="js/store/transfers.js"></script>
<script src="js/ui/tooltip.js"></script>
<script src="js/ui/modals.js"></script>
<script src="js/app.js"></script>
```

脚本顺序为：数据资源 -> Core -> Engine -> Store -> UI -> App。若拆分过程中发现某个函数有额外依赖，以实际加载错误为准调整顺序，不为了形式上的分层重写业务逻辑。

#### [MODIFY] `scripts/prepare_dist.js`

- 增加对 `js/` 目录的递归复制；
- 确保构建用 `dist/js/` 与外置 `web/js/` 使用同一份模块文件；
- 不新增功能重复的同步脚本；
- 继续同步现有 `index.html`、`data_tables.js`、`assets/` 和 `txt/`。

---

## 实施方式

1. 先备份当前 `index.html`；
2. 按模块边界逐段复制代码到新文件，再从 `index.html` 删除已复制部分；
3. 每完成一个模块就补上脚本引用并打开页面确认；
4. 优先先拆 `core/`，再拆 `engine/`、`store/`、`ui/`，最后整理 `app.js`；
5. 遇到跨模块全局依赖时先保留，不在本次强行改造为参数传递或 ES Module；
6. 每完成一组模块保留一个可运行版本，方便回退。

本次不引入 React、Vue、TypeScript、打包器、事件总线或新的状态管理库。

---

## 验证与回归测试计划

### 1. 基础语法与加载检查

- 对新增的 8 个 `.js` 文件执行 `node --check`；
- 在浏览器或 Tauri 中打开页面，确认脚本没有启动级错误；
- 确认数据资源、解析器、渲染和 Tauri 桥接均按顺序加载。

不要求第一阶段建立完整的 Node.js 单元测试框架，也不要求把所有函数改造成可独立导入的测试模块。

### 2. 代表性功能检查

使用现有样本存档进行手工回归：

- 载入 `xixipo.d2s` 和一个仓库文件；
- 检查角色背包、个人仓库、共享仓库、本地云仓库四个页签；
- 检查物品数量、品质、属性、图标和 Tooltip；
- 测试物品点击选取、批量存入和取回；
- 测试保存后重新读取；
- 检查日志、警告弹窗和异常提示。

若出现解析差异，优先与拆分前页面的结果对比，不要求一次性编写复杂的逐字段自动比对工具。

### 3. 构建与外置资源同步验证

- 运行 `node scripts/prepare_dist.js`；
- 检查 `web/js/` 和 `dist/js/` 是否完整生成；
- 修改外置 `web/index.html` 或某个 JS 文件的可见行为；
- 不重新编译 exe，按 F5 或重启确认修改生效。

### 4. Tauri 交互实测

- 验证自动扫描存档和手动载入仍可用；
- 验证直接写盘、备份和日志仍可用；
- 验证资源加载失败时有明确提示，不出现无信息白屏。

---

## 推荐实施顺序

1. 备份 `index.html`；
2. 拆出 `core/bitstream.js`、`core/parser.js`、`core/writer.js`；
3. 拆出 `engine/props.js`；
4. 拆出 `store/storage.js`、`store/transfers.js`；
5. 拆出 `ui/tooltip.js`、`ui/modals.js`；
6. 整理 `app.js` 并更新脚本引用；
7. 修改 `prepare_dist.js` 同步 `js/`；
8. 运行一次基础构建和代表性功能回归；
9. 先实际使用一段时间，再决定是否需要进一步改成 ES Module 或更严格的接口隔离。

验收标准是：**现有功能和数据结果保持一致，代码按职责更容易定位，外置 HTML/JS 修改无需重新编译 exe。**
