import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

GEOJSON_PATH = Path('/Users/daveee/Desktop/Projets/CabinetsMAP/cabinets.geojson')
CACHE_PATH = Path('/Users/daveee/Desktop/Projets/CabinetsMAP/geocode_cache.json')
OUT_PATH = Path('/Users/daveee/Desktop/Projets/CabinetsMAP/cabinets.geojson')

# Fallbacks connus pour les adresses incomplètes
FALLBACKS = {
    '06400 CANNES': '18 Boulevard Carnot, 06400 Cannes, France',
    '59110 LA MADELEINE': '40 Rue Pasteur, 59110 La Madeleine, France',
    '43-45 Rue de Breteuil - 13006 MARSEILLE': 'Rue Breteuil, 13006 Marseille, France',
    '11 Rue Gambetta - 97110 POINT A PITRE': '11 Rue Gambetta, 97110 Pointe-à-Pitre, Guadeloupe, France',
}

HEADERS = {
    'User-Agent': 'CabinetsMAP/1.0 (github.com/cabinetsmap)',
    'Accept-Language': 'fr'
}

def load_cache():
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding='utf-8'))
    return {}

def save_cache(cache):
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')

def geocode(address):
    query = FALLBACKS.get(address, address)
    params = {
        'q': query,
        'format': 'json',
        'limit': 1,
        'addressdetails': 1
    }
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    return data[0] if data else None

def main():
    geojson = json.loads(GEOJSON_PATH.read_text(encoding='utf-8'))
    cache = load_cache()
    failures = []

    for feature in geojson['features']:
        address = feature['properties'].get('adresse')
        if not address:
            failures.append((feature['properties']['nom'], 'pas d\'adresse'))
            continue

        effective_address = FALLBACKS.get(address, address)
        if effective_address in cache:
            result = cache[effective_address]
        else:
            try:
                result = geocode(address)
                cache[effective_address] = result
                save_cache(cache)
                time.sleep(1.1)
            except Exception as e:
                failures.append((feature['properties']['nom'], str(e)))
                continue

        if result:
            feature['geometry']['coordinates'] = [float(result['lon']), float(result['lat'])]
            feature['properties']['display_name'] = result.get('display_name')
            feature['properties']['place_id'] = result.get('place_id')
        else:
            failures.append((feature['properties']['nom'], address))

    OUT_PATH.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding='utf-8')

    print('Géocodage terminé.')
    for f in geojson['features']:
        c = f['geometry']['coordinates']
        print(f"{f['properties']['id']}: {f['properties']['nom']} -> lon={c[0]}, lat={c[1]}")
    if failures:
        print('\nÉchecs :')
        for n, e in failures:
            print(f' - {n}: {e}')

if __name__ == '__main__':
    main()
