use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct DetectedRecordingInfo {
    #[serde(rename = "filePath")]
    pub file_path: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
    #[serde(rename = "fileSize")]
    pub file_size: u64,
    #[serde(rename = "fileSizeFormatted")]
    pub file_size_formatted: String,
    #[serde(rename = "createdTime")]
    pub created_time: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadResult {
    pub success: bool,
    pub message: String,
    #[serde(rename = "fileSize")]
    pub file_size: u64,
}

// 格式化文件大小 (MB / GB)
fn format_size(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

// 获取默认腾讯会议保存目录
#[tauri::command]
pub fn get_default_meeting_dir() -> String {
    if let Some(doc_dir) = dirs::document_dir() {
        let tencent_path = doc_dir.join("TencentMeeting");
        return tencent_path.to_string_lossy().to_string();
    }
    String::from("C:\\Users\\Public\\Documents")
}

// 扫描录像目录下的最新 MP4 文件
#[tauri::command]
pub fn scan_recordings(folder_path: String) -> Result<Vec<DetectedRecordingInfo>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let mut scan_stack: Vec<PathBuf> = vec![path.to_path_buf()];

    // 遍历录制文件夹 (支持子目录递归扫描，深度限制 3)
    let mut depth = 0;
    while let Some(current_dir) = scan_stack.pop() {
        depth += 1;
        if depth > 100 {
            break;
        }

        if let Ok(entries) = fs::read_dir(&current_dir) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    scan_stack.push(entry_path);
                } else if entry_path.is_file() {
                    if let Some(ext) = entry_path.extension() {
                        if ext.to_string_lossy().to_lowercase() == "mp4" {
                            if let Ok(meta) = entry.metadata() {
                                let size = meta.len();
                                // 过滤小于 1MB 的残损碎片文件
                                if size > 1024 * 1024 {
                                    let time_str = meta
                                        .modified()
                                        .unwrap_or(SystemTime::now())
                                        .duration_since(SystemTime::UNIX_EPOCH)
                                        .map(|d| {
                                            chrono::DateTime::from_timestamp(
                                                d.as_secs() as i64,
                                                0,
                                            )
                                            .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
                                            .unwrap_or_else(|| "最近".to_string())
                                        })
                                        .unwrap_or_else(|_| "最近".to_string());

                                    results.push(DetectedRecordingInfo {
                                        file_path: entry_path.to_string_lossy().to_string(),
                                        file_name: entry_path
                                            .file_name()
                                            .unwrap_or_default()
                                            .to_string_lossy()
                                            .to_string(),
                                        file_size: size,
                                        file_size_formatted: format_size(size),
                                        created_time: time_str,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 按文件修改时间降序排序（最新的在最前）
    results.reverse();
    // 最多返回最近 20 个录像
    if results.len() > 20 {
        results.truncate(20);
    }

    Ok(results)
}

// 在系统资源管理器中打开指定目录或选中文件
#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// 分片/流式直传本地视频到 Cloudflare R2
#[tauri::command]
pub async fn upload_recording_file(
    api_base: String,
    class_id: i64,
    file_path: String,
) -> Result<UploadResult, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("录像文件不存在".to_string());
    }

    let file_bytes = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
    let file_size = file_bytes.len() as u64;
    let file_name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(file_name)
        .mime_str("video/mp4")
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new().part("video", part);

    let url = format!("{}/classes/upload-recording/{}", api_base, class_id);
    let response = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("网络传输失败: {}", e))?;

    if response.status().is_success() {
        Ok(UploadResult {
            success: true,
            message: "视频已成功归档至机构私有云".to_string(),
            file_size,
        })
    } else {
        let err_text = response.text().await.unwrap_or_default();
        Err(format!("服务器返回错误: {}", err_text))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_default_meeting_dir,
            scan_recordings,
            open_folder,
            upload_recording_file
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
