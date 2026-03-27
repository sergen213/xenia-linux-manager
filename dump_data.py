import json

with open('/home/sergeng/.local/share/xenia-linux-manager/library/library-identity.json') as f:
    d = json.load(f)
    print("Games in local library:")
    for game in d.get("games", []):
        print(f"Title: {game.get('title')} | Art: {game.get('artwork_path')} | TitleID: {game.get('title_id')}")
