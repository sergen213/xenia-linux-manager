import json

with open('src-tauri/capabilities/default.json', 'r') as f:
    cap = json.load(f)

# Need to use the exact permission name from the error block!
cap["permissions"] = [p for p in cap["permissions"] if p not in ["fs:read-all", "fs:allow-app-data-read-recursive"]]

cap["permissions"].append("fs:allow-appdata-read-recursive")
cap["permissions"].append("fs:allow-localdata-read-recursive")
cap["permissions"].append("fs:allow-applocaldata-read-recursive")
cap["permissions"].append("fs:read-dirs")

with open('src-tauri/capabilities/default.json', 'w') as f:
    json.dump(cap, f, indent=2)
