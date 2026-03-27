import json

with open('src-tauri/capabilities/default.json', 'r') as f:
    cap = json.load(f)

# The frontend code for picking directories uses "dialog:default" and "fs:default" or equivalent.
new_perms = ["dialog:default", "fs:default"]
for p in new_perms:
    if p not in cap["permissions"]:
        cap["permissions"].append(p)

with open('src-tauri/capabilities/default.json', 'w') as f:
    json.dump(cap, f, indent=2)
