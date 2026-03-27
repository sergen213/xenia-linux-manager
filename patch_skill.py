import os

skill_file = os.path.expanduser('~/.hermes/skills/software-development/tauri-v2-asset-protocol/SKILL.md')
with open(skill_file, 'r') as f:
    content = f.read()

new_pitfalls = """## Pitfalls
- **Plugin Setup:** Ensure `tauri-plugin-fs` is added (`cargo add tauri-plugin-fs`) and registered in `lib.rs` (`.plugin(tauri_plugin_fs::init())`). The web engine relies on the Rust fs plugin to securely map the local file paths under the hood.
- **Do NOT manually assign webview permissions:** Do not add `"core:webview:allow-convert-file-src"` to your `capabilities/default.json`. In Tauri V2, doing so causes a direct build crash (`Permission not found`). Just configuring `assetProtocol`'s scope is enough.
- **CSP Missing Directives:** Just adding `assetProtocol.enable = true` is not enough. The WebView will block the request if the protocol isn't in your CSP.
- **Cargo Feature Mismatch:** Tauri v2 enforces that `tauri.conf.json` permissions have matching Cargo features compiled in. Forgetting `cargo add tauri --features protocol-asset` will break the build with an error about the allowlist.
- **Scope Restrictions:** If the file path given to `convertFileSrc` falls outside the allowed `scope` array, Tauri will return a 403 Forbidden silently in the network tab."""

content = content.replace(
"""## Pitfalls
- **CSP Missing Directives:** Just adding `assetProtocol.enable = true` is not enough. The WebView will block the request if the protocol isn't in your CSP.
- **Cargo Feature Mismatch:** Tauri v2 enforces that `tauri.conf.json` permissions have matching Cargo features compiled in. Forgetting `cargo add tauri --features protocol-asset` will break the build with an error about the allowlist.
- **Scope Restrictions:** If the file path given to `convertFileSrc` falls outside the allowed `scope` array, Tauri will return a 403 Forbidden silently in the network tab.""",
new_pitfalls
)

with open(skill_file, 'w') as f:
    f.write(content)
