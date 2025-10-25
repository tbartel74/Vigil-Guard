#!/usr/bin/env python3
"""
Generate placeholder icons for Vigil Guard Chrome Extension
Creates simple gradient icons with VG text
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Icon sizes required by Chrome
SIZES = [16, 32, 48, 128]

# Colors for gradient (purple to blue like Vigil Guard branding)
COLOR_START = (102, 126, 234)  # #667eea
COLOR_END = (118, 75, 162)     # #764ba2

def create_gradient(width, height):
    """Create a diagonal gradient"""
    image = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(image)

    for i in range(width):
        for j in range(height):
            # Calculate gradient position
            gradient_pos = (i + j) / (width + height)

            # Interpolate colors
            r = int(COLOR_START[0] * (1 - gradient_pos) + COLOR_END[0] * gradient_pos)
            g = int(COLOR_START[1] * (1 - gradient_pos) + COLOR_END[1] * gradient_pos)
            b = int(COLOR_START[2] * (1 - gradient_pos) + COLOR_END[2] * gradient_pos)

            draw.point((i, j), (r, g, b))

    return image

def add_text(image, size):
    """Add VG text to the icon"""
    draw = ImageDraw.Draw(image)

    # Text to display
    text = "VG" if size >= 32 else "V"

    # Calculate font size (approximately 50% of icon size)
    font_size = max(8, int(size * 0.4))

    # Try to use a system font, fallback to drawing without font
    try:
        # Try different font locations
        font_paths = [
            "/System/Library/Fonts/Helvetica.ttc",
            "/Library/Fonts/Arial.ttf",
            "/System/Library/Fonts/Avenir.ttc"
        ]
        font = None
        for font_path in font_paths:
            try:
                font = ImageFont.truetype(font_path, font_size)
                break
            except:
                continue

        if not font:
            # If no font found, use basic drawing
            # Draw a simple V or VG shape
            if size >= 32:
                # Draw VG
                # V
                draw.line([(size*0.25, size*0.35), (size*0.35, size*0.65)], fill=(255, 255, 255), width=max(1, size//16))
                draw.line([(size*0.35, size*0.65), (size*0.45, size*0.35)], fill=(255, 255, 255), width=max(1, size//16))
                # G
                draw.arc([(size*0.5, size*0.35), (size*0.75, size*0.65)], 30, 330, fill=(255, 255, 255), width=max(1, size//16))
                draw.line([(size*0.625, size*0.5), (size*0.75, size*0.5)], fill=(255, 255, 255), width=max(1, size//16))
            else:
                # Draw just V for small icons
                draw.line([(size*0.3, size*0.3), (size*0.5, size*0.7)], fill=(255, 255, 255), width=max(1, size//8))
                draw.line([(size*0.5, size*0.7), (size*0.7, size*0.3)], fill=(255, 255, 255), width=max(1, size//8))
            return image

        # Get text dimensions
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        # Center the text
        x = (size - text_width) // 2
        y = (size - text_height) // 2 - (bbox[1] // 2)

        # Draw white text with slight shadow for better visibility
        # Shadow
        draw.text((x+1, y+1), text, fill=(0, 0, 0, 128), font=font)
        # Main text
        draw.text((x, y), text, fill=(255, 255, 255), font=font)

    except Exception as e:
        # Fallback to simple shapes if text drawing fails
        if size >= 32:
            # Draw VG
            draw.line([(size*0.25, size*0.35), (size*0.35, size*0.65)], fill=(255, 255, 255), width=max(1, size//16))
            draw.line([(size*0.35, size*0.65), (size*0.45, size*0.35)], fill=(255, 255, 255), width=max(1, size//16))
            draw.arc([(size*0.5, size*0.35), (size*0.75, size*0.65)], 30, 330, fill=(255, 255, 255), width=max(1, size//16))
        else:
            # Draw just V
            draw.line([(size*0.3, size*0.3), (size*0.5, size*0.7)], fill=(255, 255, 255), width=max(1, size//8))
            draw.line([(size*0.5, size*0.7), (size*0.7, size*0.3)], fill=(255, 255, 255), width=max(1, size//8))

    return image

def create_icon(size):
    """Create an icon of the specified size"""
    # Create gradient background
    image = create_gradient(size, size)

    # Add text
    image = add_text(image, size)

    return image

def main():
    """Generate all required icon sizes"""
    # Create icons directory if it doesn't exist
    icons_dir = "assets/icons"
    os.makedirs(icons_dir, exist_ok=True)

    print("Generating Vigil Guard extension icons...")

    for size in SIZES:
        # Create icon
        icon = create_icon(size)

        # Save as PNG
        filename = f"{icons_dir}/icon-{size}.png"
        icon.save(filename, "PNG")
        print(f"✓ Created {filename} ({size}x{size})")

    print("\nAll icons generated successfully!")
    print("You can now load the extension in Chrome:")
    print("1. Open chrome://extensions/")
    print("2. Enable 'Developer mode'")
    print("3. Click 'Load unpacked'")
    print("4. Select the plugin/Chrome directory")

if __name__ == "__main__":
    main()