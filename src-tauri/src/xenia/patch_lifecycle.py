import sys

with open('src-tauri/src/xenia/lifecycle.rs', 'r') as f:
    content = f.read()

content = content.replace('pub async fn promote_staged_build(', 'pub async fn promote_staged_build(\n    xenia_path: &str,')
content = content.replace('let target_dir = install_state::install_dir(app_data_path);', 'let target_dir = install_state::install_dir(xenia_path);')
content = content.replace('pub async fn rollback_promotion(app_data_path: &str)', 'pub async fn rollback_promotion(app_data_path: &str, xenia_path: &str)')
content = content.replace('pub async fn remove_install(app_data_path: &str)', 'pub async fn remove_install(app_data_path: &str, xenia_path: &str)')

content = content.replace('promote_staged_build(&dir, &release, &exec)', 'promote_staged_build(&format!("{}/xenia", dir), &dir, &release, &exec)')
content = content.replace('rollback_promotion(&dir)', 'rollback_promotion(&dir, &format!("{}/xenia", dir))')
content = content.replace('remove_install(&dir)', 'remove_install(&dir, &format!("{}/xenia", dir))')

with open('src-tauri/src/xenia/lifecycle.rs', 'w') as f:
    f.write(content)
