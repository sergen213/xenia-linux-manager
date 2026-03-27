import json

with open('src-tauri/tauri.conf.json', 'r') as f:
    config = json.load(f)

# Tauri V2 asset protocol configuration usually expects an array of rules.
config['app']['security']['assetProtocol'] = {
    "enable": True,
    "scope": ["**"]  # Let's try "**" as a more permissive fallback, or ["**/*"]
}
config['app']['security']['csp'] = "default-src 'self' asset: http://asset.localhost; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: asset: http://asset.localhost; font-src 'self' data:; connect-src 'self' https://api.github.com https://github.com"

with open('src-tauri/tauri.conf.json', 'w') as f:
    json.dump(config, f, indent=2)
