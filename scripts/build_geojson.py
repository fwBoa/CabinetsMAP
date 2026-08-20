import csv
import json
import re
from pathlib import Path

CSV_PATH = Path('/Users/daveee/Desktop/Projets/CabinetsMAP/CABINETS - LISTE CABINET.csv')
OUT_PATH = Path('/Users/daveee/Desktop/Projets/CabinetsMAP/cabinets.geojson')
META_PATH = Path('/Users/daveee/Desktop/Projets/CabinetsMAP/metadata.json')

EMAIL_RE = re.compile(r'[^\s,]+@[^\s,]+\.[a-z]{2,}', re.IGNORECASE)
PHONE_RE = re.compile(r'\d{2}(?:\.\d{2}){4}|\d{10}')

def normalise_dept(code):
    code = str(code).strip().upper()
    mapping = {
        '97-1': '971', '97-2': '972', '97-3': '973', '97-4': '974',
        '97-6': '976', '98-7': '987', '98-8': '988',
        '2A': '2A', '2B': '2B'
    }
    if code in mapping:
        return mapping[code]
    # Numériques
    m = re.match(r'^(\d{1,3})$', code)
    if m:
        return code.zfill(2) if int(code) < 96 else code
    return code

def is_address_line(value):
    return bool(re.search(r'\b\d{5}\b|\b97\d{3}\b|\b98\d{3}\b|\b20\d{3}\b', value))

blocks = []
current = None

with CSV_PATH.open(encoding='utf-8-sig', newline='') as f:
    reader = csv.reader(f)
    try:
        header = next(reader)
    except StopIteration:
        header = None
    for row in reader:
        if not any(v.strip() for v in row):
            continue
        # Une ligne qui commence par un code département (numérique ou 2A/2B/97-x/98-x) lance un nouveau bloc
        first_cell = row[0].strip()
        is_new_block = bool(re.match(r'^(\d{1,3}|[0-9]{2}-[0-9AB]+|2A|2B)$', first_cell, re.IGNORECASE))
        if is_new_block:
            if current:
                blocks.append(current)
            current = [row]
        else:
            if current is not None:
                current.append(row)
            else:
                # Ligne orpheline au début, on la garde quand même
                current = [row]

if current:
    blocks.append(current)

cabinets = {}
for block in blocks:
    first = block[0]
    dept_raw = first[0].strip()
    tribunal = first[1].strip()
    cour = first[2].strip()
    cabinet_name = first[3].strip()
    phone = first[4].strip() if len(first) > 4 else ''

    if not cabinet_name:
        continue

    # Fusionner toutes les cellules du bloc pour chercher email/adresse
    all_cells = ' '.join([c.strip() for row in block for c in row if c.strip()])
    emails = list(set(EMAIL_RE.findall(all_cells)))
    # Adresse : ligne contenant un code postal, hors email/téléphone
    address_candidates = []
    for row in block:
        for cell in row:
            cell = cell.strip()
            if not cell or '@' in cell:
                continue
            digits_only = re.sub(r'[^0-9]', '', cell)
            if PHONE_RE.fullmatch(digits_only):
                continue
            if is_address_line(cell):
                address_candidates.append(cell)
    address = address_candidates[-1] if address_candidates else None

    # Nettoyer le téléphone
    phone_clean = phone if phone and (len(phone.replace('.', '').replace(' ', '')) >= 10 or phone.isdigit()) else None

    if cabinet_name not in cabinets:
        cabinets[cabinet_name] = {
            'nom': cabinet_name,
            'tribunaux': [],
            'cours_appel': [],
            'departements': set(),
            'phones': set(),
            'emails': set(),
            'addresses': []
        }
    c = cabinets[cabinet_name]
    if tribunal:
        c['tribunaux'].append(tribunal)
    if cour:
        c['cours_appel'].append(cour)
    c['departements'].add(normalise_dept(dept_raw))
    if phone_clean:
        c['phones'].add(phone_clean)
    for e in emails:
        c['emails'].add(e.lower())
    if address:
        c['addresses'].append(address)

# Dédupliquer tribunaux/cours
for c in cabinets.values():
    c['tribunaux'] = sorted(list(set(c['tribunaux'])), key=lambda x: x.lower())
    c['cours_appel'] = sorted(list(set(c['cours_appel'])), key=lambda x: x.lower())
    c['departements'] = sorted(list(c['departements']), key=lambda x: x)
    c['phones'] = sorted(list(c['phones']))
    c['emails'] = sorted(list(c['emails']))
    # Choisir l'adresse la plus fréquente
    if c['addresses']:
        c['adresse'] = max(set(c['addresses']), key=c['addresses'].count)
    else:
        c['adresse'] = None
    del c['addresses']

# Cabinets sans siège sur la carte principale : représentés schématiquement près des insets outre-mer.
OUTREMER_ONLY = {'SELARL FILAO'}

# Couleurs par cabinet (palette institutionnelle harmonieuse)
colors = [
    '#1e3a5f', '#2a6f68', '#8b5a2b', '#4a4e69', '#9a4d66',
    '#3d5a80', '#5f7d4f', '#7c4eb5', '#b85c38', '#2c7da0',
    '#5e4b35', '#6b4c7d', '#3b7d87', '#a84d6d', '#4f6d7a'
]
features = []
for i, (name, c) in enumerate(sorted(cabinets.items(), key=lambda x: x[0])):
    props = {
        'id': f'cabinet-{i+1:02d}',
        'nom': c['nom'],
        'adresse': c['adresse'],
        'phone': c['phones'][0] if c['phones'] else None,
        'emails': c['emails'],
        'tribunaux': c['tribunaux'],
        'cours_appel': c['cours_appel'],
        'departements': c['departements'],
        'couleur': colors[i % len(colors)],
        'outremer_only': c['nom'] in OUTREMER_ONLY
    }
    # Géométrie temporaire vide, sera remplie par le géocodeur
    features.append({
        'type': 'Feature',
        'properties': props,
        'geometry': {'type': 'Point', 'coordinates': [None, None]}
    })

geojson = {'type': 'FeatureCollection', 'features': features}
OUT_PATH.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding='utf-8')

all_depts = sorted(set(d for c in cabinets.values() for d in c['departements']))
metadata = {
    'cabinet_count': len(cabinets),
    'departement_count': len(all_depts),
    'departements': all_depts,
    'cabinets': [
        {
            'id': f['properties']['id'],
            'nom': f['properties']['nom'],
            'adresse': f['properties']['adresse'],
            'departements': f['properties']['departements'],
            'couleur': f['properties']['couleur'],
            'outremer_only': f['properties']['outremer_only']
        }
        for f in features
    ]
}
META_PATH.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')

print(f'{len(cabinets)} cabinets, {len(all_depts)} départements uniques')
print('Départements:', ', '.join(all_depts))
for f in features:
    p = f['properties']
    print(f"{p['id']}: {p['nom']} | adresse: {p['adresse']} | depts: {len(p['departements'])} | trib: {len(p['tribunaux'])}")
