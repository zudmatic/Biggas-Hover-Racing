"""Import the supplied v02 package: python3 scripts/import-biggas-city.py package.zip.
Keep the native GLBs at their shared origin; convert only gameplay Z-up to Y-up.
"""
import json
from pathlib import Path
import sys
import zipfile

out = Path('public/models/biggas-city')
out.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(sys.argv[1]) as package:
    for part in ['Core', 'City', 'Forest_LOD1', 'Cascade', 'Landmark', 'Collision']:
        name = f'Biggas_City_039_v02_{part}.glb'
        (out / name).write_bytes(package.read('models/' + name))
    (out / 'README_ES.txt').write_bytes(package.read('README_ES.txt'))
    route = json.loads(package.read('data/route.json'))
    setup = json.loads(package.read('data/race_setup.json'))

def y_up(p):
    return [p[0], p[2], -p[1]]

def write(name, data):
    (out / name).write_text(json.dumps(data, separators=(',', ':')) + '\n')

write('route_gltf.json', {'length_m': route['length_m'], 'samples': [
    {'index': p['index'], 'distance_m': p['s_m'], 'position': y_up(p['position']),
     'forward': y_up(p['tangent']), 'width_m': p['width_m'], 'sector': p['sector']}
    for p in route['points']]})
write('gameplay.json', {'name': 'Biggas City 039 v02', 'lap_length_m': route['length_m'],
    'units': 'meters', 'road_width_m': 22, 'spawn_positions': [
        {'grid_position': p['id'], 'route_index': p['route_index'],
         'position_gltf': y_up(p['position']), 'forward_gltf': y_up(p['forward'])}
        for p in setup['spawns']], 'checkpoints': [
        {'order': p['id'], 'route_index': p['route_index'], 'width_m': p['width_m'],
         'position_gltf': y_up(p['position']), 'forward_gltf': y_up(p['forward'])}
        for p in setup['checkpoints']]})
print(f'Imported {route["length_m"]} m, {len(route["points"])} samples, 12 spawns and 32 checkpoints')
