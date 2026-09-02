import sys
from PIL import Image

def process_icon(img_path, size, out_path):
    img = Image.open(img_path).convert("RGBA")
    img_resized = img.resize((size, size), Image.LANCZOS)
    img_resized.save(out_path, "PNG")

img_file = r"C:\Users\roger\.gemini\antigravity\brain\6b74368d-5794-4297-888c-8495c87a10c6\sunnybridge_app_icon_1788251771226.jpg"
process_icon(img_file, 192, 'c:/SuB CRM/parent-portal/icon-192-v2.png')
process_icon(img_file, 512, 'c:/SuB CRM/parent-portal/icon-512-v2.png')
process_icon(img_file, 180, 'c:/SuB CRM/parent-portal/apple-touch-icon.png')
