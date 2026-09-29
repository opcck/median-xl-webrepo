// Median XL WebRepo - 应用主控制器、筛选交互、渲染循环与 Tauri 桥接入口
(function(root) {
  'use strict';

  const $ = id => (typeof document !== 'undefined' ? document.getElementById(id) : null);

  function esc(s) {
    return root.esc ? root.esc(s) : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function stripD2(s) {
    return root.stripD2 ? root.stripD2(s) : String(s || '');
  }

  function d2Colorize(s) {
    return root.d2Colorize ? root.d2Colorize(s) : esc(s);
  }

  function displayName(it) {
    if (!it) return '未知物品';
    // 自动按需自愈暗金与套装专属名称
    if ((it.quality === 7 || it.quality === 5) && it.setOrUniqueId !== undefined && (!it.uniqueDef && !it.setDef || it.name === it.baseName)) {
      const ed = (typeof ENGINE_DATA !== 'undefined' ? ENGINE_DATA : (root.ENGINE_DATA || (typeof global !== 'undefined' ? global.ENGINE_DATA : null)));
      if (ed) {
        if (it.quality === 7 && ed.getUnique) {
          const u = ed.getUnique(it.setOrUniqueId);
          if (u && (u.zhName || u.name)) {
            it.uniqueDef = u;
            it.name = u.zhName || u.name;
            if (u.uniqueTier) it.uniqueTier = u.uniqueTier;
          }
        } else if (it.quality === 5 && ed.getSetItem) {
          const s = ed.getSetItem(it.setOrUniqueId);
          if (s && (s.zhName || s.name)) {
            it.setDef = s;
            it.name = s.zhName || s.name;
            if (s.code) it.setCode = s.code;
          }
        }
      }
    }
    if (root.displayName && root.displayName !== displayName) return root.displayName(it);
    let n = (it && (it.name || it.baseName)) || '未知物品';
    if (it && it.persName) n = it.persName + '的' + n;
    return n;
  }

  function locText(it) {
    return it.locText + (it.gridPos ? ' ' + it.gridPos : '');
  }

  /* ============ 全局交互与多维筛选状态 ============ */
  const STATE = {
    search: '',
    storage: 'all',
    groupBy: 'quality',
    quality: new Set(),
    uniqueTier: new Set(),
    type: new Set(),
    flags: { eth: 0, blessed: 0, corrupted: 0, luckied: 0, moed: 0, sock: 0, rw: 0 },
    view: 'grid',
    showImg: true,
    showAff: false,
    tab: 'char',
    sel: new Set(),
  };

  let charSel = STATE.sel;
  let personalSel = new Set();
  let sharedSel = new Set();
  let repoSel = new Set();
  let stashSel = personalSel; // 兼容别名
  let DISPLAY = [];

  function currentSel() {
    if (STATE.tab === 'char') return charSel;
    if (STATE.tab === 'personal') return personalSel;
    if (STATE.tab === 'shared') return sharedSel;
    return repoSel;
  }

  function typeOf(it) {
    return stripD2(it.baseName).trim();
  }

  function passFlags(it) {
    const f = STATE.flags;
    const isEth = !!(it.ethereal || it.eth);
    if (f.eth === 1 && !isEth) return false;
    if (f.eth === 2 && isEth) return false;

    const isBlessed = !!(it.blessed || it.isBlessed);
    if (f.blessed === 1 && !isBlessed) return false;
    if (f.blessed === 2 && isBlessed) return false;

    const isCorrupted = !!(it.corrupted || it.isCorrupted);
    if (f.corrupted === 1 && !isCorrupted) return false;
    if (f.corrupted === 2 && isCorrupted) return false;

    const isLuckied = !!(it.luckied || it.isLuckied);
    if (f.luckied === 1 && !isLuckied) return false;
    if (f.luckied === 2 && isLuckied) return false;

    const isMoed = !!(it.moCount && it.moCount > 0);
    if (f.moed === 1 && !isMoed) return false;
    if (f.moed === 2 && isMoed) return false;

    const isSock = !!(it.socketed || (it.socketsTotal && it.socketsTotal > 0));
    if (f.sock === 1 && !isSock) return false;
    if (f.sock === 2 && isSock) return false;

    const isRw = !!(it.rw || it.runeword);
    if (f.rw === 1 && !isRw) return false;
    if (f.rw === 2 && isRw) return false;

    return true;
  }

  function filteredItems() {
    const REPO = root.REPO || { items: [] };
    const GAME_STASH = root.GAME_STASH || { items: [], personal: [], shared: [] };
    const CURRENT = root.CURRENT;

    let list = [];
    if (STATE.tab === 'repo') {
      list = REPO.items.map(r => r.item);
    } else if (STATE.tab === 'personal') {
      list = GAME_STASH.personal;
    } else if (STATE.tab === 'shared') {
      list = GAME_STASH.shared;
    } else if (STATE.tab === 'stash') {
      list = GAME_STASH.items;
    } else {
      list = CURRENT ? CURRENT.items.filter(it => it._sec !== 'stash') : [];
    }
    const q = STATE.search.toLowerCase().trim();

    return list.filter(it => {
      // 1. 存放位置筛选
      if (STATE.tab === 'char' && STATE.storage !== 'all') {
        const isChar = it._sec === 'char';
        const loc = it._locRaw;
        const stor = it._storRaw;
        if (STATE.storage === 'unequipped') {
          if (!isChar || (loc !== 0 && loc !== 6) || (stor !== 1 && stor !== 4 && stor !== 5)) return false;
        } else if (STATE.storage === 'inventory') {
          if (!isChar || loc !== 0 || stor !== 1) return false;
        } else if (STATE.storage === 'equipped') {
          if (!isChar || loc !== 1) return false;
        } else if (STATE.storage === 'stash') {
          if (!isChar || loc !== 0 || stor !== 5) return false;
        } else if (STATE.storage === 'cube') {
          if (!isChar || loc !== 0 || stor !== 4) return false;
        } else if (STATE.storage === 'merc') {
          if (isChar && loc !== 3 && loc !== 5) return false;
        }
      } else if ((STATE.tab === 'personal' || STATE.tab === 'shared' || STATE.tab === 'stash') && STATE.storage !== 'all') {
        if (STATE.storage === 'personal') {
          if (it._source !== '个人仓库') return false;
        } else if (STATE.storage === 'shared') {
          if (it._source !== '共享仓库') return false;
        } else if (STATE.storage.startsWith('page_')) {
          const p = parseInt(STATE.storage.split('_')[1], 10);
          if (it._stashPage !== p) return false;
        }
      }

      // 2. 官方同款类型树、多维品质、品阶药丸与Flags筛选
      if (root.FILTER_TREE && !root.FILTER_TREE.matchesItem(it)) return false;

      // 3. 搜索框文本
      if (q) {
        const uTierStr = it.uniqueTier ? (it.uniqueTier + ' ' + (it.tuTier ? 'tu' + it.tuTier : '')) : '';
        const hay = (
          stripD2(displayName(it)) + ' ' +
          (it.base ? stripD2(it.base.name) : '') + ' ' +
          (it.typeCode || '') + ' ' +
          locText(it) + ' ' +
          uTierStr + ' ' +
          (it.props ? it.props.map(p => (p.stat || '') + ' ' + (p.pos || '') + ' ' + (p.neg || '')).join(' ') : '')
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }

  function updateStorageOptions() {
    const sel = $('storageSelect');
    if (!sel) return;
    const GAME_STASH = root.GAME_STASH || { personal: [], shared: [], items: [] };
    const REPO = root.REPO || { items: [] };
    const CURRENT = root.CURRENT;

    if (STATE.tab === 'personal') {
      const items = GAME_STASH.personal;
      const pageMap = new Map();
      for (const it of items) {
        const p = it._stashPage !== undefined ? it._stashPage : 0;
        pageMap.set(p, (pageMap.get(p) || 0) + 1);
      }
      const opts = [
        ['all', `全部个人仓库 (${items.length})`]
      ];
      const sortedPages = [...pageMap.keys()].sort((a, b) => a - b);
      for (const p of sortedPages) {
        opts.push([`page_${p}`, `第 ${p + 1} 页 (${pageMap.get(p)})`]);
      }
      sel.innerHTML = opts.map(([val, label]) => `<option value="${val}"${STATE.storage === val ? ' selected' : ''}>${label}</option>`).join('');
      return;
    }
    if (STATE.tab === 'shared') {
      const items = GAME_STASH.shared;
      const pageMap = new Map();
      for (const it of items) {
        const p = it._stashPage !== undefined ? it._stashPage : 0;
        pageMap.set(p, (pageMap.get(p) || 0) + 1);
      }
      const opts = [
        ['all', `全部共享仓库 (${items.length})`]
      ];
      const sortedPages = [...pageMap.keys()].sort((a, b) => a - b);
      for (const p of sortedPages) {
        opts.push([`page_${p}`, `第 ${p + 1} 页 (${pageMap.get(p)})`]);
      }
      sel.innerHTML = opts.map(([val, label]) => `<option value="${val}"${STATE.storage === val ? ' selected' : ''}>${label}</option>`).join('');
      return;
    }
    if (STATE.tab === 'stash') {
      const items = GAME_STASH.items;
      let persCount = 0, sharedCount = 0;
      const pageMap = new Map();
      for (const it of items) {
        if (it._source === '个人仓库') persCount++;
        else if (it._source === '共享仓库') sharedCount++;
        const p = it._stashPage !== undefined ? it._stashPage : 0;
        pageMap.set(p, (pageMap.get(p) || 0) + 1);
      }
      const opts = [
        ['all', `全部游戏仓库 (${items.length})`]
      ];
      if (persCount > 0) opts.push(['personal', `个人仓库 (${persCount})`]);
      if (sharedCount > 0) opts.push(['shared', `共享仓库 (${sharedCount})`]);
      const sortedPages = [...pageMap.keys()].sort((a, b) => a - b);
      for (const p of sortedPages) {
        opts.push([`page_${p}`, `第 ${p + 1} 页 (${pageMap.get(p)})`]);
      }
      sel.innerHTML = opts.map(([val, label]) => `<option value="${val}"${STATE.storage === val ? ' selected' : ''}>${label}</option>`).join('');
      return;
    }
    if (STATE.tab === 'repo') {
      sel.innerHTML = `<option value="all">全部云仓库 (${REPO.items.length})</option>`;
      return;
    }

    // char 模式
    if (!CURRENT) return;
    const items = CURRENT.items.filter(it => it._sec !== 'stash');
    const counts = { unequipped: 0, inventory: 0, equipped: 0, stash: 0, cube: 0, merc: 0 };
    for (const it of items) {
      const isChar = it._sec === 'char';
      const loc = it._locRaw, stor = it._storRaw;
      if (isChar && (loc === 0 || loc === 6) && (stor === 1 || stor === 4 || stor === 5)) counts.unequipped++;
      if (isChar && loc === 0 && stor === 1) counts.inventory++;
      if (isChar && loc === 1) counts.equipped++;
      if (isChar && loc === 0 && stor === 5) counts.stash++;
      if (isChar && loc === 0 && stor === 4) counts.cube++;
      if (!isChar || loc === 3 || loc === 5) counts.merc++;
    }
    const opts = [
      ['all', `全部位置 (${items.length})`],
      ['unequipped', `未装备 (${counts.unequipped})`],
      ['inventory', `背包 (${counts.inventory})`],
      ['equipped', `已装备 (${counts.equipped})`],
      ['stash', `储物箱 (${counts.stash})`],
      ['cube', `赫拉迪克方块 (${counts.cube})`],
      ['merc', `佣兵/铁傀儡 (${counts.merc})`]
    ];
    sel.innerHTML = opts.map(([val, label]) => `<option value="${val}"${STATE.storage === val ? ' selected' : ''}>${label}</option>`).join('');
  }

  function renderStatsChips() {
    const chipsEl = $('statsChips');
    if (!chipsEl) return;
    const REPO = root.REPO || { items: [] };
    const GAME_STASH = root.GAME_STASH || { personal: [], shared: [], items: [] };
    const CURRENT = root.CURRENT;
    const QUALITY_NAMES = root.QUALITY_NAMES || {};
    const QUALITY_CLASS = root.QUALITY_CLASS || {};

    let allItems = [];
    if (STATE.tab === 'repo') allItems = REPO.items.map(r => r.item);
    else if (STATE.tab === 'personal') allItems = GAME_STASH.personal;
    else if (STATE.tab === 'shared') allItems = GAME_STASH.shared;
    else if (STATE.tab === 'stash') allItems = GAME_STASH.items;
    else allItems = CURRENT ? CURRENT.items.filter(i => i._sec !== 'stash') : [];

    const visible = filteredItems();
    const hiddenCount = allItems.length - visible.length;

    const selSet = currentSel();
    const selectedCount = selSet.size;

    let storeableCount = 0;
    if (STATE.tab === 'char') {
      storeableCount = visible.filter(i => i.rawStart !== undefined && i._sec === 'char').length;
    } else {
      storeableCount = visible.length;
    }

    const qCounts = new Map();
    for (const it of visible) {
      qCounts.set(it.quality, (qCounts.get(it.quality) || 0) + 1);
    }

    let html = `
      <span class="preview-stat-chip"><strong>${STATE.tab === 'repo' ? '可取回' : '可存入'}</strong><span>${storeableCount}</span></span>
      <span class="preview-stat-chip"><strong>已选中</strong><span>${selectedCount}</span></span>
      <span class="preview-stat-chip"><strong>显示中</strong><span>${visible.length}</span></span>
      <span class="preview-stat-chip"><strong>已隐藏</strong><span>${hiddenCount}</span></span>
    `;

    const sortedQ = [...qCounts.keys()].sort((a, b) => a - b);
    for (const q of sortedQ) {
      const qName = QUALITY_NAMES[q] ? QUALITY_NAMES[q].split(' ')[0] : ('品质' + q);
      const qCls = QUALITY_CLASS[q] || 'q-normal';
      html += `<span class="preview-stat-chip"><strong class="${qCls}">${esc(qName)}</strong><span>${qCounts.get(q)}</span></span>`;
    }

    chipsEl.innerHTML = html;
  }

  function pillHtml(it) {
    const qc = (root.QUALITY_CLASS && root.QUALITY_CLASS[it.quality]) || 'q-normal';
    const icon = root.iconSrc ? root.iconSrc(it) : null;
    const img = STATE.showImg ? (icon ? '<img src="' + icon + '">' : '') : '';
    const clsR = root.classRestriction ? root.classRestriction(it) : null;
    const clsBadge = clsR ? '<span class="badge cls" title="限定职业: ' + esc(clsR[0]) + '">' + esc(clsR[0]) + '</span>' : '';
    let uTierBadge = '';
    if (it.quality === 7 && it.uniqueTier) {
      if (it.uniqueTier === 'SU') uTierBadge = '<span class="badge" style="background:#b45309;color:#fff" title="神圣暗金 SU">SU</span>';
      else if (it.uniqueTier === 'SSU') uTierBadge = '<span class="badge" style="background:#dc2626;color:#fff" title="特级神圣暗金 SSU">SSU</span>';
      else if (it.uniqueTier === 'SSSU') uTierBadge = '<span class="badge" style="background:#7c3aed;color:#fff" title="终极神圣暗金 SSSU">SSSU</span>';
      else if (it.uniqueTier === 'TU') {
        const tNum = it.tuTier || (it.baseName ? (it.baseName.match(/\(([1-4])\)/) || [])[1] : '') || '';
        uTierBadge = '<span class="badge" style="background:#0284c7;color:#fff" title="普通暗金 ' + tNum + '阶">TU' + tNum + '</span>';
      }
    }
    const flags = (it.ethereal ? '<span class="badge eth">无形</span>' : '') +
                  (it.rw ? '<span class="badge rw">符文之语</span>' : '') +
                  clsBadge +
                  uTierBadge +
                  (it.socketed && it.socketsTotal ? '<span class="badge sock">' + it.socketsTotal + '孔</span>' : '');
    let affs = '';
    if (STATE.showAff && it.props && it.props.length && root.propsText) {
      affs = root.propsText(it.props).slice(0, 3).map(t => {
        const neg = /^\s*[-\u2212]/.test(t) || /-\d/.test(t);
        return '<span class="aff' + (neg ? ' neg' : '') + '">' + esc(stripD2(t)) + '</span>';
      }).join('');
    }
    const cls = STATE.showAff ? 'pill pill2' : 'pill';
    const curSel = currentSel();
    const selKey = STATE.tab === 'char' ? it._idx : (STATE.tab === 'repo' ? it._repoId : it._stashIdx);
    const selCls = curSel.has(selKey) ? ' selected' : '';
    const locked = STATE.tab === 'char' && (!it.rawStart || it._sec !== 'char');
    const lockCls = locked ? ' locked' : '';
    const lockTip = locked ? ' title="佣兵/铁傀儡物品暂不支持存入"' : '';
    return '<span class="' + cls + selCls + lockCls + '" data-idx="' + it._idx + '" data-selkey="' + selKey + '"' + lockTip + '>' + img +
           '<span><span class="' + qc + '">' + d2Colorize(displayName(it)) + '</span>' + flags + affs + '</span></span>';
  }

  function rebuildGameStash() {
    const GAME_STASH = root.GAME_STASH;
    const CURRENT = root.CURRENT;
    if (!GAME_STASH) return;

    const allStash = [];
    for (const it of GAME_STASH.personal) allStash.push(it);
    for (const it of GAME_STASH.shared) allStash.push(it);
    if (CURRENT) {
      for (const it of CURRENT.items) {
        if (it._sec === 'char' && it._storRaw === 5) {
          it._source = '个人储物箱';
          allStash.push(it);
        }
      }
    }
    allStash.forEach((it, i) => {
      it._stashIdx = i;
      it._idx = i;
    });
    GAME_STASH.items = allStash;
    updateCounts();
  }

  function updateCounts() {
    const CURRENT = root.CURRENT;
    const GAME_STASH = root.GAME_STASH || { personal: [], shared: [], items: [] };
    const REPO = root.REPO || { items: [] };

    const charItemsCount = CURRENT ? CURRENT.items.filter(it => it._sec !== 'stash').length : 0;
    if ($('charCount')) $('charCount').textContent = charItemsCount;
    if ($('personalCount')) $('personalCount').textContent = GAME_STASH.personal.length;
    if ($('sharedCount')) $('sharedCount').textContent = GAME_STASH.shared.length;
    if ($('repoCount')) $('repoCount').textContent = REPO.items.length;
    if ($('stashCount')) $('stashCount').textContent = GAME_STASH.personal.length + GAME_STASH.shared.length;
    if (root.updateLogBadge) root.updateLogBadge();
  }

  function render() {
    const REPO = root.REPO || { items: [] };
    const GAME_STASH = root.GAME_STASH || { personal: [], shared: [], items: [] };
    const CURRENT = root.CURRENT;
    const QUALITY_CLASS = root.QUALITY_CLASS || {};
    const QUALITY_NAMES = root.QUALITY_NAMES || {};

    let allItems = [];
    if (STATE.tab === 'repo') {
      allItems = REPO.items.map(r => {
        const it = r.item;
        it._idx = r.id;
        it._repoId = r.id;
        return it;
      });
    } else if (STATE.tab === 'personal') {
      allItems = GAME_STASH.personal.map((it, i) => {
        it._idx = i;
        it._stashIdx = i;
        it._source = '个人仓库';
        return it;
      });
    } else if (STATE.tab === 'shared') {
      allItems = GAME_STASH.shared.map((it, i) => {
        it._idx = i;
        it._stashIdx = i;
        it._source = '共享仓库';
        return it;
      });
    } else if (STATE.tab === 'stash') {
      allItems = GAME_STASH.items;
    } else {
      allItems = CURRENT ? CURRENT.items.filter(it => it._sec !== 'stash') : [];
    }

    const items = filteredItems();
    DISPLAY = items;
    root.DISPLAY = items;

    const isTable = STATE.view === 'table';
    if ($('list')) $('list').style.display = isTable ? 'none' : 'block';
    if ($('tableView')) $('tableView').style.display = isTable ? 'block' : 'none';

    if (!items.length) {
      let emptyTip = '暂无匹配物品。';
      if (STATE.tab === 'repo' && !REPO.items.length) emptyTip = '云仓库为空。可从“角色背包”、“个人仓库”或“共享仓库”中选中物品存入云仓库。';
      else if (STATE.tab === 'personal' && !GAME_STASH.personal.length) emptyTip = '个人仓库为空或未载入当前角色的 .stash 个人仓库文件。';
      else if (STATE.tab === 'shared' && !GAME_STASH.shared.length) emptyTip = '共享仓库为空或未载入 _sharedstash.shared 共享仓库文件。';
      else if (STATE.tab === 'char' && (!CURRENT || !CURRENT.items.length)) emptyTip = '角色随身背包为空或未载入角色。';
      if ($('list')) $('list').innerHTML = `<p style="color:#6b7280;padding:12px 4px">${emptyTip}</p>`;
      if ($('tableBody')) $('tableBody').innerHTML = `<tr><td colspan="5" style="color:#6b7280;padding:12px 10px">${emptyTip}</td></tr>`;
    } else if (isTable) {
      let rows = '';
      for (const it of items) {
        const qc = QUALITY_CLASS[it.quality] || 'q-normal';
        const curSel = currentSel();
        const selKey = STATE.tab === 'char' ? it._idx : (STATE.tab === 'repo' ? it._repoId : it._stashIdx);
        const selCls = curSel.has(selKey) ? ' selected' : '';
        let uBadge = '';
        if (it.quality === 7 && it.uniqueTier) {
          if (it.uniqueTier === 'SU') uBadge = ' <span class="badge" style="background:#b45309;color:#fff">SU</span>';
          else if (it.uniqueTier === 'SSU') uBadge = ' <span class="badge" style="background:#dc2626;color:#fff">SSU</span>';
          else if (it.uniqueTier === 'SSSU') uBadge = ' <span class="badge" style="background:#7c3aed;color:#fff">SSSU</span>';
          else if (it.uniqueTier === 'TU') {
            const tNum = it.tuTier || (it.baseName ? (it.baseName.match(/\(([1-4])\)/) || [])[1] : '') || '';
            uBadge = ' <span class="badge" style="background:#0284c7;color:#fff">TU' + tNum + '</span>';
          }
        }
        let qDesc = QUALITY_NAMES[it.quality] || '';
        if (it.quality === 7 && it.uniqueTier) {
          if (it.uniqueTier === 'SU') qDesc = '神圣暗金 [SU]';
          else if (it.uniqueTier === 'SSU') qDesc = '特级神圣暗金 [SSU]';
          else if (it.uniqueTier === 'SSSU') qDesc = '终极神圣暗金 [SSSU]';
          else if (it.uniqueTier === 'TU') qDesc = '普通暗金 [TU' + (it.tuTier || '') + ']';
          else if (it.uniqueTier === 'Jewelry') qDesc = '暗金首饰';
        }
        rows += '<tr class="itemrow' + selCls + '" data-idx="' + it._idx + '" data-selkey="' + selKey + '"><td class="' + qc + '">' + d2Colorize(displayName(it)) +
          uBadge +
          (it.ethereal ? ' <span class="badge eth">无形</span>' : '') +
          (it.rw ? ' <span class="badge rw">符文之语</span>' : '') + '</td>' +
          '<td class="muted">' + esc(qDesc) + '</td>' +
          '<td class="muted">' + esc(typeOf(it)) + '</td>' +
          '<td class="muted">' + esc(locText(it)) + '</td>' +
          '<td class="muted">' + (it.ilvl !== undefined ? it.ilvl : '') + '</td></tr>';
      }
      if ($('tableBody')) $('tableBody').innerHTML = rows;
      if (root.bindPopups) root.bindPopups('tr.itemrow');
    } else if (STATE.groupBy === 'none') {
      if ($('list')) $('list').innerHTML = '<div class="pills">' + items.map(pillHtml).join('') + '</div>';
      if (root.bindPopups) root.bindPopups('.pill');
    } else {
      const key = STATE.groupBy === 'type' ? typeOf : (STATE.groupBy === 'storage' ? locText : (it => it.quality));
      const groups = new Map();
      for (const it of items) {
        const k = key(it);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(it);
      }
      let keys = [...groups.keys()];
      if (STATE.groupBy === 'quality') keys.sort((a, b) => a - b);
      else keys.sort((a, b) => groups.get(b).length - groups.get(a).length);
      let html = '';
      for (const k of keys) {
        const arr = groups.get(k);
        const label = STATE.groupBy === 'quality'
          ? '<span class="' + (QUALITY_CLASS[k] || 'q-normal') + '">' + esc(QUALITY_NAMES[k] || '其他') + '</span>'
          : esc(k);
        html += '<div class="qgroup"><div class="qgroup-header">' + label + '<span class="cnt">' + arr.length + '</span></div>' +
                '<div class="pills">' + arr.map(pillHtml).join('') + '</div></div>';
      }
      if ($('list')) $('list').innerHTML = html;
      if (root.bindPopups) root.bindPopups('.pill');
    }

    if ($('visibleCount')) $('visibleCount').textContent = items.length;
    if ($('totalCount')) $('totalCount').textContent = allItems.length;
    updateFilterBadge();
    renderStatsChips();
    updateBulkBar();
  }

  function initFilters() {
    const REPO = root.REPO || { items: [] };
    const GAME_STASH = root.GAME_STASH || { personal: [], shared: [], items: [] };
    const CURRENT = root.CURRENT;

    let items = [];
    if (STATE.tab === 'repo') items = REPO.items.map(r => r.item);
    else if (STATE.tab === 'personal') items = GAME_STASH.personal;
    else if (STATE.tab === 'shared') items = GAME_STASH.shared;
    else if (STATE.tab === 'stash') items = GAME_STASH.items;
    else items = CURRENT ? CURRENT.items.filter(i => i._sec !== 'stash') : [];

    if (root.FILTER_TREE) {
      root.FILTER_TREE.updateCounts(items);
      root.FILTER_TREE.updateBadge();
    }

    updateStorageOptions();
  }

  function activeFilterCount() {
    let n = root.FILTER_TREE ? root.FILTER_TREE.getActiveFilterCount() : 0;
    if (STATE.storage !== 'all') n++;
    return n;
  }

  function updateFilterBadge() {
    if (root.FILTER_TREE) {
      root.FILTER_TREE.updateBadge();
    }
  }

  function resetFilters() {
    if (root.FILTER_TREE) {
      root.FILTER_TREE.resetAllFilters();
    }
    STATE.search = '';
    STATE.storage = 'all';
    if ($('search')) $('search').value = '';
    if ($('storageSelect')) $('storageSelect').value = 'all';
    render();
  }

  function showResult(result) {
    root.CURRENT = result;
    root.CHAR = { name: result.name || result.charName || (result.header && result.header.name) || '' };
    result.items.forEach((it, i) => it._idx = i);
    rebuildGameStash();
    DISPLAY = result.items;
    root.DISPLAY = result.items;
    if ($('dropzone')) $('dropzone').style.display = 'none';
    if ($('content')) $('content').style.display = 'block';
    const warn = result.warnings.length ? '<br><span id="warnTrigger" style="color:#d8a940;cursor:pointer;text-decoration:underline;display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:rgba(216,169,64,0.12);border:1px solid rgba(216,169,64,0.3);border-radius:4px;margin-top:6px;font-size:12px" title="点击查看具体警告详情">⚠ ' + result.warnings.length + ' 条警告（点击直接查看详情）</span>' : '';
    const charItemsCount = result.items.filter(i => i._sec !== 'stash').length;
    const GAME_STASH = root.GAME_STASH || { items: [] };
    const REPO = root.REPO || { items: [] };
    if ($('charInfo')) {
      $('charInfo').innerHTML = '<b>' + esc(result.name) + '</b> · ' + esc(result.class) + ' · 等级 ' + result.level +
        ' · 随身 ' + charItemsCount + ' 件 · 游戏仓库 ' + GAME_STASH.items.length + ' 件 · 云仓库 ' + REPO.items.length + ' 件' + warn;
    }
    if (result.warnings.length) {
      console.warn(result.warnings);
      const warnTrig = $('warnTrigger');
      if (warnTrig) {
        warnTrig.onclick = () => {
          if (root.openWarnModal) root.openWarnModal(result.warnings);
        };
      }
    }
    initFilters();
    render();
  }

  function switchTab(t) {
    STATE.tab = t;
    STATE.storage = 'all';
    if ($('tabChar')) $('tabChar').classList.toggle('active', t === 'char');
    if ($('tabPersonal')) $('tabPersonal').classList.toggle('active', t === 'personal');
    if ($('tabShared')) $('tabShared').classList.toggle('active', t === 'shared');
    if ($('tabRepo')) $('tabRepo').classList.toggle('active', t === 'repo');

    const stSelect = $('storageSelect');
    if (stSelect) {
      stSelect.style.display = (t === 'char' || t === 'personal' || t === 'shared') ? 'inline-block' : 'none';
    }

    updateStorageOptions();
    updateBulkBar();
    initFilters();
    render();
  }

  function toggleSel(el, key) {
    if (key === undefined || key === null || Number.isNaN(key)) return;
    const sel = currentSel();
    if (sel.has(key)) { sel.delete(key); el.classList.remove('selected'); }
    else { sel.add(key); el.classList.add('selected'); }
    updateBulkBar();
    renderStatsChips();
  }

  function updateBulkBar() {
    const sel = currentSel();
    const n = sel.size;
    const bar = $('bulkBar');
    const CURRENT = root.CURRENT;
    const GAME_STASH = root.GAME_STASH || { personal: [], shared: [] };
    const REPO = root.REPO || { items: [] };
    const hasData = (CURRENT && CURRENT.items.length) || GAME_STASH.personal.length || GAME_STASH.shared.length || REPO.items.length;
    if (bar) bar.style.display = hasData ? 'flex' : 'none';
    const selCountEl = $('selCount');
    if (selCountEl) selCountEl.textContent = n;

    const bulkActionBtn = $('bulkAction');
    const btnRetPers = $('btnRetrievePersonal');
    const btnRetShared = $('btnRetrieveShared');

    if (bulkActionBtn) {
      bulkActionBtn.disabled = n === 0;
      if (STATE.tab === 'repo') {
        bulkActionBtn.textContent = '🎒 取回至背包 (' + n + ')';
      } else {
        bulkActionBtn.textContent = '📥 存入云仓库 (' + n + ')';
      }
    }

    if (btnRetPers) {
      btnRetPers.style.display = STATE.tab === 'repo' ? 'inline-block' : 'none';
      btnRetPers.disabled = n === 0;
      btnRetPers.textContent = '📦 取回到个人仓库 (' + n + ')';
    }
    if (btnRetShared) {
      btnRetShared.style.display = STATE.tab === 'repo' ? 'inline-block' : 'none';
      btnRetShared.disabled = n === 0;
      btnRetShared.textContent = '🌐 取回到共享仓库 (' + n + ')';
    }
  }

  /* ============ 存档与仓库载入调度 ============ */
  async function openDir() {
    const SAVE = root.SAVE;
    if (!window.showDirectoryPicker) { alert('请使用 Chrome 或 Edge 打开本页面（需要目录访问 API）'); return; }
    try {
      SAVE.dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (e) { if (e.name !== 'AbortError') console.error(e); return; }
    try {
      const fh = await SAVE.dir.getFileHandle(root.REPO_FILE || 'repository.mxlrepo.json');
      const dirRepo = JSON.parse(await (await fh.getFile()).text());
      if (dirRepo && Array.isArray(dirRepo.items) && dirRepo.items.length) {
        if (root.setRepo) root.setRepo(dirRepo);
        else root.REPO = dirRepo;
      }
    } catch (e) { /* 尚无云仓库文件 */ }
    const curRepo = root.getRepo ? root.getRepo() : (root.REPO || { items: [] });
    if (root.getNextRepoId) root.repoSeq = root.getNextRepoId();

    // 预检并载入共享仓库
    const GAME_STASH = root.GAME_STASH;
    try {
      const sharedHandle = await SAVE.dir.getFileHandle('_sharedstash.shared');
      const sharedFile = await sharedHandle.getFile();
      const sharedBuf = new Uint8Array(await sharedFile.arrayBuffer());
      GAME_STASH.sharedBytes = sharedBuf;
      const r = root.parseStashBytes(sharedBuf, '共享仓库');
      GAME_STASH.shared = r.items;
      await root.saveStashToCache('shared', sharedBuf);
    } catch (e) {
      const cachedShared = await root.loadStashFromCache('shared');
      if (cachedShared) {
        GAME_STASH.sharedBytes = cachedShared;
        const r = root.parseStashBytes(cachedShared, '共享仓库');
        GAME_STASH.shared = r.items;
      }
    }

    const saves = [];
    for await (const [name, handle] of SAVE.dir.entries()) {
      if (name.toLowerCase().endsWith('.d2s') && handle.kind === 'file') saves.push({ name, handle });
    }
    if ($('dropzone')) $('dropzone').style.display = 'none';
    const sp = $('savePicker');
    if (sp) {
      sp.style.display = 'block';
      if (!saves.length) { sp.innerHTML = '<p>该目录下没有 .d2s 存档文件。</p>'; return; }
      sp.innerHTML = '<p>选择要打开的存档：</p>' + saves.map((s, i) =>
        '<button style="display:block;margin:4px 0" data-i="' + i + '">' + esc(s.name) + '</button>').join('');
      sp.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => openSave(saves[+btn.dataset.i])));
    }
  }

  async function openSave(entry) {
    const SAVE = root.SAVE;
    const GAME_STASH = root.GAME_STASH;
    SAVE.fileHandle = entry.handle; SAVE.fileName = entry.name;
    const file = await entry.handle.getFile();
    const buf = new Uint8Array(await file.arrayBuffer());

    GAME_STASH.personal = [];
    const charBaseName = entry.name.replace(/\.d2s$/i, '');
    const stashFileName = charBaseName + '.stash';
    GAME_STASH.personalFileName = stashFileName;
    try {
      const stashHandle = await SAVE.dir.getFileHandle(stashFileName);
      const stashFile = await stashHandle.getFile();
      const stashBuf = new Uint8Array(await stashFile.arrayBuffer());
      GAME_STASH.personalBytes = stashBuf;
      const r = root.parseStashBytes(stashBuf, '个人仓库');
      GAME_STASH.personal = r.items;
      await root.saveStashToCache('stash_' + charBaseName, stashBuf);
    } catch (e) {
      const cached = await root.loadStashFromCache('stash_' + charBaseName);
      if (cached) {
        GAME_STASH.personalBytes = cached;
        const r = root.parseStashBytes(cached, '个人仓库');
        GAME_STASH.personal = r.items;
      }
    }

    if (!GAME_STASH.shared.length) {
      try {
        const sharedHandle = await SAVE.dir.getFileHandle('_sharedstash.shared');
        const sharedFile = await sharedHandle.getFile();
        const sharedBuf = new Uint8Array(await sharedFile.arrayBuffer());
        GAME_STASH.sharedBytes = sharedBuf;
        const r = root.parseStashBytes(sharedBuf, '共享仓库');
        GAME_STASH.shared = r.items;
        await root.saveStashToCache('shared', sharedBuf);
      } catch (e) {
        const cachedShared = await root.loadStashFromCache('shared');
        if (cachedShared) {
          GAME_STASH.sharedBytes = cachedShared;
          const r = root.parseStashBytes(cachedShared, '共享仓库');
          GAME_STASH.shared = r.items;
        }
      }
    }

    rebuildGameStash();
    loadBytes(buf);
    if ($('charInfo')) {
      $('charInfo').innerHTML = '目录: <b>' + esc(SAVE.dir.name) + '</b> · 存档: <b>' + esc(entry.name) + '</b> · 游戏仓库 ' + GAME_STASH.items.length + ' 件 · 云仓库 ' + (root.REPO ? root.REPO.items.length : 0) + ' 件';
    }
  }

  function loadBytes(bytes) {
    const SAVE = root.SAVE;
    try {
      const result = root.parseD2s(bytes);
      SAVE.bytes = bytes; SAVE.parsed = result;
      STATE.sel.clear();
      STATE.tab = 'char';
      if ($('tabChar')) $('tabChar').classList.add('active');
      if ($('tabPersonal')) $('tabPersonal').classList.remove('active');
      if ($('tabShared')) $('tabShared').classList.remove('active');
      if ($('tabRepo')) $('tabRepo').classList.remove('active');
      showResult(result);
      updateBulkBar();
      updateCounts();
      console.log('OK items=' + result.items.length + ' warn=' + result.warnings.length);
    } catch (e) {
      console.error('ERR ' + (e.message || e));
      alert('解析失败: ' + (e.message || e));
      console.error(e);
    }
  }

  async function loadSingleD2S(d2sFile, stashFiles = []) {
    const SAVE = root.SAVE;
    const GAME_STASH = root.GAME_STASH;
    SAVE.fileName = d2sFile.name;
    const buf = new Uint8Array(await d2sFile.arrayBuffer());
    const charBase = d2sFile.name.replace(/\.d2s$/i, '').toLowerCase();

    let autoLinkedPers = false;
    const matchingStash = stashFiles.find(f => f.name.toLowerCase() === (charBase + '.stash'));
    if (matchingStash) {
      const sBuf = new Uint8Array(await matchingStash.arrayBuffer());
      GAME_STASH.personalBytes = sBuf;
      GAME_STASH.personalFileName = matchingStash.name;
      const r = root.parseStashBytes(sBuf, '个人仓库');
      GAME_STASH.personal = r.items;
      await root.saveStashToCache('stash_' + charBase, sBuf);
      autoLinkedPers = true;
    } else {
      const cachedPersonal = await root.loadStashFromCache('stash_' + charBase);
      if (cachedPersonal) {
        GAME_STASH.personalBytes = cachedPersonal;
        GAME_STASH.personalFileName = charBase + '.stash';
        const r = root.parseStashBytes(cachedPersonal, '个人仓库');
        GAME_STASH.personal = r.items;
        autoLinkedPers = true;
      }
    }

    let autoLinkedShared = false;
    const matchingShared = stashFiles.find(f => f.name.toLowerCase().includes('shared'));
    if (matchingShared) {
      const sBuf = new Uint8Array(await matchingShared.arrayBuffer());
      GAME_STASH.sharedBytes = sBuf;
      const r = root.parseStashBytes(sBuf, '共享仓库');
      GAME_STASH.shared = r.items;
      await root.saveStashToCache('shared', sBuf);
      autoLinkedShared = true;
    } else if (!GAME_STASH.shared.length) {
      const cachedShared = await root.loadStashFromCache('shared');
      if (cachedShared) {
        GAME_STASH.sharedBytes = cachedShared;
        const r = root.parseStashBytes(cachedShared, '共享仓库');
        GAME_STASH.shared = r.items;
        autoLinkedShared = true;
      }
    }

    rebuildGameStash();
    loadBytes(buf);

    if (autoLinkedPers || autoLinkedShared) {
      const parts = [];
      if (autoLinkedPers) parts.push('个人仓库');
      if (autoLinkedShared) parts.push('共享仓库');
      if (root.showToast) root.showToast('已自动关联' + parts.join('与') + '（共 ' + GAME_STASH.items.length + ' 件）', true);
    } else {
      if (root.showToast) root.showToast('提示：可直接拖入 save 文件夹或 .stash 仓库一键关联！', true);
    }
  }

  async function handleLoadedFiles(fileList) {
    if (!fileList || !fileList.length) {
      alert('【未读取到文件】\n如果是直接拖入 save 文件夹受限，请进入该文件夹按 Ctrl+A 全选所有文件拖入，或点击页面顶部的【📁 选择存档文件夹】按钮！');
      return;
    }

    const first = fileList[0];
    if (fileList.length === 1 && (first.name.toLowerCase() === 'save' || (!first.name.includes('.') && first.size === 0))) {
      alert('【系统保护提示】\n由于 Windows 与浏览器对 AppData 敏感目录的安全保护，浏览器阻断了直接穿透拖入的 save 文件夹。\n\n极速解决方式（任选其一，1秒搞定）：\n1️⃣ 点击左上方【📁 选择存档文件夹】按钮直接选择 save 目录（绝不报错！）；\n2️⃣ 或双击进入 save 文件夹，按 Ctrl+A 全选所有文件直接拖入网页！');
      return;
    }

    const d2sFiles = [];
    const stashFiles = [];

    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const fn = f.name.toLowerCase();
      if (fn.endsWith('.d2s')) d2sFiles.push(f);
      else if (fn.endsWith('.stash') || fn.endsWith('.shared')) stashFiles.push(f);
    }

    if (!d2sFiles.length && !stashFiles.length) {
      const sampleNames = Array.from(fileList).slice(0, 3).map(f => f.name).join(', ');
      alert('【未检测到有效存档】\n已接收到 ' + fileList.length + ' 个文件（如：' + sampleNames + '），但其中未包含 .d2s 或 .stash 存档文件。\n请确认拖入的是 Diablo II Median XL 的 save 目录文件！');
      return;
    }

    const GAME_STASH = root.GAME_STASH;
    for (const f of stashFiles) {
      const fn = f.name.toLowerCase();
      const buf = new Uint8Array(await f.arrayBuffer());
      const isShared = fn.includes('shared');
      const label = isShared ? '共享仓库' : '个人仓库';
      const r = root.parseStashBytes(buf, label);
      if (isShared) {
        GAME_STASH.sharedBytes = buf;
        GAME_STASH.shared = r.items;
        await root.saveStashToCache('shared', buf);
      } else {
        const charBase = fn.replace(/\.stash$/, '');
        GAME_STASH.personalBytes = buf;
        GAME_STASH.personalFileName = f.name;
        const curName = root.getCurCharName ? root.getCurCharName() : '';
        if (!curName || curName.toLowerCase() === charBase) {
          GAME_STASH.personal = r.items;
        }
        await root.saveStashToCache('stash_' + charBase, buf);
      }
    }

    if (d2sFiles.length > 1) {
      if ($('dropzone')) $('dropzone').style.display = 'none';
      const sp = $('savePicker');
      if (sp) {
        sp.style.display = 'block';
        sp.innerHTML = '<p>检测到包含 ' + d2sFiles.length + ' 个角色存档，请点击选择要打开的角色：</p>' + d2sFiles.map((s, i) =>
          '<button style="display:block;margin:4px 0" data-i="' + i + '">' + esc(s.name) + '</button>').join('');
        sp.querySelectorAll('button').forEach(btn => btn.addEventListener('click', async () => {
          sp.style.display = 'none';
          await loadSingleD2S(d2sFiles[+btn.dataset.i], stashFiles);
        }));
      }
      return;
    }

    if (d2sFiles.length === 1) {
      await loadSingleD2S(d2sFiles[0], stashFiles);
    } else if (stashFiles.length) {
      rebuildGameStash();
      if ($('dropzone')) $('dropzone').style.display = 'none';
      if ($('content')) $('content').style.display = 'block';
      const stashCountEl = $('stashCount');
      if (stashCountEl) stashCountEl.textContent = GAME_STASH.items.length;
      if (root.getCurCharName && root.getCurCharName()) {
        render();
        if (root.showToast) root.showToast('已成功补全游戏仓库（共 ' + GAME_STASH.items.length + ' 件）并自动记忆！', true);
      } else {
        if ($('charInfo')) $('charInfo').innerHTML = '已载入并记忆游戏仓库：<b>' + stashFiles.map(f => esc(f.name)).join(', ') + '</b> · 共 ' + GAME_STASH.items.length + ' 件物品';
        switchTab('stash');
        if (root.showToast) root.showToast('已载入并自动记忆此仓库，之后拖入角色 .d2s 将自动关联！', true);
      }
    }
  }

  async function extractDroppedFiles(dataTransfer) {
    const files = [];
    if (!dataTransfer) return files;

    if (dataTransfer.items && dataTransfer.items.length) {
      const items = [...dataTransfer.items];
      const entries = [];
      for (const item of items) {
        if (typeof item.webkitGetAsEntry === 'function') {
          try {
            const ent = item.webkitGetAsEntry();
            if (ent) entries.push(ent);
          } catch (e) {}
        }
      }
      if (entries.length) {
        async function walkEntry(entry) {
          if (!entry) return;
          if (entry.isFile) {
            const file = await new Promise((res) => entry.file(res, () => res(null)));
            if (file) files.push(file);
          } else if (entry.isDirectory) {
            const reader = entry.createReader();
            let batch;
            do {
              batch = await new Promise((res) => reader.readEntries(res, () => res([])));
              if (batch && batch.length) {
                for (const c of batch) await walkEntry(c);
              }
            } while (batch && batch.length > 0);
          }
        }
        for (const ent of entries) await walkEntry(ent);
        if (files.length) return files;
      }
    }

    if (dataTransfer.files && dataTransfer.files.length) {
      for (let i = 0; i < dataTransfer.files.length; i++) files.push(dataTransfer.files[i]);
    }
    return files;
  }

  /* ============ Tauri 原生桌面端桥接 ============ */
  const IS_TAURI = typeof window !== 'undefined' && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);

  async function tauriInvoke(cmd, args = {}) {
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
      return await window.__TAURI__.core.invoke(cmd, args);
    }
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
      return await window.__TAURI_INTERNALS__.invoke(cmd, args);
    }
    throw new Error('当前未在 Tauri 原生桌面环境中运行');
  }

  async function initResourceBadge() {
    const badge = $('resourceSourceBadge');
    if (!badge) return;
    try {
      const info = await tauriInvoke('get_resource_info');
      if (info) {
        if (info.is_external) {
          badge.innerHTML = '📦 资源模式: <b style="color:#34d399">外置 web 目录</b> <span style="opacity:0.75">(v' + esc(info.data_version) + ')</span>';
          badge.title = '外部动态资源路径: ' + info.web_dir + '\n修改 web/ 下的代码按 F5 刷新即刻生效！';
          badge.style.background = '#064e3b';
          badge.style.borderColor = '#059669';
        } else {
          badge.innerHTML = '📦 资源模式: <b style="color:#fbbf24">内置基线</b> <span style="opacity:0.75">(v' + esc(info.data_version) + ')</span>';
          badge.title = '当前未检测到外置 web 目录，已安全回退为 exe 内置基线版本。';
          badge.style.background = '#374151';
          badge.style.borderColor = '#4b5563';
        }
        badge.style.display = 'inline-block';
        return;
      }
    } catch (e) {
      badge.textContent = '🌐 网页独立运行模式';
      badge.style.background = '#1e293b';
      badge.style.borderColor = '#475569';
    }
  }

  async function initTauriSaveAutoLoad() {
    if (!IS_TAURI) return;
    initResourceBadge();
    const SAVE = root.SAVE;
    const GAME_STASH = root.GAME_STASH;
    try {
      let savedDir = null;
      try { savedDir = localStorage.getItem('mxl_last_save_dir'); } catch (e) {}

      const payload = await tauriInvoke('read_save_directory', savedDir ? { dirPath: savedDir } : {});
      if (!payload || !payload.dir) return;

      SAVE.isNative = true;
      SAVE.dirPath = payload.dir;
      try { localStorage.setItem('mxl_last_save_dir', payload.dir); } catch (e) {}

      if (payload.repo_json) {
        try {
          const parsedRepo = JSON.parse(payload.repo_json);
          if (parsedRepo && Array.isArray(parsedRepo.items)) {
            if (root.setRepo) root.setRepo(parsedRepo);
            else root.REPO = parsedRepo;
            if ($('repoCount')) $('repoCount').textContent = parsedRepo.items.length;
          }
        } catch (e) {}
      }

      if (payload.shared && payload.shared.data) {
        const sharedBuf = new Uint8Array(payload.shared.data);
        GAME_STASH.sharedBytes = sharedBuf;
        const r = root.parseStashBytes(sharedBuf, '共享仓库');
        GAME_STASH.shared = r.items;
        await root.saveStashToCache('shared', sharedBuf);
      }

      window._NATIVE_STASHES = {};
      if (payload.stashes) {
        for (const st of payload.stashes) {
          const sBuf = new Uint8Array(st.data);
          window._NATIVE_STASHES[st.name.toLowerCase()] = sBuf;
          const charBase = st.name.toLowerCase().replace(/\.stash$/, '');
          await root.saveStashToCache('stash_' + charBase, sBuf);
        }
      }

      window._NATIVE_D2S = payload.d2s || [];

      if ($('dropzone')) $('dropzone').style.display = 'none';
      const sp = $('savePicker');
      if (sp) sp.style.display = 'block';

      if ($('charInfo')) {
        $('charInfo').innerHTML = '<span style="color:#22c55e;font-weight:bold">⚡ 桌面极速模式已连接:</span> <span style="color:#94a3b8">' + esc(payload.dir) + '</span>';
      }

      if (payload.d2s && payload.d2s.length) {
        sp.innerHTML = '<p style="color:#4ade80;font-weight:600">⚡ 已自动直连本地存档目录，点击切换角色：</p>' +
          payload.d2s.map((s, i) =>
            '<button style="display:inline-block;margin:4px 6px;background:#1e293b;border:1px solid #3b82f6;color:#e2e8f0;padding:6px 14px;border-radius:4px;cursor:pointer" data-ni="' + i + '">🎮 ' + esc(s.name) + '</button>'
          ).join('');
        sp.querySelectorAll('button[data-ni]').forEach(btn => {
          btn.addEventListener('click', () => openNativeSave(payload.d2s[+btn.dataset.ni]));
        });
        openNativeSave(payload.d2s[0]);
      }
    } catch (err) {
      console.warn('Tauri 自动载入失败:', err);
    }
  }

  async function openNativeSave(d2sEntry) {
    const SAVE = root.SAVE;
    const GAME_STASH = root.GAME_STASH;
    SAVE.fileName = d2sEntry.name;
    const buf = new Uint8Array(d2sEntry.data);
    const baseName = d2sEntry.name.replace(/\.d2s$/i, '');
    const stashName = (baseName + '.stash').toLowerCase();

    if (window._NATIVE_STASHES && window._NATIVE_STASHES[stashName]) {
      const stashBuf = window._NATIVE_STASHES[stashName];
      GAME_STASH.personalBytes = stashBuf;
      GAME_STASH.personalFileName = baseName + '.stash';
      const r = root.parseStashBytes(stashBuf, '个人仓库');
      GAME_STASH.personal = r.items;
    }
    loadBytes(buf);
  }

  /* ============ DOM 事件与入口挂载 ============ */
  function initApp() {
    if (typeof document === 'undefined') return;

    // 搜索、位置、分组
    if ($('search')) $('search').addEventListener('input', () => { STATE.search = $('search').value.trim(); render(); });
    if ($('storageSelect')) $('storageSelect').addEventListener('change', () => { STATE.storage = $('storageSelect').value; render(); });
    if ($('groupBy')) $('groupBy').addEventListener('change', () => { STATE.groupBy = $('groupBy').value; render(); });

    // 视图与图层开关
    if ($('btnToggleImg')) {
      $('btnToggleImg').addEventListener('click', () => {
        STATE.showImg = !STATE.showImg;
        $('btnToggleImg').classList.toggle('active', STATE.showImg);
        render();
      });
    }
    if ($('btnToggleAff')) {
      $('btnToggleAff').addEventListener('click', () => {
        STATE.showAff = !STATE.showAff;
        $('btnToggleAff').classList.toggle('active', STATE.showAff);
        render();
      });
    }
    if ($('viewGrid')) {
      $('viewGrid').addEventListener('click', () => {
        STATE.view = 'grid';
        $('viewGrid').classList.add('active');
        if ($('viewTable')) $('viewTable').classList.remove('active');
        render();
      });
    }
    if ($('viewTable')) {
      $('viewTable').addEventListener('click', () => {
        STATE.view = 'table';
        $('viewTable').classList.add('active');
        if ($('viewGrid')) $('viewGrid').classList.remove('active');
        render();
      });
    }

    // 初始化官方同款多维胶囊与树形筛选控制器
    if (root.FILTER_TREE) {
      root.FILTER_TREE.init(() => render());
    }

    // 批量多选
    if ($('selShown')) {
      $('selShown').addEventListener('click', () => {
        const visible = filteredItems();
        if (STATE.tab === 'char') {
          visible.forEach(i => { if (i.rawStart !== undefined && i._sec === 'char') charSel.add(i._idx); });
        } else if (STATE.tab === 'personal') {
          visible.forEach(i => personalSel.add(i._stashIdx));
        } else if (STATE.tab === 'shared') {
          visible.forEach(i => sharedSel.add(i._stashIdx));
        } else if (STATE.tab === 'stash') {
          visible.forEach(i => stashSel.add(i._stashIdx));
        } else {
          visible.forEach(i => repoSel.add(i._repoId || i.id));
        }
        render(); updateBulkBar();
      });
    }
    if ($('clearShown')) {
      $('clearShown').addEventListener('click', () => {
        const visible = filteredItems();
        if (STATE.tab === 'char') {
          visible.forEach(i => charSel.delete(i._idx));
        } else if (STATE.tab === 'personal') {
          visible.forEach(i => personalSel.delete(i._stashIdx));
        } else if (STATE.tab === 'shared') {
          visible.forEach(i => sharedSel.delete(i._stashIdx));
        } else if (STATE.tab === 'stash') {
          visible.forEach(i => stashSel.delete(i._stashIdx));
        } else {
          visible.forEach(i => repoSel.delete(i._repoId || i.id));
        }
        render(); updateBulkBar();
      });
    }
    if ($('selAll')) {
      $('selAll').addEventListener('click', () => {
        const CURRENT = root.CURRENT;
        const GAME_STASH = root.GAME_STASH || { personal: [], shared: [] };
        const REPO = root.REPO || { items: [] };
        if (STATE.tab === 'char') {
          (CURRENT ? CURRENT.items : []).forEach(i => { if (i.rawStart !== undefined && i._sec === 'char') charSel.add(i._idx); });
        } else if (STATE.tab === 'personal') {
          GAME_STASH.personal.forEach(i => personalSel.add(i._stashIdx));
        } else if (STATE.tab === 'shared') {
          GAME_STASH.shared.forEach(i => sharedSel.add(i._stashIdx));
        } else {
          REPO.items.forEach(i => repoSel.add(i.id));
        }
        render(); updateBulkBar();
      });
    }
    if ($('selNone')) {
      $('selNone').addEventListener('click', () => {
        charSel.clear(); personalSel.clear(); sharedSel.clear(); repoSel.clear();
        render(); updateBulkBar();
      });
    }

    // 存取操作栏按钮
    if ($('bulkAction')) {
      $('bulkAction').addEventListener('click', async () => {
        if (STATE.tab === 'repo') {
          if (root.doRetrieve) await root.doRetrieve();
        } else {
          if (root.doStore) await root.doStore();
        }
      });
    }
    if ($('btnRetrievePersonal')) {
      $('btnRetrievePersonal').addEventListener('click', async () => {
        if (root.doRetrieveToStash) await root.doRetrieveToStash('personal');
      });
    }
    if ($('btnRetrieveShared')) {
      $('btnRetrieveShared').addEventListener('click', async () => {
        if (root.doRetrieveToStash) await root.doRetrieveToStash('shared');
      });
    }

    // Tab 路由按钮
    if ($('tabChar')) $('tabChar').addEventListener('click', () => switchTab('char'));
    if ($('tabPersonal')) $('tabPersonal').addEventListener('click', () => switchTab('personal'));
    if ($('tabShared')) $('tabShared').addEventListener('click', () => switchTab('shared'));
    if ($('tabRepo')) $('tabRepo').addEventListener('click', () => switchTab('repo'));

    // 保存修改
    if ($('btnSaveDirect')) {
      $('btnSaveDirect').addEventListener('click', async () => {
        if (root.saveAllToDisk) await root.saveAllToDisk(false);
      });
    }

    // 传统备用下载
    if ($('btnDownloadSave')) {
      $('btnDownloadSave').addEventListener('click', () => {
        const SAVE = root.SAVE;
        const GAME_STASH = root.GAME_STASH;
        let dlCount = 0;
        if (SAVE && SAVE.bytes) {
          const fn = SAVE.fileName || (((root.getCurCharName && root.getCurCharName()) || 'character') + '.d2s');
          if (root.downloadBytes) root.downloadBytes(fn, SAVE.bytes);
          dlCount++;
        }
        if (GAME_STASH && GAME_STASH.personalBytes) {
          setTimeout(() => {
            const fn = GAME_STASH.personalFileName || (((root.getCurCharName && root.getCurCharName()) || 'character') + '.stash');
            if (root.downloadBytes) root.downloadBytes(fn, GAME_STASH.personalBytes);
          }, 300);
          dlCount++;
        }
        if (GAME_STASH && GAME_STASH.sharedBytes) {
          setTimeout(() => {
            if (root.downloadBytes) root.downloadBytes('_sharedstash.shared', GAME_STASH.sharedBytes);
          }, 600);
          dlCount++;
        }
        if (root.showToast) root.showToast('已为您下载 ' + dlCount + ' 个更新后的文件，放入 save 目录覆盖即可！', true);
      });
    }

    // 打开按钮 / 文件选择
    if ($('openBtn')) $('openBtn').addEventListener('click', openDir);
    const fileInputEl = $('fileInput');
    if ($('openFilesBtn') && fileInputEl) {
      $('openFilesBtn').addEventListener('click', () => fileInputEl.click());
    }
    const dirInputEl = $('dirInput');
    if ($('openDirInputBtn') && dirInputEl) {
      $('openDirInputBtn').addEventListener('click', () => dirInputEl.click());
      dirInputEl.addEventListener('change', e => {
        if (e.target.files && e.target.files.length) handleLoadedFiles(e.target.files);
      });
    }
    const dzEl = $('dropzone');
    if (dzEl && fileInputEl) {
      dzEl.addEventListener('click', e => {
        if (e.target !== fileInputEl && (!dirInputEl || e.target !== dirInputEl)) {
          fileInputEl.click();
        }
      });
      fileInputEl.addEventListener('change', e => {
        handleLoadedFiles(e.target.files);
      });
    }

    // 全屏拖拽
    const dropOverlayEl = $('dropOverlay');
    let dragCounter = 0;
    window.addEventListener('dragenter', e => {
      e.preventDefault();
      dragCounter++;
      if (dropOverlayEl) dropOverlayEl.classList.add('active');
      if (dzEl) dzEl.classList.add('drag');
    });
    window.addEventListener('dragover', e => {
      e.preventDefault();
      if (dropOverlayEl) dropOverlayEl.classList.add('active');
    });
    window.addEventListener('dragleave', () => {
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) {
        if (dropOverlayEl) dropOverlayEl.classList.remove('active');
        if (dzEl) dzEl.classList.remove('drag');
      }
    });
    window.addEventListener('drop', async e => {
      e.preventDefault();
      dragCounter = 0;
      if (dropOverlayEl) dropOverlayEl.classList.remove('active');
      if (dzEl) dzEl.classList.remove('drag');
      try {
        const files = await extractDroppedFiles(e.dataTransfer);
        if (files && files.length) {
          await handleLoadedFiles(files);
        } else {
          alert('【未能从拖入项中提取文件】\n原因通常为系统对 AppData 敏感目录的权限限制。\n\n极速解决方式：\n1. 双击进入 save 文件夹，按 Ctrl+A 全选所有文件拖入；\n2. 或直接点击页面顶部的【📁 选择存档文件夹】按钮！');
        }
      } catch (err) {
        console.error('拖放读取失败:', err);
        alert('拖放读取失败: ' + (err.message || err));
      }
    });

    // F5 / Ctrl+R 热重载
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        const SAVE = root.SAVE;
        if (SAVE && SAVE.dirPath) {
          try { localStorage.setItem('mxl_last_save_dir', SAVE.dirPath); } catch (err) {}
        }
        location.reload();
      }
    });

    // 开发用 ?test=<url>
    const testFile = new URLSearchParams(location.search).get('test');
    if (testFile) {
      console.log('FETCHING ' + testFile);
      fetch(testFile, { cache: 'no-store' }).then(r => { console.log('FETCHED ' + r.status); return r.arrayBuffer(); })
        .then(b => loadBytes(new Uint8Array(b)))
        .catch(e => { console.error('TESTFETCH ERR ' + (e.message || e)); });
    }

    // Tauri 初始化
    if (IS_TAURI) {
      initTauriSaveAutoLoad();
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }

  const exportsObj = {
    STATE,
    charSel,
    personalSel,
    sharedSel,
    repoSel,
    stashSel,
    DISPLAY,
    currentSel,
    typeOf,
    passFlags,
    filteredItems,
    updateStorageOptions,
    renderStatsChips,
    pillHtml,
    rebuildGameStash,
    updateCounts,
    render,
    initFilters,
    activeFilterCount,
    updateFilterBadge,
    resetFilters,
    showResult,
    switchTab,
    toggleSel,
    updateBulkBar,
    openDir,
    openSave,
    loadBytes,
    loadSingleD2S,
    handleLoadedFiles,
    extractDroppedFiles,
    IS_TAURI,
    tauriInvoke,
    initResourceBadge,
    initTauriSaveAutoLoad,
    openNativeSave,
    initApp
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  Object.assign(root, exportsObj);
})(typeof window !== 'undefined' ? window : globalThis);
