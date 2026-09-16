use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const MAX_PER_RING: usize = 12;
pub const DEFAULT_DWELL_MS: u64 = 250;
pub const DEFAULT_ACCENT: &str = "#7EB8D4";

fn default_auto_update() -> bool {
    true
}
// Leave enough transparent room for the orb's animated glow. A circular native
// window region clipped both the glow and, on some WebView2 versions, the orb.
pub const ORB_SIZE: f64 = 92.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub dwell_ms: u64,
    pub accent: String,
    #[serde(default = "default_auto_update")]
    pub auto_update: bool,
    pub hubs: Vec<Hub>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hub {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub accent: String,
    pub x: f64,
    pub y: f64,
    pub monitor: u32,
    pub items: Vec<MenuItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MenuItem {
    #[serde(rename = "folder")]
    Folder {
        id: String,
        name: String,
        #[serde(default)]
        icon: Option<String>,
        items: Vec<MenuItem>,
    },
    #[serde(rename = "shortcut")]
    Shortcut {
        id: String,
        name: String,
        path: String,
        #[serde(default)]
        icon: Option<String>,
    },
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            dwell_ms: DEFAULT_DWELL_MS,
            accent: DEFAULT_ACCENT.to_string(),
            auto_update: true,
            hubs: Vec::new(),
        }
    }
}

pub fn app_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or("Could not resolve AppData")?;
    let dir = base.join("Orbit");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("icons")).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn config_path() -> Result<PathBuf, String> {
    Ok(app_dir()?.join("config.json"))
}

pub fn load() -> Result<AppConfig, String> {
    let path = config_path()?;
    if !path.exists() {
        let cfg = AppConfig::default();
        save(&cfg)?;
        return Ok(cfg);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut cfg: AppConfig = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if cfg.dwell_ms < 80 {
        cfg.dwell_ms = 80;
    }
    if cfg.accent.is_empty() {
        cfg.accent = DEFAULT_ACCENT.to_string();
    }
    for hub in &mut cfg.hubs {
        if hub.accent.is_empty() {
            hub.accent = cfg.accent.clone();
        }
    }
    validate_tree(&cfg)?;
    Ok(cfg)
}

pub fn save(cfg: &AppConfig) -> Result<(), String> {
    validate_tree(cfg)?;
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

pub fn validate_tree(cfg: &AppConfig) -> Result<(), String> {
    for hub in &cfg.hubs {
        validate_items(&hub.items)?;
    }
    Ok(())
}

fn validate_items(items: &[MenuItem]) -> Result<(), String> {
    if items.len() > MAX_PER_RING {
        return Err(format!(
            "A ring can hold at most {MAX_PER_RING} items. Make a subfolder."
        ));
    }
    for item in items {
        if let MenuItem::Folder { items, .. } = item {
            validate_items(items)?;
        }
    }
    Ok(())
}

pub fn shortcut_name(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Shortcut")
        .to_string()
}

pub fn find_hub_mut<'a>(cfg: &'a mut AppConfig, id: &str) -> Result<&'a mut Hub, String> {
    cfg.hubs
        .iter_mut()
        .find(|h| h.id == id)
        .ok_or_else(|| format!("Unknown hub {id}"))
}

pub fn find_hub<'a>(cfg: &'a AppConfig, id: &str) -> Result<&'a Hub, String> {
    cfg.hubs
        .iter()
        .find(|h| h.id == id)
        .ok_or_else(|| format!("Unknown hub {id}"))
}
