"""WebSocket (RFC 6455) без зависимостей — только то, что нужно игре: короткие кадры, без дробления сообщений.

Граница сервера на уровне байтов: рукопожатие и кадры разбираются здесь один раз; всё необычное (дробление, служебные биты,
неизвестные коды, длинные кадры, кадры без маски от клиента) отклоняется. Чистая логика: ни сети, ни часов.
"""
import base64
import binascii
import hashlib
import struct

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
OP_TEXT, OP_BINARY, OP_CLOSE, OP_PING, OP_PONG = 1, 2, 8, 9, 10
MAX_PAYLOAD = 1024                  # игре нужно ≤ 512 символов текста и 24 байта позы; больше — не принимаем
MAX_HANDSHAKE = 4096
PATH = "/ws"


class HandshakeError(Exception):
    pass


class FrameError(Exception):
    def __init__(self, code, reason):
        super().__init__(reason)
        self.code, self.reason = code, reason


def accept_key(key):
    return base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()


def parse_handshake(data, allowed_origins=None):
    """Запрос клиента → его ключ; всё, что не по форме, — HandshakeError. allowed_origins=None — пускаем любой Origin."""
    if len(data) > MAX_HANDSHAKE:
        raise HandshakeError("запрос слишком длинный")
    try:
        text = data.decode("ascii")
    except UnicodeDecodeError:
        raise HandshakeError("не ASCII")
    if not text.endswith("\r\n\r\n"):
        raise HandshakeError("запрос не закончен")
    first, *lines = text[:-4].split("\r\n")
    if first != f"GET {PATH} HTTP/1.1":
        raise HandshakeError("ожидается GET /ws HTTP/1.1")
    headers = {}
    for line in lines:
        name, sep, value = line.partition(":")
        if not sep:
            raise HandshakeError("строка заголовка без двоеточия")
        headers[name.strip().lower()] = value.strip()
    if headers.get("upgrade", "").lower() != "websocket":
        raise HandshakeError("нет Upgrade: websocket")
    if "upgrade" not in [t.strip().lower() for t in headers.get("connection", "").split(",")]:
        raise HandshakeError("нет Connection: Upgrade")
    if headers.get("sec-websocket-version") != "13":
        raise HandshakeError("версия WebSocket не 13")
    key = headers.get("sec-websocket-key", "")
    try:
        if len(base64.b64decode(key, validate=True)) != 16:
            raise ValueError
    except (binascii.Error, ValueError):
        raise HandshakeError("плохой ключ")
    if allowed_origins is not None and headers.get("origin") not in allowed_origins:
        raise HandshakeError("Origin не разрешён")
    return key


def handshake_response(key):
    return ("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept_key(key)}\r\n\r\n").encode()


def close_payload(code, reason=""):
    return struct.pack(">H", code) + reason.encode()[:100]


def encode_frame(opcode, payload=b"", mask=None):
    """Один целый кадр. mask=None — без маски (сервер → клиент); четыре байта — с маской (клиент → сервер, для тестов и клиентов)."""
    n = len(payload)
    head = bytes([0x80 | opcode])
    mbit = 0x80 if mask else 0
    head += bytes([mbit | n]) if n < 126 else bytes([mbit | 126]) + struct.pack(">H", n)
    if mask:
        return head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return head + payload


class FrameDecoder:
    """Накопитель: feed(байты) → список целых кадров (код, данные). Ошибка протокола — FrameError с кодом закрытия."""

    def __init__(self, expect_masked=True):
        self.buf = bytearray()
        self.expect_masked = expect_masked

    def feed(self, data):
        self.buf += data
        out = []
        while True:
            frame = self._take()
            if frame is None:
                return out
            out.append(frame)

    def _take(self):
        b = self.buf
        if len(b) < 2:
            return None
        fin, rsv, opcode = b[0] & 0x80, b[0] & 0x70, b[0] & 0x0F
        masked, n = bool(b[1] & 0x80), b[1] & 0x7F
        if rsv:
            raise FrameError(1002, "служебные биты")
        if opcode not in (OP_TEXT, OP_BINARY, OP_CLOSE, OP_PING, OP_PONG):
            raise FrameError(1003 if opcode == 0 else 1002, "дробление или неизвестный код")
        if not fin:
            raise FrameError(1003, "дробление сообщений не поддерживается")
        if masked != self.expect_masked:
            raise FrameError(1002, "маска не по правилам")
        pos = 2
        if n == 127:
            raise FrameError(1009, "слишком длинный кадр")
        if n == 126:
            if len(b) < 4:
                return None
            n, pos = struct.unpack(">H", bytes(b[2:4]))[0], 4
        if n > MAX_PAYLOAD or (opcode >= OP_CLOSE and n > 125):
            raise FrameError(1009, "слишком длинный кадр")
        need = pos + (4 if masked else 0) + n
        if len(b) < need:
            return None
        key = bytes(b[pos:pos + 4]) if masked else None
        raw = bytes(b[pos + (4 if masked else 0):need])
        del b[:need]
        return opcode, (bytes(c ^ key[i % 4] for i, c in enumerate(raw)) if key else raw)
