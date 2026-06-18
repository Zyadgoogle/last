import requests, sys, io, base64
from io import BytesIO
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = "http://localhost:5000"

import barcode as bc
from barcode.writer import ImageWriter

def make_b64(num):
    # Pad to 12 digits for EAN-13 generation (last digit is check digit added by library)
    num12 = num.zfill(12)[:12]
    ean = bc.get('ean13', num12, writer=ImageWriter())
    buf = BytesIO()
    ean.write(buf)
    buf.seek(0)
    return "data:image/png;base64," + base64.b64encode(buf.read()).decode()

tests = [
    ("030187153500", "CeraVe Moisturizing Cream"),
    ("076991519264", "The Ordinary Niacinamide"),
    ("007050100107", "Neutrogena Hydro Boost"),
    ("340139961651", "Bioderma Sensibio H2O"),
    ("333787131668", "Vichy Mineral 89 Serum"),
    ("003700085588", "Olay Regenerist"),
]

print("DB size check...")
h = requests.get(f"{BASE}/api/health").json()
print(f"DB: {h['database_size']} products | Models: {h['models_loaded']}\n")

for num, desc in tests:
    try:
        resp = requests.post(f"{BASE}/api/scan-product", json={"image": make_b64(num)}, timeout=30)
        detected = resp.json().get("detected", [])
        if detected:
            p = detected[0]["product"]
            print(f"PASS  {desc}")
            print(f"      {p['name']}")
            print(f"      {p['ingredients'][:80]}...")
        else:
            print(f"INFO  {desc} -> barcode not in DB (stub returned or no match)")
    except Exception as e:
        print(f"ERR   {desc}: {e}")
    print()
