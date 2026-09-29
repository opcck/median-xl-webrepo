// Median XL WebRepo - 暗黑2底层二进制位流与校验和基建模块
(function(root) {
  'use strict';

  /* ============ bit reader (LSB-first, 连续位流，与 D2 存档位打包一致) ============ */
  class BitReader {
    constructor(bytes, byteOffset = 0, byteLength = bytes.length - byteOffset) {
      this.b = bytes;
      this.bytePos = byteOffset;
      this.bitPos = 0;
      this.end = byteOffset + byteLength;
    }
    readBits(n) {
      let v = 0;
      for (let i = 0; i < n; i++) {
        if (this.bytePos >= this.end) throw new Error('bit underrun');
        v |= ((this.b[this.bytePos] >> this.bitPos) & 1) << i;
        if (++this.bitPos === 8) { this.bitPos = 0; this.bytePos++; }
      }
      return v;
    }
    skip(n) {
      for (let i = 0; i < n; i++) {
        if (this.bytePos >= this.end) throw new Error('bit skip underrun');
        if (++this.bitPos === 8) { this.bitPos = 0; this.bytePos++; }
      }
    }
    byteAlign() {
      if (this.bitPos !== 0) { this.bitPos = 0; this.bytePos++; }
    }
    get consumedBytes() {
      return this.bytePos + (this.bitPos ? 1 : 0);
    }
  }

  function u32le(v) {
    return new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  }

  function u16le(v) {
    return new Uint8Array([v & 255, (v >> 8) & 255]);
  }

  // 与游戏引擎算法一致：循环左移累加，跳过 0xC-0xF
  function d2Checksum(b) {
    let s = 0;
    for (let i = 0; i < b.length; i++) {
      const msb = (s & 0x80000000) !== 0;
      s = ((s << 1) & 0xFFFFFFFF) | (msb ? 1 : 0);
      if (i < 0xC || i >= 0x10) s = (s + b[i]) & 0xFFFFFFFF;
    }
    return s >>> 0;
  }

  // 文件长度 @0x8 + 校验和 @0xC
  function fixHeader(bytes) {
    const out = bytes;
    out.set(u32le(out.length), 0x8);
    out.set(u32le(d2Checksum(out)), 0xC);
    return out;
  }

  function b64enc(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function b64dec(str) {
    const s = atob(str);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  // LSB-first 位写入（用于修改物品的位置/坐标位）
  function setBits(data, bitOffset, width, value) {
    for (let i = 0; i < width; i++) {
      const bit = (value >> i) & 1;
      const byteIdx = (bitOffset + i) >> 3;
      const bitIdx = (bitOffset + i) & 7;
      if (bit) data[byteIdx] |= (1 << bitIdx);
      else data[byteIdx] &= ~(1 << bitIdx);
    }
  }

  const exportsObj = {
    BitReader,
    u32le,
    u16le,
    d2Checksum,
    fixHeader,
    b64enc,
    b64dec,
    setBits
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
  Object.assign(root, exportsObj);
})(typeof window !== 'undefined' ? window : globalThis);
