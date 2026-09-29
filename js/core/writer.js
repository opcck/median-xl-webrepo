// Median XL WebRepo - 存档二进制修补与序列化写回模块
(function(root) {
  'use strict';

  // 依赖检测：位流工具与解析器
  const getBitstream = () => ({
    setBits: root.setBits || (typeof require !== 'undefined' ? require('./bitstream.js').setBits : null),
    fixHeader: root.fixHeader || (typeof require !== 'undefined' ? require('./bitstream.js').fixHeader : null),
    u16le: root.u16le || (typeof require !== 'undefined' ? require('./bitstream.js').u16le : null)
  });

  const getParser = () => ({
    parseD2s: root.parseD2s || (typeof require !== 'undefined' ? require('./parser.js').parseD2s : null)
  });

  // 位置字段修补：使用解析时记录的精确位偏移（相对物品数据起点），保证读写一致
  function patchItemPos(raw, bitOff, loc, we, col, row, stor) {
    const { setBits } = getBitstream();
    const d = new Uint8Array(raw); // raw 含 JM 头 2 字节
    const base = 2 * 8;            // 数据起点（位）
    setBits(d, base + bitOff.loc, 3, loc);
    setBits(d, base + bitOff.we, 4, we);
    setBits(d, base + bitOff.col, 4, col);
    setBits(d, base + bitOff.row, 4, row);
    setBits(d, base + bitOff.stor, 3, stor);
    return d;
  }

  // 背包空位计算（Median XL 为 15x10 网格，返回 [col,row] 或 null）
  function freeInventoryCell(items, w, h, maxCols = 15, maxRows = 10) {
    const occ = new Set();
    for (const it of items) {
      if (!it.rawStart || it._sec !== 'char') continue;   // 仅顶层角色区物品占格
      if (it._locRaw !== 0 || it._storRaw !== 1) continue; // 只算背包里的
      const bw = (it.base ? it.base.w : 1) || 1, bh = (it.base ? it.base.h : 1) || 1;
      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          occ.add((it.col + dx) + ',' + (it.row + dy));
        }
      }
    }
    for (let row = 0; row <= maxRows - h; row++) {
      for (let col = 0; col <= maxCols - w; col++) {
        let ok = true;
        for (let dy = 0; dy < h && ok; dy++) {
          for (let dx = 0; dx < w && ok; dx++) {
            if (occ.has((col + dx) + ',' + (row + dy))) ok = false;
          }
        }
        if (ok) return [col, row];
      }
    }
    return null;
  }

  // 从文件字节中移除若干 [start,end) 区段（须升序），并更新物品数量/尺寸/校验和
  function removeItemRanges(bytes, region, ranges) {
    const { fixHeader, u16le } = getBitstream();
    let out = new Uint8Array(bytes.length);
    let src = 0, dst = 0;
    for (const r of ranges) {
      out.set(bytes.subarray(src, r.start), dst);
      dst += r.start - src;
      src = r.end;
    }
    out.set(bytes.subarray(src), dst);
    dst += bytes.length - src;   // 尾段长度计入
    out = out.subarray(0, dst);  // 截断
    // 数量字段：区段头 JM 在 region.start-2，数量在其后 2 字节
    const newCount = region.count - ranges.length;
    out.set(u16le(newCount), region.start - 2);
    return { bytes: fixHeader(out), newCount };
  }

  // 从游戏仓库 (.stash / .shared) 字节流中精准剔除物品区段，并更新对应页面的物品计数
  function removeStashItemRanges(bytes, itemsToRemove) {
    if (!itemsToRemove || !itemsToRemove.length) return bytes;
    const sorted = [...itemsToRemove].sort((a, b) => a.rawStart - b.rawStart);

    const pages = [];
    for (let i = 0; i <= bytes.length - 5; i++) {
      if (bytes[i] === 0x53 && bytes[i+1] === 0x54 && bytes[i+2] === 0x41 && bytes[i+3] === 0x53 && bytes[i+4] === 0x48) {
        for (let k = i + 5; k < Math.min(bytes.length - 3, i + 30); k++) {
          if (bytes[k] === 0x4A && bytes[k+1] === 0x4D) {
            const count = bytes[k + 2] | (bytes[k + 3] << 8);
            pages.push({ jmPos: k, count, pageIdx: pages.length });
            break;
          }
        }
      }
    }

    const pageRemoveCount = {};
    for (const it of sorted) {
      const p = it._stashPage !== undefined ? it._stashPage : 0;
      pageRemoveCount[p] = (pageRemoveCount[p] || 0) + 1;
    }

    const workingBytes = new Uint8Array(bytes);
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const rem = pageRemoveCount[pIdx] || 0;
      if (rem > 0) {
        const newCnt = Math.max(0, pages[pIdx].count - rem);
        workingBytes[pages[pIdx].jmPos + 2] = newCnt & 255;
        workingBytes[pages[pIdx].jmPos + 3] = (newCnt >> 8) & 255;
      }
    }

    let out = new Uint8Array(workingBytes.length);
    let src = 0, dst = 0;
    for (const it of sorted) {
      out.set(workingBytes.subarray(src, it.rawStart), dst);
      dst += it.rawStart - src;
      src = it.rawEnd;
    }
    out.set(workingBytes.subarray(src), dst);
    dst += workingBytes.length - src;
    return out.subarray(0, dst);
  }

  function downloadBytes(filename, u8) {
    const blob = new Blob([u8], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 在仓库分页（14x14 网格）中寻找容纳 (w, h) 物品的空位
  function freeStashCell(itemsInPage, w, h, maxCols = 14, maxRows = 14) {
    const occ = new Set();
    for (const it of itemsInPage) {
      const bw = (it.base ? it.base.w : 1) || 1;
      const bh = (it.base ? it.base.h : 1) || 1;
      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          occ.add((it.col + dx) + ',' + (it.row + dy));
        }
      }
    }
    for (let row = 0; row <= maxRows - h; row++) {
      for (let col = 0; col <= maxCols - w; col++) {
        let ok = true;
        for (let dy = 0; dy < h && ok; dy++) {
          for (let dx = 0; dx < w && ok; dx++) {
            if (occ.has((col + dx) + ',' + (row + dy))) ok = false;
          }
        }
        if (ok) return [col, row];
      }
    }
    return null;
  }

  // 向仓库字节流中插入物品字节（支持插入已有页或自动追加全新页）
  function insertItemIntoStashBytes(bytes, newItemRaw, targetPageIdx) {
    if (!bytes || !bytes.length) {
      bytes = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x53, 0x54, 0x41, 0x53, 0x48, 0x00, 0x00, 0x00, 0x00, 0x4a, 0x4d, 0x00, 0x00]);
    }
    const pages = [];
    for (let i = 0; i <= bytes.length - 5; i++) {
      if (bytes[i] === 0x53 && bytes[i+1] === 0x54 && bytes[i+2] === 0x41 && bytes[i+3] === 0x53 && bytes[i+4] === 0x48) {
        for (let k = i + 5; k < Math.min(bytes.length - 3, i + 30); k++) {
          if (bytes[k] === 0x4A && bytes[k+1] === 0x4D) {
            const count = bytes[k + 2] | (bytes[k + 3] << 8);
            pages.push({ stashOffset: i, jmPos: k, count, pageIdx: pages.length });
            break;
          }
        }
      }
    }

    if (targetPageIdx < pages.length) {
      const p = pages[targetPageIdx];
      const insertAt = (targetPageIdx < pages.length - 1) ? pages[targetPageIdx + 1].stashOffset : bytes.length;
      const out = new Uint8Array(bytes.length + newItemRaw.length);
      out.set(bytes.subarray(0, insertAt), 0);
      out.set(newItemRaw, insertAt);
      out.set(bytes.subarray(insertAt), insertAt + newItemRaw.length);

      const newCount = p.count + 1;
      out[p.jmPos + 2] = newCount & 255;
      out[p.jmPos + 3] = (newCount >> 8) & 255;
      return out;
    } else {
      // 超出已有页数，在末尾追加全新 Page
      const newPageHead = new Uint8Array([0x53, 0x54, 0x41, 0x53, 0x48, 0x09, 0x00, 0x00, 0x00, 0x4a, 0x4d, 0x01, 0x00]);
      const out = new Uint8Array(bytes.length + newPageHead.length + newItemRaw.length);
      out.set(bytes, 0);
      out.set(newPageHead, bytes.length);
      out.set(newItemRaw, bytes.length + newPageHead.length);
      return out;
    }
  }

  // 在 region 末尾（尸体段前）插入物品字节，并更新数量/尺寸/校验和
  function insertItemBytes(bytes, region, newItems) {
    const { fixHeader, u16le } = getBitstream();
    const insertAt = region.end;
    const total = newItems.reduce((a, b) => a + b.length, 0);
    const out = new Uint8Array(bytes.length + total);
    out.set(bytes.subarray(0, insertAt), 0);
    let off = insertAt;
    for (const ni of newItems) {
      out.set(ni, off);
      off += ni.length;
    }
    out.set(bytes.subarray(insertAt), off);
    const newCount = region.count + newItems.length;
    out.set(u16le(newCount), region.start - 2);
    return { bytes: fixHeader(out), newCount };
  }

  // 写入前重解析验证
  function verifySave(bytes) {
    const { parseD2s } = getParser();
    try {
      const r = parseD2s(bytes);
      return { ok: r.parseFailures === 0, parsed: r.items.length, warnings: r.warnings };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  const exportsObj = {
    patchItemPos,
    freeInventoryCell,
    removeItemRanges,
    removeStashItemRanges,
    downloadBytes,
    freeStashCell,
    insertItemIntoStashBytes,
    insertItemBytes,
    verifySave
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  Object.assign(root, exportsObj);
})(typeof window !== 'undefined' ? window : globalThis);
