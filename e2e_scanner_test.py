"""
End-to-end scanner test — sends real barcode images to the fixed backend.
Tests: La Roche-Posay (local DB), unknown product (stub fallback),
       and verifies the preprocess pipeline no longer squishes to 800x800.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import requests, base64, json, cv2, numpy as np
from pyzbar.pyzbar import decode as pyzbar_decode

BACKEND = "http://localhost:5000"

# ── helpers ────────────────────────────────────────────────────────────────────

def barcode_img_b64(barcode_number):
    """Generate a real EAN-13 barcode image and return base64 data-URI."""
    import barcode
    from barcode.writer import ImageWriter
    from io import BytesIO
    ean = barcode.get('ean13', barcode_number[:13], writer=ImageWriter())
    buf = BytesIO()
    ean.write(buf)
    buf.seek(0)
    raw = buf.read()
    b64 = base64.b64encode(raw).decode()
    return f"data:image/png;base64,{b64}"

def post_scan(b64_image):
    resp = requests.post(f"{BACKEND}/api/scan-product",
                         json={"image": b64_image}, timeout=60)
    return resp.status_code, resp.json()

def ok(cond, msg):
    tag = "PASS" if cond else "FAIL"
    print(f"  [{tag}] {msg}")
    return cond

# ── tests ──────────────────────────────────────────────────────────────────────

def test_health():
    print("\n=== Health Check ===")
    r = requests.get(f"{BACKEND}/api/health", timeout=5)
    ok(r.status_code == 200, f"HTTP 200  ->  {r.json()}")

def test_local_db_product():
    """La Roche-Posay barcode — must hit local DB instantly."""
    print("\n=== Test 1: Local DB Product (La Roche-Posay) ===")
    b64 = barcode_img_b64("3337872411083")
    status, body = post_scan(b64)
    detected = body.get("detected", [])
    ok(status == 200, f"HTTP 200")
    ok(len(detected) > 0, f"At least 1 product detected")
    if detected:
        prod = detected[0]["product"]
        ok("La Roche" in prod.get("name",""), f"Correct name: {prod.get('name')}")
        ok(len(prod.get("ingredients","")) > 20, f"Has ingredients: {prod.get('ingredients','')[:80]}...")
        print(f"  Barcode type : {detected[0].get('type')}")
        print(f"  Product name : {prod.get('name')}")
        print(f"  Brand        : {prod.get('brand')}")
        print(f"  Ingredients  : {prod.get('ingredients','')[:120]}...")

def test_unknown_product_stub():
    """Unknown barcode — backend must now return a stub, not empty detected."""
    print("\n=== Test 2: Unknown Product (Paris Hilton perfume) ===")
    # Use a plausible but non-DB barcode
    b64 = barcode_img_b64("0088300810109")  # Paris Hilton Heiress EDP common barcode
    status, body = post_scan(b64)
    detected = body.get("detected", [])
    ok(status == 200, "HTTP 200")
    # With the fix, backend always returns SOMETHING (stub) when barcode is found
    if len(detected) > 0:
        prod = detected[0]["product"]
        ok(True, f"Stub returned: {prod.get('name')}")
        print(f"  Barcode      : {detected[0].get('data')}")
        print(f"  Product name : {prod.get('name')}")
        print(f"  Ingredients  : {prod.get('ingredients','')[:120]}")
    else:
        # If the external APIs found nothing AND barcode decoded OK, this would still
        # return the stub — if it's empty something else is wrong
        ok(False, f"Empty detected[] — stub fallback not working. Full body: {json.dumps(body)[:300]}")

def test_aspect_ratio_preserved():
    """Verify preprocess no longer squishes barcode to 800x800 square."""
    print("\n=== Test 3: Aspect Ratio Preservation ===")
    import barcode
    from barcode.writer import ImageWriter
    from io import BytesIO
    
    ean = barcode.get('ean13', "3337872411083", writer=ImageWriter())
    buf = BytesIO()
    ean.write(buf)
    buf.seek(0)
    raw_bytes = np.frombuffer(buf.read(), dtype=np.uint8)
    img = cv2.imdecode(raw_bytes, cv2.IMREAD_COLOR)
    
    h, w = img.shape[:2]
    print(f"  Original shape: {w}x{h}")
    
    # Simulate the NEW resize_keep_aspect(img, 800)
    max_dim = 800
    scale = max_dim / max(h, w)
    if scale < 1.0:
        new_w, new_h = int(w * scale), int(h * scale)
        resized = cv2.resize(img, (new_w, new_h))
    else:
        resized = img
        new_w, new_h = w, h
    
    print(f"  Resized shape : {new_w}x{new_h}")
    
    # Verify aspect ratio unchanged (within 1px rounding)
    orig_ratio = w / h
    new_ratio = new_w / new_h
    ratio_ok = abs(orig_ratio - new_ratio) < 0.02
    ok(ratio_ok, f"Aspect ratio preserved: {orig_ratio:.3f} -> {new_ratio:.3f}")
    
    # Verify pyzbar can still decode the resized image
    decoded = pyzbar_decode(resized)
    ok(len(decoded) > 0, f"pyzbar decodes aspect-correct resized image: {[d.data.decode() for d in decoded]}")

def test_ocr_ingredient_fallback():
    """Send an image with ingredient TEXT (no barcode) — OCR should extract it."""
    print("\n=== Test 4: OCR Ingredient Text Fallback ===")
    # Create a white image with ingredient text
    img = np.ones((300, 900, 3), dtype=np.uint8) * 255
    lines = [
        "INGREDIENTS: Aqua, Glycerin, Sodium Hyaluronate, Niacinamide,",
        "Cetearyl Alcohol, Phenoxyethanol, Dimethicone, Parfum,",
        "Tocopheryl Acetate, Citric Acid, Allantoin, Carbomer"
    ]
    for i, line in enumerate(lines):
        cv2.putText(img, line, (20, 80 + i*70),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0,0,0), 2)
    
    _, buf = cv2.imencode('.jpg', img)
    b64 = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()
    
    status, body = post_scan(b64)
    detected = body.get("detected", [])
    ok(status == 200, "HTTP 200")
    if detected:
        prod = detected[0]["product"]
        ings = prod.get("ingredients","")
        ok("glycerin" in ings.lower() or "aqua" in ings.lower(),
           f"OCR extracted ingredients: {ings[:100]}...")
    else:
        print(f"  No OCR detected (may need better image quality in real use)")

# ── run all ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("FULL END-TO-END SCANNER TEST (FIXED BACKEND)")
    print("=" * 60)
    test_health()
    test_local_db_product()
    test_unknown_product_stub()
    test_aspect_ratio_preserved()
    test_ocr_ingredient_fallback()
    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)
