use base64::{engine::general_purpose::STANDARD, Engine as _};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

use crate::config;

pub fn cache_dir() -> Result<PathBuf, String> {
    Ok(config::app_dir()?.join("icons"))
}

pub fn get_icon_data_url(path: &str) -> Result<String, String> {
    if let Some(mime) = image_mime(path) {
        let bytes = fs::read(path).map_err(|e| e.to_string())?;
        return Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)));
    }
    let png = load_or_extract(path)?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(png)))
}

fn image_mime(path: &str) -> Option<&'static str> {
    match std::path::Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())?
        .to_ascii_lowercase()
        .as_str()
    {
        "svg" => Some("image/svg+xml"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "ico" => Some("image/x-icon"),
        _ => None,
    }
}

pub fn import_hub_icon(hub_id: &str, source: &str) -> Result<PathBuf, String> {
    let source = std::path::Path::new(source);
    if !source.is_file() {
        return Err("The selected icon file does not exist.".into());
    }
    let ext = source
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or("Choose an SVG, ICO, JPG, or PNG file.")?;
    if !matches!(ext.as_str(), "svg" | "ico" | "jpg" | "jpeg" | "png") {
        return Err("Choose an SVG, ICO, JPG, or PNG file.".into());
    }
    let size = fs::metadata(source).map_err(|e| e.to_string())?.len();
    if size > 10 * 1024 * 1024 {
        return Err("Icon files must be smaller than 10 MB.".into());
    }
    let dir = config::app_dir()?.join("hub-icons");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(format!("{hub_id}-{}.{}", uuid::Uuid::new_v4(), ext));
    fs::copy(source, &target).map_err(|e| e.to_string())?;
    Ok(target)
}

fn cache_file(path: &str) -> Result<PathBuf, String> {
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    let hash = hex_encode(&hasher.finalize());
    Ok(cache_dir()?.join(format!("{hash}.png")))
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn load_or_extract(path: &str) -> Result<Vec<u8>, String> {
    let file = cache_file(path)?;
    if file.exists() {
        return fs::read(&file).map_err(|e| e.to_string());
    }
    let png = extract_png(path)?;
    fs::write(&file, &png).map_err(|e| e.to_string())?;
    Ok(png)
}

#[cfg(windows)]
fn extract_png(path: &str) -> Result<Vec<u8>, String> {
    windows_extract(path).or_else(|_| fallback_dot_png())
}

#[cfg(not(windows))]
fn extract_png(_path: &str) -> Result<Vec<u8>, String> {
    fallback_dot_png()
}

fn fallback_dot_png() -> Result<Vec<u8>, String> {
    let img = image::RgbaImage::from_pixel(64, 64, image::Rgba([126, 184, 212, 255]));
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(buf)
}

#[cfg(windows)]
fn windows_extract(path: &str) -> Result<Vec<u8>, String> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::UI::Shell::{
        IShellItem, IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_ICONONLY,
        SIIGBF_RESIZETOFIT,
    };

    unsafe {
        let item: IShellItem =
            SHCreateItemFromParsingName(&HSTRING::from(path), None).map_err(|e| e.to_string())?;
        let factory: IShellItemImageFactory = Interface::cast(&item).map_err(|e| e.to_string())?;
        let hbmp = factory
            .GetImage(
                SIZE { cx: 128, cy: 128 },
                SIIGBF_RESIZETOFIT | SIIGBF_ICONONLY,
            )
            .map_err(|e| e.to_string())?;

        let mut bm = BITMAP::default();
        let got = windows::Win32::Graphics::Gdi::GetObjectW(
            HGDIOBJ(hbmp.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut BITMAP as *mut core::ffi::c_void),
        );
        if got == 0 {
            let _ = DeleteObject(HGDIOBJ(hbmp.0));
            return Err("GetObjectW failed".into());
        }

        let w = bm.bmWidth;
        let h = bm.bmHeight.abs();
        if w <= 0 || h <= 0 {
            let _ = DeleteObject(HGDIOBJ(hbmp.0));
            return Err("empty bitmap".into());
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut pixels = vec![0u8; (w * h * 4) as usize];
        let hdc = GetDC(None);
        let copied = GetDIBits(
            hdc,
            hbmp,
            0,
            h as u32,
            Some(pixels.as_mut_ptr() as *mut core::ffi::c_void),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, hdc);
        let _ = DeleteObject(HGDIOBJ(hbmp.0));
        if copied == 0 {
            return Err("GetDIBits failed".into());
        }

        for px in pixels.chunks_exact_mut(4) {
            px.swap(0, 2);
        }

        let img = image::RgbaImage::from_raw(w as u32, h as u32, pixels)
            .ok_or("Could not build icon image")?;
        let mut png = Vec::new();
        img.write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        Ok(png)
    }
}
