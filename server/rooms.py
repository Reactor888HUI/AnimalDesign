"""Комнаты игроков: чистая логика без сети и без часов (время и случайность передаются снаружи).

Соединение — любой хешируемый идентификатор. Каждый вызов возвращает список (соединение, сообщение) — кому что отправить;
сам модуль ничего не отправляет. Правила:
  · в комнате до 7 игроков, место (слот) — наименьший свободный номер;
  · создатель — хозяин; уходит или пропадает хозяин — хозяином становится наименьший слот среди тех, кто в сети;
  · оборвалась связь — место держится `grace` секунд; вернуться можно с токеном, который выдан при входе;
  · повторный вход и повторный выход безвредны.
"""
import random

from .protocol import CODE_ALPHABET

MAX_PLAYERS = 7
_TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"


class _Player:
    __slots__ = ("name", "conn", "token", "offline_since")

    def __init__(self, name, conn, token):
        self.name, self.conn, self.token, self.offline_since = name, conn, token, None


class Rooms:
    def __init__(self, now, rng=None, grace=30.0):
        self._now = now
        self._rng = rng or random.SystemRandom()          # токены — ключи возврата в комнату: нужен криптостойкий источник
        self._grace = grace
        self._rooms = {}                                  # код → {слот: _Player}
        self._host = {}                                   # код → слот хозяина
        self._where = {}                                  # соединение → (код, слот)

    # ---- запросы -------------------------------------------------------------------------------------------------
    def slot_of(self, conn):
        return self._where[conn][1] if conn in self._where else None

    def peers(self, conn):
        if conn not in self._where:
            return []
        code, _ = self._where[conn]
        return [p.conn for p in self._rooms[code].values() if p.conn is not None and p.conn != conn]

    # ---- события -------------------------------------------------------------------------------------------------
    def handle(self, conn, msg):
        op = msg["op"]
        if op == "ping":
            return [(conn, {"op": "pong", "t": msg["t"], "srv": self._now()})]
        if op == "leave":
            return self._remove_conn(conn)
        if op == "create":
            return self._create(conn, msg["name"])
        return self._join(conn, msg)

    def disconnect(self, conn):
        if conn not in self._where:
            return []
        code, slot = self._where.pop(conn)
        player = self._rooms[code][slot]
        player.conn, player.offline_since = None, self._now()
        if self._host[code] == slot:
            self._pass_host(code)
        return self._broadcast(code)

    def tick(self):
        outs = []
        for code in list(self._rooms):
            room = self._rooms[code]
            gone = [s for s, p in room.items() if p.offline_since is not None and self._now() - p.offline_since > self._grace]
            for slot in gone:
                del room[slot]
            if gone:
                outs += self._after_removal(code)
        return outs

    # ---- внутреннее ----------------------------------------------------------------------------------------------
    def _create(self, conn, name):
        if conn in self._where:
            return [(conn, {"op": "error", "code": "already_in_room"})]
        code = self._new_code()
        self._rooms[code], self._host[code] = {}, 0
        return self._seat(conn, code, 0, name)

    def _join(self, conn, msg):
        code = msg["code"]
        if conn in self._where:
            here, slot = self._where[conn]
            if here != code:
                return [(conn, {"op": "error", "code": "already_in_room"})]
            return [(conn, self._state(code, slot, with_token=True))]            # повторный вход: просто пришлём состояние
        room = self._rooms.get(code)
        if room is None:
            return [(conn, {"op": "error", "code": "no_room"})]
        back = next((s for s, p in room.items() if p.conn is None and msg.get("token") == p.token), None)
        if back is not None:
            room[back].conn, room[back].offline_since = conn, None
            self._where[conn] = (code, back)
            return self._broadcast(code, with_token_for=conn)
        free = next((s for s in range(MAX_PLAYERS) if s not in room), None)
        if free is None:
            return [(conn, {"op": "error", "code": "full"})]
        return self._seat(conn, code, free, msg["name"])

    def _seat(self, conn, code, slot, name):
        self._rooms[code][slot] = _Player(name, conn, self._new_token())
        self._where[conn] = (code, slot)
        return self._broadcast(code, with_token_for=conn)

    def _remove_conn(self, conn):
        if conn not in self._where:
            return []
        code, slot = self._where.pop(conn)
        del self._rooms[code][slot]
        return self._after_removal(code)

    def _after_removal(self, code):
        room = self._rooms[code]
        if not room:
            del self._rooms[code], self._host[code]
            return []
        if self._host[code] not in room:
            self._pass_host(code)
        return self._broadcast(code)

    def _pass_host(self, code):
        room = self._rooms[code]
        online = [s for s, p in room.items() if p.conn is not None]
        self._host[code] = min(online or room)

    def _state(self, code, you, with_token=False):
        room = self._rooms[code]
        state = {"op": "room", "code": code, "you": you, "host": self._host[code],
                 "players": [{"slot": s, "name": room[s].name, "online": room[s].conn is not None} for s in sorted(room)]}
        if with_token:
            state["token"] = room[you].token
        return state

    def _broadcast(self, code, with_token_for=None):
        return [(p.conn, self._state(code, s, with_token=p.conn == with_token_for))
                for s, p in sorted(self._rooms[code].items()) if p.conn is not None]

    def _new_code(self):
        while True:
            code = "".join(self._rng.choice(CODE_ALPHABET) for _ in range(4))
            if code not in self._rooms:
                return code

    def _new_token(self):
        return "".join(self._rng.choice(_TOKEN_ALPHABET) for _ in range(22))
