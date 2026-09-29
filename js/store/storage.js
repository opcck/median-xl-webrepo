// Median XL WebRepo - 本地云仓库、IndexedDB 缓存与审计日志存储模块
(function(root) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function stripD2(s) {
    return root.stripD2 ? root.stripD2(s) : String(s || '').replace(/ÿc[0-9:+;,\-]/g, '').replace(/\\[a-z]+;/g, '').replace(/\\n/g, ' · ');
  }

  function displayName(it) {
    if (root.displayName) return root.displayName(it);
    let n = (it && (it.name || it.baseName)) || '未知物品';
    if (it && it.persName) n = it.persName + '的' + n;
    return n;
  }

  /* ============ 全局存储上下文与状态 ============ */
  let CURRENT = null;
  let CHAR = null;

  const SAVE = {
    dir: null,
    dirPath: '',
    isNative: false,
    fileHandle: null,
    fileName: '',
    bytes: null,
    parsed: null,
    backedUp: false
  };

  let GAME_STASH = {
    items: [],
    personal: [],
    shared: [],
    personalBytes: null,
    sharedBytes: null,
    personalFileName: '',
    sharedFileName: '_sharedstash.shared'
  };

  let REPO = { items: [] };
  const REPO_FILE = 'repository.mxlrepo.json';
  let repoSeq = 1;

  function getRepo() {
    if (!root.REPO || typeof root.REPO !== 'object' || !Array.isArray(root.REPO.items)) {
      root.REPO = REPO;
    }
    return root.REPO;
  }

  function hydrateRepoItems(repoObj) {
    if (!repoObj || !Array.isArray(repoObj.items)) return false;
    const ed = (typeof ENGINE_DATA !== 'undefined' ? ENGINE_DATA : (root.ENGINE_DATA || (typeof global !== 'undefined' ? global.ENGINE_DATA : null)));
    if (!ed) return false;

    let modified = false;
    for (const entry of repoObj.items) {
      const it = entry && entry.item;
      if (!it) continue;

      // 1. 暗金物品自愈补全
      if (it.quality === 7 && it.setOrUniqueId !== undefined) {
        if (!it.uniqueDef || it.name === it.baseName) {
          const u = ed.getUnique ? ed.getUnique(it.setOrUniqueId) : null;
          if (u && (u.zhName || u.name)) {
            it.uniqueDef = u;
            it.name = u.zhName || u.name;
            if (u.uniqueTier) it.uniqueTier = u.uniqueTier;
            modified = true;
          }
        }
      }
      // 2. 套装物品自愈补全
      else if (it.quality === 5 && it.setOrUniqueId !== undefined) {
        if (!it.setDef || it.name === it.baseName) {
          const s = ed.getSetItem ? ed.getSetItem(it.setOrUniqueId) : null;
          if (s && (s.zhName || s.name)) {
            it.setDef = s;
            it.name = s.zhName || s.name;
            if (s.code) it.setCode = s.code;
            modified = true;
          }
        }
      }
    }
    return modified;
  }

  function deduplicateRepoIds(repoObj) {
    if (!repoObj || !Array.isArray(repoObj.items)) return false;
    const seen = new Set();
    let hasDuplicate = false;
    for (const e of repoObj.items) {
      if (!e || e.id === undefined || seen.has(e.id)) {
        hasDuplicate = true;
        break;
      }
      seen.add(e.id);
    }
    if (hasDuplicate) {
      let curId = 1;
      for (let i = repoObj.items.length - 1; i >= 0; i--) {
        const e = repoObj.items[i];
        if (e) {
          e.id = curId++;
          if (e.item) {
            e.item._repoId = e.id;
            e.item._idx = e.id;
          }
        }
      }
      return true;
    }
    return false;
  }

  function getNextRepoId() {
    const curRepo = getRepo();
    let maxId = 0;
    if (curRepo && Array.isArray(curRepo.items)) {
      for (const entry of curRepo.items) {
        const eid = Number(entry.id);
        if (!Number.isNaN(eid) && eid > maxId) {
          maxId = eid;
        }
      }
    }
    return maxId + 1;
  }

  function setRepo(v) {
    if (v && Array.isArray(v.items)) {
      deduplicateRepoIds(v);
      hydrateRepoItems(v);
      REPO = v;
      root.REPO = v;
      repoSeq = getNextRepoId();
      root.repoSeq = repoSeq;
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const cachedRepo = localStorage.getItem('MXL_REPO_JSON');
      if (cachedRepo) {
        const parsed = JSON.parse(cachedRepo);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          deduplicateRepoIds(parsed);
          hydrateRepoItems(parsed);
          REPO = parsed;
          repoSeq = getNextRepoId();
          root.repoSeq = repoSeq;
        }
      }
    }
  } catch (e) {}

  root.REPO = REPO;
  repoSeq = getNextRepoId();
  root.repoSeq = repoSeq;

  function getCurCharName() {
    return (CHAR && CHAR.name) ||
      (CURRENT && (CURRENT.charName || (CURRENT.header && CURRENT.header.name))) ||
      (SAVE.fileName ? SAVE.fileName.replace(/\.d2s$/i, '') : '');
  }

  /* ============ 存取操作审计日志系统 ============ */
  let OPERATION_LOGS = [];
  function loadLogs() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('median_op_logs');
        if (raw) OPERATION_LOGS = JSON.parse(raw);
      }
    } catch (e) {}
  }
  loadLogs();

  async function saveLogs() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('median_op_logs', JSON.stringify(OPERATION_LOGS));
      }
    } catch (e) {}
    updateLogBadge();
  }

  function addLog(action, actionName, it, from, to) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timeStr = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      time: timeStr,
      action,
      actionName,
      item: {
        name: it ? stripD2(displayName(it)) : '未知物品',
        quality: it ? it.quality : 0,
        code: it ? (it.typeCode || '') : '',
        guid: (it && it.guid !== undefined) ? ('0x' + (it.guid >>> 0).toString(16).toUpperCase().padStart(8, '0')) : ''
      },
      from,
      to
    };
    OPERATION_LOGS.unshift(entry);
    if (OPERATION_LOGS.length > 500) OPERATION_LOGS.length = 500;
    saveLogs();
    if (typeof document !== 'undefined') {
      const modal = document.getElementById('logModal');
      if (modal && modal.classList.contains('active')) {
        renderLogs();
      }
    }
  }

  function updateLogBadge() {
    if (typeof document === 'undefined') return;
    const b = document.getElementById('logCountBadge');
    if (b) b.textContent = OPERATION_LOGS.length;
  }

  function renderLogs() {
    if (typeof document === 'undefined') return;
    const listEl = document.getElementById('logList');
    const subEl = document.getElementById('logCountSub');
    if (subEl) subEl.textContent = '共 ' + OPERATION_LOGS.length + ' 条记录';
    if (!listEl) return;
    if (!OPERATION_LOGS.length) {
      listEl.innerHTML = '<p style="color:#64748b;text-align:center;padding:30px">暂无存取日志记录</p>';
      return;
    }
    const qcMap = (root.QUALITY_CLASS) || {};
    listEl.innerHTML = OPERATION_LOGS.map(l => {
      const it = l.item || {};
      const qc = qcMap[it.quality] || 'q-normal';
      return '<div class="log-entry">' +
        '<span class="log-time">' + esc(l.time) + '</span>' +
        '<span class="log-badge ' + esc(l.action) + '">' + esc(l.actionName) + '</span>' +
        '<div class="log-item">' +
          '<span class="' + qc + '" style="font-weight:600">' + esc(it.name) + '</span>' +
          '<span style="color:#64748b;font-size:11px;margin-left:6px">[' + esc(it.code || '') + '] ' + esc(it.guid || '') + '</span>' +
        '</div>' +
        '<span class="log-route">' + esc(l.from) + ' ➔ ' + esc(l.to) + '</span>' +
      '</div>';
    }).join('');
  }

  /* ============ 智能仓库缓存与自动关联（IndexedDB） ============ */
  const STASH_CACHE_DB = 'MXL_REPO_CACHE';
  const STASH_STORE = 'stashes';

  function openStashDB() {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      try {
        const req = indexedDB.open(STASH_CACHE_DB, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STASH_STORE)) {
            db.createObjectStore(STASH_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function saveStashToCache(key, uint8Array) {
    const db = await openStashDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STASH_STORE, 'readwrite');
        tx.objectStore(STASH_STORE).put(uint8Array, key.toLowerCase());
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  async function loadStashFromCache(key) {
    const db = await openStashDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STASH_STORE, 'readonly');
        const req = tx.objectStore(STASH_STORE).get(key.toLowerCase());
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  /* ============ 未保存修改状态追踪与拦截 ============ */
  let HAS_UNSAVED_CHANGES = false;

  function markUnsavedChanges(changed = true) {
    HAS_UNSAVED_CHANGES = changed;
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('btnSaveDirect');
    if (btn) {
      if (changed) {
        btn.textContent = '💾 保存修改 (待保存*)';
        btn.style.background = '#d97706';
        btn.style.borderColor = '#f59e0b';
        btn.classList.add('pulse');
      } else {
        btn.textContent = '💾 保存修改';
        btn.style.background = '#10b981';
        btn.style.borderColor = '#059669';
        btn.classList.remove('pulse');
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', (e) => {
      if (HAS_UNSAVED_CHANGES) {
        e.preventDefault();
        e.returnValue = '您有尚未保存的存档或云仓库修改，确定要离开吗？';
        return e.returnValue;
      }
    });
  }

  /* ============ 原生写盘与写回辅助 ============ */
  async function nativeWriteBytes(fileName, bytes) {
    if (SAVE.isNative && SAVE.dirPath && root.tauriInvoke) {
      try {
        try {
          await root.tauriInvoke('write_save_file', {
            fileName: fileName,
            bytes: Array.from(bytes),
            backup: true
          });
          return true;
        } catch (safeErr) {
          console.warn('write_save_file fallback:', safeErr);
          await root.tauriInvoke('write_file_bytes', {
            filePath: SAVE.dirPath + '/' + fileName,
            bytes: Array.from(bytes),
            backup: true
          });
          return true;
        }
      } catch (e) {
        console.warn('Tauri 原生写盘失败:', e);
      }
    }
    return false;
  }

  async function nativeWriteText(fileName, text) {
    if (SAVE.isNative && SAVE.dirPath && root.tauriInvoke) {
      try {
        await root.tauriInvoke('write_text_file', {
          filePath: SAVE.dirPath + '/' + fileName,
          content: text
        });
        return true;
      } catch (e) {
        console.warn('Tauri 原生文本写盘失败:', e);
      }
    }
    return false;
  }

  async function backupSave() {
    if (SAVE.backedUp || !SAVE.dir) return;
    try {
      const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const fh = await SAVE.dir.getFileHandle(SAVE.fileName + '.bak-' + ts, { create: true });
      const w = await fh.createWritable();
      await w.write(SAVE.bytes);
      await w.close();
      SAVE.backedUp = true;
    } catch (e) {
      console.warn('备份原存档失败:', e);
    }
  }

  async function writeSave(bytes) {
    SAVE.bytes = bytes;
    if (SAVE.isNative && SAVE.dirPath && SAVE.fileName) {
      const ok = await nativeWriteBytes(SAVE.fileName, bytes);
      if (ok) return true;
    }
    if (SAVE.fileHandle) {
      try {
        await backupSave();
        const w = await SAVE.fileHandle.createWritable();
        await w.write(bytes);
        await w.close();
        return true;
      } catch (e) {
        console.warn('写回磁盘存档失败:', e);
        return false;
      }
    }
    return false;
  }

  async function writeRepo() {
    const curRepo = getRepo();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('MXL_REPO_JSON', JSON.stringify(curRepo));
      }
    } catch (e) {}
    if (SAVE.isNative && SAVE.dirPath) {
      await nativeWriteText(REPO_FILE, JSON.stringify(curRepo, null, 2));
      if (root.updateCounts) root.updateCounts();
      return;
    }
    if (SAVE.dir) {
      try {
        const fh = await SAVE.dir.getFileHandle(REPO_FILE, { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(curRepo, null, 2));
        await w.close();
      } catch (e) {
        console.warn('写入本地目录云仓库文件失败:', e);
      }
    }
    if (root.updateCounts) root.updateCounts();
  }

  const exportsObj = {
    CURRENT,
    CHAR,
    SAVE,
    GAME_STASH,
    getRepo,
    setRepo,
    REPO,
    REPO_FILE,
    repoSeq,
    getCurCharName,
    OPERATION_LOGS,
    loadLogs,
    saveLogs,
    addLog,
    updateLogBadge,
    renderLogs,
    openStashDB,
    saveStashToCache,
    loadStashFromCache,
    HAS_UNSAVED_CHANGES,
    markUnsavedChanges,
    nativeWriteBytes,
    nativeWriteText,
    backupSave,
    writeSave,
    writeRepo,
    hydrateRepoItems,
    getNextRepoId,
    deduplicateRepoIds
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  Object.assign(root, exportsObj);
})(typeof window !== 'undefined' ? window : globalThis);
