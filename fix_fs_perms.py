import json

with open('src-tauri/capabilities/default.json', 'r') as f:
    cap = json.load(f)

new_perms = [
    "fs:allow-read",
    "fs:allow-app-data-read",
    "fs:allow-app-local-data-read"
]
for p in new_perms:
    if p not in cap["permissions"]:
        cap["permissions"].append(p)

with open('src-tauri/capabilities/default.json', 'w') as f:
    json.dump(cap, f, indent=2)
