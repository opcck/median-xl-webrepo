// Median XL 官方同款类型树与多维胶囊筛选控制器 (Official Style Hierarchy & Facet Filter)
(function(root) {
  'use strict';

  const $ = id => (typeof document !== 'undefined' ? document.getElementById(id) : null);

  function esc(s) {
    return root.esc ? root.esc(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function stripD2(s) {
    return root.stripD2 ? root.stripD2(s) : String(s || '');
  }

  // 预设品质定义列表 (对齐官方 Global Shop)
  const QUALITY_DEFS = [
    { key: 'SSSU', label: '终极神圣暗金 (SSSU)', color: '#c084fc' },
    { key: 'SSU', label: '特级神圣暗金 (SSU)', color: '#f87171' },
    { key: 'SU', label: '神圣暗金 (SU)', color: '#fbbf24' },
    { key: 'TU', label: '普通暗金 (TU)', color: '#38bdf8' },
    { key: 'Set', label: '套装 (Set)', color: '#4ade80' },
    { key: 'RW', label: '符文之语 (RW)', color: '#facc15' },
    { key: 'Rare', label: '亮金 (Rare)', color: '#fef08a' },
    { key: 'Crafted', label: '手工 (Crafted)', color: '#fb923c' },
    { key: 'Magic', label: '魔法 (Magic)', color: '#60a5fa' },
    { key: 'Honorific', label: '名誉物品 (Honorific)', color: '#2dd4bf' },
    { key: 'Superior', label: '超强/特质 (Superior)', color: '#a3e635' },
    { key: 'Normal', label: '普通 (Normal)', color: '#e2e8f0' },
    { key: 'Unique', label: '其他暗金/首饰 (Unique)', color: '#e879f9' },
    { key: 'Charm', label: '护身符/符咒 (Charm)', color: '#f43f5e' },
    { key: 'Relic', label: '圣物 (Relic)', color: '#ec4899' },
    { key: 'Effigy', label: '塑像 (Effigy)', color: '#a78bfa' },
    { key: 'UMO', label: '独特秘境球 (UMO)', color: '#f472b6' },
    { key: 'SMO', label: '圣祠秘境球 (SMO)', color: '#fb7185' }
  ];

  // 内部筛选状态
  const STATE = {
    qualities: new Set(),
    typeNodes: new Set(),
    selectedCodes: new Set(),
    tiers: new Set(),
    conditions: new Set(),
    flags: {
      eth: 0,
      blessed: 0,
      corrupted: 0,
      luckied: 0,
      moed: 0,
      sock: 0,
      rw: 0
    },
    typeSearchText: ''
  };

  let nodeMap = new Map();
  let parentMap = new Map();
  let onChangeCallback = null;
  let isTreeBuilt = false;

  // 索引树结构
  function indexHierarchy(nodes, parent) {
    if (!nodes || !Array.isArray(nodes)) return;
    for (const node of nodes) {
      nodeMap.set(node.id, node);
      if (parent) {
        parentMap.set(node.id, parent);
      }
      if (node.children && node.children.length > 0) {
        indexHierarchy(node.children, node);
      }
    }
  }

  // 获取物品的代码 (3字符小写)
  function getItemCode(it) {
    if (!it) return '';
    return ((it.typeCode || it.code || '') + '').trim().toLowerCase();
  }

  // 判定物品属于哪个 Tier
  function getItemTier(it) {
    if (!it) return '__EMPTY__';
    const bName = stripD2(it.baseName || '');
    const code = getItemCode(it);

    if (bName.includes('神圣') || bName.includes('(Sacred)') || code.includes('@') || (it.base && it.base.sacred)) {
      return 'Sacred';
    }
    if (bName.includes('天使') || bName.includes('Angelic')) {
      return 'Angelic';
    }
    if (bName.includes('大师') || bName.includes('Mastercrafted')) {
      return 'Mastercrafted';
    }
    const m = bName.match(/\(([1-4])\)/);
    if (m) {
      return m[1];
    }
    if (it.tuTier && it.tuTier >= 1 && it.tuTier <= 4) {
      return String(it.tuTier);
    }
    return '__EMPTY__';
  }

  // 判定物品是否为特质 (Superior)
  function isItemSuperior(it) {
    if (!it) return false;
    if (it.quality === 3 || it.isSuperior) return true;
    const bName = stripD2(it.baseName || '');
    const name = stripD2(it.name || '');
    return bName.includes('超强') || name.includes('超强') || bName.includes('Superior') || name.includes('Superior');
  }

  // 判定物品匹配品质
  function matchesQuality(it, qKey) {
    if (!it) return false;
    const q = it.quality;
    const ut = it.uniqueTier;
    const code = getItemCode(it);
    const bName = stripD2(it.baseName || '');
    const name = stripD2(it.name || '');

    switch (qKey) {
      case 'SSSU':
        return q === 7 && ut === 'SSSU';
      case 'SSU':
        return q === 7 && ut === 'SSU';
      case 'SU':
        return q === 7 && ut === 'SU';
      case 'TU':
        return q === 7 && ut === 'TU';
      case 'Set':
        return q === 5;
      case 'RW':
        return !!(it.rw || it.runeword);
      case 'Rare':
        return q === 6;
      case 'Crafted':
        return q === 8;
      case 'Magic':
        return q === 4;
      case 'Honorific':
        return q === 9 || !!it.isHonorific || bName.includes('名誉') || name.includes('名誉') || bName.includes('Honorific');
      case 'Superior':
        return isItemSuperior(it);
      case 'Normal':
        return q === 1 || q === 2;
      case 'Unique':
        return q === 7 && !['SSSU', 'SSU', 'SU', 'TU'].includes(ut);
      case 'Charm':
        return ['cm1', 'cm2', 'cm3'].includes(code) || bName.includes('护身符') || bName.includes('Charm');
      case 'Relic':
        return bName.includes('圣物') || name.includes('圣物') || bName.includes('Relic');
      case 'Effigy':
        return bName.includes('塑像') || name.includes('塑像') || bName.includes('Effigy');
      case 'UMO':
        return bName.includes('独特秘境球') || name.includes('独特秘境球') || (code === 'umo') || (name.includes('秘境球') && q === 7);
      case 'SMO':
        return bName.includes('圣祠秘境球') || name.includes('圣祠秘境球') || (code === 'smo');
      default:
        return false;
    }
  }

  // 判定物品满足标志 (三态: 0=任意, 1=必须是, 2=必须否)
  function matchesFlags(it) {
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

  // 总判定入口：某个物品是否满足当前所有筛选
  function matchesItem(it) {
    if (!it) return false;

    // 1. 品质筛选 (OR 关系)
    if (STATE.qualities.size > 0) {
      let qMatch = false;
      for (const qKey of STATE.qualities) {
        if (matchesQuality(it, qKey)) {
          qMatch = true;
          break;
        }
      }
      if (!qMatch) return false;
    }

    // 2. 类型层级树筛选 (匹配 selectedCodes)
    if (STATE.selectedCodes.size > 0) {
      const code = getItemCode(it);
      if (!STATE.selectedCodes.has(code)) {
        return false;
      }
    }

    // 3. 阶级筛选 (OR 关系)
    if (STATE.tiers.size > 0) {
      const t = getItemTier(it);
      if (!STATE.tiers.has(t)) {
        return false;
      }
    }

    // 4. 特质筛选
    if (STATE.conditions.has('Superior')) {
      if (!isItemSuperior(it)) return false;
    }

    // 5. 标志三态筛选
    if (!matchesFlags(it)) return false;

    return true;
  }

  // 获取当前有效激活筛选条件计数
  function getActiveFilterCount() {
    let count = STATE.qualities.size + STATE.typeNodes.size + STATE.tiers.size + STATE.conditions.size;
    for (const k in STATE.flags) {
      if (STATE.flags[k] !== 0) count++;
    }
    return count;
  }

  // 更新总筛选徽标角标
  function updateBadge() {
    const badge = $('repository-view-filters-badge');
    if (!badge) return;
    const cnt = getActiveFilterCount();
    if (cnt > 0) {
      badge.textContent = cnt;
      badge.removeAttribute('hidden');
      badge.style.display = 'inline-flex';
    } else {
      badge.setAttribute('hidden', '');
      badge.style.display = 'none';
    }
  }

  // 构建品质面板 DOM
  function buildQualityPanel() {
    const wrap = $('repository-view-quality-options');
    if (!wrap) return;

    wrap.innerHTML = QUALITY_DEFS.map(q => `
      <label class="repository-tag-filter-option">
        <input type="checkbox" class="form-check-input" data-quality-key="${q.key}">
        <span class="repository-tag-filter-meta">
          <span class="repository-filter-option-copy">
            <span style="color:${q.color}">${esc(q.label)}</span>
          </span>
          <span class="repository-filter-option-count" data-quality-count="${q.key}">0</span>
        </span>
      </label>
    `).join('');

    wrap.querySelectorAll('input[data-quality-key]').forEach(cb => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.qualityKey;
        if (cb.checked) {
          STATE.qualities.add(key);
        } else {
          STATE.qualities.delete(key);
        }
        updateQualityClearBtn();
        notifyChange();
      });
    });

    const clearBtn = $('repository-view-quality-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        STATE.qualities.clear();
        wrap.querySelectorAll('input[data-quality-key]').forEach(cb => cb.checked = false);
        updateQualityClearBtn();
        notifyChange();
      });
    }
  }

  function updateQualityClearBtn() {
    const clearBtn = $('repository-view-quality-clear');
    if (clearBtn) {
      clearBtn.disabled = STATE.qualities.size === 0;
    }
  }

  // 构建类型层级树 DOM (基于 window.ITEM_HIERARCHY)
  function buildTypeTreeDOM() {
    const treeEl = $('repository-view-type-tree');
    if (!treeEl) return;
    const hierarchy = window.ITEM_HIERARCHY || [];
    if (!hierarchy.length) return;

    indexHierarchy(hierarchy, null);

    // 递归生成树 HTML 片段
    function renderNodeHTML(node) {
      const hasChildren = node.children && node.children.length > 0;
      const indentPx = (node.depth || 0) * 14;
      const isSpacerClass = hasChildren ? '' : ' is-spacer';
      const labelText = node.labelZh || node.labelEn;
      const titleAttr = (node.hasZh && node.labelZh !== node.labelEn) ? `${node.labelZh} (${node.labelEn})` : node.labelEn;

      let childrenHTML = '';
      if (hasChildren) {
        childrenHTML = `
          <div class="rtt-children" hidden>
            ${node.children.map(renderNodeHTML).join('')}
          </div>
        `;
      }

      return `
        <div class="rtt-node" data-id="${node.id}" data-depth="${node.depth}" style="--indent:${indentPx}px">
          <div class="rtt-row" role="treeitem">
            <button type="button" class="rtt-toggle${isSpacerClass}" aria-label="Expand ${esc(labelText)}" tabindex="${hasChildren ? 0 : -1}" aria-expanded="false"></button>
            <label class="rtt-check">
              <input type="checkbox" class="form-check-input" data-repository-type-node="${node.id}">
              <span class="rtt-label" title="${esc(titleAttr)}">${esc(labelText)}</span>
              <span class="rtt-count">0</span>
            </label>
          </div>
          ${childrenHTML}
        </div>
      `;
    }

    treeEl.innerHTML = hierarchy.map(renderNodeHTML).join('');
    bindTreeEvents(treeEl);
    isTreeBuilt = true;
  }

  // 绑定树事件 (展开/折叠、多选联动、搜索)
  function bindTreeEvents(treeEl) {
    // 1. 折叠展开事件委托
    treeEl.addEventListener('click', e => {
      const toggle = e.target.closest('.rtt-toggle');
      if (toggle && !toggle.classList.contains('is-spacer')) {
        e.preventDefault();
        e.stopPropagation();
        const nodeEl = toggle.closest('.rtt-node');
        const childrenEl = nodeEl ? nodeEl.querySelector('.rtt-children') : null;
        if (childrenEl) {
          const isCurrentlyHidden = childrenEl.hasAttribute('hidden');
          if (isCurrentlyHidden) {
            childrenEl.removeAttribute('hidden');
            toggle.setAttribute('aria-expanded', 'true');
          } else {
            childrenEl.setAttribute('hidden', '');
            toggle.setAttribute('aria-expanded', 'false');
          }
        }
      }
    });

    // 2. 复选框变更事件委托
    treeEl.addEventListener('change', e => {
      const cb = e.target.closest('input[data-repository-type-node]');
      if (!cb) return;

      const nodeId = cb.dataset.repositoryTypeNode;
      const isChecked = cb.checked;
      const nodeEl = cb.closest('.rtt-node');

      // 级联处理所有子孙 checkbox
      if (nodeEl) {
        nodeEl.querySelectorAll('input[data-repository-type-node]').forEach(childCb => {
          childCb.checked = isChecked;
          childCb.indeterminate = false;
        });
      }

      // 向上回溯父级，更新 indeterminate 或 checked
      updateParentCheckboxes(nodeId);

      // 汇总所有被选中的节点 codes
      recalculateSelectedCodes();
      updateTypeClearBtn();
      notifyChange();
    });

    // 3. 全部折叠按钮
    const collapseBtn = $('repository-view-type-tree-collapse');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        treeEl.querySelectorAll('.rtt-children').forEach(c => c.setAttribute('hidden', ''));
        treeEl.querySelectorAll('.rtt-toggle').forEach(t => t.setAttribute('aria-expanded', 'false'));
      });
    }

    // 4. 类型清空按钮
    const clearBtn = $('repository-view-type-tree-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        treeEl.querySelectorAll('input[data-repository-type-node]').forEach(cb => {
          cb.checked = false;
          cb.indeterminate = false;
        });
        STATE.typeNodes.clear();
        STATE.selectedCodes.clear();
        updateTypeClearBtn();
        notifyChange();
      });
    }

    // 5. 搜索过滤输入框 (中英双语即时过滤与展开)
    const searchInput = $('repository-view-type-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const kw = searchInput.value.trim().toLowerCase();
        STATE.typeSearchText = kw;
        filterTreeNodes(kw);
      });
    }
  }

  // 向上更新父节点 checkbox 状态
  function updateParentCheckboxes(nodeId) {
    let parent = parentMap.get(nodeId);
    while (parent) {
      const parentNodeEl = document.querySelector(`.rtt-node[data-id="${parent.id}"]`);
      if (parentNodeEl) {
        const parentCb = parentNodeEl.querySelector(`:scope > .rtt-row input[data-repository-type-node]`);
        const childrenContainer = parentNodeEl.querySelector(`:scope > .rtt-children`);
        if (parentCb && childrenContainer) {
          const directChildrenCbs = childrenContainer.querySelectorAll(`:scope > .rtt-node > .rtt-row input[data-repository-type-node]`);
          let allChecked = true;
          let noneChecked = true;
          let hasIndeterminate = false;

          directChildrenCbs.forEach(childCb => {
            if (childCb.indeterminate) {
              hasIndeterminate = true;
            }
            if (childCb.checked) {
              noneChecked = false;
            } else {
              allChecked = false;
            }
          });

          if (allChecked) {
            parentCb.checked = true;
            parentCb.indeterminate = false;
          } else if (noneChecked && !hasIndeterminate) {
            parentCb.checked = false;
            parentCb.indeterminate = false;
          } else {
            parentCb.checked = false;
            parentCb.indeterminate = true;
          }
        }
      }
      parent = parentMap.get(parent.id);
    }
  }

  // 重新汇聚选中的底材代码
  function recalculateSelectedCodes() {
    STATE.typeNodes.clear();
    STATE.selectedCodes.clear();

    const checkedBoxes = document.querySelectorAll('#repository-view-type-tree input[data-repository-type-node]:checked');
    checkedBoxes.forEach(cb => {
      const id = cb.dataset.repositoryTypeNode;
      STATE.typeNodes.add(id);
      const node = nodeMap.get(id);
      if (node && node.codes && Array.isArray(node.codes)) {
        node.codes.forEach(c => STATE.selectedCodes.add((c + '').trim().toLowerCase()));
      }
    });
  }

  function updateTypeClearBtn() {
    const clearBtn = $('repository-view-type-tree-clear');
    if (clearBtn) {
      clearBtn.disabled = STATE.typeNodes.size === 0;
    }
  }

  // 搜索树节点过滤
  function filterTreeNodes(kw) {
    const treeEl = $('repository-view-type-tree');
    if (!treeEl) return;

    if (!kw) {
      treeEl.querySelectorAll('.rtt-node').forEach(n => n.classList.remove('is-hidden'));
      treeEl.querySelectorAll('.rtt-label').forEach(lbl => {
        const id = lbl.closest('.rtt-node').dataset.id;
        const node = nodeMap.get(id);
        if (node) {
          lbl.textContent = node.labelZh || node.labelEn;
        }
      });
      treeEl.classList.remove('is-search-empty');
      return;
    }

    let matchCount = 0;
    const matchedNodeIds = new Set();
    const ancestorsToOpen = new Set();

    nodeMap.forEach((node, id) => {
      const zh = (node.labelZh || '').toLowerCase();
      const en = (node.labelEn || '').toLowerCase();
      if (zh.includes(kw) || en.includes(kw)) {
        matchedNodeIds.add(id);
        matchCount++;
        // 收集所有祖先节点以展开显示
        let p = parentMap.get(id);
        while (p) {
          ancestorsToOpen.add(p.id);
          p = parentMap.get(p.id);
        }
      }
    });

    treeEl.querySelectorAll('.rtt-node').forEach(nodeEl => {
      const id = nodeEl.dataset.id;
      const isMatched = matchedNodeIds.has(id);
      const isAncestor = ancestorsToOpen.has(id);

      if (isMatched || isAncestor) {
        nodeEl.classList.remove('is-hidden');
        if (isAncestor) {
          const childrenEl = nodeEl.querySelector(':scope > .rtt-children');
          const toggleEl = nodeEl.querySelector(':scope > .rtt-row .rtt-toggle');
          if (childrenEl) childrenEl.removeAttribute('hidden');
          if (toggleEl) toggleEl.setAttribute('aria-expanded', 'true');
        }
        // 高亮命中的文字
        if (isMatched) {
          const lbl = nodeEl.querySelector(':scope > .rtt-row .rtt-label');
          const node = nodeMap.get(id);
          if (lbl && node) {
            const text = node.labelZh || node.labelEn;
            const reg = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            lbl.innerHTML = esc(text).replace(reg, '<mark>$1</mark>');
          }
        }
      } else {
        nodeEl.classList.add('is-hidden');
      }
    });

    if (matchCount === 0) {
      treeEl.classList.add('is-search-empty');
    } else {
      treeEl.classList.remove('is-search-empty');
    }
  }

  // 绑定 Tier 与 Condition 药丸按钮
  function bindTierOptions() {
    const tierWrap = $('repository-view-tier-options');
    if (!tierWrap) return;

    tierWrap.querySelectorAll('.tier-btn[data-tier]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tier = btn.dataset.tier;
        const isOn = btn.classList.toggle('st-on');
        btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        if (isOn) {
          STATE.tiers.add(tier);
        } else {
          STATE.tiers.delete(tier);
        }
        notifyChange();
      });
    });

    tierWrap.querySelectorAll('.tier-btn[data-condition]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cond = btn.dataset.condition;
        const isOn = btn.classList.toggle('st-on');
        btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        if (isOn) {
          STATE.conditions.add(cond);
        } else {
          STATE.conditions.delete(cond);
        }
        notifyChange();
      });
    });
  }

  // 绑定 Flags 标志三态按钮
  function bindFlagOptions() {
    const flagWrap = document.querySelector('.repository-flag-filter-options');
    if (!flagWrap) return;

    flagWrap.querySelectorAll('.flag-btn[data-flag]').forEach(btn => {
      btn.addEventListener('click', () => {
        const flag = btn.dataset.flag;
        let cur = STATE.flags[flag] || 0;
        // 循环切换: 0 (任意) -> 1 (必须是) -> 2 (必须否) -> 0
        cur = (cur + 1) % 3;
        STATE.flags[flag] = cur;

        btn.classList.remove('st-any', 'st-yes', 'st-no');
        if (cur === 0) {
          btn.classList.add('st-any');
        } else if (cur === 1) {
          btn.classList.add('st-yes');
        } else {
          btn.classList.add('st-no');
        }

        updateFlagResetBtn();
        notifyChange();
      });
    });

    const resetBtn = $('repository-view-flag-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        for (const k in STATE.flags) {
          STATE.flags[k] = 0;
        }
        flagWrap.querySelectorAll('.flag-btn[data-flag]').forEach(b => {
          b.classList.remove('st-yes', 'st-no');
          b.classList.add('st-any');
        });
        updateFlagResetBtn();
        notifyChange();
      });
    }
  }

  function updateFlagResetBtn() {
    const resetBtn = $('repository-view-flag-reset');
    if (!resetBtn) return;
    let anyActive = false;
    for (const k in STATE.flags) {
      if (STATE.flags[k] !== 0) {
        anyActive = true;
        break;
      }
    }
    resetBtn.disabled = !anyActive;
  }

  // 绑定互斥弹窗交互与点击外部自动收起
  function bindPopoverExclusivity() {
    const wrap = $('repository-view-filters-wrap');
    if (!wrap) return;

    const subDetails = wrap.querySelectorAll('.repository-group-panel > details.repository-tag-filter');

    // 外层 wrap 收起时，重置子 details 展开状态
    wrap.addEventListener('toggle', () => {
      if (!wrap.open) {
        subDetails.forEach(d => d.removeAttribute('open'));
      }
    });

    // 点击某一个子 details 时收起其他子 details
    subDetails.forEach(d => {
      d.addEventListener('toggle', () => {
        if (d.open) {
          subDetails.forEach(other => {
            if (other !== d && other.open) {
              other.removeAttribute('open');
            }
          });
        }
      });
    });

    // 点击页面空白处收起外层 wrap 以及所有子 details
    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) {
        subDetails.forEach(d => d.removeAttribute('open'));
        wrap.removeAttribute('open');
      }
    });

    // 绑定总清除按钮 Ⓧ
    const clearAllBtn = $('repository-view-clear-filters');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        resetAllFilters();
      });
    }
  }

  // 重置全部筛选条件
  function resetAllFilters() {
    // 1. 重置品质
    STATE.qualities.clear();
    const qWrap = $('repository-view-quality-options');
    if (qWrap) qWrap.querySelectorAll('input').forEach(cb => cb.checked = false);
    updateQualityClearBtn();

    // 2. 重置类型树
    STATE.typeNodes.clear();
    STATE.selectedCodes.clear();
    const treeEl = $('repository-view-type-tree');
    if (treeEl) {
      treeEl.querySelectorAll('input').forEach(cb => {
        cb.checked = false;
        cb.indeterminate = false;
      });
    }
    updateTypeClearBtn();

    // 3. 重置药丸
    STATE.tiers.clear();
    STATE.conditions.clear();
    const tierWrap = $('repository-view-tier-options');
    if (tierWrap) {
      tierWrap.querySelectorAll('.tier-btn').forEach(btn => {
        btn.classList.remove('st-on');
        btn.setAttribute('aria-pressed', 'false');
      });
    }

    // 4. 重置标志
    for (const k in STATE.flags) {
      STATE.flags[k] = 0;
    }
    document.querySelectorAll('.repository-flag-filter-options .flag-btn').forEach(btn => {
      btn.classList.remove('st-yes', 'st-no');
      btn.classList.add('st-any');
    });
    updateFlagResetBtn();

    // 5. 重置搜索框
    const searchInput = $('repository-view-type-search');
    if (searchInput) {
      searchInput.value = '';
      filterTreeNodes('');
    }

    notifyChange();
  }

  // 触发全局通知
  function notifyChange() {
    updateBadge();
    if (typeof onChangeCallback === 'function') {
      onChangeCallback();
    }
  }

  // 动态 Facet 统计更新 (传入当前 Tab 模式下的所有全量物品)
  function updateCounts(items) {
    if (!items || !Array.isArray(items)) items = [];

    // 1. 品质数量统计
    const qCounts = new Map();
    QUALITY_DEFS.forEach(q => qCounts.set(q.key, 0));
    for (const it of items) {
      for (const q of QUALITY_DEFS) {
        if (matchesQuality(it, q.key)) {
          qCounts.set(q.key, (qCounts.get(q.key) || 0) + 1);
        }
      }
    }
    QUALITY_DEFS.forEach(q => {
      const el = document.querySelector(`.repository-filter-option-count[data-quality-count="${q.key}"]`);
      if (el) {
        const cnt = qCounts.get(q.key) || 0;
        el.textContent = cnt.toLocaleString('en-US');
      }
    });

    // 2. Tier 与 Condition 药丸数量统计
    const tierCounts = {
      'Sacred': 0, 'Angelic': 0, 'Mastercrafted': 0,
      '1': 0, '2': 0, '3': 0, '4': 0, '__EMPTY__': 0,
      'Superior': 0
    };
    for (const it of items) {
      const t = getItemTier(it);
      if (tierCounts[t] !== undefined) {
        tierCounts[t]++;
      }
      if (isItemSuperior(it)) {
        tierCounts['Superior']++;
      }
    }
    for (const t in tierCounts) {
      const btn = document.querySelector(`.tier-btn[data-tier="${t}"], .tier-btn[data-condition="${t}"]`);
      if (btn) {
        const countSpan = btn.querySelector('.n');
        const cnt = tierCounts[t] || 0;
        if (countSpan) countSpan.textContent = cnt.toLocaleString('en-US');
        if (cnt === 0) {
          btn.classList.add('is-empty');
        } else {
          btn.classList.remove('is-empty');
        }
      }
    }

    // 3. 类型层级树数量统计
    // 快速生成 item code 频次表
    const codeFreq = new Map();
    for (const it of items) {
      const code = getItemCode(it);
      if (code) {
        codeFreq.set(code, (codeFreq.get(code) || 0) + 1);
      }
    }

    // 递归计算每个节点的物品频次
    function calcNodeCount(node) {
      let total = 0;
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          total += calcNodeCount(child);
        }
      } else if (node.codes && Array.isArray(node.codes)) {
        for (const c of node.codes) {
          const lcode = (c + '').trim().toLowerCase();
          total += (codeFreq.get(lcode) || 0);
        }
      }

      // 更新 DOM 中的 count
      const nodeEl = document.querySelector(`.rtt-node[data-id="${node.id}"]`);
      if (nodeEl) {
        const countEl = nodeEl.querySelector(':scope > .rtt-row .rtt-count');
        if (countEl) {
          countEl.textContent = total.toLocaleString('en-US');
        }
        if (total === 0) {
          nodeEl.classList.add('is-empty');
        } else {
          nodeEl.classList.remove('is-empty');
        }
      }

      return total;
    }

    const hierarchy = window.ITEM_HIERARCHY || [];
    for (const rootNode of hierarchy) {
      calcNodeCount(rootNode);
    }
  }

  // 模块初始化入口
  function init(onChange) {
    if (onChange) onChangeCallback = onChange;
    if (isTreeBuilt) return;
    buildQualityPanel();
    buildTypeTreeDOM();
    bindTierOptions();
    bindFlagOptions();
    bindPopoverExclusivity();
    updateBadge();
  }

  const FILTER_TREE = {
    STATE,
    init,
    matchesItem,
    updateCounts,
    resetAllFilters,
    getActiveFilterCount,
    updateBadge,
    getItemTier,
    isItemSuperior,
    matchesQuality
  };

  root.FILTER_TREE = FILTER_TREE;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FILTER_TREE;
  }
})(typeof window !== 'undefined' ? window : globalThis);
