import sys
with open('src-tauri/src/xenia/lifecycle.rs', 'r') as f:
    content = f.read()
content = content.replace('install_state::install_dir(&dir)', 'install_state::install_dir(&format!("{}/xenia", dir))')
with open('src-tauri/src/xenia/lifecycle.rs', 'w') as f:
    f.write(content)
