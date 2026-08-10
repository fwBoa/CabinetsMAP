import json
import math
from pathlib import Path

INPUT = Path('/Users/daveee/Desktop/Projets/CabinetsMAP/departements-adminexpress.geojson')
OUTPUT = Path('/Users/daveee/Desktop/Projets/CabinetsMAP/departements.geojson')


def perpendicular_dist(point, start, end):
    x0, y0 = point
    x1, y1 = start
    x2, y2 = end
    if x1 == x2 and y1 == y2:
        return math.hypot(x0 - x1, y0 - y1)
    num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
    den = math.hypot(y2 - y1, x2 - x1)
    return num / den


def douglas_peucker(points, epsilon):
    if len(points) < 3:
        return points
    dmax = 0
    index = 0
    for i in range(1, len(points) - 1):
        d = perpendicular_dist(points[i], points[0], points[-1])
        if d > dmax:
            index = i
            dmax = d
    if dmax > epsilon:
        left = douglas_peucker(points[:index + 1], epsilon)
        right = douglas_peucker(points[index:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


def simplify_ring(ring, epsilon=0.005):
    result = douglas_peucker(ring, epsilon)
    if len(result) < 3:
        return []
    if result[0] != result[-1]:
        result.append(result[0])
    return result


def simplify_geometry(geom, epsilon=0.005):
    t = geom['type']
    c = geom['coordinates']
    if t == 'Polygon':
        rings = [r for r in (simplify_ring(ring, epsilon) for ring in c) if len(r) >= 4]
        if not rings:
            rings = [c[0]] if c and len(c[0]) >= 4 else c[:1]
        return {'type': 'Polygon', 'coordinates': rings}
    if t == 'MultiPolygon':
        polys = []
        for poly in c:
            rings = [r for r in (simplify_ring(ring, epsilon) for ring in poly) if len(r) >= 4]
            if rings:
                polys.append(rings)
        if not polys and c:
            polys = [poly for poly in c if poly and len(poly[0]) >= 4]
        return {
            'type': 'MultiPolygon',
            'coordinates': polys
        }
    return geom


def count_coords(obj):
    t = obj['type']
    c = obj['coordinates']
    if t == 'Point':
        return 1
    if t in ('LineString', 'MultiPoint'):
        return len(c)
    if t == 'Polygon':
        return sum(len(ring) for ring in c)
    if t == 'MultiPolygon':
        return sum(sum(len(ring) for ring in poly) for poly in c)
    if t == 'MultiLineString':
        return sum(len(seg) for seg in c)
    return 0


geo = json.loads(INPUT.read_text(encoding='utf-8'))

out_features = []
for f in geo['features']:
    code = str(f['properties'].get('code_insee'))
    name = f['properties'].get('nom_officiel') or f['properties'].get('nom_majuscule') or f['properties'].get('nom', '')
    simple = simplify_geometry(f['geometry'], epsilon=0.008)
    out_features.append({
        'type': 'Feature',
        'properties': {'code': code, 'nom': name},
        'geometry': simple
    })

# COMs 987 et 988 (absents des decoupages administratifs standards)
out_features.append({
    'type': 'Feature',
    'properties': {'code': '987', 'nom': 'Polynesie francaise'},
    'geometry': {
        'type': 'Polygon',
        'coordinates': [[
            [-152.3, -16.5], [-148.5, -16.5], [-148.5, -18.0], [-152.3, -18.0], [-152.3, -16.5]
        ]]
    }
})
out_features.append({
    'type': 'Feature',
    'properties': {'code': '988', 'nom': 'Nouvelle-Caledonie'},
    'geometry': {
        'type': 'Polygon',
        'coordinates': [[
            [163.2, -19.0], [168.5, -19.0], [168.5, -23.0], [163.2, -23.0], [163.2, -19.0]
        ]]
    }
})

out = {'type': 'FeatureCollection', 'features': out_features}
OUTPUT.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')

total = sum(count_coords(f['geometry']) for f in out_features)
print(f"Wrote {OUTPUT} with {len(out_features)} features, {total} coords, size {OUTPUT.stat().st_size / 1024:.1f} KB")
