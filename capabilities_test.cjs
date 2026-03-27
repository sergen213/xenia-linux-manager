const fs = require('fs');
let cap = JSON.parse(fs.readFileSync('src-tauri/capabilities/default.json'));
if (!cap.permissions.includes("core:webview:allow-convert-file-src")) {
    cap.permissions.push("core:webview:allow-convert-file-src");
}
fs.writeFileSync('src-tauri/capabilities/default.json', JSON.stringify(cap, null, 2));
