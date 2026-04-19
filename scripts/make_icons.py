"""Generate icon PNGs for the Sound Booster extension.

Renders a speaker with sound waves on an indigo rounded-square background
at 16, 32, 48, and 128 px sizes using Pillow.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ACCENT = (99, 102, 241, 255)  # indigo-500 — matches popup --accent
WHITE = (255, 255, 255, 255)
SIZES = (16, 32, 48, 128)
OUT_DIR = Path(__file__).resolve().parent.parent / "extension" / "icons"


def rounded_square(size: int, radius_ratio: float = 0.22) -> Image.Image:
    """Indigo rounded-square background at the given size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * radius_ratio)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=ACCENT)
    return img


def draw_speaker(img: Image.Image) -> None:
    """Draw a white speaker + 2 sound waves centered on img."""
    size = img.width
    draw = ImageDraw.Draw(img)

    # Speaker body: a small square with a triangular cone extending right.
    # Coords are normalized to a 100x100 grid then scaled to `size`.
    def s(v: float) -> int:
        return int(v / 100 * size)

    # Box (speaker base)
    box = (s(22), s(40), s(40), s(60))
    draw.rectangle(box, fill=WHITE)

    # Cone (triangle pointing right from box top/bottom out to a point)
    cone = [(s(40), s(32)), (s(40), s(68)), (s(58), s(80)), (s(58), s(20))]
    draw.polygon(cone, fill=WHITE)

    # Two sound-wave arcs (concentric) to the right of the speaker.
    wave_width = max(2, size // 16)
    # Inner wave
    draw.arc(
        (s(55), s(28), s(75), s(72)),
        start=-55,
        end=55,
        fill=WHITE,
        width=wave_width,
    )
    # Outer wave
    draw.arc(
        (s(62), s(18), s(90), s(82)),
        start=-50,
        end=50,
        fill=WHITE,
        width=wave_width,
    )


def render(size: int) -> Image.Image:
    # Render at 4x then downscale for crisp edges on small sizes.
    scale = 4 if size < 64 else 1
    big = size * scale
    img = rounded_square(big)
    draw_speaker(img)
    if scale != 1:
        img = img.resize((size, size), Image.LANCZOS)
    return img


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        out = OUT_DIR / f"icon{size}.png"
        render(size).save(out, "PNG", optimize=True)
        print(f"wrote {out}")


if __name__ == "__main__":
    main()
