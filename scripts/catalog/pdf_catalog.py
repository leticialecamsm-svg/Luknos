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
    mm = bool(re.search(r'mm\b', text, re.I))
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


def pix(doc):
    """Cada seção da página tem um título grande ('LUMINÁRIA PUNTO'), a foto do produto e uma ou
    mais tabelas 'CÓDIGO | COR | TEMPERATURA | FLUXO | DIMENSÕES' com os códigos 3.650.NNNN. Fluxo,
    potência e medidas costumam ser uma célula só para todos os códigos da tabela."""
    code_re = re.compile(r'^3\.650\.\d{4}$')
    color_re = re.compile(r'^(preto|branco|cinza|dourado|bronze|cobre|champagne|inox|grafite|natural|prata|aço|amarelo|verde|vermelho|azul|bege|marrom|rgb|transparente|fosco)\b', re.I)
    for pn, page in enumerate(doc):
        blocks = text_blocks(page)
        not_product = {'vigo', 'infinity', 'fitas e fontes', 'outdoor', 'lâmpadas', 'spots', 'battery', 'painéis', 'soluções e ferramentas', 'architectural', 'duplo', 'triplo'}
        titles = sorted([(bb, ' '.join(ls)) for bb, ls, sz in blocks
                         if sz >= 14 and re.search(r'[A-Za-zÀ-ú]{3}', ' '.join(ls)) and not re.search(r'dados|garantia|catálogo', ' '.join(ls), re.I)
                         and ' '.join(ls).strip().lower() not in not_product and not color_re.match(' '.join(ls).strip())],
                        key=lambda t: t[0][1])
        linha = next((l.split('Linha ', 1)[1].strip() for bb, ls, _ in blocks for l in ls if l.startswith('Linha ')), None)
        imgs = product_images(page, max_frac=0.5)
        if not titles:  # página só de tabela (acessórios): sem título, sem foto
            titles = [((0, 0, 0, 0), 'Acessórios' if not linha else linha)]
        for k, (tbb, title) in enumerate(titles):
            lo, hi = (0 if k == 0 else tbb[1] - 4), (titles[k + 1][0][1] - 4 if k + 1 < len(titles) else 10 ** 6)
            sec = sorted([(bb, ls) for bb, ls, _ in blocks if lo <= bb[1] < hi], key=lambda t: (round(t[0][1]), t[0][0]))
            tokens = [l for _, ls in sec for l in ls]
            # linhas com posição: o nome do produto numa tabela "MODELO"/"LARGURA" está na mesma linha do código
            sec_lines = [(round((l['bbox'][1] + l['bbox'][3]) / 2, 1), l['bbox'][0], ''.join(sp['text'] for sp in l['spans']).strip())
                         for b in page.get_text('dict')['blocks'] if b['type'] == 0 and lo <= b['bbox'][1] < hi for l in b['lines']]
            tables, cur = [], None
            for t in tokens:
                if t == 'CÓDIGO': cur = []; tables.append(cur)
                elif cur is not None: cur.append(t)
            sec_imgs = [i for i in imgs if lo <= (i['bbox'][1] + i['bbox'][3]) / 2 < hi]
            cands = ranked_images(tbb, sec_imgs, 400) if tbb[3] else []
            words = title.split()
            kind = next((KINDS[w.lower()] for w in words if w.lower() in KINDS), None)
            accessory_page = bool(re.search(r'emenda|conector|cabo|kit|plug|acess|interruptor|sensor|controle|receptor', title, re.I))
            for tab in tables:
                shared = ' '.join(tab)
                dims_m = re.search(r'\d+(?:[.,]\d+)?\s?x\s?\d+(?:[.,]\d+)?(?:\s?x\s?\d+(?:[.,]\d+)?)?\s?(?:mm|cm)', shared)
                dims = cm_from(dims_m.group(0)) if dims_m else cm_from('')
                idx = [i for i, t in enumerate(tab) if code_re.match(t)]
                for n, i in enumerate(idx):
                    seg = tab[i + 1:(idx[n + 1] if n + 1 < len(idx) else len(tab))]
                    name, kind_row = title.title(), kind
                    cl = next((l for l in sec_lines if l[2] == tab[i]), None)
                    row = [t for yc, x0, t in sorted(sec_lines, key=lambda l: l[1]) if cl and abs(yc - cl[0]) < 4 and cl[1] + 5 < x0 < page.rect.width - 60 and t != tab[i]]
                    row_cands, auth = cands, False
                    if 'MODELO' in tab:  # 'Emenda Linear 180º Fita COB', 'Cabo Conector Fonte/Fita 8mm'
                        model = next((t for t in row if re.search(r'[A-Za-zÀ-ú]{4}', t) and not color_re.match(t) and t.lower() not in not_product), None)
                        if model:
                            name = model
                            kind_row = KINDS.get(model.split()[0].lower(), model.split()[0].lower())
                            if not accessory_page: row_cands = []  # acessório citado na página de uma fita: a foto é da fita
                            else: auth = True  # tabela de acessórios: fonte confiável do nome e da foto
                    elif 'LARGURA' in tab:  # 'Conector Pix Mult' + '8mm'
                        width = next((t for t in row if re.fullmatch(r'\d+\s?mm', t)), None)
                        if width:
                            name = f'{title.title()} {width}'
                            if not accessory_page: row_cands = []
                            else: auth = True
                    color = next((t for t in seg if color_re.match(t)), None)
                    temp = next((t for t in seg if re.fullmatch(r'\d{4}K', t)), None)
                    yield dict(ref=tab[i], name=name, kind=kind_row, line=(linha or '').title() or None, model=tab[i],
                               variant=' '.join(x for x in (color, temp) if x) or None, page=pn + 1, cands=row_cands, auth=auth, **dims)


def darkness(jpeg):
    """Fração de pixels escuros (<80) no objeto: distingue a foto da versão preta da branca."""
    im = Image.open(io.BytesIO(jpeg)).convert('L'); im.thumbnail((64, 64))
    px = list(im.getdata())
    return sum(1 for v in px if v < 80) / len(px)


def lumi(doc):
    """Seção por título grande (linhas com fonte >= 20: 'ARANDELA XBOX'), 1-2 fotos (versão branca e
    preta), tabela de especificações e linhas de código: 'LM831 · 3.000K · BRANCO · EAN13', ou, nos
    perfis e acessórios, '1 metro · LM1932 · EAN · LM1932AC · EAN'. A foto do código é a escura se a cor
    é PRETO e a clara se é BRANCO."""
    code_re = re.compile(r'^LM\d{3,5}[A-Z]{0,2}$')
    nav = {'decorativo', 'lâmpadas', 'fitas e drivers', 'sistemas lineares', 'perfis', 'área externa', 'luminárias'}
    for pn, page in enumerate(doc):
        # blocos com tamanho por linha: o título é só a(s) linha(s) grandes do bloco
        blocks = []
        for b in page.get_text('dict')['blocks']:
            if b['type'] != 0: continue
            ls = [(''.join(sp['text'] for sp in l['spans']).strip(), max((sp['size'] for sp in l['spans']), default=0)) for l in b['lines']]
            ls = [(t, z) for t, z in ls if t]
            if ls: blocks.append((tuple(b['bbox']), ls))
        titles = []
        for bb, ls in blocks:
            big = [t for t, z in ls if z >= 20 and re.search(r'[A-Za-zÀ-ú]{3}', t) and t.lower() not in nav]
            if big and not code_re.match(big[0]):
                rest = [t for t, z in ls if z < 20 and z >= 7 and not re.fullmatch(r'(IRC|\d+)', t) and not code_re.match(t) and len(t) > 3]
                titles.append((bb, ' '.join(big), rest[:2]))
        titles.sort(key=lambda t: t[0][1])
        if not titles: continue
        imgs = product_images(page, max_frac=0.5)
        for k, (tbb, title, extra) in enumerate(titles):
            lo, hi = tbb[1] - 4, (titles[k + 1][0][1] - 4 if k + 1 < len(titles) else 10 ** 6)
            sec = [(bb, [t for t, _ in ls]) for bb, ls in blocks if lo <= bb[1] < hi]
            sec_imgs = [i for i in imgs if lo <= (i['bbox'][1] + i['bbox'][3]) / 2 < hi]
            cands = sorted(ranked_images(tbb, sec_imgs, 500), key=lambda i: i['bbox'][0])
            dim_text = ''
            for bb, ls in sec:
                if ls[0].lower().startswith('dimens'):
                    dim_text = ' '.join(ls[1:])
                    for b2, l2 in sec:
                        if b2 is not bb and re.fullmatch(r'[\d.,]+\s?mm', l2[0]) and abs(b2[0] - bb[0]) < 120 and bb[1] - 6 <= b2[1] <= bb[3] + 24:
                            dim_text += ' ' + l2[0]
                    break
            power = next((ls[0] for bb, ls in sec if re.fullmatch(r'\d+(?:,\d+)?W', ls[0])), None)
            dims = cm_from(dim_text) if dim_text else cm_from('')
            kind = next((KINDS[w.lower()] for w in title.split() if w.lower() in KINDS), None)
            sub_re = re.compile(r'^(PERFIL:|ACESSÓRIOS|DIFUSORES|CONECTORES|ADAPTADORES)[A-ZÀ-Ú :/\-]*$')
            for bb, ls in sec:
                idx = [i for i, t in enumerate(ls) if code_re.match(t)]
                if not idx: continue
                label_re = re.compile(r'^(\d+\s*(metros?|m)\b|Parede/Parede|Teto/Parede|Positivo|Tampas|Fixa[çc][ãa]o|Cabo|Emenda|Kit|Conector|Plug|Suporte)', re.I)
                label = ls[0] if label_re.match(ls[0]) else None
                # subtítulo da tabela ('PERFIL: PRETO', 'ACESSÓRIOS', 'DIFUSORES'): último bloco em maiúsculas acima da linha
                above = [(bb[1] - b2[3], l2[0]) for b2, l2 in sec if b2[3] <= bb[1] + 2 and sub_re.match(l2[0]) and not code_re.match(l2[0])]
                sub = min(above)[1] if above else None
                for n, i in enumerate(idx):
                    seg = ls[i + 1:(idx[n + 1] if n + 1 < len(idx) else len(ls))]
                    temp = next((t for t in seg if re.fullmatch(r'\d[.,]?\d{3}K', t)), None)
                    color = next((t for t in seg if re.fullmatch(r'[A-ZÀ-Ú]{3,}(?:[ /][A-ZÀ-Ú]{3,})*', t) and t != 'LED'), None)
                    ean = next((t for t in seg if re.fullmatch(r'\d{13}', t)), None)
                    mat = 'Acrílico' if ls[i].endswith('AC') else None
                    parts = [title] + [x for x in (sub if sub and sub != title.upper() else None, label) if x]
                    yield dict(ref=ls[i], name=' '.join(parts).title(), kind=kind, line=' '.join(extra).title() or None, model=ls[i], ean=ean,
                               variant=' '.join(x for x in (power, temp, color, mat) if x) or None, page=pn + 1,
                               cands=cands, want=(color or '').upper(), **dims)


PROFILES = {'skylight': skylight, 'spotline': spotline, 'pix': pix, 'lumi': lumi}


# ---------- extração e envio ----------

# cutout=True: só aceita foto recortada (borda branca). Catálogos que só têm foto de ambiente usam False.
PROFILE_OPTS = {'skylight': dict(cutout=True), 'spotline': dict(cutout=True), 'pix': dict(cutout=True), 'lumi': dict(cutout=True)}


def extract(profile, pdf_path, out_dir):
    doc = fitz.open(pdf_path)
    os.makedirs(os.path.join(out_dir, 'img'), exist_ok=True)
    cutout = PROFILE_OPTS.get(profile, {}).get('cutout', True)
    found = {}
    for r in PROFILES[profile](doc):
        cur = found.get(r['ref'])
        # Mesma ref em várias páginas: vale a de tabela de acessórios (auth), depois a que tem foto
        # candidata; empate fica com a primeira.
        rank = lambda x: (bool(x.get('auth')), bool(x['cands']))
        if cur is None or rank(r) > rank(cur): found[r['ref']] = r
    rows, jpegs = [], {}
    for r in found.values():
        pick = None
        want = r.pop('want', '')
        good = []
        for img in r.pop('cands'):
            if img['xref'] not in jpegs: jpegs[img['xref']] = image_jpeg(doc, doc[r['page'] - 1], img)
            if not cutout or is_cutout(jpegs[img['xref']]): good.append(img['xref'])
        if good:
            pick = good[0]
            if len(good) > 1 and ('PRETO' in want or 'BRANCO' in want):  # foto escura p/ preto, clara p/ branco
                by_dark = sorted(good, key=lambda x: darkness(jpegs[x]))
                pick = by_dark[-1] if 'PRETO' in want else by_dark[0]
        r['image_file'] = f'x{pick}.jpg' if pick else None
        if pick: open(os.path.join(out_dir, 'img', r['image_file']), 'wb').write(jpegs[pick])
        r['source'] = profile
        r['source_product_id'] = (r['image_file'] or r['ref']).rsplit('.', 1)[0]
        rows.append(r)
    rows.sort(key=lambda r: r['ref'])
    json.dump(rows, open(os.path.join(out_dir, 'rows.json'), 'w'), ensure_ascii=False, indent=1)
    return rows


COLUMNS = ('source', 'ref', 'source_product_id', 'name', 'kind', 'line', 'model', 'ean', 'variant',
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
