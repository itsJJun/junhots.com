"""Rebuild the Builds page data from the latest Heroes of the Storm game files.

Writes public/data/heroes/<hero>.json (abilities and talents with level scaling)
and public/img/talents/*.webp (64px icons). Run after a HotS patch:

    pip install pillow
    python tools/update_builds_data.py

Game data comes from HeroesToolChest/heroes-data2, the same source the overlay's
update_heroes.py uses.
"""
import io
import json
import os
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen

from PIL import Image

SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
DATA_URL = "https://raw.githubusercontent.com/HeroesToolChest/heroes-data2/main/heroesdata/"
IMAGE_URL = "https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages/abilitytalents/"


def fetch(url):
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=60) as response:
        return response.read()


def fetch_json(url):
    return json.loads(fetch(url).decode("utf-8"))


def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except (OSError, ValueError):
        return default


# ---------- JSON patch (RFC 6902), so no extra package is needed ----------

def split_pointer(pointer):
    if pointer == "":
        return []
    return [part.replace("~1", "/").replace("~0", "~") for part in pointer.split("/")[1:]]


def walk_to_parent(doc, parts):
    node = doc
    for part in parts[:-1]:
        node = node[int(part)] if isinstance(node, list) else node[part]
    return node


def get_at(doc, pointer):
    node = doc
    for part in split_pointer(pointer):
        node = node[int(part)] if isinstance(node, list) else node[part]
    return node


def remove_at(doc, pointer):
    parts = split_pointer(pointer)
    parent = walk_to_parent(doc, parts)
    if isinstance(parent, list):
        return parent.pop(int(parts[-1]))
    return parent.pop(parts[-1])


def add_at(doc, pointer, value):
    parts = split_pointer(pointer)
    if not parts:
        return value
    parent = walk_to_parent(doc, parts)
    if isinstance(parent, list):
        if parts[-1] == "-":
            parent.append(value)
        else:
            parent.insert(int(parts[-1]), value)
    else:
        parent[parts[-1]] = value
    return doc


def apply_patch(doc, patch):
    for op in patch:
        kind = op["op"]
        if kind == "add":
            doc = add_at(doc, op["path"], op["value"])
        elif kind == "remove":
            remove_at(doc, op["path"])
        elif kind == "replace":
            parts = split_pointer(op["path"])
            if not parts:
                doc = op["value"]
            else:
                parent = walk_to_parent(doc, parts)
                key = int(parts[-1]) if isinstance(parent, list) else parts[-1]
                parent[key] = op["value"]
        elif kind == "move":
            value = remove_at(doc, op["from"])
            doc = add_at(doc, op["path"], value)
        elif kind == "copy":
            value = json.loads(json.dumps(get_at(doc, op["from"])))
            doc = add_at(doc, op["path"], value)
        elif kind == "test":
            pass
    return doc


# ---------- game data ----------

def pick_version(meta):
    # Newest live version; skip PTR builds
    live = [v for v in meta["versions"] if not v.endswith("_ptr")]
    return live[-1] if live else meta["latest"]


def load_full_files(target):
    # Follow "depends-on" back to a full version, then apply each patch forward
    chain = []
    version = target
    while True:
        hdp = fetch_json(DATA_URL + version + "/.hdp.json")
        chain.append((version, hdp))
        if hdp.get("json") == "full":
            break
        version = hdp["depends-on"]
    chain.reverse()

    hero_data = None
    strings = None
    for version, hdp in chain:
        files = hdp["files"]
        print(f"  reading {version}")
        hero_part = fetch_json(DATA_URL + version + "/data/" + files["[data]"]["herodata"])
        string_part = fetch_json(DATA_URL + version + "/gamestrings/" + files["[gamestrings]"]["enus"])
        if hero_data is None:
            hero_data, strings = hero_part, string_part
        else:
            hero_data = apply_patch(hero_data, hero_part)
            strings = apply_patch(strings, string_part)
    return hero_data["items"], strings["items"]



meta_doc = fetch_json(DATA_URL + ".version.json")
v = pick_version(meta_doc)
print("game data", v)
items, s = load_full_files(v)
safe = lambda n: re.sub(r'[^a-z0-9_]', '', n.lower().rsplit('.', 1)[0])
site = json.load(open(SITE + '/data/heroes.json'))
norm = lambda x: re.sub(r'[^a-z0-9]', '', x.lower().replace('lúcio','lucio')).removeprefix('the')
site_by = {norm(n): (i, n, r) for i, n, r in site}
hname = s['hero']['name']; htitle = s['hero'].get('title', {})
ab_name, ab_text, ab_cd, ab_en = (s['ability'][k] for k in ('name', 'fullText', 'cooldownText', 'energyText'))
t_name, t_text = s['talent']['name'], s['talent']['fullText']
t_cd = s['talent'].get('cooldownText', {})

def clean(t):
    if not t: return ''
    t = re.sub(r'<img[^>]*/>', '', t)
    t = t.replace('<n/>', '<br>')
    t = re.sub(r'<c val="bfd4fd"[^>]*>([^<]*)</c><c val="a7a7a7"[^>]*>~~([\d.]+)~~</c>', r'<b class="n" data-s="\2">\1</b>', t)
    t = re.sub(r'<c val="bfd4fd"[^>]*>([^<]*)</c>', r'<b class="n">\1</b>', t)
    t = re.sub(r'<c val="e4b800"[^>]*>([^<]*)</c>', r'<b class="q">\1</b>', t)
    t = re.sub(r'<c [^>]*>([^<]*)</c>', r'<b class="h">\1</b>', t)
    t = re.sub(r'</?c[^>]*>', '', t)
    t = re.sub(r'<s [^>]*>([^<]*)</s>', r'\1', t)
    t = re.sub(r'~~[\d.]+~~', '', t)
    t = re.sub(r'(<br>\s*)+$', '', t)
    return t.strip()
def meta(cd, en):
    out = [re.sub(r'<[^>]+>', '', x).strip() for x in (cd, en) if x]
    return ' · '.join(o.replace('Cooldown: ', '').replace(' seconds', 's').replace(' second', 's') for o in out if o)

icons = set(); out_index = []
os.makedirs(SITE + '/data/heroes', exist_ok=True)
missing = []
for hid, h in items.items():
    gn = hname.get(hid, hid)
    k = site_by.get(norm(gn))
    if not k: missing.append((hid, gn)); continue
    sid, name, role = k
    abil = []
    for group in ('Trait', 'Basic', 'Heroic'):
        for a in h['abilities'].get(group, []):
            lid = a['linkId']
            if lid not in ab_text: continue
            key = {'Trait': 'D', 'Heroic': 'R'}.get(a['abilityType'], a['abilityType'])
            abil.append({'key': key, 'name': ab_name.get(lid, ''), 'icon': safe(a['icon']), 'meta': meta(ab_cd.get(lid), ab_en.get(lid)), 'text': clean(ab_text[lid])})
            icons.add(a['icon'])
    tal = {}
    for lvl in ('1', '4', '7', '10', '13', '16', '20'):
        row = []
        for t in sorted(h['talents'].get('Level' + lvl, []), key=lambda t: t.get('sort', 99)):
            lid = t['linkId']
            nm = ' '.join(str(t_name.get(lid, '')).split())
            if not nm: continue
            key = {'Heroic': 'R', 'Trait': 'D', 'Passive': 'Passive', 'Active': 'Active'}.get(t['abilityType'], t['abilityType'])
            row.append({'key': key, 'name': nm, 'icon': safe(t['icon']), 'meta': meta(t_cd.get(lid), None), 'text': clean(t_text.get(lid, '')), 'quest': bool(t.get('isQuest'))})
            icons.add(t['icon'])
        tal[lvl] = row
    life = h.get('life', {}); w = (h.get('weapons') or [{}])[0]
    doc = {'id': sid, 'name': name, 'title': htitle.get(hid, ''), 'role': role,
           'life': [life.get('amount'), life.get('scale', 0)], 'attack': [w.get('damage'), w.get('damageScale', 0), w.get('period')],
           'abilities': abil, 'talents': tal}
    json.dump(doc, open(f'{SITE}/data/heroes/{sid}.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    out_index.append(sid)
print('written', len(out_index), 'missing', missing)
print('site heroes without data', [i for i, n, r in site if i not in out_index])

OUT = SITE + '/img/talents'
os.makedirs(OUT, exist_ok=True)
fail = []
def one(n):
    dst = f'{OUT}/{safe(n)}.webp'
    if os.path.exists(dst): return
    try:
        data = fetch(IMAGE_URL + urllib.parse.quote(n))
        Image.open(io.BytesIO(data)).convert('RGB').resize((64, 64), Image.LANCZOS).save(dst, quality=80)
    except Exception as e: fail.append((n, str(e)[:60]))
list(ThreadPoolExecutor(16).map(one, sorted(icons)))
print('icons', len(icons), 'failed', fail)
