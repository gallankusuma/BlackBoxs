#!/usr/bin/env python3
"""
Product Image Scraper v2 — Uses Bing Image Search (more lenient than Google)
Downloads actual product images and saves them locally.
"""
import mysql.connector
import requests
import os
import re
import time
import sys
from urllib.parse import quote_plus

import os

DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'user': os.environ.get('DB_USER', 'erp_user'),
    'password': os.environ['DB_PASSWORD'],
    'database': os.environ.get('DB_NAME', 'blackboxs'),
    'charset': 'utf8mb4',
}

SAVE_DIR = '/var/www/blackboxs/backend/uploads/product-images'
BASE_URL = '/uploads/product-images'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.5',
}


def search_bing_image(query):
    """Search Bing Images and extract first image URL."""
    try:
        url = f"https://www.bing.com/images/search?q={quote_plus(query)}&first=1&count=5&qft=+filterui:photo-photo"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None
        
        # Bing puts image URLs in murl="..." attributes
        murls = re.findall(r'murl[&quot;]*[=:][&quot;]*"?(https?://[^"&]+\.(?:jpg|jpeg|png|webp)[^"&]*)"?', resp.text, re.IGNORECASE)
        if murls:
            for u in murls:
                if len(u) > 30:
                    return u
        
        # Alternative: look for data-src or src with image extensions
        srcs = re.findall(r'(?:src|data-src)="(https?://[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"', resp.text, re.IGNORECASE)
        for s in srcs:
            if 'bing.com' not in s and 'microsoft' not in s and len(s) > 30:
                return s
        
        # Method 3: Look for tse thumbnail URLs from Bing
        tse = re.findall(r'(https://tse\d+\.mm\.bing\.net/th\?[^"&\s]+)', resp.text)
        if tse:
            return tse[0]
        
        return None
    except Exception as e:
        return None


def download_image(url, product_id):
    """Download image and save locally."""
    try:
        resp = requests.get(url, headers={**HEADERS, 'Accept': 'image/*'}, timeout=15, stream=True)
        if resp.status_code != 200:
            return None
        
        content_type = resp.headers.get('Content-Type', '')
        
        # Determine extension
        if 'png' in content_type:
            ext = '.png'
        elif 'webp' in content_type:
            ext = '.webp'
        else:
            ext = '.jpg'
        
        filename = f"prod-{product_id}{ext}"
        filepath = os.path.join(SAVE_DIR, filename)
        
        with open(filepath, 'wb') as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
        
        size = os.path.getsize(filepath)
        if size < 1024:  # skip broken/tiny images
            os.remove(filepath)
            return None
        
        return f"{BASE_URL}/{filename}"
    except:
        return None


def clean_name(name, description=''):
    """Clean product name for better search results."""
    clean = re.sub(r'^[-\s]+', '', str(name))
    clean = re.sub(r'\([^)]*\)', '', clean).strip()
    clean = re.sub(r'[^\w\s./°×\-]', '', clean).strip()
    if len(clean) < 3:
        clean = f"{name} {description or ''}".strip()[:60]
    return clean


def main():
    os.makedirs(SAVE_DIR, exist_ok=True)
    
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    # Batch size from CLI argument
    batch = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    offset = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    
    cursor.execute(f"""
        SELECT id, name, description 
        FROM products 
        WHERE active = 1 
          AND (image_url IS NULL OR image_url LIKE '%unsplash.com%' OR image_url = '')
        ORDER BY id
        LIMIT {batch} OFFSET {offset}
    """)
    products = cursor.fetchall()
    print(f"Processing {len(products)} products (batch={batch}, offset={offset})", flush=True)
    
    updated = 0
    failed = 0
    
    for i, p in enumerate(products):
        name = clean_name(p['name'], p['description'])
        query = f"{name} jual"  # add "jual" for marketplace-style results
        sys.stdout.write(f"[{i+1}/{len(products)}] {name[:45]}...")
        sys.stdout.flush()
        
        img_url = search_bing_image(query)
        
        if not img_url:
            # Retry with simpler query
            img_url = search_bing_image(name)
        
        if img_url:
            local_path = download_image(img_url, p['id'])
            if local_path:
                cursor.execute("UPDATE products SET image_url = %s WHERE id = %s", (local_path, p['id']))
                updated += 1
                print(f" ✅", flush=True)
            else:
                failed += 1
                print(f" ⚠️ dl fail", flush=True)
        else:
            failed += 1
            print(f" ❌", flush=True)
        
        if (i + 1) % 10 == 0:
            conn.commit()
            print(f"  --- committed {updated} so far ---", flush=True)
        
        time.sleep(2)  # Rate limit
    
    conn.commit()
    print(f"\n{'='*40}", flush=True)
    print(f"✅ Updated: {updated}/{len(products)}", flush=True)
    print(f"❌ Failed: {failed}", flush=True)
    
    cursor.close()
    conn.close()


if __name__ == '__main__':
    main()
