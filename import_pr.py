import re, requests, openpyxl, sys, warnings; warnings.filterwarnings('ignore')
from datetime import date

BASE = 'http://76.13.22.155:3005/api'
TODAY = date.today().isoformat()
BOOK = '/Users/gallankusuma/Webapps/EPC/2. PR 2026.xlsx'

tok_r = requests.post(f'{BASE}/auth/login', json={'email':'admin@erp.local','password':'admin123'}).json()
TOKEN = tok_r.get('token') or tok_r.get('data',{}).get('token')
H = {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'}
def api(m,p,**kw): return getattr(requests,m)(f'{BASE}{p}',headers=H,timeout=20,**kw)

units = api('get','/units?limit=100').json().get('data',[])
unit_map = {}
for u in units:
    unit_map[u.get('symbol','').upper()] = u['id']
    unit_map[u.get('name','').upper()] = u['id']
DEFAULT_UNIT = units[0]['id'] if units else 1
def get_unit_id(u):
    return unit_map.get(u.upper().strip()) or unit_map.get('PCS') or unit_map.get('BUAH') or DEFAULT_UNIT

cats = api('get','/categories?limit=50').json().get('data',[])
raw_cat = next((c['id'] for c in cats if any(x in c.get('name','').lower() for x in ['consumable','material','raw'])), cats[0]['id'] if cats else None)

ic, vc, skus = {}, {}, set()
for p in api('get','/products?limit=1000').json().get('data',[]):
    ic[p.get('name','').upper().strip()] = p['id']
    if p.get('sku'): skus.add(p['sku'].upper())
for v in api('get','/procurement/vendors?limit=500').json().get('data',[]):
    vc[v.get('name','').upper().strip()] = v['id']

def make_sku(name):
    base = 'ITM-' + re.sub(r'[^A-Z0-9]','-', name.upper()[:12]).strip('-')
    sku = base; i = 2
    while sku in skus: sku = f"{base}-{i}"; i+=1
    skus.add(sku); return sku

def get_or_create_item(name, unit_str='PCS'):
    k = name.upper().strip()
    if k in ic: return ic[k]
    uid = get_unit_id(unit_str)
    sku = make_sku(k)
    cr = api('post','/products', json={'sku':sku,'name':name.strip(),'unit_of_measure_id':uid,'category_id':raw_cat,'standard_cost':0,'status':'active'})
    if cr.ok:
        nid = cr.json().get('data',{}).get('id'); ic[k]=nid; print(f"  ✚ Item: {name} [{sku}]"); return nid
    print(f"  ✗ Item fail {name}: {cr.text[:80]}"); return None

def get_or_create_vendor(name):
    if not name or str(name).strip() in (':','None',''): return None
    k = name.upper().strip()
    if k in vc: return vc[k]
    code = 'VND-' + re.sub(r'[^A-Z0-9]','-', k[:10]).strip('-')
    cr = api('post','/procurement/vendors', json={'code':code,'name':name.strip(),'supply_category':'Material','status':'active'})
    if cr.ok:
        nid = cr.json().get('data',{}).get('id'); vc[k]=nid; print(f"  ✚ Vendor: {name}"); return nid
    print(f"  ✗ Vendor fail: {cr.text[:80]}"); return None

def parse_qty(s):
    s = str(s or '').strip()
    m = re.match(r'(\d+(?:\.\d+)?)\s*(.*)', s)
    return (float(m.group(1)), m.group(2).strip().upper() or 'PCS') if m else (1.0,'PCS')

def parse_sheet(ws):
    rows = list(ws.iter_rows(values_only=True))
    pr_no=None; pr_date=None; supplier=None; pr_type=None; items=[]; in_items=False
    for r in rows:
        if r[9] and 'No PR' in str(r[9]):
            pr_no = str(r[9]).split('\n')[0].replace('No PR:','').replace('No PR :','').strip()
        if str(r[0] or '').startswith('Tanggal PR'):
            pr_date = r[2]
            if r[5] == 'Rec. Supplier ' and r[7] and str(r[7]).strip() not in (':',''):
                supplier = str(r[7]).strip()
        if r[0] == 'Jenis PR': pr_type = str(r[2]).strip() if r[2] else None
        if r[0] == 'NO' and r[1] == 'ITEM NAME': in_items=True; continue
        if in_items:
            if r[1] and 'Dibuat' in str(r[1]): break
            if r[0] and 'Dibuat' in str(r[0]): break
            is_num = isinstance(r[0],int) or (isinstance(r[0],str) and re.match(r'^\d+$',str(r[0]).strip()))
            is_cont = r[0] is None and r[1] and str(r[1]).strip() and 'Approve' not in str(r[1])
            if (is_num or is_cont) and r[1] and str(r[1]).strip():
                qty,unit = parse_qty(r[5])
                est = float(r[7]) if isinstance(r[7],(int,float)) else 0.0
                items.append({'name':str(r[1]).strip(),'qty':qty,'unit':unit,'est':est})
    return pr_no, pr_date, supplier, pr_type, items

def import_sheet(sh, ws):
    pr_no, pr_date, supplier, pr_type, items = parse_sheet(ws)
    open_date = pr_date.date().isoformat() if hasattr(pr_date,'date') else TODAY
    print(f"\n{'='*55}\n{sh}: PR#{pr_no} | {open_date} | sup={supplier} | {pr_type} | {len(items)} items")
    if not items: print("  ⚠ No items found"); return
    vendor_id = get_or_create_vendor(supplier)
    pr_items = []
    for it in items:
        iid = get_or_create_item(it['name'], it['unit'])
        if iid: pr_items.append({'product_id':iid,'quantity':it['qty'],'unit_price':it['est'],'notes':it['unit']})
    if not pr_items: print("  ✗ No valid items"); return
    payload = {'pr_number':pr_no or sh,'request_date':open_date,'needed_by':TODAY,
               'department':pr_type or 'General','reason':pr_type or 'Import Excel',
               'notes':f'Imported from Excel | Jenis: {pr_type}','status':'DRAFT','items':pr_items}
    if vendor_id: payload['selected_vendor_id'] = vendor_id
    r = api('post','/procurement/purchase-requests', json=payload)
    if r.ok:
        nid = r.json().get('data',{}).get('id') or r.json().get('id')
        print(f"  ✓ PR created id={nid}, {len(pr_items)} items OK")
    else:
        print(f"  ✗ {r.status_code}: {r.text[:300]}")

wb = openpyxl.load_workbook(BOOK, data_only=True)
target = sys.argv[1].upper() if len(sys.argv)>1 else 'PR2'
for sh in wb.sheetnames:
    if target == 'ALL' or sh.upper() == target:
        import_sheet(sh, wb[sh])
print("\n✅ Done")
