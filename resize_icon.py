from PIL import Image

def make_square(img_path, size, out_path):
    img = Image.open(img_path).convert("RGBA")
    old_w, old_h = img.size
    
    # Padding size (80% of actual size to leave margin for maskable)
    pad_ratio = 0.8
    target_inner_size = size * pad_ratio
    
    # Calculate target dimensions while maintaining aspect ratio
    ratio = min(target_inner_size/old_w, target_inner_size/old_h)
    new_w, new_h = int(old_w * ratio), int(old_h * ratio)
    img_resized = img.resize((new_w, new_h), Image.LANCZOS)
    
    # Create a new blank square image (white background for maskable)
    new_img = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    
    # Paste resized image into the center
    paste_x = (size - new_w) // 2
    paste_y = (size - new_h) // 2
    new_img.paste(img_resized, (paste_x, paste_y), img_resized)
    
    new_img.save(out_path, "PNG")

make_square('c:/SuB CRM/parent-portal/sunblogo.png', 192, 'c:/SuB CRM/parent-portal/icon-192.png')
make_square('c:/SuB CRM/parent-portal/sunblogo.png', 512, 'c:/SuB CRM/parent-portal/icon-512.png')
