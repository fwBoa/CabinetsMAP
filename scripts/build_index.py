import json
import os
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
    Echec = exception levee (pas de fallback silencieux sur cabinets.geojson :
    on ne veut JAMAIS embarquer des donnees qui ne refletent pas Neon en prod)."""
    url = f"{API_BASE_URL.rstrip('/')}/api/geojson/cabinets?_t={int(time.time())}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            if resp.status != 200:
                raise RuntimeError(f'API status {resp.status}')
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('type') != 'FeatureCollection':
                raise RuntimeError(f'reponse invalide (type={data.get("type")})')
            return data
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
        raise RuntimeError(
            f'Neon inaccessible ({type(e).__name__}: {e}). '
            f'Build refuse pour empecher un bundle stale. '
            f'Verifier que l\'API repond ou definir SKIP_NEON_CHECK=1 pour build local.'
        ) from e


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

    # --- Smoke-test Neon ---
    # Le runtime (assets/main.js) fetch /api/geojson/cabinets au demarrage.
    # On verifie ici que Neon repond pour detecter une chaine de build cassee
    # (down Neon, mauvaise URL, bug de la Function). Si Neon KO on refuse le
    # build loudement (exit non-zero). SKIP_NEON_CHECK=1 uniquement pour debug.
    if os.environ.get('SKIP_NEON_CHECK') == '1':
        print('  ⚠ SKIP_NEON_CHECK=1 : smoke-test Neon desactive')
    else:
        try:
            cabinets_count = len(fetch_cabinets_from_neon()['features'])
            print(f'  ✓ Neon repond ({cabinets_count} cabinets)')
        except RuntimeError as e:
            raise SystemExit(f'\n✗ Build refuse : {e}\n') from e

    template = TEMPLATE.read_text(encoding='utf-8')
    template = inline_assets(template)
    # Note : __CABINETS_GEOJSON__ et __DEPARTEMENTS_GEOJSON__ ne sont PLUS
    # inlines dans le HTML. Le runtime fetch Neon + departements.geojson au
    # chargement. Raison : Neon est la seule source de verite, on ne veut
    # JAMAIS embarquer de donnees statiques dans le bundle.

    OUT.write_text(template, encoding='utf-8')
    print(f'Wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)')


if __name__ == '__main__':
    build()
