import sys
import re

with open('src-tauri/src/library/artwork.rs', 'r') as f:
    text = f.read()

X360DB_INFO_URL = "https://xenia-manager.github.io/x360db/titles/{title_id}/info.json"
X360DB_FALLBACK_URL = "https://xenia-manager.github.io/x360db/titles/{title_id}/artwork/boxart.jpg"

new_code = r"""
#[derive(Debug, serde::Deserialize)]
struct X360DbArtwork {
    boxart: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct X360DbInfo {
    artwork: Option<X360DbArtwork>,
}

async fn fetch_boxart_urls(title_id: &str) -> Vec<String> {
    let mut urls = Vec::new();
    
    // First, try to fetch info.json to get the high-quality Xbox CDN URL
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();
        
    let info_url = format!("https://xenia-manager.github.io/x360db/titles/{title_id}/info.json");
    if let Ok(response) = client.get(&info_url).send().await {
        if response.status().is_success() {
            if let Ok(info) = response.json::<X360DbInfo>().await {
                if let Some(art) = info.artwork {
                    if let Some(boxart) = art.boxart {
                        urls.push(boxart);
                    }
                }
            }
        }
    }
    
    // Add the primary fallback from x360db
    urls.push(format!("https://xenia-manager.github.io/x360db/titles/{title_id}/artwork/boxart.jpg"));
    
    // Add the legacy repository URL as final fallback
    urls.push(format!("https://raw.githubusercontent.com/xenia-manager/xenia-manager-database/main/Assets/Marketplace/Boxarts/{title_id}.jpg"));
    
    urls
}

async fn download_artwork_with_fallbacks(title_id: &str, cached_path: &Path) -> Result<(), String> {
    let urls = fetch_boxart_urls(title_id).await;
    
    for url in urls {
        eprintln!("[artwork] Attempting to download from: {}", url);
        if download_artwork(&url, cached_path).await.is_ok() {
            return Ok(());
        }
    }
    
    Err("All artwork URLs failed".to_string())
}
"""

if "fetch_boxart_urls" not in text:
    text = text.replace("async fn download_artwork(", new_code + "\nasync fn download_artwork(")

    # Replace the actual fetching logic
    old_logic = """    // Build download URL.
    let url = XBOX_BOXART_URL.replace("{title_id}", &title_id);
    eprintln!("[artwork] Downloading: {url}");

    // Download.
    match download_artwork(&url, &cached_path).await {
        Ok(()) => {
            let path_str = cached_path.to_string_lossy().to_string();
            let _ = persist_artwork_path(library_metadata_path, game_id, &path_str);
            return ArtworkResult {
                game_id: game_id.to_string(),
                artwork_path: Some(path_str),
                already_cached: false,
                error: None,
            };
        }
        Err(e) => {
            return ArtworkResult {
                game_id: game_id.to_string(),
                artwork_path: None,
                already_cached: false,
                error: Some(e),
            };
        }
    }"""
    
    new_logic = """    // Try downloading with fallbacks.
    match download_artwork_with_fallbacks(&title_id, &cached_path).await {
        Ok(()) => {
            let path_str = cached_path.to_string_lossy().to_string();
            let _ = persist_artwork_path(library_metadata_path, game_id, &path_str);
            return ArtworkResult {
                game_id: game_id.to_string(),
                artwork_path: Some(path_str),
                already_cached: false,
                error: None,
            };
        }
        Err(e) => {
            return ArtworkResult {
                game_id: game_id.to_string(),
                artwork_path: None,
                already_cached: false,
                error: Some(e),
            };
        }
    }"""
    text = text.replace(old_logic, new_logic)

with open('src-tauri/src/library/artwork.rs', 'w') as f:
    f.write(text)
