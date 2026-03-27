import json
with open('src-tauri/tauri.conf.json', 'r') as f:
    config = json.load(f)

# Need to make sure CSP allows our assets:
csp = config['app']['security'].get('csp', '')
if 'img-src' not in csp:
    if csp:
        config['app']['security']['csp'] += "; img-src 'self' data: https: asset: http://asset.localhost"
    else:
        config['app']['security']['csp'] = "default-src 'self' asset: http://asset.localhost; img-src 'self' data: https: asset: http://asset.localhost;"
elif 'asset:' not in csp and 'http://asset.localhost' not in csp:
    # Just aggressively set it to something we know works
    config['app']['security']['csp'] = "default-src 'self' asset: http://asset.localhost; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: asset: http://asset.localhost; font-src 'self' data:; connect-src 'self' https://api.github.com https://github.com"

# The assetProtocol in Tauri v2 can also be configured with full access:
config['app']['security']['assetProtocol']['scope'] = ["**"]

with open('src-tauri/tauri.conf.json', 'w') as f:
    json.dump(config, f, indent=2)
