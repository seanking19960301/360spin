use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, path::BaseDirectory};

#[derive(Serialize)]
struct ModelStatus {
    ready: bool,
    message: String,
}

struct JobCleanup(PathBuf);

impl Drop for JobCleanup {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn local_root() -> PathBuf {
    if let Some(path) = std::env::var_os("LOCALAPPDATA") {
        return PathBuf::from(path).join("360spin");
    }
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join(".local")
        .join("share")
        .join("360spin")
}

fn python_path() -> PathBuf {
    if let Some(path) = std::env::var_os("TRIPOSR_PYTHON") {
        return PathBuf::from(path);
    }
    #[cfg(windows)]
    {
        return local_root().join("venv").join("Scripts").join("python.exe");
    }
    #[cfg(not(windows))]
    {
        local_root().join("venv").join("bin").join("python")
    }
}

fn model_root() -> PathBuf {
    std::env::var_os("TRIPOSR_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| local_root().join("models").join("TripoSR"))
}

fn worker_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource) = app.path().resolve("ai_service/generate.py", BaseDirectory::Resource) {
        if resource.exists() {
            return Ok(resource);
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let development_path = manifest.join("..").join("ai_service").join("generate.py");
    if development_path.exists() {
        return Ok(development_path);
    }
    Err("找不到本地模型运行程序。请重新安装 360spin。".to_string())
}

fn model_is_ready() -> bool {
    let python = python_path();
    let model = model_root();
    python.is_file() && model.join("run.py").is_file()
}

#[tauri::command]
fn model_status() -> ModelStatus {
    if model_is_ready() {
        ModelStatus {
            ready: true,
            message: "本地 AI 环境已就绪（TripoSR）".to_string(),
        }
    } else {
        ModelStatus {
            ready: false,
            message: "本地模型尚未安装；请按 README 配置 TripoSR".to_string(),
        }
    }
}

#[tauri::command]
async fn generate_spin(
    app: tauri::AppHandle,
    image_base64: String,
    file_name: String,
    duration: u32,
    background: String,
) -> Result<String, String> {
    if !(4..=16).contains(&duration) {
        return Err("视频时长需要在 4 到 16 秒之间。".to_string());
    }
    if image_base64.len() > 32 * 1024 * 1024 {
        return Err("照片过大，请先压缩到 24 MB 以内再试。".to_string());
    }
    let input = STANDARD
        .decode(image_base64.as_bytes())
        .map_err(|_| "图片数据无法读取，请重新选择照片。".to_string())?;
    if input.is_empty() {
        return Err("所选照片为空，请重新选择。".to_string());
    }
    if !model_is_ready() {
        return Err("本地 AI 环境未就绪。请先安装 Python、PyTorch 和 TripoSR 模型。".to_string());
    }

    let worker = worker_path(&app)?;
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let job_dir = root.join("jobs").join(timestamp.to_string());
    fs::create_dir_all(&job_dir).map_err(|error| format!("无法创建临时工作目录：{error}"))?;

    let extension = safe_extension(&file_name);
    let background = safe_color(&background);
    let input_path = job_dir.join(format!("product{extension}"));
    let output_path = job_dir.join("360spin.mp4");
    fs::write(&input_path, input).map_err(|error| format!("无法暂存照片：{error}"))?;

    let python = python_path();
    let model = model_root();
    let cache = local_root().join("models").join("huggingface");
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _cleanup = JobCleanup(job_dir.clone());
        let output = Command::new(&python)
            .arg(&worker)
            .arg("--input")
            .arg(&input_path)
            .arg("--output")
            .arg(&output_path)
            .arg("--model-root")
            .arg(&model)
            .arg("--duration")
            .arg(duration.to_string())
            .arg("--background")
            .arg(background)
            .env("HF_HOME", &cache)
            .env("U2NET_HOME", local_root().join("models").join("rembg"))
            .env("NUMBA_CACHE_DIR", local_root().join("cache").join("numba"))
            .current_dir(&job_dir)
            .output()
            .map_err(|error| format!("无法启动本地 AI：{error}"))?;

        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr);
            let message = detail.lines().rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
            return Err(if message.is_empty() {
                "本地模型运行失败，请检查 TripoSR 环境和显卡驱动。".to_string()
            } else {
                format!("本地模型运行失败：\n{message}")
            });
        }
        let video = fs::read(&output_path).map_err(|error| format!("模型没有生成视频文件：{error}"))?;
        Ok(STANDARD.encode(video))
    })
    .await
    .map_err(|error| format!("本地模型任务中断：{error}"))??;

    Ok(result)
}

fn safe_extension(file_name: &str) -> &'static str {
    match Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => ".png",
        "webp" => ".webp",
        "jpg" | "jpeg" => ".jpg",
        _ => ".jpg",
    }
}

fn safe_color(color: &str) -> String {
    let bytes = color.as_bytes();
    if bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(|digit| digit.is_ascii_hexdigit()) {
        color.to_string()
    } else {
        "#ffffff".to_string()
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![model_status, generate_spin])
        .run(tauri::generate_context!())
        .expect("error while running 360spin");
}
