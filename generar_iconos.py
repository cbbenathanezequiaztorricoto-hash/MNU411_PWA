import os
import struct
import zlib

def crear_png_casio(ruta: str, size: int):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filtro PNG None
        ny = y / size
        for x in range(size):
            nx = x / size
            # Fondo chasis oscuro (#1e2533)
            r, g, b = 30, 37, 51
            # Pantalla LCD verde Casio (#c7d5be)
            if 0.15 <= nx <= 0.85 and 0.15 <= ny <= 0.38:
                r, g, b = 199, 213, 190
            # Tecla '=' azul (#0284c7)
            elif 0.64 <= nx <= 0.85 and 0.64 <= ny <= 0.82:
                r, g, b = 2, 132, 199
            # Tecla 'AC' roja (#e11d48)
            elif 0.64 <= nx <= 0.85 and 0.44 <= ny <= 0.60:
                r, g, b = 225, 29, 72
            # Teclas numéricas claras (#e2e8f0)
            elif 0.15 <= nx <= 0.60 and 0.44 <= ny <= 0.82:
                if int(nx * 10) % 2 == 1 and int(ny * 10) % 2 == 0:
                    r, g, b = 226, 232, 240
            raw.extend((r, g, b, 255))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack("!I", len(data))
            + tag
            + data
            + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack("!IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(ruta, "wb") as f:
        f.write(png)

if __name__ == "__main__":
    crear_png_casio("frontend/icons/icon-192.png", 192)
    crear_png_casio("frontend/icons/icon-512.png", 512)
    print("Íconos PWA generados en frontend/icons/")
