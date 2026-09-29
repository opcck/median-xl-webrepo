# Median XL 本地云仓库与存档管理工具 (Median XL WebRepo)

一款专为 **暗黑破坏神2: 毁灭之王 (Diablo II: Lord of Destruction)** 大型 MOD **Median XL** 设计的本地无限容量云仓库与存档管理工具。

支持单文件桌面端（Tauri + Rust）与纯网页端（Web），具备装备跨角色/跨仓库无损存取、多维属性与底材筛选、官方全量技能与词缀精准汉化解析、以及严格的存档安全备份机制。

---

## ✨ 核心特性

- 📦 **全模式存取互通**：
  - 支持 **角色背包/装备栏 (.d2s)**、**个人仓库 (.stash)**、**共享大仓库 (_sharedstash.shared)** 与 **本地无限云仓库** 之间任意双向存取与移动。
  - 自动网格空间检测与安全布局，防止物品位置冲突与空间溢出。
- 🔍 **多维智能筛选器**：
  - 支持按品质（普通白、魔法蓝、稀有黄、手工橙、套装绿、暗金金、大师级、暗金梯度 TU/SU/SSU/SSSU/Jewelry）筛选。
  - 支持完整的物品树状分类索引（按装备部位、防具、武器大类、符文、珠宝、圣物/遗物等精准定位）。
  - 支持按属性词缀全文模糊搜索（例如搜“法术专注”、“所有技能”、“减抗”等）。
- 📖 **官方全量数据库汉化与词缀引擎**：
  - 完整提取 Median XL 底层全量 **3018 项技能字典**，彻底告别“技能#ID”代号显示。
  - 完美支持 Relic 遗物系统、大师级底材（wm01~wm22、mz01~mz22）及稀有词缀名称解码。
  - 准确还原触发类技能（CTC）、随等级成长属性、冷却时间缩减等复杂机制描述。
- 🛡️ **工业级存档写盘安全保护**：
  - 每次执行写盘保存时，后端自动生成微秒级时间戳备份文件（`.bak`），杜绝任何数据损坏风险。
  - 临时文件暂存 + 原子替换，确保断电或异常终止不会损坏原存档。
  - 解析器底层内置防御性校验，自动静默屏蔽非法幽灵数据。
- 🚀 **双运行形态**：
  - **单文件便携桌面版**：基于 Tauri v2 + Rust 构建，单文件体积仅 ~5.6 MB，静态资源全内嵌，即开即用。
  - **独立网页版**：纯静态前端结构，直接用现代浏览器打开 `index.html` 即可免安装运行。

---

## 🏗️ 技术架构

```text
median-xl-webrepo/
├── src-tauri/             # Rust 桌面端核心源码 (Tauri v2)
│   ├── src/main.rs        # 桌面程序入口 (无控制台窗口优化)
│   ├── src/lib.rs         # Tauri 核心配置与插件绑定
│   ├── src/commands.rs    # 原生文件 IO、原子写盘与时间戳安全备份
│   ├── Cargo.toml         # Rust 依赖与 LTO 优化配置
│   └── tauri.conf.json    # 桌面应用窗口与构建配置
├── js/                    # 前端模块化源码
│   ├── app.js             # 页面控制器与交互调度
│   ├── core/
│   │   ├── bitstream.js   # 高效二进制位流读取器 (BitReader) 与写入器 (BitWriter)
│   │   ├── parser.js      # D2S / STASH / SHARED 二进制解析器与非法数据防御
│   │   └── writer.js      # 物品二进制序列化、重排与空间防叠核心
│   ├── engine/
│   │   └── props.js       # 全量属性计算、词缀解析与富文本着色引擎
│   ├── store/
│   │   ├── storage.js     # 本地云仓库存储驱动 (IndexedDB / JSON)
│   │   └── transfers.js   # 物品跨仓库双向传输状态机
│   └── ui/
│       ├── filter_tree.js # 分类层级树与状态过滤
│       ├── modals.js      # 弹窗与交互面板
│       └── tooltip.js     # 原生高仿 D2 暗黑悬浮装备属性气泡
├── scripts/               # 自动化构建与数据提纯流水线
│   ├── build_data_tables.js   # 从 txt 数据库提纯技能、底材与属性字典
│   ├── build_item_hierarchy.js # 生成装备分类多级树状索引
│   └── prepare_dist.js        # 自动化静态资源打包、Terser 混淆与深度压缩
├── txt/                   # Median XL 游戏底层官方数据表源文件
├── assets/                # 物品高清图标 (items-icons/)、数据源与暗黑主题样式
├── index.html             # 客户端主界面
└── package.json           # Node 构建配置
```

---

## 🛠️ 快速开始

### 前置环境

- [Node.js](https://nodejs.org/) (建议 v18+ 或最新 LTS)
- [Rust](https://www.rust-lang.org/) (仅编译桌面版客户端需要，建议 1.77+)
- Windows 10 / 11

### 安装依赖

```bash
npm install
```

### 数据表自动构建与资源同步

从 `txt/` 官方游戏底层数据自动构建纯净字典，并同步准备资源：

```bash
node scripts/prepare_dist.js
```

### 运行开发调试

```bash
# 启动 Tauri 桌面端开发环境
npm run dev
```

或者直接在浏览器中打开 `index.html`，即可直接使用免安装网页版。

### 编译单文件 Release 桌面端

```bash
# 执行全量打包编译（自动混淆压缩前端资源并内嵌至二进制文件）
npm run build
```

编译产物将生成在 `src-tauri/target/release/app.exe`，重命名为 `median-xl-repo.exe` 即可独立运行。

---

## 📝 贡献与许可

- **作者**：西西 (QQ: 596162014)
- **致谢**：Median XL 团队、Diablo II 社区及广大玩家。
- 本项目遵循 MIT 开源协议。
