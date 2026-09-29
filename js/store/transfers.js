// Median XL WebRepo - 跨存储空间存取事务管理与批量转移引擎模块
(function(root) {
  'use strict';

  function showToast(msg, ok) {
    if (root.showToast) root.showToast(msg, ok);
    else console.log((ok === false ? '[FAIL] ' : '[OK] ') + msg);
  }

  function stripD2(s) {
    return root.stripD2 ? root.stripD2(s) : String(s || '');
  }

  /* ---- 存入云仓库（转移逻辑：仅内存暂存，点击【保存修改】后才真正写入磁盘） ---- */
  async function doStore() {
    const STATE = root.STATE || { tab: 'char' };
    const GAME_STASH = root.GAME_STASH;
    const REPO = root.getRepo ? root.getRepo() : (root.REPO || { items: [] });
    const SAVE = root.SAVE;
    const CURRENT = root.CURRENT;
    const personalSel = root.personalSel || new Set();
    const sharedSel = root.sharedSel || new Set();
    const charSel = root.charSel || new Set();

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 1. 个人仓库存入
    if (STATE.tab === 'personal') {
      const items = GAME_STASH.personal.filter(i => personalSel.has(i._stashIdx));
      if (!items.length) { showToast('未选中任何个人仓库物品', false); return; }
      try {
        let nextId = (root.getNextRepoId ? root.getNextRepoId() : (Math.max(0, ...REPO.items.map(x => x.id || 0)) + 1));
        for (const it of items) {
          const copy = JSON.parse(JSON.stringify(it, (k, v) => (k === 'raw' || k === '_parent') ? undefined : v));
          copy.locText = '云仓库 · ' + now;
          delete copy.gridPos; delete copy.rawStart; delete copy.rawEnd;
          const rawData = it.raw ? root.b64enc(it.raw) : '';
          const newId = nextId++;
          REPO.items.unshift({ id: newId, added: now, item: copy, data: rawData });
          root.addLog('store', '存入云仓库', it, '个人仓库', '本地云仓库');
        }
        root.repoSeq = nextId;

        if (GAME_STASH.personalBytes) {
          const newPersBytes = root.removeStashItemRanges(GAME_STASH.personalBytes, items);
          GAME_STASH.personalBytes = newPersBytes;
          GAME_STASH.personal = root.parseStashBytes(newPersBytes, '个人仓库').items;
          const charBase = (root.getCurCharName() || 'stash').toLowerCase();
          await root.saveStashToCache('stash_' + charBase, newPersBytes);
        } else {
          const toRem = new Set(items.map(i => i._stashIdx));
          GAME_STASH.personal = GAME_STASH.personal.filter(i => !toRem.has(i._stashIdx));
        }

        if (root.rebuildGameStash) root.rebuildGameStash();
        personalSel.clear();
        if (root.updateCounts) root.updateCounts();
        if (root.render) root.render();
        if (root.updateBulkBar) root.updateBulkBar();
        root.markUnsavedChanges(true);
        showToast('已成功将 ' + items.length + ' 件物品移入云仓（待保存），请核对后点击右上角【💾 保存修改】写盘生效！', true);
      } catch (e) {
        showToast('存入云仓库失败: ' + (e.message || e), false);
        console.error(e);
      }
      return;
    }

    // 2. 共享仓库存入
    if (STATE.tab === 'shared') {
      const items = GAME_STASH.shared.filter(i => sharedSel.has(i._stashIdx));
      if (!items.length) { showToast('未选中任何共享仓库物品', false); return; }
      try {
        let nextId = (root.getNextRepoId ? root.getNextRepoId() : (Math.max(0, ...REPO.items.map(x => x.id || 0)) + 1));
        for (const it of items) {
          const copy = JSON.parse(JSON.stringify(it, (k, v) => (k === 'raw' || k === '_parent') ? undefined : v));
          copy.locText = '云仓库 · ' + now;
          delete copy.gridPos; delete copy.rawStart; delete copy.rawEnd;
          const rawData = it.raw ? root.b64enc(it.raw) : '';
          const newId = nextId++;
          REPO.items.unshift({ id: newId, added: now, item: copy, data: rawData });
          root.addLog('store', '存入云仓库', it, '共享仓库', '本地云仓库');
        }
        root.repoSeq = nextId;

        if (GAME_STASH.sharedBytes) {
          const newSharedBytes = root.removeStashItemRanges(GAME_STASH.sharedBytes, items);
          GAME_STASH.sharedBytes = newSharedBytes;
          GAME_STASH.shared = root.parseStashBytes(newSharedBytes, '共享仓库').items;
          await root.saveStashToCache('shared', newSharedBytes);
        } else {
          const toRem = new Set(items.map(i => i._stashIdx));
          GAME_STASH.shared = GAME_STASH.shared.filter(i => !toRem.has(i._stashIdx));
        }

        if (root.rebuildGameStash) root.rebuildGameStash();
        sharedSel.clear();
        if (root.updateCounts) root.updateCounts();
        if (root.render) root.render();
        if (root.updateBulkBar) root.updateBulkBar();
        root.markUnsavedChanges(true);
        showToast('已成功将 ' + items.length + ' 件物品移入云仓（待保存），请核对后点击右上角【💾 保存修改】写盘生效！', true);
      } catch (e) {
        showToast('存入云仓库失败: ' + (e.message || e), false);
        console.error(e);
      }
      return;
    }

    // 3. 角色随身物品存入
    const items = (CURRENT ? CURRENT.items : []).filter(i => charSel.has(i._idx));
    if (!items.length) { showToast('未选中任何可存入的角色物品', false); return; }
    const nonChar = items.filter(i => i._sec !== 'char');
    if (nonChar.length) { showToast('佣兵/铁傀儡物品暂不支持存入', false); return; }
    try {
      let nextId = (root.getNextRepoId ? root.getNextRepoId() : (Math.max(0, ...REPO.items.map(x => x.id || 0)) + 1));
      for (const it of items) {
        const copy = JSON.parse(JSON.stringify(it, (k, v) => (k === 'raw' || k === '_parent') ? undefined : v));
        copy.locText = '云仓库 · ' + now;
        delete copy.gridPos; delete copy.rawStart; delete copy.rawEnd;
        const newId = nextId++;
        REPO.items.unshift({ id: newId, added: now, item: copy, data: root.b64enc(it.raw) });
        root.addLog('store', '存入云仓库', it, '角色随身背包', '本地云仓库');
      }
      root.repoSeq = nextId;

      const ranges = items.map(i => ({ start: i.rawStart, end: i.rawEnd })).sort((a, b) => a.start - b.start);
      const res = root.removeItemRanges(SAVE.bytes, SAVE.parsed.region, ranges);
      const v = root.verifySave(res.bytes);
      if (!v.ok) { showToast('位流验证失败，已中止: ' + (v.error || v.warnings), false); return; }

      SAVE.bytes = res.bytes;
      charSel.clear();
      if (root.loadBytes) root.loadBytes(res.bytes);
      if (root.updateCounts) root.updateCounts();
      root.markUnsavedChanges(true);
      showToast('已成功将 ' + items.length + ' 件物品移入云仓（待保存），请核对后点击右上角【💾 保存修改】写盘生效！', true);
    } catch (e) {
      showToast('存入云仓库失败: ' + (e.message || e), false);
      console.error(e);
    }
  }

  /* ---- 取回：云仓库 → 角色随身背包（仅内存暂存，点击【保存修改】后才真正写入磁盘） ---- */
  async function doRetrieve() {
    const REPO = root.getRepo ? root.getRepo() : (root.REPO || { items: [] });
    const repoSel = root.repoSel || new Set();
    const CURRENT = root.CURRENT;
    const SAVE = root.SAVE;

    const entries = REPO.items.filter(r => repoSel.has(r.id));
    if (!entries.length) { showToast('未选中任何物品', false); return; }
    if (!CURRENT) { showToast('请先打开角色存档以取回物品到背包', false); return; }
    try {
      const occupancy = new Set();
      for (const it of CURRENT.items) {
        if (!it.rawStart || it._sec !== 'char' || it._locRaw !== 0 || it._storRaw !== 1) continue;
        const bw = (it.base ? it.base.w : 1) || 1, bh = (it.base ? it.base.h : 1) || 1;
        for (let dy = 0; dy < bh; dy++) {
          for (let dx = 0; dx < bw; dx++) {
            occupancy.add((it.col + dx) + ',' + (it.row + dy));
          }
        }
      }
      const newItems = [];
      const maxCols = 15, maxRows = 10; // Median XL 背包为 15 列 x 10 行
      for (const e of entries) {
        if (!e.data) { showToast('物品缺少原始位流数据，无法取回: ' + stripD2(e.item.name || e.item.baseName), false); return; }
        const raw = root.b64dec(e.data);
        const w = (e.item.base ? e.item.base.w : 1) || 1, h = (e.item.base ? e.item.base.h : 1) || 1;
        let cell = null;
        for (let row = 0; row <= maxRows - h && !cell; row++) {
          for (let col = 0; col <= maxCols - w && !cell; col++) {
            let ok = true;
            for (let dy = 0; dy < h && ok; dy++) {
              for (let dx = 0; dx < w && ok; dx++) {
                if (occupancy.has((col + dx) + ',' + (row + dy))) ok = false;
              }
            }
            if (ok) cell = [col, row];
          }
        }
        if (!cell) {
          showToast('角色背包空间不足（需 ' + w + 'x' + h + ' 连续空间），无法放入 ' + stripD2(e.item.name || e.item.baseName) + '，请先整理角色背包或取回到个人/共享仓库！', false);
          return;
        }
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
            occupancy.add((cell[0] + dx) + ',' + (cell[1] + dy));
          }
        }
        newItems.push(root.patchItemPos(raw, e.item._bitOff || { loc: 42, we: 45, col: 49, row: 53, stor: 57 }, 0, 0, cell[0], cell[1], 1));
        root.addLog('retrieve_char', '取回至背包', e.item, '本地云仓库', '角色随身背包');
      }
      const res = root.insertItemBytes(SAVE.bytes, SAVE.parsed.region, newItems);
      const v = root.verifySave(res.bytes);
      if (!v.ok) { showToast('位流验证失败，已中止: ' + (v.error || v.warnings), false); return; }
      
      SAVE.bytes = res.bytes;
      REPO.items = REPO.items.filter(r => !repoSel.has(r.id));
      repoSel.clear();
      if (root.loadBytes) root.loadBytes(res.bytes);
      if (root.updateCounts) root.updateCounts();
      if (root.updateBulkBar) root.updateBulkBar();
      if (root.render) root.render();
      root.markUnsavedChanges(true);
      showToast('已成功将 ' + entries.length + ' 件物品取回至背包（待保存），请核对后点击右上角【💾 保存修改】写盘生效！', true);
    } catch (e) {
      showToast('取回失败: ' + (e.message || e), false);
      console.error(e);
    }
  }

  /* ---- 取回：云仓库 → 个人仓库 / 共享仓库（仅内存暂存，点击【保存修改】后才真正写入磁盘） ---- */
  async function doRetrieveToStash(targetType = 'personal') {
    const isShared = targetType === 'shared';
    const targetName = isShared ? '共享仓库' : '个人仓库';
    const REPO = root.getRepo ? root.getRepo() : (root.REPO || { items: [] });
    const repoSel = root.repoSel || new Set();
    const GAME_STASH = root.GAME_STASH;

    const entries = REPO.items.filter(r => repoSel.has(r.id));
    if (!entries.length) { showToast('未选中任何物品', false); return; }

    const charName = root.getCurCharName();
    if (!isShared && !charName && !GAME_STASH.personalBytes && !GAME_STASH.personal.length) {
      showToast('请先打开或选择角色，以确定要放入的个人仓库！', false);
      return;
    }

    try {
      let curBytes = isShared ? GAME_STASH.sharedBytes : GAME_STASH.personalBytes;
      if (!curBytes || !curBytes.length) {
        curBytes = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x53, 0x54, 0x41, 0x53, 0x48, 0x00, 0x00, 0x00, 0x00, 0x4a, 0x4d, 0x00, 0x00]);
      }

      for (const e of entries) {
        if (!e.data) { showToast('物品缺少原始位流数据，无法放入仓库: ' + stripD2(e.item.name || e.item.baseName), false); return; }
        const raw = root.b64dec(e.data);
        const w = (e.item.base ? e.item.base.w : 1) || 1;
        const h = (e.item.base ? e.item.base.h : 1) || 1;
        const curParsed = root.parseStashBytes(curBytes, targetName);

        const pageIndices = (curParsed.pages && curParsed.pages.length)
          ? curParsed.pages.map(p => p.pageIdx)
          : [...new Set(curParsed.items.map(i => i._stashPage))].sort((a, b) => a - b);
        if (!pageIndices.length) pageIndices.push(0);

        let placed = false;
        for (const pIdx of pageIndices) {
          const pageItems = curParsed.items.filter(i => i._stashPage === pIdx);
          const cell = root.freeStashCell(pageItems, w, h);
          if (cell) {
            const patched = root.patchItemPos(raw, e.item._bitOff || { loc: 42, we: 45, col: 49, row: 53, stor: 57 }, 0, 0, cell[0], cell[1], 5);
            curBytes = root.insertItemIntoStashBytes(curBytes, patched, pIdx);
            placed = true;
            break;
          }
        }

        if (!placed) {
          const newPIdx = pageIndices.length;
          const patched = root.patchItemPos(raw, e.item._bitOff || { loc: 42, we: 45, col: 49, row: 53, stor: 57 }, 0, 0, 0, 0, 5);
          curBytes = root.insertItemIntoStashBytes(curBytes, patched, newPIdx);
        }

        root.addLog(isShared ? 'retrieve_shared' : 'retrieve_personal', isShared ? '取回至共享仓库' : '取回至个人仓库', e.item, '本地云仓库', targetName);
      }

      if (isShared) {
        GAME_STASH.sharedBytes = curBytes;
        GAME_STASH.shared = root.parseStashBytes(curBytes, '共享仓库').items;
        await root.saveStashToCache('shared', curBytes);
      } else {
        GAME_STASH.personalBytes = curBytes;
        if (!GAME_STASH.personalFileName && charName) {
          GAME_STASH.personalFileName = charName.toLowerCase() + '.stash';
        }
        GAME_STASH.personal = root.parseStashBytes(curBytes, '个人仓库').items;
        const charBase = (charName || 'stash').toLowerCase();
        await root.saveStashToCache('stash_' + charBase, curBytes);
      }

      if (root.rebuildGameStash) root.rebuildGameStash();
      REPO.items = REPO.items.filter(r => !repoSel.has(r.id));
      repoSel.clear();

      if (root.updateCounts) root.updateCounts();
      if (root.render) root.render();
      if (root.updateBulkBar) root.updateBulkBar();
      root.markUnsavedChanges(true);
      showToast('已成功将 ' + entries.length + ' 件物品取回到' + targetName + '（待保存），请核对后点击右上角【💾 保存修改】写盘生效！', true);
    } catch (e) {
      showToast('取回到' + targetName + '失败: ' + (e.message || e), false);
      console.error(e);
    }
  }

  /* ============ 统一直接修改保存 (免下载覆盖，手动点击生效) ============ */
  async function saveAllToDisk(silent = false) {
    const SAVE = root.SAVE;
    const GAME_STASH = root.GAME_STASH;
    const OPERATION_LOGS = root.OPERATION_LOGS || [];

    try {
      let savedAny = false;
      if (SAVE.isNative && SAVE.dirPath) {
        if (SAVE.bytes && SAVE.fileName) {
          await root.nativeWriteBytes(SAVE.fileName, SAVE.bytes);
          savedAny = true;
        }
        if (GAME_STASH.personalBytes) {
          const charBase = (root.getCurCharName() || 'stash').toLowerCase();
          const stashFn = GAME_STASH.personalFileName || (charBase + '.stash');
          await root.nativeWriteBytes(stashFn, GAME_STASH.personalBytes);
          savedAny = true;
        }
        if (GAME_STASH.sharedBytes) {
          await root.nativeWriteBytes('_sharedstash.shared', GAME_STASH.sharedBytes);
          savedAny = true;
        }
        await root.writeRepo();
        if (OPERATION_LOGS.length) {
          await root.nativeWriteText('median_operation_log.json', JSON.stringify(OPERATION_LOGS, null, 2));
        }
        savedAny = true;
        root.markUnsavedChanges(false);

        if (!silent) {
          showToast('✅ 存档已直接修改并保存到本地（已自动生成带时间戳 .bak 备份）！', true);
        }
        if (typeof document !== 'undefined') {
          const btn = document.getElementById('btnSaveDirect');
          if (btn) {
            btn.textContent = '✅ 已保存最新修改';
            btn.classList.remove('pulse');
            setTimeout(() => { root.markUnsavedChanges(false); }, 2000);
          }
        }
        return true;
      } else if (SAVE.dir) {
        if (SAVE.bytes && SAVE.fileHandle) {
          const w = await SAVE.fileHandle.createWritable();
          await w.write(SAVE.bytes);
          await w.close();
        }
        await root.writeRepo();
        root.markUnsavedChanges(false);
        if (!silent) showToast('✅ 存档已直接覆写保存！', true);
        return true;
      } else {
        await root.writeRepo();
        root.markUnsavedChanges(false);
        if (!silent) showToast('当前为纯网页模式，若需直接免覆盖写盘请使用桌面端程序！', false);
        return false;
      }
    } catch (err) {
      console.error('saveAllToDisk 失败:', err);
      if (!silent) showToast('保存失败: ' + (err.message || err), false);
      return false;
    }
  }

  const exportsObj = {
    doStore,
    doRetrieve,
    doRetrieveToStash,
    saveAllToDisk
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  Object.assign(root, exportsObj);
})(typeof window !== 'undefined' ? window : globalThis);
