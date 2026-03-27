import sys

with open('src-tauri/src/lib.rs', 'r') as f:
    text = f.read()

if 'tauri_plugin_fs' not in text:
    text = text.replace(
        '.plugin(tauri_plugin_process::init())',
        '.plugin(tauri_plugin_process::init())\n        .plugin(tauri_plugin_fs::init())'
    )

with open('src-tauri/src/lib.rs', 'w') as f:
    f.write(text)

