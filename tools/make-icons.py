"""Icons and share card for the UCD blog, drawn from the mark in favicon.svg (Pillow, Georgia)."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out = Path(sys.argv[1])
BLUE, WHITE = '#1f5fd1', '#ffffff'
GEORGIA = 'C:/Windows/Fonts/georgia.ttf'; GEORGIA_B = 'C:/Windows/Fonts/georgiab.ttf'; GEORGIA_I = 'C:/Windows/Fonts/georgiai.ttf'

def mark(size, bg=BLUE, radius=True):
    """The favicon.svg mark at any size: a rounded blue tile with the two-lobed B."""
    s = size / 64
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if radius: d.rounded_rectangle((0, 0, size - 1, size - 1), radius=12 * s, fill=bg)
    else: d.rectangle((0, 0, size, size), fill=bg)
    w = round(5 * s)
    d.rounded_rectangle((18 * s, 16 * s, 46 * s, 32 * s), radius=7.8 * s, outline=WHITE, width=w, corners=(False, True, True, False))
    d.rounded_rectangle((18 * s, 32 * s, 50 * s, 48 * s), radius=7.8 * s, outline=WHITE, width=w, corners=(False, True, True, False))
    d.line((18 * s, 16 * s, 18 * s, 48 * s), fill=WHITE, width=w)   # the spine, squared like the svg path
    return im

big = mark(1024)
for size, name in [(16, 'favicon-16.png'), (32, 'favicon-32.png'), (180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
    im = big.resize((size, size), Image.Resampling.LANCZOS)
    if size == 180: bg = Image.new('RGB', (size, size), BLUE); bg.paste(im, mask=im); im = bg   # iOS squares the corners itself
    im.save(out / name, optimize=True)
ico = Image.new('RGB', (1024, 1024), WHITE); ico.paste(big, mask=big)
big.convert('RGBA').save(out / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])

# Share card 1200x630: mark on the left, name and tagline on the right.
card = Image.new('RGB', (1200, 630), BLUE)
d = ImageDraw.Draw(card)
m = mark(300, bg=WHITE)
# invert the mark colours for the card: white tile, blue strokes
mm = Image.new('RGBA', m.size, (0, 0, 0, 0)); md = ImageDraw.Draw(mm)
s = 300 / 64; w = round(5 * s)
md.rounded_rectangle((0, 0, 299, 299), radius=12 * s, fill=WHITE)
md.rounded_rectangle((18 * s, 16 * s, 46 * s, 32 * s), radius=7.8 * s, outline=BLUE, width=w, corners=(False, True, True, False))
md.rounded_rectangle((18 * s, 32 * s, 50 * s, 48 * s), radius=7.8 * s, outline=BLUE, width=w, corners=(False, True, True, False))
md.line((18 * s, 16 * s, 18 * s, 48 * s), fill=BLUE, width=w)
card.paste(mm, (90, 165), mask=mm)
title = ImageFont.truetype(GEORGIA_B, 118); tag = ImageFont.truetype(GEORGIA_I, 46); url = ImageFont.truetype(GEORGIA, 30)
d.text((450, 190), 'UCD blog', font=title, fill=WHITE)
d.text((455, 350), 'Posts by curious UCD students', font=tag, fill=WHITE)
d.text((455, 430), 'How organisations face the megatrends\nshaping business and society.', font=url, fill='#dbe6ff', spacing=10)
card.save(out / 'og-image.jpg', quality=88, optimize=True)
print('ok', (out / 'og-image.jpg').stat().st_size)
