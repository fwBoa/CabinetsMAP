import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / 'index.template.html'
OUT = ROOT / 'index.html'
CABINETS_FILE = ROOT / 'cabinets.geojson'  # fallback offline uniquement
DEPARTEMENTS = ROOT / 'departements.geojson'
ASSETS = ROOT / 'assets'

# URL de l'API publique. Override avec env API_BASE_URL pour build local.
API_BASE_URL = (
    sys.argv[1]
    if len(sys.argv) > 1 and sys.argv[1].startswith('http')
    else 'https://cabinetsmap.vercel.app'
)


def geojson_to_js_value(data) -> str:
    """Sérialise un GeoJSON en littéral JS compact (sans escapes inutiles).
    Accepte soit un dict (déjà chargé), soit un Path (fichier GeoJSON)."""
    if isinstance(data, Path):
        data = json.loads(data.read_text(encoding='utf-8'))
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'))


def fetch_cabinets_from_neon():
    """Lit la liste des cabinets depuis Neon via l'API publique /api/geojson/cabinets.
    Retourne None si l'API est inaccessible (build offline)."""
    url = f"{API_BASE_URL.rstrip('/')}/api/geojson/cabinets?_t={int(time.time())}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
        print(f'  ⚠ Neon inaccessible ({type(e).__name__}: {e}), fallback sur {CABINETS_FILE.name}', file=sys.stderr)
        return None


def read_asset(name: str) -> str:
    return (ASSETS / name).read_text(encoding='utf-8')


def inline_assets(template: str) -> str:
    """Inline the CSS (perf + offline). Scripts are kept external so that
    updates to assets/*.js take effect without rebuilding the HTML."""
    # CSS — inline
    css = read_asset('styles.css')
    template = re.sub(
        r'<link[^>]*href=["\']assets/styles\.css["\'][^>]*>',
        lambda m: f'<style>\n{css}\n</style>',
        template,
        count=1
    )

    # Scripts — add ?v=<hash> cache-busting query so the browser
    # re-downloads them when their content changes (Vercel caches them for 1h).
    import hashlib
    script_order = ['config.js', 'map.js', 'ui.js', 'main.js']
    for script_name in script_order:
        js_content = read_asset(script_name)
        js_hash = hashlib.md5(js_content.encode('utf-8')).hexdigest()[:8]
        template = re.sub(
            rf'<script[^>]*src=["\']assets/{re.escape(script_name)}(?:\?v=[^"\']+)?["\'][^>]*></script>',
            lambda m, js=script_name, h=js_hash: f'<script src="assets/{js}?v={h}"></script>',
            template,
            count=1
        )
    return template


def build():
    if not TEMPLATE.exists():
        raise FileNotFoundError(f'Template manquant : {TEMPLATE}')
    if not DEPARTEMENTS.exists():
        raise FileNotFoundError(f'GeoJSON manquant : {DEPARTEMENTS}')

    template = TEMPLATE.read_text(encoding='utf-8')
    template = inline_assets(template)

    # Source de verite : Neon (via API). Fallback fichier local si offline.
    cabinets_geojson = fetch_cabinets_from_neon()
    if cabinets_geojson is None:
        if not CABINETS_FILE.exists():
            raise FileNotFoundError(f'Ni Neon ni {CABINETS_FILE.name} accessibles.')
        cabinets_geojson = json.loads(CABINETS_FILE.read_text(encoding='utf-8'))
        print('  → utilisation du fichier local (Neon indisponible)')
    else:
        print(f'  → {len(cabinets_geojson["features"])} cabinets lus depuis Neon')

    template = template.replace('__CABINETS_GEOJSON__', geojson_to_js_value(cabinets_geojson))
    template = template.replace('__DEPARTEMENTS_GEOJSON__', geojson_to_js_value(DEPARTEMENTS))

    OUT.write_text(template, encoding='utf-8')
    print(f'Wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)')


if __name__ == '__main__':
    build()
