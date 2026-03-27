import json

with open('src-tauri/capabilities/default.json', 'r') as f:
    cap = json.load(f)

# Need to use the correct V2 permission names based on the error output:
cap["permissions"] = [p for p in cap["permissions"] if p not in ["fs:allow-read", "fs:allow-app-data-read", "fs:allow-app-local-data-read"]]

# Add the specific V2 allowed plugins scopes
# fs:allow-read is actually fs:allow-read-file / fs:allow-read-dir or fs:read-all
cap["permissions"].append("fs:read-all")
cap["permissions"].append("fs:allow-app-data-read-recursive")

with open('src-tauri/capabilities/default.json', 'w') as f:
    json.dump(cap, f, indent=2)
