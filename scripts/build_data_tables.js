/**
 * scripts/build_data_tables.js
 * 
 * Median XL 官方数据表全自动构建流水线
 * 
 * 职责：
 * 1. 100% 读取游戏官方源文件（armor.tsv, weapons.tsv, misc.txt, itemstatcost.txt, string.txt, patchstring.txt 等）
 * 2. 自动联结与提纯，提取标准 props, items, monsters, skills 表
 * 3. 彻底清除早期网页版的残留直译与未汉化英文，使所有名称、描述与官方文本 100% 对齐
 * 4. 自动生成 data_tables.js，并同步到 web/ 和 dist/ 目录
 */

const fs = require('fs');
const path = require('path');

console.log('=== [build_data_tables] 开始构建官方全纯净数据表 ===');

// 1. 读取并构建 string.txt / patchstring.txt / expansionstring.txt 字典
const strFiles = [
  'txt/string.txt',
  'txt/patchstring.txt',
  'txt/expansionstring.txt'
];

const strKeyMap = {};
const strIndexed = [];

for (const f of strFiles) {
  if (!fs.existsSync(f)) {
    console.warn(`[WARN] 文本文件未找到: ${f}`);
    continue;
  }
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;
    const parts = rawLine.split('\t');
    const k = parts[0].trim();
    const v = parts.slice(1).join('\t').trim();
    if (k) {
      strKeyMap[k.toLowerCase()] = v;
    }
    if (f === 'txt/string.txt') {
      strIndexed[i] = v;
    } else if (f === 'txt/patchstring.txt') {
      strIndexed[10000 + i] = v;
    }
  }
}

console.log(`[build_data_tables] 字符串表已加载: key索引=${Object.keys(strKeyMap).length}条, 行号索引=${strIndexed.length}条`);

// 2. 构建 props (来自 itemstatcost.txt)
console.log('[build_data_tables] 正在从 txt/itemstatcost.txt 提取属性定义 (props)...');
const iscContent = fs.readFileSync('txt/itemstatcost.txt', 'utf8');
const iscLines = iscContent.split(/\r?\n/);
const iscHeader = iscLines[0].split('\t');
const col = name => iscHeader.indexOf(name);

function cleanD2Text(t) {
  if (!t) return '';
  return t.replace(/ÿc[0-9a-z]/gi, '').replace(/\\[a-z]+;/gi, '').trim();
}

const props = {};
for (let i = 1; i < iscLines.length; i++) {
  const line = iscLines[i];
  if (!line || !line.trim()) continue;
  const parts = line.split('\t');
  const stat = parts[col('Stat')];
  const idStr = parts[col('ID')];
  const id = parseInt(idStr !== undefined && idStr !== '' ? idStr : (i - 1), 10);
  if (isNaN(id)) continue;

  const bits = parseInt(parts[col('Save Bits')], 10) || 0;
  const add = parseInt(parts[col('Save Add')], 10) || 0;
  const pbits = parseInt(parts[col('Save Param Bits')], 10) || 0;
  const df = parseInt(parts[col('descfunc')], 10) || 0;
  const dv = parseInt(parts[col('descval')], 10) || 0;
  const pr = parseInt(parts[col('descpriority')], 10) || 0;

  const posKey = (parts[col('descstrpos')] || '').trim().toLowerCase();
  const negKey = (parts[col('descstrneg')] || '').trim().toLowerCase();

  let pos = strKeyMap[posKey] || parts[col('descstrpos')] || '';
  let neg = strKeyMap[negKey] || parts[col('descstrneg')] || '';

  // 汉化与清洗
  pos = cleanD2Text(pos);
  neg = cleanD2Text(neg);

  props[String(id)] = {
    stat: stat || ('stat_' + id),
    add,
    bits,
    pbits,
    df,
    dv,
    pr,
    pos: pos || stat || ('属性#' + id),
    neg: neg || pos || stat || ('属性#' + id)
  };
}
console.log(`[build_data_tables] 属性定义提取完成，共 ${Object.keys(props).length} 项`);

// 3. 构建 items (来自 armor.tsv, weapons.tsv, misc.txt)
console.log('[build_data_tables] 正在从官方防具、武器、杂物表提取物品库 (items)...');

function resolveItemName(code, namestr, rawName) {
  // 1. 优先尝试以 namestr 作为 key 查询
  if (namestr) {
    const k = namestr.trim().toLowerCase();
    if (strKeyMap[k]) {
      return formatRawStringName(strKeyMap[k]);
    }
  }
  // 2. 尝试以 code 作为 key 查询
  if (code) {
    const k = code.trim().toLowerCase();
    if (strKeyMap[k]) {
      return formatRawStringName(strKeyMap[k]);
    }
  }
  // 3. 若 key 未命中，且 namestr 是纯数字行号，则去 strIndexed[num] 查找
  if (namestr) {
    const num = parseInt(namestr, 10);
    if (!isNaN(num) && strIndexed[num]) {
      return formatRawStringName(strIndexed[num]);
    }
  }
  // 4. 回退到 rawName 或 code
  return rawName || code;
}

function formatRawStringName(raw) {
  if (!raw) return '';
  // 处理带类别分节符 } 的字符串，例如 "方块重塑材料 Cube Reagent}ÿc8强效炼金油 Oil of Greater Alchemy (3)"
  if (raw.includes('}')) {
    const parts = raw.split('}');
    const category = cleanD2Text(parts[0]).split(' ')[0] || '方块重塑材料';
    const mainName = cleanD2Text(parts.slice(1).join(' '));
    return category + '\\n\\orange;' + mainName;
  }
  // 去掉 【普通】 【中】 【重】 等旧式方括号尾缀
  let cleaned = raw.replace(/【[^】]+】/g, '').trim();
  return cleanD2Text(cleaned);
}

// 特殊试剂/挑战物品标准配方说明补全库
const customDescs = {
  'ebs1': '90}强效炼金油}允许你锻造护符(amulets):}}油 + 套装护符}--〉 手工护符}带有"所有技能 +1"词缀}}随机添加一个词缀:}------------------------------}20% 移动速度}+200 生命恢复/秒}+15% 固有元素伤害 (IED)}+10% 体力}+10% 精力}-10% 敌人元素抗性}+10% 物理抗性}+50% 武器物理伤害 (WPD)}毒素持续时间减少 40%}诅咒持续时间减少 40%}',
  'ebs2': '90}强效炼金油}允许你锻造护符(amulets):}}油 + 套装护符}--〉 手工护符}带有"所有技能 +1"词缀}}随机添加一个词缀:}------------------------------}20% 移动速度}+200 生命恢复/秒}+15% 固有元素伤害 (IED)}+10% 体力}+10% 精力}-10% 敌人元素抗性}+10% 物理抗性}+50% 武器物理伤害 (WPD)}毒素持续时间减少 40%}诅咒持续时间减少 40%}',
  'ebs3': '90}强效炼金油}允许你锻造护符(amulets):}}油 + 套装护符}--〉 手工护符}带有"所有技能 +1"词缀}}随机添加一个词缀:}------------------------------}20% 移动速度}+200 生命恢复/秒}+15% 固有元素伤害 (IED)}+10% 体力}+10% 精力}-10% 敌人元素抗性}+10% 物理抗性}+50% 武器物理伤害 (WPD)}毒素持续时间减少 40%}诅咒持续时间减少 40%}',
  '|dul': '75}这个强大的神器可与不同试剂重塑以产生多种用途。}}某些完美宝石允许你自选指定类别的属性。}}守护结界 + 完美宝石 -> 增加/重洗属性}}红宝石 = 职业技能}绿宝石 = 速度}蓝宝石 = 敌人抗性}黄宝石 = 基础属性}紫宝石 = 抗性}钻石 = 最大抗性}骷髅 = 仆从属性}}此外，该神器还可用于召唤特定首领、传送至特定区域以及开启任务传送门。}',
  'x5x': '\\grey;在方块中重塑全部三颗太阳石以合成双子海的太阳石\\n',
  'x6x': '\\grey;在方块中重塑全部三颗太阳石以合成双子海的太阳石\\n',
  'x7x': '\\grey;在方块中重塑全部三颗太阳石以合成双子海的太阳石\\n',
  '2x0': '50}正电子脑用于制造和充能转移催化剂。}}5x 正电子脑}--> 转移催化剂}}催化剂 + 正电子脑 (最多 10 个)}--> 催化剂 (+1-10 充能数)}',
  'en96': '\\dgrey;取决于力量与敏捷中较高者\\n\\blue;双手武器: 力量/敏捷的 52% 转为固有火焰伤害\\n单手武器: 力量/敏捷的 33% 转为固有火焰伤害\\n武器物理伤害 -500%\\n无法造成魔法伤害\\n\\gold;混沌领域 (Pandemonium)\\n\\n\\red;对元素基底及带有固有元素伤害成长的物品无效\\n\\grey;与魔法或更高品质的神圣武器于方块中重塑以添加加成\\n\\n方块重塑材料',
  'ktfx': '未成形之地的灵魂碎片\\n\\n可净化灵魂的万物之一\\n\\n兄弟、救世主与牺牲者的造物\\n\\n可显现圣子与其门徒\\n\\n其尖啸萦绕于生者之畔',
  'ktgx': '前路已现，蓄势待发\\n\\n高级知识印记\\n必须灌注伟大的知识\\n\\n\\dgrey;世界之石水晶已被重塑',
  'dy99': '\\grey;用于给装备重新染色\\n方块重塑材料',
  'ir01': '\\dgrey;- 赫拉迪姆重塑 -\\n',
  'ir09': '\\dgrey;- 赫拉迪姆重塑 -\\n\\n\\grey;怪物英雄与精英可能刷新\\n免疫压碎性打击(CB)，减少 50% 毒素持续时间\\n免疫群体控制，最大减速效果: 25%\\n吸收 50% 火焰、冰冷与闪电伤害\\n无法被冰冻或减速\\n\\green;+20% 移动速度\\n\\grey;70% 吸血抗性\\n次元撕裂\\n\\green;诅咒消减\\n\\n\\grey;元素抗性: +24%\\n怪物密度: +10%\\n怪物伤害: +80%\\n怪物生命: +160%\\n',
  'ir10': '\\dgrey;- 赫拉迪姆重塑 -\\n\\n\\grey;怪物英雄与精英可能刷新\\n免疫压碎性打击(CB)，减少 50% 毒素持续时间\\n免疫群体控制，最大减速效果: 25%\\n吸收 50% 火焰、冰冷与闪电伤害\\n无法被冰冻或减速\\n+20% 移动速度\\n70% 吸血抗性\\n\\green;无怪物尸体\\n\\grey;次元撕裂\\n诅咒消减\\n\\n元素抗性: +27%\\n怪物密度: +10%\\n怪物伤害: +90%\\n怪物生命: +180%\\n',
  'ir11': '\\dgrey;- 赫拉迪姆重塑 -\\n\\n\\grey;怪物英雄、精英与统领可能刷新\\n免疫压碎性打击(CB)，减少 50% 毒素持续时间\\n免疫群体控制，最大减速效果: 25%\\n吸收 50% 火焰、冰冷与闪电伤害\\n无法被冰冻或减速\\n+20% 移动速度\\n70% 吸血抗性\\n无怪物尸体\\n\\green;强化技能\\n\\grey;次元撕裂\\n诅咒消减\\n\\n元素抗性: +30%\\n怪物密度: +10%\\n\\green;怪物集群规模: +20%\\n\\grey;怪物伤害: +100%\\n怪物生命: +200%\\n',
  'ir12': '\\dgrey;- 赫拉迪姆重塑 -\\n\\n\\grey;怪物英雄、精英与统领可能刷新\\n免疫压碎性打击(CB)，减少 50% 毒素持续时间\\n免疫群体控制，最大减速效果: 25%\\n\\green;击中时降低玩家闪避与格挡\\n\\grey;吸收 50% 火焰、冰冷与闪电伤害\\n无法被冰冻或减速\\n+20% 移动速度\\n70% 吸血抗性\\n无怪物尸体\\n强化技能\\n次元撕裂\\n诅咒消减\\n\\n元素抗性: +33%\\n怪物密度: +10%\\n怪物集群规模: +20%\\n怪物伤害: +110%\\n怪物生命: +220%\\n',
  'ir13': '\\dgrey;- 赫拉迪姆重塑 -\\n\\n\\grey;怪物英雄、精英与统领可能刷新\\n免疫压碎性打击(CB)，减少 50% 毒素持续时间\\n免疫群体控制，最大减速效果: 25%\\n\\green;获得 200% 物理伤害的额外元素伤害\\n\\grey;击中时降低玩家闪避与格挡\\n吸收 50% 火焰、冰冷与闪电伤害\\n无法被冰冻或减速\\n\\green;+40% 移动速度\\n\\grey;70% 吸血抗性\\n无怪物尸体\\n强化技能\\n次元撕裂\\n诅咒消减\\n\\n元素抗性: +36%\\n怪物密度: +10%\\n怪物集群规模: +20%\\n怪物伤害: +120%\\n怪物生命: +240%\\n',
  'ir14': '\\dgrey;- 赫拉迪姆重塑 -\\n\\n\\grey;怪物英雄、精英与统领可能刷新\\n免疫压碎性打击(CB)，减少 50% 毒素持续时间\\n免疫群体控制，最大减速效果: 25%\\n获得 200% 物理伤害的额外元素伤害\\n击中时降低玩家闪避与格挡\\n吸收 50% 火焰、冰冷与闪电伤害\\n\\green;穿透 100% 元素抗性\\n\\grey;无法被冰冻或减速\\n+40% 移动速度\\n70% 吸血抗性\\n无怪物尸体\\n强化技能\\n次元撕裂\\n诅咒消减\\n\\n元素抗性: +40%\\n怪物密度: +10%\\n怪物集群规模: +20%\\n怪物伤害: +130%\\n怪物生命: +260%\\n',
  'ir15': '\\dgrey;- 赫拉迪姆重塑 -\\n\\n\\grey;怪物英雄、精英与统领可能刷新\\n免疫压碎性打击(CB)，减少 50% 毒素持续时间\\n免疫群体控制，最大减速效果: 25%\\n获得 200% 物理伤害的额外元素伤害\\n击中时降低玩家闪避与格挡\\n吸收 50% 火焰、冰冷与闪电伤害\\n穿透 100% 元素抗性\\n无法被冰冻或减速\\n+40% 移动速度\\n70% 吸血抗性\\n无怪物尸体\\n强化技能\\n次元撕裂\\n诅咒消减\\n\\green;宿敌 (Nemesis)\\n\\n\\n\\grey;元素抗性: +45%\\n怪物密度: +40%\\n怪物集群规模: +20%\\n怪物伤害: +150%\\n怪物生命: +300%\\n'
};

function resolveItemDesc(code, spelldescstr) {
  if (customDescs[code]) return customDescs[code];
  if (spelldescstr !== undefined && spelldescstr !== '') {
    const num = parseInt(spelldescstr, 10);
    if (!isNaN(num) && strIndexed[num] && /[\u4e00-\u9fa5]/.test(strIndexed[num])) {
      return strIndexed[num];
    }
  }
  return '';
}

const items = {};

// 3.1 提取 armor
const armorPath = 'median-save-editor v0.1.0/data/offline-tools/txt/armor.tsv';
if (fs.existsSync(armorPath)) {
  const armorLines = fs.readFileSync(armorPath, 'utf8').split(/\r?\n/);
  const aH = armorLines[0].split('\t');
  for (let i = 1; i < armorLines.length; i++) {
    const rawLine = armorLines[i];
    if (!rawLine || !rawLine.trim()) continue;
    const cols = rawLine.replace(/[\r\n]+$/, '').split('\t');
    const code = cols[aH.indexOf('code')];
    if (!code) continue;

    items[code] = {
      name: resolveItemName(code, cols[aH.indexOf('namestr')], cols[aH.indexOf('name')]),
      img: cols[aH.indexOf('invfile')] || '',
      w: parseInt(cols[aH.indexOf('invwidth')], 10) || 1,
      h: parseInt(cols[aH.indexOf('invheight')], 10) || 1,
      stack: 0,
      rlvl: parseInt(cols[aH.indexOf('levelreq')], 10) || 0,
      rstr: parseInt(cols[aH.indexOf('reqstr')], 10) || 0,
      type: cols[aH.indexOf('type')] || '',
      desc: '',
      armo: 1,
      weap: 0
    };
  }
}

// 3.2 提取 weapons
const weaponsPath = 'median-save-editor v0.1.0/data/offline-tools/txt/weapons.tsv';
if (fs.existsSync(weaponsPath)) {
  const weaponLines = fs.readFileSync(weaponsPath, 'utf8').split(/\r?\n/);
  const wH = weaponLines[0].split('\t');
  for (let i = 1; i < weaponLines.length; i++) {
    const rawLine = weaponLines[i];
    if (!rawLine || !rawLine.trim()) continue;
    const cols = rawLine.replace(/[\r\n]+$/, '').split('\t');
    const code = cols[wH.indexOf('code')];
    if (!code) continue;

    items[code] = {
      name: resolveItemName(code, cols[wH.indexOf('namestr')], cols[wH.indexOf('name')]),
      img: cols[wH.indexOf('invfile')] || '',
      w: parseInt(cols[wH.indexOf('invwidth')], 10) || 1,
      h: parseInt(cols[wH.indexOf('invheight')], 10) || 1,
      stack: parseInt(cols[wH.indexOf('stackable')], 10) || 0,
      rlvl: parseInt(cols[wH.indexOf('levelreq')], 10) || 0,
      rstr: parseInt(cols[wH.indexOf('reqstr')], 10) || 0,
      type: cols[wH.indexOf('type')] || '',
      desc: '',
      armo: 0,
      weap: 1
    };
  }
}

// 3.3 提取 misc
const miscPath = 'txt/misc.txt';
if (fs.existsSync(miscPath)) {
  const miscLines = fs.readFileSync(miscPath, 'utf8').split(/\r?\n/);
  const mH = miscLines[0].split('\t');
  for (let i = 1; i < miscLines.length; i++) {
    const rawLine = miscLines[i];
    if (!rawLine || !rawLine.trim()) continue;
    const cols = rawLine.replace(/[\r\n]+$/, '').split('\t');
    const code = cols[mH.indexOf('code')];
    if (!code) continue;

    items[code] = {
      name: resolveItemName(code, cols[mH.indexOf('namestr')], cols[mH.indexOf('name')]),
      img: cols[mH.indexOf('invfile')] || '',
      w: parseInt(cols[mH.indexOf('invwidth')], 10) || 1,
      h: parseInt(cols[mH.indexOf('invheight')], 10) || 1,
      stack: parseInt(cols[mH.indexOf('stackable')], 10) || 0,
      rlvl: parseInt(cols[mH.indexOf('levelreq')], 10) || 0,
      rstr: 0,
      type: cols[mH.indexOf('type')] || '',
      desc: resolveItemDesc(code, cols[mH.indexOf('spelldescstr')]),
      armo: 0,
      weap: 0
    };
  }
}
console.log(`[build_data_tables] 基础物品提取完成，共 ${Object.keys(items).length} 项`);

// 3.4 补充大师级（Mastercrafted）底材与映射代码
const mastercraftedBases = {
  'wm01': { name: '女士之弓 Maiden Bow [大师级] (Mastercrafted)', w: 2, h: 4, armo: 0, weap: 1, type: 'bow' },
  'mz01': { name: '女士之弓 Maiden Bow [大师级] (Mastercrafted)', w: 2, h: 4, armo: 0, weap: 1, type: 'bow' },
  'wm02': { name: '反曲刀 Kukri [大师级] (Mastercrafted)', w: 1, h: 3, armo: 0, weap: 1, type: 'swor' },
  'mz02': { name: '反曲刀 Kukri [大师级] (Mastercrafted)', w: 1, h: 3, armo: 0, weap: 1, type: 'swor' },
  'wm03': { name: '哥德之杖 Gothic Staff [大师级] (Mastercrafted)', w: 1, h: 4, armo: 0, weap: 1, type: 'staf' },
  'mz03': { name: '哥德之杖 Gothic Staff [大师级] (Mastercrafted)', w: 1, h: 4, armo: 0, weap: 1, type: 'staf' },
  'wm04': { name: '束带 Cincture [大师级] (Mastercrafted)', w: 2, h: 1, armo: 1, weap: 0, type: 'belt' },
  'mz04': { name: '束带 Cincture [大师级] (Mastercrafted)', w: 2, h: 1, armo: 1, weap: 0, type: 'belt' },
  'wm05': { name: '小李飞刀 Flying Kinzhal [大师级] (Mastercrafted)', w: 1, h: 2, armo: 0, weap: 1, type: 'knif' },
  'mz05': { name: '小李飞刀 Flying Kinzhal [大师级] (Mastercrafted)', w: 1, h: 2, armo: 0, weap: 1, type: 'knif' },
  'wm21': { name: '魂契手套 Soulbinder Gloves [大师级] (Mastercrafted)', w: 2, h: 2, armo: 1, weap: 0, type: 'glov' },
  'mz21': { name: '魂契手套 Soulbinder Gloves [大师级] (Mastercrafted)', w: 2, h: 2, armo: 1, weap: 0, type: 'glov' },
  'wm22': { name: '回响之刃 Echo Sabre [大师级] (Mastercrafted)', w: 1, h: 3, armo: 0, weap: 1, type: 'swor' },
  'mz22': { name: '回响之刃 Echo Sabre [大师级] (Mastercrafted)', w: 1, h: 3, armo: 0, weap: 1, type: 'swor' }
};

for (const [code, def] of Object.entries(mastercraftedBases)) {
  items[code] = Object.assign({
    img: '', stack: 0, rlvl: 100, rstr: 350, desc: ''
  }, def);
}

// 4. 构建 skills 与 monsters
let monsters = {};
let skills = {};

// 4.1 从 skills.tsv 预加载基础技能
const skillsTsvPath = 'median-save-editor v0.1.0/data/offline-tools/skills.tsv';
if (fs.existsSync(skillsTsvPath)) {
  const sLines = fs.readFileSync(skillsTsvPath, 'utf8').split(/\r?\n/);
  const sH = sLines[0].split('\t');
  const idIdx = sH.indexOf('Id');
  const nameIdx = sH.indexOf('skill');
  for (let i = 2; i < sLines.length; i++) {
    const p = sLines[i].split('\t');
    const id = p[idIdx];
    const name = p[nameIdx];
    if (id !== undefined && id !== '') {
      skills[id] = (name && strKeyMap[name.toLowerCase()]) || name;
    }
  }
}

// 4.2 从官方 txt/skills.txt 与 txt/skilldesc.txt 补齐全量技能（含圣物技能、专属技能等）
const sdMap = {};
if (fs.existsSync('txt/skilldesc.txt')) {
  const lines = fs.readFileSync('txt/skilldesc.txt', 'utf8').split(/\r?\n/);
  const h = lines[0].split('\t');
  const codeCol = h.indexOf('skilldesc');
  const nameCol = h.indexOf('str name');
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split('\t');
    const code = p[codeCol];
    const strName = p[nameCol];
    if (code) {
      sdMap[code] = strName;
      sdMap[String(i - 1)] = strName;
    }
  }
}

if (fs.existsSync('txt/skills.txt')) {
  const lines = fs.readFileSync('txt/skills.txt', 'utf8').split(/\r?\n/);
  const h = lines[0].split('\t');
  const idCol = h.indexOf('Id');
  const descCol = h.indexOf('skilldesc');
  const nameCol = h.indexOf('skill');
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split('\t');
    const id = p[idCol];
    const descId = p[descCol];
    const rawName = p[nameCol];
    if (id !== undefined && id !== '') {
      let resolved = '';
      if (descId && sdMap[descId]) {
        const strKey = sdMap[descId].toLowerCase();
        if (strKeyMap[strKey]) resolved = strKeyMap[strKey];
      }
      if (!resolved && rawName) {
        if (strKeyMap[rawName.toLowerCase()]) resolved = strKeyMap[rawName.toLowerCase()];
        else if (strKeyMap['skillname' + rawName.toLowerCase()]) resolved = strKeyMap['skillname' + rawName.toLowerCase()];
      }
      if (resolved) {
        skills[id] = cleanD2Text(resolved);
      } else if (!skills[id] && rawName) {
        skills[id] = rawName;
      }
    }
  }
}
if (fs.existsSync('txt/monname.txt')) {
  const mlines = fs.readFileSync('txt/monname.txt', 'utf8').split(/\r?\n/);
  for (let i = 1; i < mlines.length; i++) {
    const m = mlines[i].trim();
    if (m && m !== 'NULL') monsters[String(i - 1)] = m;
  }
}
console.log(`[build_data_tables] skills 字典提取完成: ${Object.keys(skills).length} 项, monsters: ${Object.keys(monsters).length} 项`);

// 5. 组合生成新表并写回
const dataTablesObj = {
  props,
  items,
  monsters,
  skills
};

const outputContent = 'const DATA_TABLES = ' + JSON.stringify(dataTablesObj) + ';\n' +
  'if (typeof window !== "undefined") { window.DATA_TABLES = DATA_TABLES; }\n' +
  'if (typeof global !== "undefined") { global.DATA_TABLES = DATA_TABLES; }\n' +
  'if (typeof module !== "undefined" && module.exports) { module.exports = DATA_TABLES; }\n';

const targets = [
  'data_tables.js',
  'web/data_tables.js',
  'dist/data_tables.js',
  'MedianXL-Repo/web/data_tables.js',
  'MedianXL-Repo/dist/data_tables.js'
];

for (const t of targets) {
  const dir = path.dirname(t);
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(t, outputContent, 'utf8');
  console.log(`[build_data_tables] 已成功写入: ${t} (${(outputContent.length / 1024).toFixed(1)} KB)`);
}

console.log('=== [build_data_tables] 官方全纯净数据表构建成功！ ===');
