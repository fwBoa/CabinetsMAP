import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / 'index.template.html'
OUT = ROOT / 'index.html'
CABINETS = ROOT / 'cabinets.geojson'
DEPARTEMENTS = ROOT / 'departements.geojson'
ASSETS = ROOT / 'assets'


def geojson_to_js_value(path: Path) -> str:
    """Minify a GeoJSON file into a compact JS literal."""
    data = json.loads(path.read_text(encoding='utf-8'))
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'))


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
    if not CABINETS.exists():
        raise FileNotFoundError(f'GeoJSON manquant : {CABINETS}')
    if not DEPARTEMENTS.exists():
        raise FileNotFoundError(f'GeoJSON manquant : {DEPARTEMENTS}')

    template = TEMPLATE.read_text(encoding='utf-8')
    template = inline_assets(template)

    template = template.replace('__CABINETS_GEOJSON__', geojson_to_js_value(CABINETS))
    template = template.replace('__DEPARTEMENTS_GEOJSON__', geojson_to_js_value(DEPARTEMENTS))

    OUT.write_text(template, encoding='utf-8')
    print(f'Wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)')


if __name__ == '__main__':
    build()
