import sys
with open('src-tauri/src/commands/xenia.rs', 'r') as f:
    content = f.read()

content = content.replace('install_state::install_dir(&dir)', 'install_state::install_dir(&format!("{}/xenia", dir))')
content = content.replace('remove_xenia_install(dir.clone(), dir.clone())', 'remove_xenia_install(format!("{}/xenia", dir), dir.clone())')

with open('src-tauri/src/commands/xenia.rs', 'w') as f:
    f.write(content)
