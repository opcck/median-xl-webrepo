// Median XL WebRepo - 属性计算引擎、中文本地化与富文本着色模块
(function(root) {
  'use strict';

  function getDataTables() {
    if (typeof DATA_TABLES !== 'undefined') return DATA_TABLES;
    if (root && root.DATA_TABLES) return root.DATA_TABLES;
    if (typeof global !== 'undefined' && global.DATA_TABLES) return global.DATA_TABLES;
    return {};
  }

  function getEngineData() {
    if (typeof ENGINE_DATA !== 'undefined') return ENGINE_DATA;
    if (root && root.ENGINE_DATA) return root.ENGINE_DATA;
    if (typeof global !== 'undefined' && global.ENGINE_DATA) return global.ENGINE_DATA;
    return null;
  }

  function getIconFiles() {
    if (typeof ICON_FILES !== 'undefined') return ICON_FILES;
    if (root && root.ICON_FILES) return root.ICON_FILES;
    if (typeof global !== 'undefined' && global.ICON_FILES) return global.ICON_FILES;
    return new Set();
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ============ 属性显示常量 ============ */
  const PROP = {
    ED: 17, MinDmg: 21, MaxDmg: 22, MinDmg2: 23, MaxDmg2: 24, Defence: 31,
    Fire: 48, Cold: 54, Light: 50, Magic: 52, Poison: 57,
    ClassSkills: 83, ReqnLevel: 92, Oskill: 97, ClassOnlySkill: 107, AllSkills: 127,
    ChargedSkill: 204
  };

  const QUALITY_ZH = { 1: '低质', 2: '普通白', 3: '超强', 4: '魔法', 5: '套装', 6: '稀有', 7: '暗金', 8: '手工', 9: '荣誉' };
  const QUALITY_EN = { 1: 'low', 2: 'normal', 3: 'superior', 4: 'magic', 5: 'set', 6: 'rare', 7: 'unique', 8: 'crafted', 9: 'honorific' };
  const CLASS_NAMES = ['亚马逊', '法师', '死灵法师', '圣骑士', '野蛮人', '德鲁伊', '刺客'];
  const CLASS_NAMES_EN = { 0: 'Amazon', 1: 'Sorceress', 2: 'Necromancer', 3: 'Paladin', 4: 'Barbarian', 5: 'Druid', 6: 'Assassin' };

  // 技能系分类名 [classId][tabId]
  const SKILL_TABS = {
    0: ['弓和十字弓', '被动和魔法', '标枪和长矛'],
    1: ['火焰', '闪电', '冰冷'],
    2: ['诅咒', '毒素和白骨', '召唤'],
    3: ['作战', '攻击光环', '防御光环'],
    4: ['战斗', '战斗精通', '呐喊'],
    5: ['元素', '变形', '召唤'],
    6: ['武术', '影子训练', '陷阱']
  };

  /* D2 颜色标记 -> HTML（ÿcX 与 \xxx; 两种），\n 转空格 */
  const D2_COLOR_MAP = {
    '0': '#ffffff', '1': '#dc2828', '2': '#3add3a', '3': '#3a6bff', '4': '#d8b760',
    '5': '#2b2b2b', '6': '#28bebe', '7': '#a86ee0', '8': '#e06e28', '9': '#d8d840',
    ':': '#40a050', ';': '#d8d8c8', '+': '#68c8af', '-': '#7a6148', ',': '#88a8b8'
  };

  const D2_NAMED = {
    grey: '#9a9a9a', white: '#ffffff', blue: '#7b7bff', red: '#dc2828',
    green: '#3add3a', gold: '#c7b377', orange: '#ff8000', purple: '#a86ee0',
    yellow: '#ffff64', black: '#2b2b2b'
  };

  function displayName(it) {
    if (!it) return '未知物品';
    let n = it.name || it.baseName || '未知物品';
    if (it.persName) n = it.persName + '的' + n;
    return n;
  }

  function fmtItemMeta(it) {
    const parts = [];
    if (it.base && it.base.rlvl) parts.push('需求等级 ' + it.base.rlvl);
    if (it.ilvl !== undefined) parts.push('物品等级 ' + it.ilvl);
    if (it.defense !== undefined) parts.push('防御 ' + it.defense);
    if (it.durability) parts.push('耐久 ' + it.durability);
    if (it.quantity !== undefined) parts.push('数量 ' + it.quantity);
    if (it.socketsTotal) parts.push('镶孔 ' + it.socketsTotal);
    return parts.join(' · ');
  }

  function locText(it) {
    return (it.locText || '') + (it.gridPos ? ' ' + it.gridPos : '');
  }

  function d2Colorize(s) {
    let html = esc(s).replace(/\\n/g, ' · ');
    html = html.replace(/ÿc([0-9:+;,\-])/g, (m, c) => '</span><span style="color:' + (D2_COLOR_MAP[c] || '#fff') + '">');
    html = html.replace(/\\([a-z]+);/g, (m, name) => '</span><span style="color:' + (D2_NAMED[name] || '#fff') + '">');
    return '<span>' + html + '</span>';
  }

  function stripD2(s) {
    if (!s) return '';
    return String(s).replace(/ÿc[0-9:+;,\-]/g, '').replace(/\\[a-z]+;/g, '').replace(/\\n/g, ' · ');
  }

  function formatItemDesc(desc) {
    if (!desc) return '';
    let d = desc.replace(/^\d+(\}|\\n|\n|\s+)/, '');
    d = d.replace(/\\n/g, '\n').replace(/\}/g, '\n');
    d = d.replace(/\n{3,}/g, '\n\n').trim();
    return d.split('\n').map(line => {
      let html = esc(line);
      html = html.replace(/ÿc([0-9:+;,\-])/g, (m, c) => '</span><span style="color:' + (D2_COLOR_MAP[c] || '#fff') + '">');
      html = html.replace(/\\([a-z]+);/g, (m, name) => '</span><span style="color:' + (D2_NAMED[name] || '#fff') + '">');
      return '<span>' + html + '</span>';
    }).join('<br>');
  }

  function stripColorCodes(s) {
    if (!s) return '';
    return String(s).replace(/ÿc[0-9:+;,\-\.a-zA-Z]/g, '').replace(/\\color;[0-9]*/g, '').trim();
  }

  /* 物品图标：assets/items-icons/<image>.png（清单见 icons_manifest.js） */
  function iconSrc(it) {
    const img = it.base && it.base.img;
    if (!img) return null;
    const iconFiles = getIconFiles();
    for (const name of [img + '.png', img + '1.png', img.toLowerCase() + '.png']) {
      if (iconFiles.has(name)) return 'assets/items-icons/' + name;
    }
    return null;
  }

  /* 职业限制：由物品 type 字段推断 */
  const CLASS_TYPE_MAP = {
    'head': ['死灵法师', 'Necromancer'], 'pelt': ['德鲁伊', 'Druid'],
    'orb': ['法师', 'Sorceress'], 'h2h': ['刺客', 'Assassin'],
    'phlm': ['圣骑士', 'Paladin'], 'pham': ['圣骑士', 'Paladin'],
    'ashd': ['亚马逊', 'Amazon'], 'azsd': ['亚马逊', 'Amazon'], 'ahlm': ['亚马逊', 'Amazon'],
  };

  function classRestriction(it) {
    const ed = getEngineData();
    if (ed && ed.getClassRestriction) {
      const r = ed.getClassRestriction(it.typeCode, it.setDef);
      if (r) return r;
    }
    if (it.setDef && it.setDef.set) {
      const rawSet = it.setDef.set;
      if (/amazon|亚马逊/i.test(rawSet)) return ['亚马逊', 'Amazon'];
      if (/sorceress|法师/i.test(rawSet)) return ['法师', 'Sorceress'];
      if (/necromancer|死灵/i.test(rawSet)) return ['死灵法师', 'Necromancer'];
      if (/paladin|圣骑/i.test(rawSet)) return ['圣骑士', 'Paladin'];
      if (/barbarian|野蛮人/i.test(rawSet)) return ['野蛮人', 'Barbarian'];
      if (/druid|德鲁伊/i.test(rawSet)) return ['德鲁伊', 'Druid'];
      if (/assassin|刺客/i.test(rawSet)) return ['刺客', 'Assassin'];
    }
    const base = it.base;
    if (!base || !base.type) return null;
    const types = base.type.split(',').map(t => t.trim());
    for (const t of types) {
      if (CLASS_TYPE_MAP[t]) return CLASS_TYPE_MAP[t];
    }
    return null;
  }

  function skillNameAt(idx) {
    const dt = getDataTables();
    const s = dt.skills ? dt.skills[idx] : null;
    return s && s.trim() ? s.trim() : '技能#' + idx;
  }

  function monsterNameAt(id) {
    const dt = getDataTables();
    return dt.monsters ? (dt.monsters[String(id)] || ('怪物#' + id)) : ('怪物#' + id);
  }

  let _strIndexed = null;
  function stringTableByIndex(idx) {
    if (!idx && idx !== 0) return '';
    const ed = getEngineData();
    if (ed && ed.numStrings && ed.numStrings[String(idx)] !== undefined) {
      return ed.numStrings[String(idx)];
    }
    if (!_strIndexed) {
      const dt = getDataTables();
      if (root.STR_INDEXED) {
        _strIndexed = root.STR_INDEXED;
      } else if (dt.str_indexed) {
        _strIndexed = [];
        for (const arr of dt.str_indexed) {
          for (const v of arr) _strIndexed.push(v);
        }
      } else {
        _strIndexed = [];
      }
    }
    return _strIndexed[idx] || '';
  }

  function descFuncText(p) {
    if (!p.value && !p.param) return '';      // 0 值属性不显示
    let val = p.value;
    let pos = stripColorCodes(p.pos || '');
    let neg = stripColorCodes(p.neg || '');
    let desc = val < 0 ? (neg || pos) : (pos || neg);
    const signed = (val >= 0 ? '+' : '') + val;
    const dv = p.dv;

    // 1. 触发类/CTC/事件技能（df === 15 或 pos 包含 %d/%s 格式占位符）
    if (p.df === 15 || (desc.includes('%s') && desc.includes('%d'))) {
      const chance = val;
      const lvl = p.param & 63;
      const skId = p.param >> 6;
      const skName = skillNameAt(skId);
      let i = 0;
      const args = [chance, lvl, skName];
      return desc.replace(/%\+?d|%s|%\.\d+[fg]/g, (m) => {
        const v = args[i++];
        return v === undefined ? m : String(v);
      }).replaceAll('%%', '%');
    }

    // 2. 特殊技能与系属 (df 13, 14, 24, 27, 28)
    if (p.df === 13 || p.id === PROP.ClassSkills) {
      const cName = CLASS_NAMES[p.param] || CLASS_NAMES[val] || '职业';
      return `+${val} ${cName}技能等级`;
    }
    if (p.df === 14 || p.id === 188) { // 技能系 (Skill Tab)
      const classId = p.param >> 3;
      const tabId = p.param & 7;
      const tabName = (SKILL_TABS[classId] || [])[tabId] || ('技能系#' + tabId);
      const cText = CLASS_NAMES[classId] ? ` (仅限${CLASS_NAMES[classId]})` : '';
      return `+${val} ${tabName}技能${cText}`;
    }
    if (p.df === 27 || p.id === PROP.ClassOnlySkill) { // 专属技能
      const skId = p.param;
      const skName = skillNameAt(skId);
      return `+${val} ${skName}`;
    }
    if (p.df === 28 || p.id === PROP.Oskill) { // 跨职业技能 oskill
      const skId = p.param;
      const skName = skillNameAt(skId);
      return `+${val} ${skName}`;
    }
    if (p.df === 24 || p.id === PROP.ChargedSkill) { // 聚气技能
      const lvl = p.param & 63;
      const skId = p.param >> 6;
      const cur = val & 255;
      const max = val >> 8;
      return `等级 ${lvl} ${skillNameAt(skId)} (${cur}/${max} 聚气)`;
    }

    // 3. 随角色等级提升属性 (df 6, 7, 8)
    if (p.df === 6 || p.df === 7 || p.df === 8) {
      const dsaText = (p.dsa && p.dsa !== 'undefined') ? p.dsa : ' (依据角色等级)';
      const pct = (p.df === 7 || p.df === 8) ? '%' : '';
      return dv === 1 ? `${signed}${pct} ${desc}${dsaText}` : `${desc} ${signed}${pct}${dsaText}`;
    }

    // 4. 标准 descfunc 分支
    switch (p.df) {
      case 0: return '';
      case 1: return dv === 1 ? `${signed} ${desc}` : `${desc} ${signed}`;
      case 2: return dv === 1 ? `${signed}% ${desc}` : `${desc} ${signed}%`;
      case 3: return dv ? `${desc} ${val}` : desc;
      case 4: return dv === 1 ? `${signed}% ${desc}` : `${desc} ${signed}%`;
      case 5: return `${desc} ${Math.round(val * 100 / 128)}%`;
      case 11: return `每 ${Math.round(100 / val)} 秒恢复 1 点耐久`;
      case 12: return `${desc} ${signed}`;
      case 20: return `${-val}% ${desc}`;
      case 23: return `${val}% ${desc} ${monsterNameAt(p.param)}`;
      case 32: {
        const v = Math.round(val / 10);
        return (v >= 0 ? '+' : '') + v + ' ' + desc;
      }
      case 33: {
        const skName = skillNameAt(p.param);
        const sec = (val / 25.0).toFixed(1);
        return `${skName} 冷却时间减少 ${sec} 秒`;
      }
      case 36: return val === 2 ? desc : '';
      case 37: return `${skillNameAt(p.param)} 技能上限提高 ${val}`;
      case 31: case 34: {
        const str = stringTableByIndex(p.param) || stringTableByIndex(p.value);
        if (str) return stripColorCodes(str);
        if (desc && !desc.startsWith('is')) return desc;
        return '';
      }
      default:
        if (desc.includes('%d')) return desc.replace('%d', val);
        return `${signed} ${desc}`;
    }
  }

  function specialDisplay(p) {
    if (p.id === PROP.ClassSkills || p.df === 13) return descFuncText(p);
    if (p.id === PROP.Oskill || p.id === PROP.ClassOnlySkill || p.df === 27 || p.df === 28) return descFuncText(p);
    if (p.id === PROP.ChargedSkill || p.df === 24) return descFuncText(p);
    return null;
  }

  function isCtc(id) { return (id >= 175 && id <= 205) && id !== 204; }
  function ctcDisplay(p) { return descFuncText(p); }

  /* 主入口：输入解析出的属性数组，输出 [{text, neg}] */
  function displayPropsList(props) {
    const out = [];
    for (const p of props) {
      if (p.unknown) { out.push({ pr: 999, id: p.id, text: '[未知属性 #' + p.id + ']' }); continue; }
      if ((p.id === PROP.MinDmg2 && props.some(x => x.id === PROP.MinDmg)) ||
          (p.id === PROP.MaxDmg2 && props.some(x => x.id === PROP.MaxDmg))) continue;
      
      let text = descFuncText(p);
      if (text) {
        if (text.includes('}')) {
          const parts = text.split('}').map(s => s.trim()).filter(Boolean);
          parts.forEach(part => out.push({ pr: p.pr || p.id, id: p.id, text: part }));
        } else {
          out.push({ pr: p.pr || p.id, id: p.id, text });
        }
      }
    }

    out.sort((a, b) => a.pr - b.pr);

    // 合并 min/max 伤害对
    const dmgPairs = [
      [PROP.MinDmg, PROP.MaxDmg, '物理伤害'], [PROP.MinDmg2, PROP.MaxDmg2, '物理伤害'],
      [PROP.Fire, PROP.Fire + 1, '火焰伤害'], [PROP.Light, PROP.Light + 1, '闪电伤害'],
      [PROP.Magic, PROP.Magic + 1, '魔法伤害'], [PROP.Cold, PROP.Cold + 1, '冰冷伤害'],
      [PROP.Poison, PROP.Poison + 1, '毒素伤害'],
    ];

    for (const [mn, mx, label] of dmgPairs) {
      const pmn = props.find(x => x.id === mn), pmx = props.find(x => x.id === mx);
      if (pmn && pmx) {
        const omn = out.find(o => o.id === mn), omx = out.find(o => o.id === mx);
        if (omn && omx) {
          let text = pmn.value === pmx.value ? `+${pmn.value} ${label}` : `增加 ${pmn.value}-${pmx.value} ${label}`;
          if (mn === PROP.Poison) {
            const plen = props.find(x => x.id === 59 || x.id === 57);
            if (plen && (plen.lenF || plen.param || plen.value)) {
              const sec = Math.max(1, Math.round((plen.lenF || plen.value || 25) / 25));
              text += `（持续 ${sec} 秒）`;
            }
          }
          out.splice(out.indexOf(omx), 1);
          omn.text = text;
        }
      }
    }
    return out;
  }

  function propsText(props) {
    return displayPropsList(props).map(l => l.text);
  }

  const exportsObj = {
    PROP,
    QUALITY_ZH,
    QUALITY_EN,
    CLASS_NAMES,
    CLASS_NAMES_EN,
    SKILL_TABS,
    D2_COLOR_MAP,
    D2_NAMED,
    displayName,
    fmtItemMeta,
    locText,
    d2Colorize,
    stripD2,
    formatItemDesc,
    stripColorCodes,
    iconSrc,
    CLASS_TYPE_MAP,
    classRestriction,
    skillNameAt,
    monsterNameAt,
    stringTableByIndex,
    descFuncText,
    specialDisplay,
    isCtc,
    ctcDisplay,
    displayPropsList,
    propsText,
    esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  Object.assign(root, exportsObj);
})(typeof window !== 'undefined' ? window : globalThis);
