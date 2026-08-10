import json
import re
from pathlib import Path

ROOT = Path('/Users/daveee/Desktop/Projets/CabinetsMAP')
TEMPLATE = ROOT / 'index.template.html'
OUT = ROOT / 'index.html'
CABINETS = ROOT / 'cabinets.geojson'
DEPARTEMENTS = ROOT / 'departements.geojson'


def geojson_to_js_value(path: Path) -> str:
    """Minify a GeoJSON file into a compact JS literal."""
    data = json.loads(path.read_text(encoding='utf-8'))
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'))


def build():
    if not TEMPLATE.exists():
        raise FileNotFoundError(f'Template manquant : {TEMPLATE}')
    if not CABINETS.exists():
        raise FileNotFoundError(f'GeoJSON manquant : {CABINETS}')
    if not DEPARTEMENTS.exists():
        raise FileNotFoundError(f'GeoJSON manquant : {DEPARTEMENTS}')

    template = TEMPLATE.read_text(encoding='utf-8')

    template = template.replace('__CABINETS_GEOJSON__', geojson_to_js_value(CABINETS))
    template = template.replace('__DEPARTEMENTS_GEOJSON__', geojson_to_js_value(DEPARTEMENTS))

    OUT.write_text(template, encoding='utf-8')
    print(f'Wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)')


if __name__ == '__main__':
    build()
