"""Граница сервера «Восьмёрки Баклажан»: чужие данные проверяются один раз здесь, дальше им верят.

Два вида сообщений от игрока:
  · управляющие — короткий JSON-текст (create / join / leave / ping), разбирает parse_control;
  · поза машины — ровно 24 бинарных байта, тип 1 (формат — arcade/lib/pose.js); сервер её не читает, только пересылает.
Чистая логика: ни сети, ни часов (время передаётся снаружи).
"""
import json
import math
import re
import time

MAX_CONTROL_CHARS = 512
POSE_BYTES, POSE_TYPE = 24, 1
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"        # без похожих I, L, O, 0, 1
_CODE = re.compile(r"^[%s]{4}$" % CODE_ALPHABET)
_TOKEN = re.compile(r"^[A-Za-z0-9_-]{22}$")
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def clean_name(value):
    name = _CONTROL_CHARS.sub("", value).strip()[:16].strip() if isinstance(value, str) else ""
    return name or "Игрок"


def _finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _parse_create(d):
    return {"op": "create", "name": clean_name(d.get("name"))}


def _parse_join(d):
    code = d.get("code")
    if not isinstance(code, str) or not _CODE.match(code.upper()):
        return None
    out = {"op": "join", "code": code.upper(), "name": clean_name(d.get("name"))}
    if "token" in d:
        if not isinstance(d["token"], str) or not _TOKEN.match(d["token"]):
            return None
        out["token"] = d["token"]
    return out


def _parse_ping(d):
    return {"op": "ping", "t": d["t"]} if _finite_number(d.get("t")) else None


_PARSERS = {"create": _parse_create, "join": _parse_join, "leave": lambda d: {"op": "leave"}, "ping": _parse_ping}


def parse_control(text):
    """Текст игрока → нормализованное сообщение или None (отклонено)."""
    if not isinstance(text, str) or len(text) > MAX_CONTROL_CHARS:
        return None
    try:
        d = json.loads(text)
    except ValueError:
        return None
    parser = _PARSERS.get(d.get("op")) if isinstance(d, dict) and isinstance(d.get("op"), str) else None
    return parser(d) if parser else None


def valid_pose_frame(data):
    return isinstance(data, (bytes, bytearray)) and len(data) == POSE_BYTES and data[0] == POSE_TYPE


class RateLimiter:
    """Не больше `rate` сообщений в секунду, пачкой не больше `burst`; долгая тишина запас не копит."""

    def __init__(self, rate, burst, now=time.monotonic):
        self.rate, self.burst, self.now = rate, burst, now
        self.tokens, self.last = float(burst), now()

    def allow(self):
        t = self.now()
        self.tokens = min(self.burst, self.tokens + (t - self.last) * self.rate)
        self.last = t
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True
