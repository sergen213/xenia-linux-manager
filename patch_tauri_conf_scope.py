import json

with open('src-tauri/tauri.conf.json', 'r') as f:
    config = json.load(f)

# Make sure fs protocol has broad enough access. The most permissive in v2 is just ["**"]
config['app']['security']['assetProtocol'] = {
    "enable": True,
    "scope": ["**"]
}

with open('src-tauri/tauri.conf.json', 'w') as f:
    json.dump(config, f, indent=2)

