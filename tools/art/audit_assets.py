"""Inventory the shipped GLB meshes/animations and PBR files; no network calls."""
import hashlib
import json
import struct
from pathlib import Path

root = Path(__file__).resolve().parents[2]
asset_root = root / 'assets/rebuild'
sources = {
    'sentinel': ('Irondust', 'https://opengameart.org/content/sci-fi-soldier'),
    'stalker': ('City Building Game Art', 'https://opengameart.org/content/3d-horror-game-monster'),
    'revenant': ('Irondust', 'https://opengameart.org/content/evil-cyborg'),
    'boss': ('Irondust; project-derived variant', 'https://opengameart.org/content/evil-cyborg'),
    'covered-car': ('MP / Poly Haven', 'https://polyhaven.com/a/covered_car'),
}
rows = []
for path in sorted(asset_root.rglob('*')):
    if not path.is_file():
        continue
    data = path.read_bytes()
    row = {'path': str(path.relative_to(root)), 'bytes': len(data),
           'sha256': hashlib.sha256(data).hexdigest(), 'runtime': path.suffix in ('.glb', '.jpg')}
    if path.suffix == '.glb':
        magic, version, total = struct.unpack_from('<4sII', data)
        assert magic == b'glTF' and version == 2 and total == len(data), path
        length, kind = struct.unpack_from('<I4s', data, 12)
        assert kind == b'JSON', path
        gltf = json.loads(data[20:20 + length])
        row['triangles'] = sum(gltf['accessors'][p.get('indices', p['attributes']['POSITION'])]['count'] // 3
                               for m in gltf['meshes'] for p in m['primitives'] if p.get('mode', 4) == 4)
        row['skinJointCounts'] = [len(s['joints']) for s in gltf.get('skins', [])]
        row['animations'] = [{'name': a['name'], 'durationSeconds': round(max(gltf['accessors'][s['input']]['max'][0] for s in a['samplers']), 4)}
                             for a in gltf.get('animations', [])]
        family = path.stem.removesuffix('-lod')
        if family.startswith('weapon-'):
            row.update(origin='Project-authored mesh', thirdPartySource=None)
        else:
            author, url = sources[family]
            row.update(origin='Third-party mesh with project conversion / edits', author=author, source=url, sourceLicense='CC0-1.0')
    elif path.suffix == '.jpg':
        slug = path.stem.removesuffix('_Diffuse').removesuffix('_nor_gl').removesuffix('_Rough')
        row.update(origin='Poly Haven PBR texture', source='https://polyhaven.com/a/' + slug, sourceLicense='CC0-1.0')
    else:
        row.update(origin='Project image-generation material edit; authoring source only', note='Not a mesh or animation; incorporated as a candidate base color in sentinel.glb.')
    rows.append(row)
output = root / 'docs/art-rebuild/asset-manifest.json'
output.write_text(json.dumps({'scope': 'Shipped files, not upstream source archives. Sources and rights limitations: ASSETS.md.', 'assets': rows}, ensure_ascii=False, indent=2))
print(json.dumps({'file': str(output), 'files': len(rows), 'runtimeFiles': sum(r['runtime'] for r in rows)}))
