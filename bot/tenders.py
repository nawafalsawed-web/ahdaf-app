# يسحب المناقصات من البوابات ويكتب tenders.json بجذر التطبيق
# التشغيل: python3 bot/tenders.py
import json, os, re, datetime
from urllib.parse import quote
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tenders.json')
# نطاق أهداف: تسويق، سوشال، مؤثرين، فعاليات، علاقات عامة، محتوى وإنتاج، هوية
# نسحب نشاط الدعاية والإعلان (801) + بحث بكلمات النطاق بكل الأنشطة، ثم نفلتر بالعنوان
ETIMAD_ACTIVITY = 801
SEARCH = ['تسويق', 'إعلامية', 'علاقات عامة', 'التواصل الاجتماعي', 'فعاليات', 'حفل', 'تنظيم معرض',
          'مؤتمر', 'حملة', 'هوية بصرية', 'محتوى', 'مؤثرين', 'إنتاج مرئي', 'الاتصال المؤسسي']
PAGES, PAGE_SIZE = 12, 24  # السيرفر يقصّ الصفحة على 24
FIT = re.compile(r'تسويق|إعلامي|اعلامي|إعلاني|اعلاني|حملة|حملات|علاقات عامة|العلاقات العامة|اتصال|الاتصالية|التواصل الاجتماعي|منصات التواصل|السوشيال|'
                 r'حفل|فعالي|احتفال|أمسية|امسية|معرض|مؤتمر|ملتقى|منتدى|تنظيم|تشغيل وإدارة|'
                 r'محتوى|تصوير|إنتاج|انتاج|فيديو|مرئي|أفلام|فيلم|هوية|مؤثر|إبداع|توعي|تسويقي|ترويج|رقمي|براند|علامة تجارية')
# خارج نطاقنا حتى لو طابق كلمة فوق
OUT_OF_SCOPE = re.compile(r'طباع|مطبوع|ملصق|لوحات|لوحة|دروع|ميدالي|هدايا|سواري|أعلام|اعلام |حبر|ورق|أثاث|توريد وتركيب|'
                          r'أنظمة|انظمة|نظام|سيبران|برمج|صيانة|ترميم|تأهيل|إنشاء|انشاء|مباني|كهرب|تكييف|نظافة|حراسة|إعاشة|اعاشة|'
                          r'أدوية|طبية|مستلزمات|معدات|سيارات|نقل|تأمين طبي|تدريب|حج|قص صخري|ألحف|مخدات|حقائب|اسعاف|إسعاف')

def get(pg, url):
    # اعتماد تحدّ عدد الطلبات ("API calls quota") → تمهّل وأعد المحاولة
    for wait in (3, 20, 60, 120):
        pg.wait_for_timeout(wait * 1000)
        txt = pg.evaluate(f"fetch('{url}').then(r=>r.text())")
        if txt.lstrip().startswith('{'): return json.loads(txt)
        print('  تمهّل:', txt[:80])
    raise RuntimeError('اعتماد رفضت الطلبات: ' + txt[:120])

def etimad(pg):
    pg.goto('https://tenders.etimad.sa/Tender/AllTendersForVisitor', timeout=90000, wait_until='domcontentloaded')
    pg.wait_for_timeout(8000)  # تحدي الحماية (F5) يحتاج وقت
    now = (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).isoformat()  # توقيت الرياض
    seen = {}
    queries = [f'TenderActivityId={ETIMAD_ACTIVITY}'] + ['MultipleSearch=' + quote(k) for k in SEARCH]
    for q in queries:
        for n in range(1, PAGES + 1):
            r = get(pg, f'/Tender/AllSupplierTendersForVisitorAsync?PageSize={PAGE_SIZE}&PageNumber={n}&{q}')
            for t in r['data']:
                due, title = t.get('lastOfferPresentationDate') or '', (t.get('tenderName') or '').strip()
                if due < now or t['tenderId'] in seen: continue
                if not FIT.search(title) or OUT_OF_SCOPE.search(title): continue
                seen[t['tenderId']] = {
                    'portal': 'etimad', 'id': str(t['tenderId']), 'ref': t.get('referenceNumber') or '',
                    'title': title, 'agency': t.get('agencyName') or '', 'activity': t.get('tenderActivityName') or '',
                    'type': t.get('tenderTypeName') or '', 'due': due, 'published': (t.get('submitionDate') or '')[:19],
                    'fee': t.get('buyingCost') or 0,
                    'url': 'https://tenders.etimad.sa/Tender/DetailsForVisitor?STenderId=' + quote(t.get('tenderIdString') or ''),
                    'fit': True,
                }
            if len(r['data']) < PAGE_SIZE or all((t.get('lastOfferPresentationDate') or '') < now for t in r['data']): break
    return list(seen.values())

def main():
    old = json.load(open(OUT)) if os.path.exists(OUT) else {}
    portals = {p['id']: p for p in old.get('portals', [])}
    tenders = old.get('tenders', [])
    stamp = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3))).isoformat(timespec='seconds')
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        try:
            et = etimad(b.new_page())
            tenders = [t for t in tenders if t['portal'] != 'etimad'] + et
            portals['etimad'] = {**portals.get('etimad', {}), 'status': 'ok', 'checked': stamp, 'count': len(et), 'note': 'المنافسات العامة · نطاق أهداف'}
        except Exception as e:
            portals['etimad'] = {**portals.get('etimad', {}), 'status': 'error', 'checked': stamp, 'note': str(e)[:160]}
        b.close()
    for pid in ('etimad', 'forsah', 'ariba', 'oracle'): portals.setdefault(pid, {'status': 'pending'})
    for pid, p in portals.items(): p['id'] = pid
    tenders.sort(key=lambda t: t['due'])
    json.dump({'updated': stamp, 'portals': list(portals.values()), 'tenders': tenders},
              open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(stamp, len(tenders), 'مناقصة', sum(t['fit'] for t in tenders), 'تناسبنا')

if __name__ == '__main__':
    main()
