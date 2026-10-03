"""Importa o catálogo PDF da Hevvy para supplier_catalog_products (source='hevvy').

O site da Hevvy não serve para isso (certificado inválido / erro 500), mas o PDF
tem texto: cada produto aparece como "MODELO\\nRef: NNNN\\nEAN13: ...". A foto é a
imagem da página mais próxima da etiqueta; sem imagem perto, usa a página inteira.

Uso (precisa de PyMuPDF e Pillow):
  python3 scripts/catalog/hevvy_catalog.py catalogo-hevvy.pdf saida/
Gera saida/rows.json e saida/img/*.jpg. Com SUPABASE_URL e SUPABASE_SECRET_KEY no
ambiente, também envia as fotos para o bucket 'supplier-catalog' (hevvy/...) e faz
upsert das linhas.
"""
import io, json, os, re, sys, urllib.request
import fitz
from PIL import Image

KINDS = {'PENDENTE': 'pendente', 'ARANDELA': 'arandela', 'LUSTRE': 'lustre', 'PLAFON': 'plafon',
         'SPOT': 'spot', 'ABAJUR': 'abajur', 'COLUNA': 'coluna', 'BALIZADOR': 'balizador', 'TRILHO': 'trilho'}
MAX = 640


def dist(pt, bb):
    x, y = pt
    dx = max(bb[0] - x, 0, x - bb[2]); dy = max(bb[1] - y, 0, y - bb[3])
    return (dx * dx + dy * dy) ** .5


STOP = {'GOLD', 'BLACK', 'AMBER', 'SMOKY', 'CHROME', 'CROMADO', 'WHITE', 'BRANCO', 'PRETO', 'DOURADO',
        'LANÇAMENTO', 'COBRE', 'BRONZE', 'NATURAL', 'FUMÊ', 'CHAMPAGNE', 'TRANSPARENTE'}


def area(bb):
    return (bb[2] - bb[0]) * (bb[3] - bb[1])


def title_of(text):
    # "LINHA DE\nPENDENTES\nHORIZON\nRINGS\n◊ COM LED…" -> "PENDENTES HORIZON RINGS"
    ls = [l.strip() for l in text.split('\n')]
    for i, l in enumerate(ls):
        if l != 'LINHA DE': continue
        out = []
        for w in ls[i + 1:i + 6]:
            if not re.fullmatch(r'[A-ZÀ-Ü&][A-ZÀ-Ü& ]*', w) or w in STOP: break
            out.append(w)
        if out: return ' '.join(out)
    return ''


def nice_name(title):
    # "PENDENTES & ARANDELAS SAILIA" -> kind 'pendente', name "Pendente Sailia"
    words = title.replace('&', ' ').split()
    kind = None
    rest = []
    for w in words:
        base = w.rstrip('S')
        if base in KINDS:
            kind = kind or KINDS[base]
        else:
            rest.append(w)
    label = ' '.join(rest).title()
    return kind, (f'{kind.capitalize()} {label}' if kind else label).strip()


def to_jpeg(pix):
    if pix.n - pix.alpha >= 4:  # CMYK
        pix = fitz.Pixmap(fitz.csRGB, pix)
    img = Image.frombytes('RGBA' if pix.alpha else 'RGB', (pix.width, pix.height), pix.samples)
    if img.mode == 'RGBA':
        bg = Image.new('RGB', img.size, 'white'); bg.paste(img, mask=img.split()[3]); img = bg
    img.thumbnail((MAX, MAX))
    buf = io.BytesIO(); img.save(buf, 'JPEG', quality=82, optimize=True)
    return buf.getvalue()


def extract(pdf_path, out_dir):
    doc = fitz.open(pdf_path)
    os.makedirs(os.path.join(out_dir, 'img'), exist_ok=True)
    texts = [p.get_text() for p in doc]
    titles = [title_of(t) for t in texts]
    has_refs = [bool(re.search(r'Ref:?\s*\d{3,5}', t)) for t in texts]

    def page_title(pn):
        # Sem título na página: vale a vizinha que é a página de abertura da linha
        # (título e foto de ambiente, sem produtos); se as duas têm produtos, a anterior.
        if titles[pn]: return titles[pn]
        near = [q for q in (pn - 1, pn + 1) if 0 <= q < len(doc) and titles[q]]
        opening = [q for q in near if not has_refs[q]]
        return titles[(opening or near or [pn])[0]]
    found = {}
    for pn, page in enumerate(doc):
        lines = []
        for b in page.get_text('dict')['blocks']:
            if b['type'] != 0: continue
            for l in b['lines']:
                t = ''.join(s['text'] for s in l['spans']).strip()
                if t: lines.append((t, l['bbox']))
        page_area = page.rect.width * page.rect.height
        imgs = [i for i in page.get_image_info(xrefs=True)
                if i['xref'] and (i['bbox'][2] - i['bbox'][0]) * (i['bbox'][3] - i['bbox'][1]) > 2500]
        title = page_title(pn)
        for k, (t, bb) in enumerate(lines):
            r = re.match(r'Ref:?\s*(\d{3,5})', t)
            if not r or k == 0: continue
            model = ' '.join(lines[k - 1][0].split())
            if not re.search(r'[A-Z]{1,4}-?\d', model): continue
            ref = r.group(1)
            ean = next((e.group(1) for t2, _ in lines[k + 1:k + 3] for e in [re.search(r'EAN13:?\s*(\d{13})', t2)] if e), '')
            pt = ((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2)
            # Fundo de ambiente (imagem que cobre boa parte da página) fica atrás das
            # etiquetas e "encosta" em todas: só vale se não houver foto de produto perto.
            products = [i for i in imgs if area(i['bbox']) < 0.3 * page_area]
            near = min(products, key=lambda i: dist(pt, i['bbox']), default=None)
            best = near if near and dist(pt, near['bbox']) < 90 else min(imgs, key=lambda i: dist(pt, i['bbox']), default=None)
            d = dist(pt, best['bbox']) if best else 999
            cur = found.get(ref)
            if cur and cur['d'] <= d:
                cur['ean'] = cur['ean'] or ean
                continue
            found[ref] = dict(ref=ref, model=model, ean=ean or (cur or {}).get('ean', ''), title=title,
                              page=pn + 1, xref=best['xref'] if best and d < 90 else None,
                              bbox=best['bbox'] if best else None, d=d)

    rows = []
    for r in sorted(found.values(), key=lambda r: int(r['ref'])):
        if r['xref']:
            file = f"x{r['xref']}.jpg"
            path = os.path.join(out_dir, 'img', file)
            if not os.path.exists(path):
                try:
                    pix = fitz.Pixmap(doc, r['xref'])
                    smask = next((i[1] for i in doc.get_page_images(r['page'] - 1) if i[0] == r['xref']), 0)
                    if smask and pix.alpha == 0: pix = fitz.Pixmap(pix, fitz.Pixmap(doc, smask))
                except Exception:
                    # máscara de tamanho diferente etc.: recorta a página na área da imagem
                    pix = doc[r['page'] - 1].get_pixmap(clip=fitz.Rect(r['bbox']), dpi=110)
                open(path, 'wb').write(to_jpeg(pix))
        else:
            file = f"p{r['page']}.jpg"
            path = os.path.join(out_dir, 'img', file)
            if not os.path.exists(path):
                open(path, 'wb').write(to_jpeg(doc[r['page'] - 1].get_pixmap(dpi=60)))
        kind, name = nice_name(r['title'])
        if not kind and 'SPOT' in texts[r['page'] - 1].upper():  # páginas de spots não têm "LINHA DE"
            kind, name = 'spot', f"Spot {r['model']}"
        if not kind and r['model'].startswith('LM-'):  # linha magnética 48V (trilhos, spots, pendentes)
            kind, name = 'magnetica', f"Linha Magnética {r['model']}"
        rows.append(dict(source='hevvy', ref=r['ref'], source_product_id=file.rsplit('.', 1)[0], name=name or r['model'],
                         kind=kind, line=r['title'].title() or None, model=r['model'], ean=r['ean'] or None,
                         image_file=file, page=r['page']))
    json.dump(rows, open(os.path.join(out_dir, 'rows.json'), 'w'), ensure_ascii=False, indent=1)
    return rows


def upload(rows, out_dir):
    url, key = os.environ['SUPABASE_URL'].rstrip('/'), os.environ['SUPABASE_SECRET_KEY']
    # Chaves novas (sb_secret_...) vão só no apikey; as antigas (JWT) também no Authorization.
    h = {'apikey': key} | ({'Authorization': f'Bearer {key}'} if key.startswith('eyJ') else {})
    for f in sorted({r['image_file'] for r in rows}):
        req = urllib.request.Request(f'{url}/storage/v1/object/supplier-catalog/hevvy/{f}', method='POST',
                                     data=open(os.path.join(out_dir, 'img', f), 'rb').read(),
                                     headers={**h, 'Content-Type': 'image/jpeg', 'x-upsert': 'true'})
        urllib.request.urlopen(req).read()
    body = [{k: r[k] for k in ('source', 'ref', 'source_product_id', 'name', 'kind', 'line', 'model', 'ean')}
            | {'image_url': f"{url}/storage/v1/object/public/supplier-catalog/hevvy/{r['image_file']}",
               'source_image_url': f"catalogo-pdf#page={r['page']}"} for r in rows]
    # Refs com foto enviada à mão no sistema mantêm a foto (só o resto é atualizado).
    q = urllib.request.Request(f'{url}/rest/v1/supplier_catalog_products?source=eq.hevvy&source_image_url=eq.upload&select=ref', headers=h)
    manual = {r['ref'] for r in json.loads(urllib.request.urlopen(q).read() or b'[]')}
    keep = [{k: v for k, v in b.items() if k not in ('image_url', 'source_image_url')} for b in body if b['ref'] in manual]
    for part in ([b for b in body if b['ref'] not in manual], keep):
        if not part: continue
        req = urllib.request.Request(f'{url}/rest/v1/supplier_catalog_products?on_conflict=source,ref', method='POST',
                                     data=json.dumps(part).encode(),
                                     headers={**h, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'})
        urllib.request.urlopen(req).read()


if __name__ == '__main__':
    rows = extract(sys.argv[1], sys.argv[2])
    print(len(rows), 'refs;', sum(1 for r in rows if r['image_file'].startswith('x')), 'com foto do produto')
    if os.environ.get('SUPABASE_URL') and os.environ.get('SUPABASE_SECRET_KEY'):
        upload(rows, sys.argv[2]); print('enviado')
