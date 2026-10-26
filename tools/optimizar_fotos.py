"""
Optimiza las fotos de los asesores para el .pbiviz.

Flujo:
  1. Deja las fotos originales (las que genera la IA) en  fotos-originales/
     (con las mismas subcarpetas por equipo: A1/, A2/, B1/...)
  2. Ejecuta:  python tools/optimizar_fotos.py
  3. Las versiones livianas quedan en  assets/advisors/  (las que usa el visual),
     con las mismas subcarpetas

Los originales no se tocan, así que se puede repetir con otro ancho cuando quieras.
Requiere Pillow:  pip install pillow

Opciones:
  --ancho 500     ancho máximo en px (nunca agranda). Por defecto 500.
  --colores 0     si > 0 reduce la paleta a N colores (p. ej. 256): pesa mucho menos
                  pero puede notarse en degradados. Pruébalo con una foto antes.
  --origen / --destino   carpetas distintas a las de por defecto.
"""
import argparse
import os
import sys

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ancho", type=int, default=500)
    ap.add_argument("--colores", type=int, default=0)
    ap.add_argument("--origen", default=os.path.join(RAIZ, "fotos-originales"))
    ap.add_argument("--destino", default=os.path.join(RAIZ, "assets", "advisors"))
    a = ap.parse_args()

    if not os.path.isdir(a.origen):
        print(f"No existe la carpeta de origen: {a.origen}")
        return 1
    os.makedirs(a.destino, exist_ok=True)

    archivos = sorted(
        os.path.relpath(os.path.join(raiz, f), a.origen)
        for raiz, _, fs in os.walk(a.origen)
        for f in fs if f.lower().endswith(".png")
    )
    if not archivos:
        print(f"No hay .png en {a.origen}")
        return 1

    antes = despues = 0
    for nombre in archivos:
        src = os.path.join(a.origen, nombre)
        dst = os.path.join(a.destino, nombre)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im = Image.open(src).convert("RGBA")
        if im.width > a.ancho:
            alto = round(im.height * a.ancho / im.width)
            im = im.resize((a.ancho, alto), Image.LANCZOS)
        if a.colores > 0:
            im = im.quantize(colors=a.colores, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        im.save(dst, "PNG", optimize=True)
        s, d = os.path.getsize(src), os.path.getsize(dst)
        antes += s
        despues += d
        print(f"{nombre:45s} {s // 1024:6d} KB -> {d // 1024:5d} KB  ({im.width}x{im.height})")

    print(f"\n{len(archivos)} fotos: {antes / 1e6:.1f} MB -> {despues / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
