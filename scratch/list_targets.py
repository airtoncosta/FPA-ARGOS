import json

with open('code_sandbox_light_git_fe61910d_1781185357/radar_data/radar_targets.json', encoding='utf-8') as f:
    data = json.load(f)

targets = data['all_targets']
print(f"Total targets loaded: {len(targets)}")
for i, t in enumerate(targets, 1):
    platform = t.get('platform', '')
    name = t.get('name', '')
    url = t.get('url', '')
    post_url = t.get('latestPost', {}).get('postUrl', '')
    handle = t.get('handle', '')
    print(f"{i:02d}. [{platform.upper():9s}] {name[:35]:35s} | Handle: {handle:25s} | URL: {post_url}")
