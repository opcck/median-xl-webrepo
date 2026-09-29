// Median XL WebRepo - 弹窗模态框与轻量交互反馈模块
(function(root) {
  'use strict';

  function esc(s) {
    return root.esc ? root.esc(s) : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showToast(msg, ok) {
    if (typeof document === 'undefined') return;
    const s = document.getElementById('bulkStatus');
    if (s) {
      s.textContent = msg;
      s.style.color = ok === false ? '#ff6b6b' : '#7cc050';
      setTimeout(() => { s.textContent = ''; }, 6000);
    }
  }

  function openWarnModal(warns) {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('warnModal');
    if (!modal) return;
    const list = warns || (root.CURRENT && root.CURRENT.warnings) || [];
    const sub = document.getElementById('warnCountSub');
    if (sub) sub.textContent = '共 ' + list.length + ' 条';
    const body = document.getElementById('warnList');
    if (body) {
      if (list.length === 0) {
        body.innerHTML = '<p style="color:#64748b;text-align:center;padding:20px">暂无警告记录</p>';
      } else {
        body.innerHTML = list.map((w, idx) =>
          '<div style="background:#1e293b;border-left:3px solid #d8a940;padding:10px 14px;border-radius:4px;margin-bottom:8px;font-family:monospace;font-size:13px;color:#f1f5f9;word-break:break-all;line-height:1.5">' +
          '<span style="color:#d8a940;font-weight:bold;margin-right:6px">[' + (idx + 1) + ']</span>' + esc(w) + '</div>'
        ).join('');
      }
    }
    modal.style.display = 'flex';
  }

  function closeWarnModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('warnModal');
    if (modal) modal.style.display = 'none';
  }

  function initModals() {
    if (typeof document === 'undefined') return;

    // 日志弹窗触发与关闭
    const btnLogModalEl = document.getElementById('btnLogModal');
    if (btnLogModalEl) {
      btnLogModalEl.addEventListener('click', () => {
        if (root.renderLogs) root.renderLogs();
        const modal = document.getElementById('logModal');
        if (modal) modal.classList.add('active');
      });
    }

    const btnCloseLogsEl = document.getElementById('btnCloseLogs');
    if (btnCloseLogsEl) {
      btnCloseLogsEl.addEventListener('click', () => {
        const modal = document.getElementById('logModal');
        if (modal) modal.classList.remove('active');
      });
    }

    const logModalEl = document.getElementById('logModal');
    if (logModalEl) {
      logModalEl.addEventListener('click', (e) => {
        if (e.target === logModalEl) {
          logModalEl.classList.remove('active');
        }
      });
    }

    // 警告弹窗关闭与点击遮罩
    const btnCloseWarnsEl = document.getElementById('btnCloseWarns');
    if (btnCloseWarnsEl) {
      btnCloseWarnsEl.addEventListener('click', closeWarnModal);
    }

    const warnModalEl = document.getElementById('warnModal');
    if (warnModalEl) {
      warnModalEl.addEventListener('click', (e) => {
        if (e.target === warnModalEl) closeWarnModal();
      });
    }

    // 复制警告
    const btnCopyWarnsEl = document.getElementById('btnCopyWarns');
    if (btnCopyWarnsEl) {
      btnCopyWarnsEl.addEventListener('click', () => {
        const list = (root.CURRENT && root.CURRENT.warnings) || [];
        if (!list.length) {
          showToast('暂无警告可复制', false);
          return;
        }
        const text = list.map((w, idx) => `[警告 ${idx + 1}] ${w}`).join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('📋 警告信息已成功复制到剪贴板！', true);
          }).catch(() => {
            alert(text);
          });
        } else {
          alert(text);
        }
      });
    }

    // 复制存取日志
    const btnCopyLogsEl = document.getElementById('btnCopyLogs');
    if (btnCopyLogsEl) {
      btnCopyLogsEl.addEventListener('click', () => {
        const logs = root.OPERATION_LOGS || [];
        if (!logs.length) {
          showToast('暂无日志可复制', false);
          return;
        }
        const text = logs.map(l => {
          const it = l.item || {};
          return `[${l.time}] [${l.actionName}] ${it.name || '未知物品'} (${it.code || ''}) ${it.guid || ''} | ${l.from} ➔ ${l.to}`;
        }).join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('✅ 全部存取日志已成功复制到剪贴板！', true);
          }).catch(() => {
            showToast('复制失败，请手动复制', false);
          });
        }
      });
    }

    // 清空存取日志
    const btnClearLogsEl = document.getElementById('btnClearLogs');
    if (btnClearLogsEl) {
      btnClearLogsEl.addEventListener('click', async () => {
        const logs = root.OPERATION_LOGS || [];
        if (!logs.length) return;
        if (confirm('确定要清空所有存取日志记录吗？')) {
          root.OPERATION_LOGS.length = 0;
          if (root.saveLogs) await root.saveLogs();
          if (root.renderLogs) root.renderLogs();
          if (root.updateLogBadge) root.updateLogBadge();
          showToast('存取日志已清空', true);
        }
      });
    }

    // 全局 ESC 键监听
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const logModal = document.getElementById('logModal');
        if (logModal && logModal.classList.contains('active')) {
          logModal.classList.remove('active');
        }
        closeWarnModal();
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initModals);
    } else {
      initModals();
    }
  }

  const exportsObj = {
    showToast,
    openWarnModal,
    closeWarnModal,
    initModals
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  Object.assign(root, exportsObj);
})(typeof window !== 'undefined' ? window : globalThis);
