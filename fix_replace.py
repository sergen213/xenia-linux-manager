import sys

with open('src-tauri/src/library/artwork.rs', 'r') as f:
    text = f.read()

# I messed up the replacement - let's find where XBOX_BOXART_URL is used and replace it
import re

pattern = r"let url = XBOX_BOXART_URL\.replace(.*);\s*eprintln!\(.*Downloading.*\);\s*match download_artwork\(&url, &cached_path\)\.await \{(.*?)\}\n\s+\}"

match = re.search(pattern, text, re.DOTALL)
if match:
    pass # Oh it looks like I completely missed putting it where it belongs.

# Let's just do a string replace on what's actually there
old_logic = """    // Build download URL.
    let url = XBOX_BOXART_URL.replace("{title_id}", &title_id);
    eprintln!("[artwork] Downloading: {url}");

    // Download.
    match download_artwork(&url, &cached_path).await {"""

new_logic = """    // Build download URL.
    let url = XBOX_BOXART_URL.replace("{title_id}", &title_id);
    eprintln!("[artwork] Downloading: {url}");

    // Download using fallbacks.
    match download_artwork_with_fallbacks(&title_id, &cached_path).await {"""

text = text.replace(old_logic, new_logic)

with open('src-tauri/src/library/artwork.rs', 'w') as f:
    f.write(text)
