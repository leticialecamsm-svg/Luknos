"""Importa catálogos PDF de fornecedores para supplier_catalog_products.

Um "perfil" por fornecedor sabe ler o desenho da página (onde está a Ref, o nome, as
medidas) e devolve linhas com a foto do produto (a imagem mais próxima do texto, sem
fundo de ambiente, QR code nem desenho de medida). O resto é comum: reduz a foto para
JPEG de até 640 px, grava em saida/img e, se pedido, envia ao Supabase.

Uso (precisa de PyMuPDF e Pillow):
  python3 scripts/catalog/pdf_catalog.py skylight catalogo.pdf saida/            # só extrai
  SUPABASE_URL=... SUPABASE_SECRET_KEY=... python3 scripts/catalog/pdf_catalog.py \\
      skylight catalogo.pdf saida/ --upload

Gera saida/rows.json (para conferir) e saida/img/*.jpg. Com --upload, envia as fotos para o
bucket 'supplier-catalog' (<fornecedor>/...) e faz upsert das linhas. Fotos enviadas à mão
pelo sistema (source_image_url = 'upload') são mantidas.
"""
import io, json, math, os, re, sys, urllib.request
import fitz
from PIL import Image

MAX_SIDE = 640
KINDS = {'pendente': 'pendente', 'arandela': 'arandela', 'plafon': 'plafon', 'abajur': 'abajur', 'coluna': 'coluna',
         'luminaria': 'luminaria', 'luminária': 'luminaria', 'spot': 'spot', 'balizador': 'balizador', 'lustre': 'lustre',
         'trilho': 'trilho', 'perfil': 'perfil', 'fita': 'fita', 'poste': 'poste', 'embutido': 'embutido', 'mesa': 'abajur'}


# ---------- geometria e texto ----------

def area(bb):
    return max(0, bb[2] - bb[0]) * max(0, bb[3] - bb[1])


def gap(a, b):
    """Distância entre dois retângulos (0 se encostam ou se sobrepõem)."""
    dx = max(a[0] - b[2], 0, b[0] - a[2]); dy = max(a[1] - b[3], 0, b[1] - a[3])
    return math.hypot(dx, dy)


def text_blocks(page):
    """[(bbox, [linhas])] dos blocos de texto da página."""
    out = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0: continue
        lines, size = [], 0
        for l in b['lines']:
            t = ''.join(s['text'] for s in l['spans']).strip()
            if t:
                lines.append(t)
                size = max(size, max((s['size'] for s in l['spans']), default=0))
        if lines: out.append((tuple(b['bbox']), lines, size))
    return out


def deslot(s):
    """'Ō T A K I' -> 'ŌTAKI'; palavras separadas por 2+ espaços continuam separadas.
    Texto normal ('spot linear magnético') não é espaçado letra a letra e fica como está."""
    toks = s.split()
    if len([t for t in toks if len(t) == 1]) < 0.6 * len(toks): return ' '.join(toks)
    words = [w.replace(' ', '') for w in re.split(r'\s{2,}', s.strip())]
    return ' '.join(w for w in words if w)


def cm_from(text):
    """'Ø20X25cm', '150X20X18', 'Ø300X110 (mm)' -> dict de medidas em cm."""
    mm = bool(re.search(r'\bmm\b', text, re.I))
    nums = [float(n.replace(',', '.')) for n in re.findall(r'\d+(?:[.,]\d+)?', text)]
    if mm: nums = [n / 10 for n in nums]
    nums = [round(n, 2) for n in nums[:3]]
    d = {'altura_cm': None, 'largura_cm': None, 'profundidade_cm': None, 'diametro_cm': None}
    if not nums: return d
    if 'Ø' in text or 'ø' in text:
        d['diametro_cm'] = nums[0]
        if len(nums) > 1: d['altura_cm'] = nums[1]
    elif len(nums) == 3:
        d['largura_cm'], d['profundidade_cm'], d['altura_cm'] = nums
    elif len(nums) == 2:
        d['largura_cm'], d['altura_cm'] = nums
    else:
        d['largura_cm'] = nums[0]
    return d


# ---------- imagens ----------

def product_images(page, min_side=40, min_pixels=7000, min_area=1500, max_frac=0.3, allow_big=False):
    """Imagens que parecem foto de produto: nada de linha fina, QR code, amostra de cor,
    nem fundo de ambiente (cobre grande parte da página)."""
    pa = page.rect.width * page.rect.height
    out = []
    for i in page.get_image_info(xrefs=True):
        bb = i['bbox']; w, h = bb[2] - bb[0], bb[3] - bb[1]
        if not i['xref'] or w <= 0 or h <= 0: continue
        if min(i['width'], i['height']) < min_side or i['width'] * i['height'] < min_pixels or w * h < min_area: continue
        if w * h > max_frac * pa and not allow_big: continue
        if max(w / h, h / w) > 7: continue
        out.append(i)
    return out


def ranked_images(bb, images, limit=220):
    """Candidatas por proximidade. Distâncias parecidas (mesma faixa de 40 pt) desempatam pela
    imagem maior: foto > desenho de medida."""
    near = [i for i in images if gap(bb, i['bbox']) <= limit]
    return sorted(near, key=lambda i: (int(gap(bb, i['bbox']) // 40), -i['width'] * i['height']))


def is_cutout(jpeg):
    """Foto de produto recortada tem a borda (quase) branca; foto de ambiente, não."""
    im = Image.open(io.BytesIO(jpeg)).convert('L'); im.thumbnail((64, 64))
    w, h = im.size; px = im.load()
    ring = [px[x, y] for x in range(w) for y in range(h) if x < 3 or y < 3 or x >= w - 3 or y >= h - 3]
    return sum(1 for v in ring if v >= 235) / len(ring) >= 0.45


def to_jpeg(pix):
    if pix.colorspace is not None and pix.colorspace.n == 4:  # CMYK
        pix = fitz.Pixmap(fitz.csRGB, pix)
    img = Image.open(io.BytesIO(pix.tobytes('png')))
    if img.mode in ('RGBA', 'LA', 'P'):
        img = img.convert('RGBA')
        bg = Image.new('RGB', img.size, 'white'); bg.paste(img, mask=img.split()[3]); img = bg
    else:
        img = img.convert('RGB')
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO(); img.save(buf, 'JPEG', quality=82, optimize=True)
    return buf.getvalue()


def image_jpeg(doc, page, img):
    try:
        pix = fitz.Pixmap(doc, img['xref'])
        smask = next((t[1] for t in page.get_images(full=True) if t[0] == img['xref']), 0)
        if smask and pix.alpha == 0: pix = fitz.Pixmap(pix, fitz.Pixmap(doc, smask))
    except Exception:  # máscara de tamanho diferente etc.: recorta a página na área da imagem
        pix = page.get_pixmap(clip=fitz.Rect(img['bbox']), dpi=110)
    return to_jpeg(pix)


# ---------- perfis ----------

def skylight(doc):
    """Bloco da Ref ('Ref: SKY-4049' ou 'Ref: SKY-1904DO - DOURADO'); o tipo e o nome ('pendente /
    Ō T A K I') vêm no mesmo bloco ou num bloco logo acima; medidas e cor, logo abaixo."""
    ref_re = re.compile(r'Ref:\s*(SKY-[0-9A-Z]+(?:-[0-9A-Z]+)*)(?:\s+-\s+([A-ZÀ-Ü ]+))?')
    for pn, page in enumerate(doc):
        blocks = text_blocks(page)
        imgs = product_images(page)
        for bb, lines, _ in blocks:
            m = next((ref_re.search(l) for l in lines if ref_re.search(l)), None)
            if not m: continue
            head = [l for l in lines if not ref_re.search(l)]
            if not head:
                above = [(bb[1] - b[3], ls) for b, ls, _ in blocks
                         if abs(b[0] - bb[0]) < 8 and -20 <= bb[1] - b[3] < 60 and not any('Ref:' in l for l in ls)]
                head = min(above, key=lambda a: abs(a[0]))[1] if above else []
            kind = KINDS.get(head[0].lower()) if head else None
            name = ' '.join(deslot(l) for l in (head[1:] if kind else head)).strip()
            below = [ls for b, ls, _ in blocks if abs(b[0] - bb[0]) < 8 and 0 <= b[1] - bb[3] < 30 and not any('Ref:' in l for l in ls)]
            dims_line = below[0][0] if below else ''
            variant = m.group(2) or (' '.join(l for l in below[0][1:] if 'CABO' not in l.upper()).strip() if below else '') or None
            yield dict(ref=m.group(1), name=f'{kind.capitalize() + " " if kind else ""}{name}'.strip() or m.group(1), kind=kind,
                       line=name or None, model=m.group(1), variant=variant, page=pn + 1,
                       cands=ranked_images(bb, imgs, 160), **cm_from(dims_line))


def spotline(doc):
    """Página de família: 'ARANDELA ARK / COM RABICHO', o número do modelo ('1155/1'), a tabela de
    cores ('7776 PRETO') e a foto do produto ao lado. O número do modelo abre a descrição da nota."""
    model_re = re.compile(r'^(\d{2,5}/\d{1,2})$')
    for pn, page in enumerate(doc):
        blocks = text_blocks(page)
        imgs = product_images(page, max_frac=0.5)
        for bb, lines, _ in blocks:
            for k, l in enumerate(lines):
                m = model_re.match(l.strip())
                if not m: continue
                names = [x for x in lines if not model_re.match(x.strip()) and re.search(r'[A-Za-zÀ-ú]{3}', x) and not x.startswith('•') and ':' not in x][:3]
                if not names:  # o nome está num bloco logo acima
                    above = [(bb[1] - b[3], ls) for b, ls, _ in blocks if b is not bb and -5 <= bb[1] - b[3] < 70 and abs(b[0] - bb[0]) < 40
                             and re.match(r'^[A-ZÀ-Ú]', ls[0]) and not ls[0].startswith('•') and not any(model_re.match(x.strip()) for x in ls)]
                    names = min(above, key=lambda a: a[0])[1] if above else []
                name = ' '.join(names).title().strip()
                kind = KINDS.get(name.split(' ')[0].lower()) if name else None
                colors = [x for b, ls, _ in blocks if 0 <= b[1] - bb[3] < 130 and abs(b[0] - bb[0]) < 60
                          for x in ls if re.fullmatch(r'[A-ZÀ-Ú/ ]{4,}', x) and x not in ('LED',)]
                yield dict(ref=m.group(1), name=name or m.group(1), kind=kind, line=None, model=m.group(1),
                           variant=', '.join(dict.fromkeys(colors)) or None, page=pn + 1,
                           cands=ranked_images(bb, imgs, 260), **cm_from(''))


PROFILES = {'skylight': skylight, 'spotline': spotline}


# ---------- extração e envio ----------

# cutout=True: só aceita foto recortada (borda branca). Catálogos que só têm foto de ambiente usam False.
PROFILE_OPTS = {'skylight': dict(cutout=True), 'spotline': dict(cutout=True)}


def extract(profile, pdf_path, out_dir):
    doc = fitz.open(pdf_path)
    os.makedirs(os.path.join(out_dir, 'img'), exist_ok=True)
    cutout = PROFILE_OPTS.get(profile, {}).get('cutout', True)
    found = {}
    for r in PROFILES[profile](doc):
        found.setdefault(r['ref'], r)  # primeira ocorrência vale
    rows, jpegs = [], {}
    for r in found.values():
        pick = None
        for img in r.pop('cands'):
            if img['xref'] not in jpegs: jpegs[img['xref']] = image_jpeg(doc, doc[r['page'] - 1], img)
            if not cutout or is_cutout(jpegs[img['xref']]):
                pick = img['xref']; break
        r['image_file'] = f'x{pick}.jpg' if pick else None
        if pick: open(os.path.join(out_dir, 'img', r['image_file']), 'wb').write(jpegs[pick])
        r['source'] = profile
        r['source_product_id'] = (r['image_file'] or r['ref']).rsplit('.', 1)[0]
        rows.append(r)
    rows.sort(key=lambda r: r['ref'])
    json.dump(rows, open(os.path.join(out_dir, 'rows.json'), 'w'), ensure_ascii=False, indent=1)
    return rows


COLUMNS = ('source', 'ref', 'source_product_id', 'name', 'kind', 'line', 'model', 'variant',
           'altura_cm', 'largura_cm', 'profundidade_cm', 'diametro_cm')


def upload(rows, out_dir):
    url, key = os.environ['SUPABASE_URL'].rstrip('/'), os.environ['SUPABASE_SECRET_KEY']
    # Chaves novas (sb_secret_...) vão só no apikey; as antigas (JWT) também no Authorization.
    h = {'apikey': key} | ({'Authorization': f'Bearer {key}'} if key.startswith('eyJ') else {})
    source = rows[0]['source']
    for f in sorted({r['image_file'] for r in rows if r['image_file']}):
        req = urllib.request.Request(f'{url}/storage/v1/object/supplier-catalog/{source}/{f}', method='POST',
                                     data=open(os.path.join(out_dir, 'img', f), 'rb').read(),
                                     headers={**h, 'Content-Type': 'image/jpeg', 'x-upsert': 'true'})
        urllib.request.urlopen(req).read()
    body = []
    for r in rows:
        b = {k: r.get(k) for k in COLUMNS}
        b['image_url'] = f"{url}/storage/v1/object/public/supplier-catalog/{source}/{r['image_file']}" if r['image_file'] else None
        b['source_image_url'] = f"catalogo-pdf#page={r['page']}"
        body.append(b)
    # Refs com foto enviada à mão no sistema mantêm a foto (só o resto é atualizado).
    q = urllib.request.Request(f'{url}/rest/v1/supplier_catalog_products?source=eq.{source}&source_image_url=eq.upload&select=ref', headers=h)
    manual = {r['ref'] for r in json.loads(urllib.request.urlopen(q).read() or b'[]')}
    keep = [{k: v for k, v in b.items() if k not in ('image_url', 'source_image_url')} for b in body if b['ref'] in manual]
    for part in ([b for b in body if b['ref'] not in manual], keep):
        for i in range(0, len(part), 200):
            req = urllib.request.Request(f'{url}/rest/v1/supplier_catalog_products?on_conflict=source,ref', method='POST',
                                         data=json.dumps(part[i:i + 200]).encode(),
                                         headers={**h, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'})
            urllib.request.urlopen(req).read()


if __name__ == '__main__':
    profile, pdf, out = sys.argv[1:4]
    rows = extract(profile, pdf, out)
    print(len(rows), 'refs;', sum(1 for r in rows if r['image_file']), 'com foto;', len({r['image_file'] for r in rows if r['image_file']}), 'fotos distintas')
    if '--upload' in sys.argv:
        upload(rows, out); print('enviado')
