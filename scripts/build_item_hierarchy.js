/**
 * scripts/build_item_hierarchy.js
 * 
 * 从 网页元素.txt 和 txt/ 官方字符串文本表自动化构建 Median XL 本地分类树
 * 严格遵照用户规则：
 * G:\game\median-xl\webrepo\txt 里的带有 string 文本文档里如果有对应的中文需要使用对应的中文，如果没有就保持英文。
 */

const fs = require('fs');
const path = require('path');

console.log('=== [build_item_hierarchy] 开始构建官方类型层级树 ===');

// 1. 构建官方中英文对照词典 (从 string.txt, patchstring.txt, expansionstring.txt)
const strFiles = [
  'txt/string.txt',
  'txt/patchstring.txt',
  'txt/expansionstring.txt'
];

const dict = {};

// 正则1: 匹配如 "拳剑 Katar (1)" 或 "长匕首 Dirk [神圣]"
const regex1 = /^([\u4e00-\u9fa5·•—\-]+)\s+([A-Za-z0-9'\s\-]+?)(?:\s*[\(\[]|\s*$)/;
// 正则2: 匹配如 "dir	长匕首 Dirk【普通】"
const regex2 = /^([A-Za-z0-9'\s\-]+?)\t+([\u4e00-\u9fa5·•—\-]+)\s+([A-Za-z0-9'\s\-]+)/;

for (const f of strFiles) {
  if (!fs.existsSync(f)) continue;
  const content = fs.readFileSync(f, 'utf8');
  for (let line of content.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split('\t');
    const key = parts[0].trim().toLowerCase();
    const val = parts.slice(1).join('\t').trim();

    // 尝试正则1
    const m1 = val.match(regex1);
    if (m1) {
      const zh = m1[1].trim();
      const en = m1[2].trim().toLowerCase();
      if (zh && en && en.length > 1 && !dict[en]) {
        dict[en] = zh;
      }
    }

    // 纯中文单词如果作为属性/部位
    if (parts.length >= 2 && /^[\u4e00-\u9fa5]+$/.test(val)) {
      if (!dict[key]) dict[key] = val;
    }
  }
}

// 补充顶级与常见部位标准中文翻译（若 string 表未覆盖）
const topCategories = {
  'weapons': '武器',
  'melee weapons': '近战武器',
  'ranged weapons': '远程武器',
  'assassin claws': '刺客爪',
  'assassin naginatas': '刺客长柄刀',
  'daggers': '匕首',
  'hammers': '铁锤',
  'maces': '钉头锤',
  'necromancer wands': '死灵法师法杖',
  'one-handed axes': '单手斧',
  'one-handed swords': '单手剑',
  'polearms': '长柄武器',
  'scepters': '权杖',
  'scythes': '镰刀',
  'sorceress orbs': '法师宝球',
  'spears': '长矛',
  'staves': '双手法杖',
  'two-handed axes': '双手斧',
  'two-handed swords': '双手剑',
  'bows': '弓',
  'crossbows': '十字弓',
  'javelins': '标枪',
  'throwing axes': '投掷斧',
  'throwing knives': '投掷飞刀',
  
  'armors': '防具',
  'body armors': '衣服/胸甲',
  'helms': '头盔',
  'shields': '盾牌',
  'gloves': '手套',
  'boots': '靴子',
  'belts': '腰带',
  'amazon helms': '亚马逊头盔',
  'assassin shields': '刺客盾牌',
  'barbarian helms': '野蛮人头盔',
  'druid pelts': '德鲁伊狼头/鸟头',
  'necromancer shields': '死灵法师专属盾',
  'paladin shields': '圣骑士专属盾',
  'sorceress body armors': '法师专属长袍',
  
  'misc': '杂项道具',
  'rings': '戒指',
  'amulets': '项链',
  'jewels': '珠宝',
  'quivers': '箭袋',
  'charms': '护身符/护符',
  'relics': '遗物 (Relic)',
  'trophies': '战利品 (Trophy)',
  'gems': '宝石',
  'runes': '符文',
  'great runes': '大符文',
  'elemental runes': '元素符文',
  'enchanted runes': '附魔符文',
  'mystic orbs': '神秘球 (MO)',
  'potions': '药剂',
  'consumables': '消耗品',
  'scrolls': '卷轴',
  'dyes': '染色剂',
  'cycles': '时轮石 (Cycles)',
  'shrines': '圣坛 (Shrines)',
  'essences': '精魄 (Essences)',
  'reagents': '重塑试剂',
  'riftstones': '裂隙石 (Riftstones)',
  'gold': '金币',
  'quest items': '任务道具',
  'other': '其它',
  'unclassified': '未分类'
};

for (const [k, v] of Object.entries(topCategories)) {
  if (!dict[k]) dict[k] = v;
}

console.log(`[build_item_hierarchy] 官方中文词典构建完成，共 ${Object.keys(dict).length} 条词条。`);

// 2. 加载 DATA_TABLES.items，建立底材映射
require(path.resolve('data_tables.js'));
const d2Items = global.DATA_TABLES.items || {};

// 3. 从 网页元素.txt 解析 843 个节点
const rawHtml = fs.readFileSync('网页元素.txt', 'utf8');
const nodeRegex = /class="rtt-node[^"]*"[^>]*data-id="([^"]+)"[^>]*data-depth="([^"]+)"[\s\S]*?<span class="rtt-label"[^>]*>([^<]+)<\/span>/gi;

let m;
const nodes = [];
const nodeMap = {};

while ((m = nodeRegex.exec(rawHtml)) !== null) {
  const id = m[1];
  const depth = parseInt(m[2], 10);
  const label = m[3].trim();
  const lowerLabel = label.toLowerCase();
  
  // 匹配中文
  const zh = dict[lowerLabel] || null;

  const node = {
    id: id,
    depth: depth,
    labelEn: label,
    labelZh: zh || label, // 有中文用中文，无中文保持英文
    hasZh: !!zh,
    children: [],
    codes: []
  };

  nodes.push(node);
  nodeMap[id] = node;
}

console.log(`[build_item_hierarchy] 从 网页元素.txt 解析出 ${nodes.length} 个层级节点。`);

// 4. 构建父子树关系
const roots = [];
for (const node of nodes) {
  const slashIdx = node.id.lastIndexOf('/');
  if (slashIdx === -1) {
    roots.push(node);
  } else {
    const parentId = node.id.slice(0, slashIdx);
    if (nodeMap[parentId]) {
      nodeMap[parentId].children.push(node);
    } else {
      roots.push(node);
    }
  }
}

// 5. 将底材 code 关联到叶子节点
// 根据底材名称与 node label 进行匹配
for (const [code, it] of Object.entries(d2Items)) {
  if (!it || !it.name) continue;
  const itNameLower = it.name.toLowerCase();

  for (const node of nodes) {
    if (node.children.length === 0) { // 叶子节点
      const lEn = node.labelEn.toLowerCase();
      const lZh = node.labelZh.toLowerCase();

      // 判断名称是否包含或对齐
      if (itNameLower.includes(lEn) || (node.hasZh && itNameLower.includes(lZh))) {
        if (!node.codes.includes(code)) {
          node.codes.push(code);
        }
      }
    }
  }
}

// 递归向上收集 codes
function rollUpCodes(node) {
  for (const child of node.children) {
    rollUpCodes(child);
    for (const c of child.codes) {
      if (!node.codes.includes(c)) {
        node.codes.push(c);
      }
    }
  }
}
roots.forEach(rollUpCodes);

// 统计
let nodesWithCodes = nodes.filter(n => n.codes.length > 0).length;
console.log(`[build_item_hierarchy] 关联底材代码完成，覆盖节点数: ${nodesWithCodes}/${nodes.length}`);

// 6. 生成前端模块 assets/item_hierarchy.js
const outputJs = `// Median XL 官方同款类型层级树静态数据 (自动对齐官方中文)
(function(root) {
  'use strict';

  const ITEM_HIERARCHY = ${JSON.stringify(roots, null, 2)};

  if (typeof window !== 'undefined') {
    window.ITEM_HIERARCHY = ITEM_HIERARCHY;
  }
  if (typeof global !== 'undefined') {
    global.ITEM_HIERARCHY = ITEM_HIERARCHY;
  }
})(typeof window !== 'undefined' ? window : this);
`;

fs.writeFileSync('assets/item_hierarchy.js', outputJs, 'utf8');
console.log(`[build_item_hierarchy] 成功生成 assets/item_hierarchy.js (${(outputJs.length / 1024).toFixed(1)} KB)！`);
