// Median XL WebRepo - 悬浮窗卡片渲染、自适应视口定位与交互模块
(function(root) {
  'use strict';

  let POPUP_ITEM = null;
  let POPUP_TIMER = null;
  let POPUP_CURRENT_EL = null;
  let POPUP_INITED = false;

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
    if ((it.quality === 7 || it.quality === 5) && it.setOrUniqueId !== undefined && (!it.uniqueDef && !it.setDef || it.name === it.baseName)) {
      const ed = getEngineData();
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

  function getEngineData() {
    return (root && root.ENGINE_DATA) || (typeof global !== 'undefined' && global.ENGINE_DATA) || null;
  }

  function getDataTables() {
    return (root && root.DATA_TABLES) || (typeof global !== 'undefined' && global.DATA_TABLES) || { props: {}, items: {}, skills: {}, monsters: {} };
  }

  function popupHtml(it) {
    const qcMap = root.QUALITY_CLASS || {};
    const qzhMap = root.QUALITY_ZH || {};
    const qenMap = root.QUALITY_EN || {};
    const PROP = root.PROP || {};
    const qc = qcMap[it.quality] || 'q-normal';
    const qzh = qzhMap[it.quality] || '', qen = qenMap[it.quality] || '';
    const base = it.base || {};
    let h = '';

    // 1. 物品名称行（含图标）
    const icon = root.iconSrc ? root.iconSrc(it) : null;
    h += '<div style="display:flex;align-items:flex-start;gap:10px">';
    if (icon) h += '<img src="' + icon + '" style="width:44px;height:44px;image-rendering:pixelated;background:#0d0f14;border-radius:4px;flex-shrink:0;margin-top:2px">';
    h += '<div style="flex:1;min-width:0">';
    let titleName = displayName(it);
    if (it.setCode) titleName += ' ' + it.setCode;

    let tierBadge = '';
    if (it.quality === 7) {
      if (it.uniqueTier === 'SU') {
        tierBadge = ' <span class="badge-unique-tier tier-su" style="background:#b45309;color:#fff;padding:1px 5px;border-radius:3px;font-size:11px;font-weight:bold;margin-left:4px;vertical-align:middle;display:inline-block">SU</span>';
      } else if (it.uniqueTier === 'SSU') {
        tierBadge = ' <span class="badge-unique-tier tier-ssu" style="background:#dc2626;color:#fff;padding:1px 5px;border-radius:3px;font-size:11px;font-weight:bold;margin-left:4px;vertical-align:middle;display:inline-block">SSU</span>';
      } else if (it.uniqueTier === 'SSSU') {
        tierBadge = ' <span class="badge-unique-tier tier-sssu" style="background:#7c3aed;color:#fff;padding:1px 5px;border-radius:3px;font-size:11px;font-weight:bold;margin-left:4px;vertical-align:middle;display:inline-block">SSSU</span>';
      } else if (it.uniqueTier === 'TU') {
        const tNum = it.tuTier || (it.baseName ? (it.baseName.match(/\(([1-4])\)/) || [])[1] : '') || '';
        tierBadge = ' <span class="badge-unique-tier tier-tu" style="background:#0284c7;color:#fff;padding:1px 5px;border-radius:3px;font-size:11px;font-weight:bold;margin-left:4px;vertical-align:middle;display:inline-block">TU' + tNum + '</span>';
      }
    }

    h += '<div class="pname ' + qc + '"><span style="float:right"><button class="copybtn" data-copy="1">🔖 复制全部</button></span>' + d2Colorize(titleName) + tierBadge + '</div>';

    // 2. 元信息行: 品质: 套装 (set) | 代码: [amu] | GUID: 0x09423DD5 | 尺寸: 1x1
    const metaParts = [];
    if (it.quality === 7) {
      if (it.uniqueTier === 'SU') metaParts.push('品质: 神圣暗金 [SU] (Sacred Unique)');
      else if (it.uniqueTier === 'SSU') metaParts.push('品质: 特级神圣暗金 [SSU] (Super Sacred Unique)');
      else if (it.uniqueTier === 'SSSU') metaParts.push('品质: 终极神圣暗金 [SSSU] (Secret Super Sacred Unique)');
      else if (it.uniqueTier === 'TU') metaParts.push('品质: 普通暗金 [TU' + (it.tuTier || '') + '] (Tiered Unique)');
      else if (it.uniqueTier === 'Jewelry') metaParts.push('品质: 暗金首饰 (Unique Jewelry)');
      else if (qzh) metaParts.push('品质: ' + qzh + ' (' + qen + ')');
    } else if (qzh) {
      metaParts.push('品质: ' + qzh + ' (' + qen + ')');
    }
    metaParts.push('代码: [' + esc(it.typeCode) + ']');
    if (it.guid !== undefined) metaParts.push('GUID: 0x' + (it.guid >>> 0).toString(16).toUpperCase().padStart(8, '0'));
    metaParts.push('尺寸: ' + (base.w || 1) + 'x' + (base.h || 1));
    h += '<div class="pmeta">' + metaParts.join(' | ') + '</div>';
    h += '</div></div>';

    // 3. 物品等级
    if (it.ilvl !== undefined) h += '<div class="prow">物品等级 (iLvl): ' + it.ilvl + '</div>';

    // 4. 基础物品行（含品质标注与阶）
    const tierM = stripD2(it.baseName).match(/\((\d)\)/);
    const tier = tierM ? tierM[1] : null;
    let baseLine = esc(stripD2(it.baseName));
    let badges = '';
    if (it.rw) badges += ' [符文之语] (runeword)';
    if (it.quality === 7) {
      if (it.uniqueTier === 'SU') badges += ' [神圣暗金 SU]';
      else if (it.uniqueTier === 'SSU') badges += ' [特级神圣暗金 SSU]';
      else if (it.uniqueTier === 'SSSU') badges += ' [终极神圣暗金 SSSU]';
      else if (it.uniqueTier === 'TU') badges += ' [普通暗金 TU' + (it.tuTier || tier || '') + ']';
      else if (qzh) badges += ' [' + qzh + '] (' + qen + ')';
    } else if (qzh) {
      badges += ' [' + qzh + '] (' + qen + ')';
    }
    if (tier && it.uniqueTier !== 'TU') badges += ' [' + tier + '阶] (Tier ' + tier + ')';
    h += '<div class="prow ' + qc + '">' + baseLine + esc(badges) + '</div>';

    if (base.desc && root.formatItemDesc) {
      h += '<div class="pdesc">' + root.formatItemDesc(base.desc) + '</div>';
    }

    // 5. 职业限制
    const clsR = root.classRestriction ? root.classRestriction(it) : null;
    if (clsR) h += '<div class="prow p-req-class" style="color:#fbbf24">(仅限' + clsR[0] + ' / ' + clsR[1] + ' Only)</div>';

    // 6. 需求等级与属性
    const rlvl = (it.setDef && it.setDef.rlvl) || (it.uniqueDef && it.uniqueDef.rlvl) || base.rlvl || 0;
    if (base.rstr) h += '<div class="prow">需要力量: ' + base.rstr + '</div>';
    if (rlvl) h += '<div class="prow">需要等级: ' + rlvl + '</div>';
    if (it.defense !== undefined) {
      const ed = it.props ? (it.props.find(x => x.id === PROP.ED) || {}).value : 0;
      let dstr = String(it.defense);
      if (ed && ed > 0) dstr += ' (' + Math.round(it.defense * 100 / (100 + ed)) + ')';
      h += '<div class="prow">防御: ' + dstr + '</div>';
    }
    if (it.durability) h += '<div class="prow">耐久度: ' + it.durability + '</div>';
    if (it.socketed) {
      h += '<div class="prow">镶嵌: (' + (it.socketsTotal || 0) + ')' + (it.socketables && it.socketables.length ? '，已插入: (' + it.socketables.length + ')' : '') + '</div>';
    }

    // 7. 专属魔法属性
    const lines = root.displayPropsList ? root.displayPropsList(it.props || []) : [];
    if (lines.length) {
      h += '<hr class="pdiv"><div class="psec-title">--- 属性 ---</div>';
      h += '<div class="pprops">' + lines.map(l => {
        const neg = /^\s*[-−]/.test(l.text) || /-\d/.test(l.text);
        return '<div class="prop' + (neg ? ' neg' : '') + '">' + esc(l.text) + '</div>';
      }).join('') + '</div>';
    }

    // 8. 套装全套奖励 (全套，默认折叠)
    const ed = getEngineData();
    const dt = getDataTables();
    if (it.quality === 5 && it.setDef && it.setDef.key && ed && ed.getFullSetBonusLines) {
      const fullSetLines = ed.getFullSetBonusLines(it.setDef.key, dt);
      if (fullSetLines && fullSetLines.length) {
        h += '<hr class="pdiv">';
        h += '<div class="p-collapsible">' +
               '<button type="button" class="p-collapse-btn q-set">' +
                 '<span>🌿 套装全套属性奖励 (' + fullSetLines.length + '条)</span>' +
                 '<span class="p-collapse-hint">点击展开 <span class="p-collapse-icon">▶</span></span>' +
               '</button>' +
               '<div class="p-collapse-content">' +
                 '<div class="pprops q-set-props" style="margin-top:0">' +
                   fullSetLines.map(l => '<div class="prop prop-set">' + esc(l) + '</div>').join('') +
                 '</div>' +
               '</div>' +
             '</div>';
      }
    }

    // 9. 镶嵌物明细 (默认折叠)
    if (it.socketables && it.socketables.length) {
      h += '<hr class="pdiv">';
      h += '<div class="p-collapsible">' +
             '<button type="button" class="p-collapse-btn">' +
               '<span>🔩 镶嵌物明细 (已镶嵌 ' + it.socketables.length + ' 孔)</span>' +
               '<span class="p-collapse-hint">点击展开 <span class="p-collapse-icon">▶</span></span>' +
             '</button>' +
             '<div class="p-collapse-content">' +
               it.socketables.map((s, idx) => {
                 const sName = stripD2(displayName(s));
                 const sProps = (s.props && s.props.length && root.displayPropsList) ? root.displayPropsList(s.props) : [];
                 let sHtml = '<div style="margin-bottom:6px;line-height:1.4">' +
                   '<div style="color:#cbd5e1;font-weight:600">• 第 ' + (idx + 1) + ' 孔: ' + esc(sName) + '</div>';
                 if (sProps.length) {
                   sHtml += '<div style="padding-left:14px;margin-top:2px">' +
                     sProps.map(p => '<div style="color:#93c5fd;font-size:11px">' + esc(p.text) + '</div>').join('') +
                     '</div>';
                 }
                 sHtml += '</div>';
                 return sHtml;
               }).join('') +
             '</div>' +
           '</div>';
    }
    return h;
  }

  function popupText(it) {
    const qzhMap = root.QUALITY_ZH || {};
    const qenMap = root.QUALITY_EN || {};
    const qzh = qzhMap[it.quality] || '', qen = qenMap[it.quality] || '';
    const base = it.base || {};
    const out = [];

    let titleName = stripD2(displayName(it));
    if (it.setCode) titleName += ' ' + it.setCode;
    if (it.quality === 7 && it.uniqueTier) {
      if (it.uniqueTier === 'TU') {
        const tNum = it.tuTier || (it.baseName ? (it.baseName.match(/\(([1-4])\)/) || [])[1] : '') || '';
        titleName += ' [TU' + tNum + ']';
      } else {
        titleName += ' [' + it.uniqueTier + ']';
      }
    }
    out.push(titleName);

    const metaParts = [];
    if (it.quality === 7) {
      if (it.uniqueTier === 'SU') metaParts.push('品质: 神圣暗金 [SU] (Sacred Unique)');
      else if (it.uniqueTier === 'SSU') metaParts.push('品质: 特级神圣暗金 [SSU] (Super Sacred Unique)');
      else if (it.uniqueTier === 'SSSU') metaParts.push('品质: 终极神圣暗金 [SSSU] (Secret Super Sacred Unique)');
      else if (it.uniqueTier === 'TU') metaParts.push('品质: 普通暗金 [TU' + (it.tuTier || '') + '] (Tiered Unique)');
      else if (it.uniqueTier === 'Jewelry') metaParts.push('品质: 暗金首饰 (Unique Jewelry)');
      else if (qzh) metaParts.push('品质: ' + qzh + ' (' + qen + ')');
    } else if (qzh) {
      metaParts.push('品质: ' + qzh + ' (' + qen + ')');
    }
    metaParts.push('代码: [' + it.typeCode + ']');
    if (it.guid !== undefined) metaParts.push('GUID: 0x' + (it.guid >>> 0).toString(16).toUpperCase().padStart(8, '0'));
    metaParts.push('尺寸: ' + (base.w || 1) + 'x' + (base.h || 1));
    out.push(metaParts.join(' | '));

    if (it.ilvl !== undefined) out.push('物品等级 (iLvl): ' + it.ilvl);

    let baseLine = stripD2(it.baseName);
    if (it.rw) baseLine += ' [符文之语] (runeword)';
    if (it.quality === 7) {
      if (it.uniqueTier === 'SU') baseLine += ' [神圣暗金 SU]';
      else if (it.uniqueTier === 'SSU') baseLine += ' [特级神圣暗金 SSU]';
      else if (it.uniqueTier === 'SSSU') baseLine += ' [终极神圣暗金 SSSU]';
      else if (it.uniqueTier === 'TU') baseLine += ' [普通暗金 TU' + (it.tuTier || (baseLine.match(/\((\d)\)/) || [])[1] || '') + ']';
      else if (qzh) baseLine += ' [' + qzh + '] (' + qen + ')';
    } else if (qzh) {
      baseLine += ' [' + qzh + '] (' + qen + ')';
    }
    const tierM = baseLine.match(/\((\d)\)/);
    if (tierM && it.uniqueTier !== 'TU') baseLine += ' [' + tierM[1] + '阶] (Tier ' + tierM[1] + ')';
    out.push(baseLine);

    const clsR = root.classRestriction ? root.classRestriction(it) : null;
    if (clsR) out.push('(仅限' + clsR[0] + ' / ' + clsR[1] + ' Only)');

    const rlvl = (it.setDef && it.setDef.rlvl) || (it.uniqueDef && it.uniqueDef.rlvl) || base.rlvl || 0;
    if (base.rstr) out.push('需要力量: ' + base.rstr);
    if (rlvl) out.push('需要等级: ' + rlvl);
    if (it.defense !== undefined) out.push('防御: ' + it.defense);
    if (it.durability) out.push('耐久度: ' + it.durability);

    const lines = root.displayPropsList ? root.displayPropsList(it.props || []) : [];
    if (lines.length) {
      out.push('--- 属性 ---');
      lines.forEach(l => out.push(l.text));
    }

    const ed = getEngineData();
    const dt = getDataTables();
    if (it.quality === 5 && it.setDef && it.setDef.key && ed && ed.getFullSetBonusLines) {
      const fullSetLines = ed.getFullSetBonusLines(it.setDef.key, dt);
      if (fullSetLines && fullSetLines.length) {
        out.push('--- 套装奖励 (全套) ---');
        fullSetLines.forEach(l => out.push(l));
      }
    }

    if (it.socketables && it.socketables.length) {
      out.push('--- 🔩 镶嵌物 (Socketables: ' + it.socketables.length + ') ---');
      it.socketables.forEach(s => out.push('• ' + stripD2(displayName(s))));
    }

    return out.join('\n');
  }

  function positionPopup(el) {
    const popup = $('popup');
    if (!popup || !el) return;
    const targetRect = el.getBoundingClientRect();
    const r = popup.getBoundingClientRect();
    const margin = 10;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    // 1. 水平定位：优先在物品元素右侧，若超出右边缘则放在左侧
    let x = targetRect.right + margin;
    if (x + r.width > winW - margin) {
      x = targetRect.left - r.width - margin;
    }
    if (x < margin) {
      x = Math.max(margin, Math.min(winW - r.width - margin, targetRect.left));
    }

    // 2. 垂直定位：优先与物品顶部对齐，若底部超出视口则向上自适应
    let y = targetRect.top;
    if (y + r.height > winH - margin) {
      y = Math.max(margin, winH - r.height - margin);
    }
    if (y < margin) y = margin;

    popup.style.left = Math.round(x) + 'px';
    popup.style.top = Math.round(y) + 'px';
  }

  function initPopupEventsOnce() {
    if (POPUP_INITED) return;
    const popup = $('popup');
    if (!popup) return;
    POPUP_INITED = true;

    // 鼠标移入悬浮窗自身：清除定时器，悬浮窗固定保持显示
    popup.addEventListener('mouseenter', () => {
      if (POPUP_TIMER) {
        clearTimeout(POPUP_TIMER);
        POPUP_TIMER = null;
      }
    });

    // 鼠标移出悬浮窗自身：延迟关闭
    popup.addEventListener('mouseleave', () => {
      if (POPUP_TIMER) clearTimeout(POPUP_TIMER);
      POPUP_TIMER = setTimeout(() => {
        popup.style.display = 'none';
        POPUP_ITEM = null;
        POPUP_CURRENT_EL = null;
      }, 250);
    });

    // 悬浮窗内部点击委托：折叠展开与复制全部
    popup.addEventListener('click', (e) => {
      const collapseBtn = e.target.closest('.p-collapse-btn');
      if (collapseBtn) {
        e.stopPropagation();
        const parent = collapseBtn.closest('.p-collapsible');
        const content = parent ? parent.querySelector('.p-collapse-content') : null;
        if (content) {
          const isExp = content.classList.toggle('expanded');
          collapseBtn.classList.toggle('expanded', isExp);
          const hint = collapseBtn.querySelector('.p-collapse-hint');
          if (hint) {
            hint.innerHTML = isExp
              ? '点击收起 <span class="p-collapse-icon">▼</span>'
              : '点击展开 <span class="p-collapse-icon">▶</span>';
          }
          if (POPUP_CURRENT_EL) {
            positionPopup(POPUP_CURRENT_EL);
          }
        }
        return;
      }

      const copyBtn = e.target.closest('.copybtn');
      if (copyBtn && POPUP_ITEM) {
        e.stopPropagation();
        const text = popupText(POPUP_ITEM);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = '✅ 已复制!';
            setTimeout(() => { copyBtn.textContent = '🔖 复制全部'; }, 1500);
            if (root.showToast) root.showToast('✅ 物品全属性已复制到剪贴板！', true);
          }).catch(() => {
            if (root.showToast) root.showToast('复制失败，请手动选择复制', false);
          });
        }
        return;
      }
    });
  }

  function bindPopups(selector) {
    initPopupEventsOnce();
    const popup = $('popup');
    const DISPLAY = root.DISPLAY || [];
    const itemMap = new Map(DISPLAY.map(d => [d._idx, d]));

    document.querySelectorAll(selector).forEach(el => {
      const it = itemMap.get(+el.dataset.idx);
      if (!it) return;

      // 点击选择物品
      el.addEventListener('click', () => {
        if (el.classList.contains('locked')) {
          if (root.showToast) root.showToast('佣兵/铁傀儡物品暂不支持存入仓库', false);
          return;
        }
        const key = Number(el.dataset.selkey);
        const sel = root.currentSel ? root.currentSel() : (root.charSel || new Set());
        if (sel.has(key)) {
          sel.delete(key);
          el.classList.remove('selected');
        } else {
          sel.add(key);
          el.classList.add('selected');
        }
        if (root.updateBulkBar) root.updateBulkBar();
        if (root.renderStatsChips) root.renderStatsChips();
      });

      // 鼠标移入物品元素：固定位置弹出，绝不跟随鼠标移动
      el.addEventListener('mouseenter', () => {
        if (POPUP_TIMER) {
          clearTimeout(POPUP_TIMER);
          POPUP_TIMER = null;
        }
        if (POPUP_CURRENT_EL === el && popup && popup.style.display === 'block') {
          return;
        }
        POPUP_CURRENT_EL = el;
        POPUP_ITEM = it;
        if (popup) {
          popup.innerHTML = popupHtml(it);
          popup.style.display = 'block';
          positionPopup(el);
        }
      });

      // 鼠标离开物品元素：延迟 250ms 隐藏
      el.addEventListener('mouseleave', () => {
        if (POPUP_TIMER) clearTimeout(POPUP_TIMER);
        POPUP_TIMER = setTimeout(() => {
          if (popup) popup.style.display = 'none';
          POPUP_ITEM = null;
          POPUP_CURRENT_EL = null;
        }, 250);
      });
    });
  }

  const exportsObj = {
    popupHtml,
    popupText,
    positionPopup,
    initPopupEventsOnce,
    bindPopups
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  Object.assign(root, exportsObj);
})(typeof window !== 'undefined' ? window : globalThis);
