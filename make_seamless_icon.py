from PIL import Image, ImageFilter

def create_seamless_icon(src_path, out_192, out_512, bg_hex="#4B9FE0"):
    img = Image.open(src_path).convert("RGB")
    w, h = img.size
    
    bg_rgb = tuple(int(bg_hex.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
    
    # Process pixels
    pixels = img.load()
    out_img = Image.new("RGBA", (w, h), bg_rgb + (255,))
    out_pixels = out_img.load()
    
    for y in range(h):
        for x in range(w):
            r, g, b = pixels[x, y]
            # If pixel is close to white (the emblem)
            if r > 200 and g > 200 and b > 200:
                # Anti-aliasing factor
                min_c = min(r, g, b)
                factor = (min_c - 200) / 55.0
                factor = max(0.0, min(1.0, factor))
                
                # Blend between bg_rgb and white (255, 255, 255)
                nr = int(bg_rgb[0] + (255 - bg_rgb[0]) * factor)
                ng = int(bg_rgb[1] + (255 - bg_rgb[1]) * factor)
                nb = int(bg_rgb[2] + (255 - bg_rgb[2]) * factor)
                out_pixels[x, y] = (nr, ng, nb, 255)
            else:
                out_pixels[x, y] = bg_rgb + (255,)
                
    # Smooth a bit
    out_img = out_img.filter(ImageFilter.SMOOTH)
    
    img_512 = out_img.resize((512, 512), Image.LANCZOS)
    img_512.save(out_512, "PNG")
    
    img_192 = out_img.resize((192, 192), Image.LANCZOS)
    img_192.save(out_192, "PNG")
    
    print("Done generating pure seamless icons!")

create_seamless_icon(
    r"C:\Users\roger\.gemini\antigravity\brain\6b74368d-5794-4297-888c-8495c87a10c6\sunnybridge_app_icon_1788251771226.jpg",
    "c:/SuB CRM/parent-portal/icon-192-v3.png",
    "c:/SuB CRM/parent-portal/icon-512-v3.png",
    "#4B9FE0"
)
