import json

with open('src-tauri/capabilities/default.json', 'r') as f:
    cap = json.load(f)

cap['permissions'] = [
    p for p in cap['permissions'] if p != "core:webview:allow-convert-file-src"
]

with open('src-tauri/capabilities/default.json', 'w') as f:
    json.dump(cap, f, indent=2)
