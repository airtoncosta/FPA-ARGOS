import urllib.request
import json

try:
    req = urllib.request.Request('http://localhost:3000/api/radar/targets')
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(f"API /api/radar/targets: HTTP {resp.status}, Total: {data.get('totalTargets')}")
except Exception as e:
    print(f"API Error: {e}")

try:
    req2 = urllib.request.Request('http://localhost:3000/radar_data/radar_targets.json')
    with urllib.request.urlopen(req2, timeout=5) as resp2:
        data2 = json.loads(resp2.read().decode('utf-8'))
        print(f"Static /radar_data/radar_targets.json: HTTP {resp2.status}, Total: {len(data2.get('all_targets', []))}")
except Exception as e:
    print(f"Static Error: {e}")
