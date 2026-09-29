// Median XL WebRepo - 角色存档与多页仓库二进制解析器
(function(root) {
  'use strict';

  // 依赖检测：BitReader
  const getBitReader = () => root.BitReader || (typeof require !== 'undefined' ? require('./bitstream.js').BitReader : null);

  /* ============ 常量字典 ============ */
  const QUALITY_NAMES = {
    1: 'Low 低质', 2: 'Normal 普通白', 3: 'Superior 超强',
    4: 'Magic 魔法', 5: 'Set 套装', 6: 'Rare 稀有',
    7: 'Unique 暗金', 8: 'Crafted 手工', 9: 'Honorific 荣誉'
  };

  const QUALITY_CLASS = {
    1: 'q-low', 2: 'q-normal', 3: 'q-superior',
    4: 'q-magic', 5: 'q-set', 6: 'q-rare',
    7: 'q-unique', 8: 'q-crafted', 9: 'q-honorific'
  };

  const CLASS_NAMES = ['亚马逊', '法师', '死灵法师', '圣骑士', '野蛮人', '德鲁伊', '刺客'];
  const LOC_NAMES = { 0: null, 1: '身上装备', 2: '腰带', 3: '佣兵', 4: '尸体', 5: '铁傀儡', 6: '其他存储' };
  const STOR_NAMES = { 1: '背包', 4: '方块', 5: '仓库' };
  const EQUIP_SLOTS = {
    0: '头', 1: '项链', 2: '身体', 3: '武器', 4: '武器2',
    5: '右手', 6: '左手', 7: '右手2', 8: '左手2', 9: '腰带',
    10: '鞋', 11: '手套', 12: '副手1', 13: '副手2'
  };

  const RARE_PREFIXES = [
    '野兽 Beast', '飞鹰 Eagle', '掠鸦 Raven', '蝰蛇 Viper', '食尸鬼 Ghoul',
    '亡骸 Skull', '鲜血 Blood', '畏怖 Dread', '末日 Doom', '凶残 Grim',
    '骸骨 Bone', '殁 Death', '暗影 Shadow', '风暴 Storm', '符文 Rune',
    '瘟疫 Plague', '石岩 Stone', '怨灵 Wraith', '魂灵 Spirit', '恶魔 Demon',
    '残酷 Cruel', '九霄 Empyrion', '异世芳华 Bramble', '痛苦 Pain', '厌恶 Loath',
    '雕纹 Glyph', '小恶魔 Imp', '魔蝠 Fiend', '冰雹 Hailstone', '狂风 Gale',
    '凶蛮 Dire', '灵魂 Soul', '硫磺 Brimstone', '尸体 Corpse', '腐尸 Carrion',
    '末世 Holocaust', '浩劫 Havoc', '冽魂 Bitter', '熵数 Entropy', '混沌 Chaos',
    '秩序 Order', '裂隙 Rift', '玷污 Corruption'
  ];

  const RARE_SUFFIXES = [
    "噬灵","抓痕","刺骨刃","尖牙","碎脏者","渴求","剃刀","镰刀","之刃","之锯",
    "劈裂者","斩刃","断裂者","断破","剐裂者","割碎者","屠杀者","强夺者","之物","啃咬",
    "之星","之吹","击碎者","克星","粉碎者","破坏者","研磨者","崩破","锤棒","丧钟",
    "长枪","刺钉","刺穿者","串刺者","戳棍","煞星","魔杖","破灭","勾刺","之针",
    "飞镖","之矢","争斗","箭羽","腾云","搭弦","尖角","钉刺者","刺针","刺棒",
    "之枝","尖塔","之歌","呼唤","哭喊","咒法","圣歌","织灵者","瘤节","凡相",
    "饰章","饰环","面纱","兜帽","面具","之额","兜盔","护面","风帽","毛皮",
    "兽皮","甲壳","外袍","裹护","衣装","斗蓬","罩衣","水兵","披风","守卫",
    "徽章","之岩","之御","守护","之塔","之盾","之翼","标记","纹章","手",
    "之拳","爪","之握","抓握","之握","之握","之触","手指","指节","尖钻",
    "驱刺","步履","潜猎者","护胫","炎光","尖钉","蹂躏","粗皮鞋","踪迹","便鞋",
    "之扣","扣带","装束","锁扣","边饰","绕卷","之链","捆带","鞭笞","捆绳",
    "之结","之环","之圈","之眼","转回","螺旋","盘绕","旋回","之箍","旋螺",
    "护符","之心","套索","项链","项圈","串珠","颈饰","颈甲","恶魔甲虫","之木",
    "烙印","棍棒","斗棍","隐现","竖琴","主宰","栅栏","劈斩","弯钩","毁损",
    "壳甲","桩棍","尖桩","苍白","凸缘"
  ];

  function decodeRareName(w1, w2) {
    const pStr = (w1 >= 183 && w1 < 183 + RARE_PREFIXES.length) ? RARE_PREFIXES[w1 - 183] : '';
    const sStr = (w2 >= 0 && w2 < RARE_SUFFIXES.length) ? RARE_SUFFIXES[w2] : '';
    if (!pStr && !sStr) return null;
    const pZh = pStr ? pStr.split(' ')[0] : '';
    return pZh + (sStr || '');
  }

  function getDataTables() {
    if (typeof DATA_TABLES !== 'undefined') return DATA_TABLES;
    if (root && root.DATA_TABLES) return root.DATA_TABLES;
    if (typeof global !== 'undefined' && global.DATA_TABLES) return global.DATA_TABLES;
    return { props: {}, items: {}, skills: {}, monsters: {} };
  }

  function getEngineData() {
    if (typeof ENGINE_DATA !== 'undefined') return ENGINE_DATA;
    if (root && root.ENGINE_DATA) return root.ENGINE_DATA;
    if (typeof global !== 'undefined' && global.ENGINE_DATA) return global.ENGINE_DATA;
    return null;
  }

  function propTable(id) {
    const dt = getDataTables();
    return (dt.props && dt.props[String(id)]) || null;
  }

  function itemName(code) {
    const dt = getDataTables();
    const it = dt.items && dt.items[code];
    return it ? it.name : null;
  }

  function isTomeCode(code) {
    return code === 'tbk' || code === 'ibk';
  }

  function parseProps(br, ctx) {
    const props = [];
    while (true) {
      if (br.bytePos >= br.end) return props;

      // 尾部 511 对齐安全探针：若紧邻下一个物品的 JM 标头 (0x4A 0x4D)，并在 9~25 位内包含 511，优先闭合当前属性流
      if (br.bytePos + 2 <= br.end) {
        const nextAligned = (br.bitPos === 0) ? br.bytePos : (br.bytePos + 1);
        for (let k = nextAligned; k <= Math.min(br.end - 2, nextAligned + 3); k++) {
          if (br.b[k] === 0x4A && br.b[k + 1] === 0x4D) {
            const remBits = (k - br.bytePos) * 8 - br.bitPos;
            if (remBits >= 9 && remBits <= 25) {
              const savedPos = br.bytePos, savedBit = br.bitPos;
              let found511 = false;
              for (let s = 0; s <= remBits - 9; s++) {
                br.bytePos = savedPos; br.bitPos = savedBit;
                if (s > 0) br.skip(s);
                if (br.readBits(9) === 511) { found511 = true; break; }
              }
              if (found511) return props;
              br.bytePos = savedPos; br.bitPos = savedBit;
            }
            break;
          }
        }
      }

      const id = br.readBits(9);
      if (id === 511) return props;
      const t = propTable(id);
      if (!t) {
        const err = new Error('未知属性 #' + id);
        err.itemCtx = Object.assign({ propsSoFar: props.map(p => p.stat + '=' + p.value), bytePos: br.bytePos }, ctx || {});
        throw err;
      }
      const pbits = t.pbits || 0, bits = t.bits || 0;
      const param = pbits ? br.readBits(pbits) : 0;
      let value = bits ? br.readBits(bits) - t.add : 0;
      const p = { id, param, value, stat: t.stat, pos: t.pos, neg: t.neg, zh: t.zh, df: t.df, dv: t.dv };
      if (id === 17) { // 增强伤害: min/max 双读取
        const v2 = br.readBits(bits) - t.add;
        p.maxV = Math.max(value, v2);
        value = Math.min(value, v2);
        p.value = value;
      } else if (id === 48 || id === 50 || id === 52 || id === 54 || id === 57) { // 元素最小伤害 → 最大伤害（冰/毒再读时长）
        const t2 = propTable(id + 1);
        if (t2) {
          p.maxV = br.readBits(t2.bits) - t2.add;
          if (id === 54 || id === 57) {
            const t3 = propTable(id + 2);
            if (t3) {
              p.lenF = br.readBits(t3.bits) - t3.add;
            }
          }
        }
      }
      props.push(p);
    }
  }

  function parseItem(br, result, depth = 0) {
    if (depth > 8) throw new Error('socket recursion too deep');
    const startByte = br.bytePos;
    if (depth === 0 && result && result.debug) result.debug.push(startByte);
    // JM 标记 (字节对齐处两个字节 0x4A 0x4D)
    if (br.bytePos + 2 > br.end || br.b[br.bytePos] !== 0x4A || br.b[br.bytePos + 1] !== 0x4D) {
      throw new Error('JM marker not found at byte ' + br.bytePos);
    }
    br.bytePos += 2;
    const dataStart = br.bytePos;
    const relBit = () => (br.bytePos - dataStart) * 8 + br.bitPos;

    const it = { socketables: [], props: [] };
    br.readBits(1);                 // quest
    br.skip(3);
    it.identified = br.readBits(1);
    br.skip(5);
    br.skip(1);                     // duped
    it.socketed = br.readBits(1);
    br.skip(2); br.skip(2);
    const isEar = br.readBits(1);
    br.readBits(1);                 // starter
    br.skip(2); br.skip(1);
    const isSimple = br.readBits(1);
    const ext = !isSimple;
    it.ethereal = br.readBits(1);
    br.skip(1);
    it.personalized = br.readBits(1);
    br.skip(1);
    it.rw = br.readBits(1);
    br.skip(5); br.skip(8); br.skip(2);   // 版本等
    const offLoc = relBit();
    const loc = br.readBits(3);
    const offWe = relBit();
    const wE = br.readBits(4);
    const offCol = relBit(); it.col = br.readBits(4);
    const offRow = relBit(); it.row = br.readBits(4);
    const offStor = relBit(); const stor = br.readBits(3);
    it._bitOff = { loc: offLoc, we: offWe, col: offCol, row: offRow, stor: offStor };

    if (isEar) {
      br.readBits(3); br.readBits(7);
      let n = '';
      for (let i = 0; i < 16; i++) {
        const c = br.readBits(7);
        if (!c) break;
        n += String.fromCharCode(c);
      }
      it.name = n; it.typeCode = 'ear';
      it.locText = '耳饰';
      if (result && result.items) result.items.push(it);
      return it;
    }
    it.typeCode = '';
    for (let i = 0; i < 4; i++) it.typeCode += String.fromCharCode(br.readBits(8));
    it.typeCode = it.typeCode.trim();
    const dt = getDataTables();
    it.base = itemName(it.typeCode) ? (dt.items && dt.items[it.typeCode]) : null;

    let props1 = [], rwProps = null;
    if (ext) {
      const sockN = br.readBits(3);
      it.guid = br.readBits(32) >>> 0;
      it.ilvl = br.readBits(7);
      const quality = br.readBits(4);
      it.quality = quality;
      if (br.readBits(1)) br.skip(3);          // 变体图形
      if (br.readBits(1)) br.skip(11);         // 自动前缀
      if (quality === 1 || quality === 3) br.skip(3);       // low/superior 子类型
      else if (quality === 4) br.skip(22);                  // magic 前后缀
      else if (quality === 5 || quality === 7) it.setOrUniqueId = br.readBits(15);
      else if (quality === 6 || quality === 8) {            // rare/crafted
        it.rareWord1 = br.readBits(8);
        it.rareWord2 = br.readBits(8);
        for (let i = 0; i < 6; i++) if (br.readBits(1)) br.skip(11);
      } else if (quality === 9) br.skip(16);                // honorific
      if (it.rw) br.skip(16);                               // RW code
      if (it.personalized) {
        let n = '';
        for (let i = 0; i < 16; i++) {
          const c = br.readBits(7);
          if (!c) break;
          n += String.fromCharCode(c);
        }
        it.persName = n;
      }
      br.skip(1);                                // 已鉴定卷轴位
      if (isTomeCode(it.typeCode)) br.skip(5);

      const base = (dt.items && dt.items[it.typeCode]) || null;
      it.base = base;
      if (base && base.armo) {
        const d = propTable(31);
        if (d) it.defense = br.readBits(d.bits) - d.add;
      }
      if (base && (base.armo || base.weap)) {
        const dm = propTable(73), dc = propTable(72);
        if (dm && dc) {
          const maxDur = br.readBits(dm.bits) - dm.add;
          if (maxDur) {
            const curDur = br.readBits(dc.bits) - dc.add;
            it.durability = curDur + '/' + Math.max(maxDur, curDur);
          } else it.durability = '不可破坏';
        }
      }
      if (base && base.stack) it.quantity = br.readBits(9);
      if (it.socketed) it.socketsTotal = br.readBits(4);

      // 套装物品：5 个列表标志位在属性列表【之前】（与编辑器 itemparser.cpp 一致）
      let setListFlags = null;
      if (it.quality === 5) {
        setListFlags = [];
        for (let i = 0; i < 5; i++) setListFlags.push(br.readBits(1));
      }

      props1 = parseProps(br, { typeCode: it.typeCode, ilvl: it.ilvl, quality: it.quality, rw: it.rw, socketed: it.socketed, list: 'item' });
      if (setListFlags) {
        for (let i = 0; i < 5; i++) if (setListFlags[i]) parseProps(br, { typeCode: it.typeCode, list: 'set' + i });
      }
      if (it.rw) rwProps = parseProps(br, { typeCode: it.typeCode, ilvl: it.ilvl, quality: it.quality, rw: it.rw, list: 'rw' });

      it.props = props1.concat(rwProps || []);
      it.socketablesNumber = sockN;
      br.byteAlign();
      for (let i = 0; i < sockN; i++) {
        const sock = parseItem(br, result, depth + 1);
        if (sock) {
          it.socketables.push(sock);
          sock._parent = it;
        }
      }
    } else {
      it.quality = 2;
      br.byteAlign();
    }

    // 位置文本
    it._locRaw = loc; it._storRaw = stor; it._weRaw = wE;
    if (LOC_NAMES[loc]) {
      it.locText = LOC_NAMES[loc];
      if (loc === 1) it.locText = EQUIP_SLOTS[wE] || '身上';
    } else {
      it.locText = STOR_NAMES[stor] || ('位置' + loc + '/' + stor);
    }
    if (loc === 0 && (stor === 1 || stor === 4 || stor === 5)) it.gridPos = '(' + it.col + ',' + it.row + ')';

    // 名称
    const bn = itemName(it.typeCode);
    it.baseName = bn || ('[' + it.typeCode + ']');
    it.name = it.baseName;
    if ((it.quality === 6 || it.quality === 8) && it.rareWord1 !== undefined && it.rareWord2 !== undefined) {
      const rn = decodeRareName(it.rareWord1, it.rareWord2);
      if (rn) {
        it.rareName = rn;
        it.name = rn + ' ' + it.baseName;
      }
    }
    const ed = getEngineData();
    if (ed) {
      if (it.quality === 5 && it.setOrUniqueId !== undefined) {
        const sDef = ed.getSetItem(it.setOrUniqueId);
        if (sDef) {
          it.setDef = sDef;
          it.name = sDef.zhName || sDef.name || it.baseName;
          if (sDef.code) it.setCode = sDef.code;
        }
      } else if (it.quality === 7 && it.setOrUniqueId !== undefined) {
        const uDef = ed.getUnique(it.setOrUniqueId);
        if (uDef) {
          it.uniqueDef = uDef;
          it.name = uDef.zhName || uDef.name || it.baseName;
          if (uDef.uniqueTier) {
            it.uniqueTier = uDef.uniqueTier;
          }
        }
      }
    }
    // 暗金分类判断 (TU / SU / SSU / SSSU / Jewelry)
    if (it.quality === 7) {
      const isJewelry = ['rin', 'amu', 'jew', 'cm1', 'cm2', 'cm3'].includes((it.typeCode || '').trim());
      if (isJewelry) {
        it.uniqueTier = 'Jewelry';
      } else if (!it.uniqueTier) {
        const tierM = (it.baseName || '').match(/\(([1-4])\)/);
        if (tierM) {
          it.uniqueTier = 'TU';
          it.tuTier = parseInt(tierM[1], 10);
        } else if ((it.baseName || '').includes('神圣') || (it.baseName || '').includes('(Sacred)') || (it.typeCode || '').includes('@')) {
          const ilvl = (it.uniqueDef && it.uniqueDef.ilvl) || 0;
          it.uniqueTier = ilvl >= 130 ? 'SSSU' : (ilvl >= 115 ? 'SSU' : 'SU');
        }
      } else if (it.uniqueTier === 'TU') {
        const tierM = (it.baseName || '').match(/\(([1-4])\)/);
        if (tierM) it.tuTier = parseInt(tierM[1], 10);
      }
    }

    // 遗物 (cotw) 品质防御：Median XL 游戏中遗物只存在暗金品质(7)，游戏客户端对非法品质物品不予显示
    if (it.typeCode === 'cotw' && it.quality !== 7) {
      if (result && result.warnings) {
        result.warnings.push('跳过非法非暗金品质遗物 (GUID: 0x' + (it.guid >>> 0).toString(16).toUpperCase() + ')');
      }
      return null;
    }

    if (depth === 0 && result && result.items) {
      result.items.push(it);
    }
    return it;
  }

  function parseD2s(bytes) {
    if (bytes[0] !== 0x55 || bytes[1] !== 0xAA || bytes[2] !== 0x55 || bytes[3] !== 0xAA) {
      throw new Error('不是有效的存档文件（缺少 0xAA55AA55 签名）');
    }
    const nameBytes = bytes.slice(0x14, 0x24);
    const charName = new TextDecoder('ascii').decode(nameBytes).replace(/\0+$/, '');
    const classCode = bytes[0x28], clvl = bytes[0x2B], skillsNumber = bytes[0x2A];

    const result = {
      name: charName, class: CLASS_NAMES[classCode] || ('职业' + classCode),
      level: clvl, items: [], warnings: [], debug: [],
    };

    // 技能区 "if"（从 StatsData 0x2FF 之后找最后一个），其后是物品区 "JM"
    let ifPos = -1;
    for (let p = 0x2FF; (p = bytes.indexOf(0x69, p)) !== -1; p++) {
      if (bytes[p] === 0x69 && bytes[p + 1] === 0x66) ifPos = p; // 'i''f'
    }
    if (ifPos === -1) throw new Error('未找到技能区头 (if)');
    let pos = ifPos + 2 + skillsNumber;
    if (bytes[pos] !== 0x4A || bytes[pos + 1] !== 0x4D) throw new Error('未找到角色物品区头 (JM)');
    const charCount = bytes[pos + 2] | (bytes[pos + 3] << 8);
    pos += 4;

    const BitReaderClass = getBitReader();
    const br = new BitReaderClass(bytes, pos, bytes.length - pos);
    let parsed = 0, failures = 0;
    const startByte = pos;
    const rawItems = [];   // 顶层物品引用（含原始字节范围），按解析顺序
    while (parsed < charCount) {
      const before = br.bytePos;
      try {
        const it = parseItem(br, result, 0);
        parsed++;
        if (it) {
          it._sec = 'char';
          it.rawStart = before;
          br.byteAlign();
          it.rawEnd = br.bytePos;
          it.raw = bytes.slice(before, it.rawEnd);
          rawItems.push(it);
        }
      } catch (e) {
        failures++;
        if (e && e.itemCtx) {
          result.warnings.push('物品 #' + parsed + ' (' + (e.itemCtx.typeCode || '?') +
            ' ilvl=' + e.itemCtx.ilvl + ' q=' + e.itemCtx.quality + (e.itemCtx.list ? ' ' + e.itemCtx.list : '') +
            ') 未知属性 #' + e.message.replace(/\D/g, '') + '，已解析属性: ' + e.itemCtx.propsSoFar.join('; '));
        } else {
          result.warnings.push('物品 #' + parsed + ' 解析失败: ' + (e.message || e));
        }
        // 回退：跳到下一个 JM
        br.byteAlign();
        let found = false;
        for (let p = br.bytePos + 2; p < bytes.length - 1; p++) {
          if (bytes[p] === 0x4A && bytes[p + 1] === 0x4D) { br.bytePos = p; found = true; break; }
        }
        if (!found) break;
        parsed++; // 计数上仍消耗一个名额，避免死循环
      }
      if (br.bytePos === before) break; // 防死循环
    }

    // 尸体段 (JM + 2字节数量) / 佣兵段 (jf) / 铁傀儡 (kf) —— 尽力而为
    br.byteAlign();
    result.region = { start: startByte, end: br.bytePos, count: charCount };  // 角色物品区边界
    try {
      let p = br.bytePos;
      if (bytes[p] === 0x4A && bytes[p + 1] === 0x4D) {
        const corpseCount = bytes[p + 2] | (bytes[p + 3] << 8);
        p += 4;
        for (let c = 0; c < corpseCount; c++) {
          if (bytes[p] !== 0x4A || bytes[p + 1] !== 0x4D) break;
          const sub = new BitReaderClass(bytes, p, bytes.length - p);
          parseItem(sub, result, 0);
          p = sub.bytePos;
        }
        br.bytePos = p;
      }
      if (bytes[br.bytePos] === 0x6A && bytes[br.bytePos + 1] === 0x66) { // 'jf'
        br.bytePos += 2;
        if (bytes[br.bytePos] === 0x4A && bytes[br.bytePos + 1] === 0x4D) {
          const mercCount = bytes[br.bytePos + 2] | (bytes[br.bytePos + 3] << 8);
          br.bytePos += 4;
          for (let m = 0; m < mercCount && mercCount > 0; m++) {
            const mit = (() => { try { return parseItem(br, result, 0); } catch (e) { return null; } })();
            if (mit) { mit._sec = 'merc'; }
          }
        }
      }
    } catch (e) { /* 佣兵/傀儡段解析失败不影响主列表 */ }

    result.parseFailures = failures;
    return result;
  }

  /* ============ 游戏内置多页仓库解析 (.stash / .shared) ============ */
  function parseStashBytes(bytes, sourceLabel) {
    const result = { items: [], warnings: [], pages: [] };
    if (!bytes || !bytes.length) return result;
    const BitReaderClass = getBitReader();

    // 1. 预扫描所有 STASH 分页物理边界
    const pages = [];
    for (let i = 0; i <= bytes.length - 5; i++) {
      if (bytes[i] === 0x53 && bytes[i+1] === 0x54 && bytes[i+2] === 0x41 && bytes[i+3] === 0x53 && bytes[i+4] === 0x48) {
        let jmPos = -1;
        for (let k = i + 5; k < Math.min(bytes.length - 3, i + 30); k++) {
          if (bytes[k] === 0x4A && bytes[k+1] === 0x4D) { jmPos = k; break; }
        }
        if (jmPos !== -1) {
          const declaredCount = bytes[jmPos + 2] | (bytes[jmPos + 3] << 8);
          pages.push({ stashOffset: i, jmPos, declaredCount, pageIdx: pages.length });
        }
      }
    }

    if (!pages.length) return result;

    // 2. 逐页进行严格边界隔离的物品位流解析
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const curPage = pages[pIdx];
      const pageEnd = (pIdx + 1 < pages.length) ? pages[pIdx + 1].stashOffset : bytes.length;
      const br = new BitReaderClass(bytes, curPage.jmPos + 4, pageEnd - (curPage.jmPos + 4));
      let parsedInPage = 0;
      const pageItems = [];

      while (parsedInPage < curPage.declaredCount && br.bytePos < pageEnd) {
        br.byteAlign();
        if (br.bytePos >= pageEnd) break;

        // 安全检查 1：若已到达下一个 STASH 签名，说明本页数据已读取完毕
        if (br.bytePos + 5 <= bytes.length &&
            bytes[br.bytePos] === 0x53 && bytes[br.bytePos+1] === 0x54 && bytes[br.bytePos+2] === 0x41 &&
            bytes[br.bytePos+3] === 0x53 && bytes[br.bytePos+4] === 0x48) {
          break;
        }

        // 安全检查 2：顶层物品必须以 JM (0x4A 0x4D) 开头
        if (bytes[br.bytePos] !== 0x4A || bytes[br.bytePos+1] !== 0x4D) {
          let found = -1;
          for (let k = br.bytePos; k < pageEnd - 1; k++) {
            // 绝不能越过下一个 STASH 页面边界
            if (k + 5 <= bytes.length && bytes[k] === 0x53 && bytes[k+1] === 0x54 && bytes[k+2] === 0x41 && bytes[k+3] === 0x53 && bytes[k+4] === 0x48) {
              break;
            }
            if (bytes[k] === 0x4A && bytes[k+1] === 0x4D) {
              found = k;
              break;
            }
          }
          if (found === -1) break; // 本页后续无更多合法物品
          br.bytePos = found;
        }

        const before = br.bytePos;
        try {
          const it = parseItem(br, result, 0);
          if (it) {
            it._sec = 'stash';
            it._source = sourceLabel || '游戏仓库';
            it._isShared = (sourceLabel || '').includes('共享');
            it._stashPage = pIdx;
            it.locText = (sourceLabel || '游戏仓库') + ' P' + (pIdx + 1);
            if (it.col !== undefined && it.row !== undefined) {
              it.gridPos = '(' + it.col + ',' + it.row + ')';
            }
            it.rawStart = before;
            br.byteAlign();
            it.rawEnd = br.bytePos;
            it.raw = bytes.slice(before, it.rawEnd);
            pageItems.push(it);
          }
          parsedInPage++;
        } catch (e) {
          result.warnings.push('仓库第 ' + (pIdx + 1) + ' 页物品 #' + (parsedInPage + 1) + ' 解析跳过: ' + (e.message || e));
          br.byteAlign();
          let found = false;
          for (let k = br.bytePos + 2; k < pageEnd - 1; k++) {
            if (k + 5 <= bytes.length && bytes[k] === 0x53 && bytes[k+1] === 0x54 && bytes[k+2] === 0x41 && bytes[k+3] === 0x53 && bytes[k+4] === 0x48) break;
            if (bytes[k] === 0x4A && bytes[k+1] === 0x4D) { br.bytePos = k; found = true; break; }
          }
          if (!found) break;
          parsedInPage++;
        }
        if (br.bytePos <= before) break; // 严格前移防死循环
      }

      result.pages.push({
        pageIdx: pIdx,
        declaredCount: curPage.declaredCount,
        actualCount: pageItems.length,
        stashOffset: curPage.stashOffset,
        jmPos: curPage.jmPos,
        pageEnd
      });
    }

    return result;
  }

  const exportsObj = {
    QUALITY_NAMES,
    QUALITY_CLASS,
    CLASS_NAMES,
    LOC_NAMES,
    STOR_NAMES,
    EQUIP_SLOTS,
    propTable,
    itemName,
    isTomeCode,
    parseProps,
    parseItem,
    parseD2s,
    parseStashBytes
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  Object.assign(root, exportsObj);
})(typeof window !== 'undefined' ? window : globalThis);
