import json
import re
from pathlib import Path

ROOT = Path('/Users/daveee/Desktop/Projets/CabinetsMAP')
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
    """Replace external asset links/scripts by inline <style>/<script> blocks."""
    # CSS
    css = read_asset('styles.css')
    template = re.sub(
        r'<link[^>]*href=["\']assets/styles\.css["\'][^>]*>',
        lambda m: f'<style>\n{css}\n</style>',
        template,
        count=1
    )

    # Scripts — inject in the requested order
    script_order = ['config.js', 'map.js', 'ui.js', 'main.js']
    for script_name in script_order:
        js = read_asset(script_name)
        template = re.sub(
            rf'<script[^>]*src=["\']assets/{re.escape(script_name)}["\'][^>]*></script>',
            lambda m, js=js: f'<script>\n{js}\n</script>',
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
