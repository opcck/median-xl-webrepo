use serde::Serialize;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

static CURRENT_SAVE_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
    pub data: Vec<u8>,
}

#[derive(Serialize)]
pub struct SaveDirPayload {
    pub dir: String,
    pub d2s: Vec<FileEntry>,
    pub stashes: Vec<FileEntry>,
    pub shared: Option<FileEntry>,
    pub repo_json: Option<String>,
}

#[derive(Serialize)]
pub struct ResourceInfo {
    pub source: String,
    pub is_external: bool,
    pub web_dir: String,
    pub data_version: String,
    pub build_time: String,
}

use std::sync::atomic::{AtomicU64, Ordering};
static BACKUP_SEQ: AtomicU64 = AtomicU64::new(1);

fn current_timestamp_str() -> String {
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = now.as_secs();
    let millis = now.subsec_millis();
    let seq = BACKUP_SEQ.fetch_add(1, Ordering::SeqCst);
    let secs = total_secs % 60;
    let mins = (total_secs / 60) % 60;
    let hours = (total_secs / 3600) % 24;
    format!("{:02}{:02}{:02}_{:03}_{}", hours, mins, secs, millis, seq)
}

#[tauri::command]
pub fn get_resource_info() -> Result<ResourceInfo, String> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    let web_dir = exe_dir.join("web");
    let has_external = web_dir.join("index.html").is_file();

    let mut data_version = "2026.09.15".to_string();
    let mut build_time = String::new();

    // 1. 默认解析内嵌在二进制内部的编译期元数据
    let embedded_version = include_str!("../../dist/version.json");
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(embedded_version) {
        if let Some(dv) = v.get("dataVersion").and_then(|s| s.as_str()) {
            data_version = dv.to_string();
        }
        if let Some(bt) = v.get("buildTime").and_then(|s| s.as_str()) {
            build_time = bt.to_string();
        }
    }

    // 2. 若存在外部 web 目录则读取外部最新数据
    if has_external {
        let version_file = web_dir.join("version.json");
        if version_file.is_file() {
            if let Ok(content) = fs::read_to_string(&version_file) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(dv) = v.get("dataVersion").and_then(|s| s.as_str()) {
                        data_version = dv.to_string();
                    }
                    if let Some(bt) = v.get("buildTime").and_then(|s| s.as_str()) {
                        build_time = bt.to_string();
                    }
                }
            }
        }
    }

    Ok(ResourceInfo {
        source: if has_external { "external-web".to_string() } else { "embedded-dist".to_string() },
        is_external: has_external,
        web_dir: web_dir.to_string_lossy().to_string(),
        data_version,
        build_time,
    })
}

#[tauri::command]
pub fn get_default_save_path() -> Result<String, String> {
    if let Some(mut p) = dirs::data_dir() {
        p.push("medianxl");
        p.push("save");
        if p.exists() {
            return Ok(p.to_string_lossy().to_string());
        }
    }
    Ok(String::new())
}

#[tauri::command]
pub fn read_save_directory(dir_path: Option<String>) -> Result<SaveDirPayload, String> {
    let target_dir: PathBuf = match dir_path {
        Some(ref d) if !d.trim().is_empty() => PathBuf::from(d),
        _ => {
            let def = get_default_save_path()?;
            if def.is_empty() {
                return Err("未找到默认 Median XL 存档目录，请手动指定目录".to_string());
            }
            PathBuf::from(def)
        }
    };

    if !target_dir.exists() || !target_dir.is_dir() {
        return Err(format!("目录不存在: {}", target_dir.display()));
    }

    // 记录确认过的存档目录以保护后续写盘边界
    if let Ok(mut lock) = CURRENT_SAVE_DIR.lock() {
        *lock = Some(target_dir.clone());
    }

    let mut d2s = Vec::new();
    let mut stashes = Vec::new();
    let mut shared = None;
    let mut repo_json = None;

    let entries = fs::read_dir(&target_dir).map_err(|e| format!("无法读取目录: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let fname = match path.file_name().and_then(|s| s.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let lower = fname.to_lowercase();

        if lower == "_sharedstash.shared" {
            if let Ok(bytes) = fs::read(&path) {
                shared = Some(FileEntry {
                    name: fname.clone(),
                    size: bytes.len() as u64,
                    data: bytes,
                });
            }
        } else if lower.ends_with(".d2s") {
            if let Ok(bytes) = fs::read(&path) {
                d2s.push(FileEntry {
                    name: fname.clone(),
                    size: bytes.len() as u64,
                    data: bytes,
                });
            }
        } else if lower.ends_with(".stash") {
            if let Ok(bytes) = fs::read(&path) {
                stashes.push(FileEntry {
                    name: fname.clone(),
                    size: bytes.len() as u64,
                    data: bytes,
                });
            }
        } else if lower == "repository.mxlrepo.json" {
            if let Ok(content) = fs::read_to_string(&path) {
                repo_json = Some(content);
            }
        }
    }

    Ok(SaveDirPayload {
        dir: target_dir.to_string_lossy().to_string(),
        d2s,
        stashes,
        shared,
        repo_json,
    })
}

// 统一安全写盘核心：时间戳备份 + 临时文件 + 原子替换 + 严格目录边界约束
fn safe_atomic_write(file_path: &Path, bytes: &[u8], backup: bool) -> Result<(), String> {
    // 检查文件名及父目录
    let file_name = file_path.file_name().and_then(|s| s.to_str()).unwrap_or("");
    if file_name.is_empty() {
        return Err("无效的文件名".to_string());
    }

    // 目录越界检查：禁止包含 ..
    for c in file_path.components() {
        if let Component::ParentDir = c {
            return Err("路径包含非法父目录遍历符号 (..)".to_string());
        }
    }

    let parent_dir = match file_path.parent() {
        Some(p) if p.exists() && p.is_dir() => p,
        _ => return Err(format!("目标文件所在目录不存在: {}", file_path.display())),
    };

    // 1. 如果需要备份且原文件存在：生成时间戳备份（绝不覆盖历史备份）
    if backup && file_path.exists() {
        let ts = current_timestamp_str();
        let bak_name = format!("{}.bak-{}", file_name, ts);
        let bak_path = parent_dir.join(bak_name);
        if let Err(e) = fs::copy(file_path, &bak_path) {
            log::warn!("创建时间戳备份失败: {}", e);
        } else {
            log::info!("已创建时间戳备份: {}", bak_path.display());
        }
    }

    // 2. 写入临时文件
    let tmp_name = format!("{}.tmp-{}", file_name, current_timestamp_str());
    let tmp_path = parent_dir.join(tmp_name);

    {
        let mut tmp_file = File::create(&tmp_path)
            .map_err(|e| format!("无法创建临时文件 {}: {}", tmp_path.display(), e))?;
        tmp_file.write_all(bytes)
            .map_err(|e| format!("写入临时文件数据失败: {}", e))?;
        tmp_file.sync_all()
            .map_err(|e| format!("刷盘临时文件失败: {}", e))?;
    }

    // 3. 原子替换目标文件
    if let Err(_e) = fs::rename(&tmp_path, file_path) {
        // 在 Windows 上某些情况下直接 rename 会遇到已存在文件拒绝，进行带保底的替换
        if let Err(replace_err) = fs::remove_file(file_path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(format!("原子替换文件失败 (删除旧文件失败): {}", replace_err));
        }
        if let Err(rename_err) = fs::rename(&tmp_path, file_path) {
            return Err(format!("原子重命名文件失败: {}", rename_err));
        }
    }

    Ok(())
}

#[tauri::command]
pub fn write_file_bytes(file_path: String, bytes: Vec<u8>, backup: bool) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    safe_atomic_write(&path, &bytes, backup)
}

#[tauri::command]
pub fn write_save_file(file_name: String, bytes: Vec<u8>, backup: bool) -> Result<(), String> {
    let clean_name = file_name.trim().trim_start_matches('/').trim_start_matches('\\');
    if clean_name.is_empty() || clean_name.contains('/') || clean_name.contains('\\') || clean_name.contains("..") {
        return Err(format!("非法的文件名: {}", file_name));
    }

    let current_dir = match CURRENT_SAVE_DIR.lock() {
        Ok(guard) => match guard.as_ref() {
            Some(d) => d.clone(),
            None => return Err("未选定合法存档目录，无法执行写盘操作".to_string()),
        },
        Err(_) => return Err("存档目录锁竞争异常".to_string()),
    };

    let target_path = current_dir.join(clean_name);
    safe_atomic_write(&target_path, &bytes, backup)
}

#[tauri::command]
pub fn write_text_file(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    safe_atomic_write(&path, content.as_bytes(), true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_safe_atomic_write_and_timestamp_backup() {
        let test_dir = std::env::temp_dir().join("mxl_test_atomic_save");
        let _ = fs::remove_dir_all(&test_dir);
        fs::create_dir_all(&test_dir).unwrap();

        let target_file = test_dir.join("test_char.d2s");
        
        // 1. 创建初始版本
        fs::write(&target_file, b"version 1").unwrap();

        // 2. 第一次安全覆盖
        std::thread::sleep(std::time::Duration::from_millis(10));
        safe_atomic_write(&target_file, b"version 2", true).unwrap();
        assert_eq!(fs::read(&target_file).unwrap(), b"version 2");

        // 验证生成了时间戳备份
        let baks: Vec<_> = fs::read_dir(&test_dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".bak-"))
            .collect();
        assert_eq!(baks.len(), 1, "应该生成且只生成1个备份文件");
        assert_eq!(fs::read(baks[0].path()).unwrap(), b"version 1");

        // 3. 第二次安全覆盖
        std::thread::sleep(std::time::Duration::from_millis(10));
        safe_atomic_write(&target_file, b"version 3", true).unwrap();
        assert_eq!(fs::read(&target_file).unwrap(), b"version 3");

        // 验证生成了2个独立的备份文件，绝不覆盖历史备份
        let baks2: Vec<_> = fs::read_dir(&test_dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".bak-"))
            .collect();
        assert_eq!(baks2.len(), 2, "连续保存应该保留两个不同时间戳的备份文件");

        // 清理
        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_path_traversal_protection() {
        let test_dir = std::env::temp_dir().join("mxl_test_traversal");
        let _ = fs::remove_dir_all(&test_dir);
        fs::create_dir_all(&test_dir).unwrap();

        // 试图向父目录越界写入
        let dangerous_path = test_dir.join("..").join("dangerous.txt");
        let res = safe_atomic_write(&dangerous_path, b"malicious", false);
        assert!(res.is_err(), "包含 .. 的越界路径必须被拒绝！");

        let _ = fs::remove_dir_all(&test_dir);
    }
}
