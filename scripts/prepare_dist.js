const fs = require('fs');
const path = require('path');

function copyDir(src, dest, stats = { count: 0 }) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (let entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d, stats);
    } else {
      fs.copyFileSync(s, d);
      stats.count++;
    }
  }
  return stats.count;
}

let terser;
try {
  terser = require('terser');
} catch (e) {
  terser = null;
}

async function minifyJsFile(filePath) {
  if (!terser) return null;
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const result = await terser.minify(code, {
      compress: { passes: 2 },
      mangle: true,
      format: { comments: false }
    });
    if (result && result.code) {
      fs.writeFileSync(filePath, result.code, 'utf8');
      return { original: code.length, minified: result.code.length };
    }
  } catch (e) {
    console.warn(`[prepare_dist] 混淆压缩 ${filePath} 时跳过:`, e.message);
  }
  return null;
}

async function obfuscateDir(dir, stats = { count: 0, originalTotal: 0, minifiedTotal: 0 }) {
  for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await obfuscateDir(full, stats);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const res = await minifyJsFile(full);
      if (res) {
        stats.count++;
        stats.originalTotal += res.original;
        stats.minifiedTotal += res.minified;
      }
    }
  }
  return stats;
}

async function syncTargets() {
  // 1. 自动触发从官方底层源文件构建全新 data_tables.js 与 item_hierarchy.js
  try {
    console.log('[prepare_dist] 正在执行数据表自动构建流水线...');
    require('./build_data_tables.js');
    console.log('[prepare_dist] 正在执行分类树自动构建流水线...');
    require('./build_item_hierarchy.js');
  } catch (e) {
    console.warn('[prepare_dist] 自动构建数据表失败，将直接使用现有数据表:', e.message);
  }

  const versionInfo = {
    version: '1.2.0',
    dataVersion: '2026.09.15',
    buildTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
    manifest: 'Median XL WebRepo Offline Stash'
  };

  const targets = ['web', 'dist', 'MedianXL-Repo/web', 'MedianXL-Repo/dist'];
  
  for (const target of targets) {
    if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
    
    let copiedFiles = 0;
    fs.copyFileSync('index.html', path.join(target, 'index.html'));
    copiedFiles++;
    
    if (fs.existsSync('data_tables.js')) {
      fs.copyFileSync('data_tables.js', path.join(target, 'data_tables.js'));
      copiedFiles++;
    }

    if (fs.existsSync('assets')) {
      copiedFiles += copyDir('assets', path.join(target, 'assets'), { count: 0 });
    }

    if (fs.existsSync('js')) {
      copiedFiles += copyDir('js', path.join(target, 'js'), { count: 0 });
    }

    if (fs.existsSync('txt')) {
      copiedFiles += copyDir('txt', path.join(target, 'txt'), { count: 0 });
    }

    // 写入版本描述信息
    fs.writeFileSync(path.join(target, 'version.json'), JSON.stringify(versionInfo, null, 2), 'utf8');
    copiedFiles++;

    console.log(`[prepare_dist] Target '${target}/' synced: ${copiedFiles} files updated (version: ${versionInfo.dataVersion})`);
  }

  // 2. 对发布目标 'dist/' 与 'MedianXL-Repo/dist/' 执行混淆压缩（保留 'web/' 为明文源码供热修开发）
  if (terser) {
    for (const dTarget of ['dist', 'MedianXL-Repo/dist']) {
      if (fs.existsSync(dTarget)) {
        console.log(`[prepare_dist] 正在对 ${dTarget}/ 生产资源执行自动化代码混淆与压缩...`);
        const stats = await obfuscateDir(dTarget);
        const origKB = (stats.originalTotal / 1024).toFixed(1);
        const minKB = (stats.minifiedTotal / 1024).toFixed(1);
        const ratio = (100 - (stats.minifiedTotal / stats.originalTotal * 100)).toFixed(1);
        console.log(`[prepare_dist] 混淆压缩完成 (${dTarget}): 共处理 ${stats.count} 个 JS 脚本，体积从 ${origKB} KB 降至 ${minKB} KB (缩减 ${ratio}%)！`);
      }
    }
  } else {
    console.warn('[prepare_dist] 未检测到 terser，跳过混淆压缩。');
  }

  console.log('[prepare_dist] Synchronization complete! web/ (明文开发版) 与 dist/ (混淆单文件版) 均已就绪。');
}

syncTargets();

