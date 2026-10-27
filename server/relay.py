"""Сервер игроков «Восьмёрки Баклажан»: WebSocket-транспорт вокруг комнат (rooms.py). Без зависимостей, только стандартная библиотека.

Что делает: принимает соединения, проверяет рукопожатие и кадры (ws.py), разбирает управляющие сообщения (protocol.py),
отдаёт их комнатам (rooms.py) и пересылает позы машин тем, кто в той же комнате (к позе спереди добавляется номер места отправителя).
Чего не делает: не читает позы и не считает физику; ничего не хранит на диске.
Защита: лимит соединений, лимит на рукопожатие и простой, кадры ≤ 1 КБ, лимит частоты (позы и текст), 5 плохих сообщений подряд — закрытие,
медленному получателю позы пропускаются, а не копятся.
"""
import asyncio
import json
import time

from . import protocol, ws
from .rooms import Rooms

MAX_STRIKES = 5
WRITE_BACKLOG = 64 * 1024


class _Conn:
    __slots__ = ("id", "writer", "strikes", "text_limit", "pose_limit", "closed")

    def __init__(self, cid, writer, text_limit, pose_limit):
        self.id, self.writer, self.strikes, self.closed = cid, writer, 0, False
        self.text_limit, self.pose_limit = text_limit, pose_limit


class Relay:
    def __init__(self, *, origins=None, max_conns=200, idle=60.0, handshake_timeout=5.0, grace=30.0, tick=1.0, pose_rate=60, pose_burst=30, now=time.monotonic):
        self.origins, self.max_conns, self.idle, self.tick = origins, max_conns, idle, tick
        self.handshake_timeout = handshake_timeout
        self.pose_rate, self.pose_burst, self.now = pose_rate, pose_burst, now
        self.rooms = Rooms(now=now, grace=grace)
        self.conns, self._next, self._ticker = {}, 0, None

    # ---- жизнь сервера -------------------------------------------------------------------------------------------
    def start_ticker(self):
        self._ticker = asyncio.ensure_future(self._tick_loop())

    async def _tick_loop(self):
        while True:
            await asyncio.sleep(self.tick)
            self._send_outs(self.rooms.tick())

    async def close(self):
        if self._ticker:
            self._ticker.cancel()
        for conn in list(self.conns.values()):
            conn.writer.close()

    # ---- соединение ----------------------------------------------------------------------------------------------
    async def serve_client(self, reader, writer):
        if len(self.conns) >= self.max_conns:
            return await self._refuse(writer, "503 Service Unavailable")
        try:
            data = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), self.handshake_timeout)
            key = ws.parse_handshake(data, self.origins)
        except (ws.HandshakeError, asyncio.TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError, ConnectionError):
            return await self._refuse(writer, "400 Bad Request")
        writer.write(ws.handshake_response(key))
        conn = _Conn(self._next, writer, protocol.RateLimiter(5, 10, self.now), protocol.RateLimiter(self.pose_rate, self.pose_burst, self.now))
        self._next += 1
        self.conns[conn.id] = conn
        try:
            await self._read_loop(conn, reader)
        except ConnectionError:
            pass
        finally:
            del self.conns[conn.id]
            self._send_outs(self.rooms.disconnect(conn.id))
            writer.close()

    async def _refuse(self, writer, status):
        writer.write(f"HTTP/1.1 {status}\r\nConnection: close\r\n\r\n".encode())
        writer.close()

    async def _read_loop(self, conn, reader):
        decoder = ws.FrameDecoder()
        while not conn.closed:
            try:
                data = await asyncio.wait_for(reader.read(2048), self.idle)
            except asyncio.TimeoutError:
                return self._close(conn, 1001)
            if not data:
                return
            try:
                frames = decoder.feed(data)
            except ws.FrameError as e:
                return self._close(conn, e.code)
            for opcode, payload in frames:
                if not self._on_frame(conn, opcode, payload):
                    return

    # ---- кадры ---------------------------------------------------------------------------------------------------
    def _on_frame(self, conn, opcode, payload):
        """False — соединение пора закончить."""
        if opcode == ws.OP_TEXT:
            return self._on_text(conn, payload)
        if opcode == ws.OP_BINARY:
            self._on_pose(conn, payload)
            return True
        if opcode == ws.OP_PING:
            conn.writer.write(ws.encode_frame(ws.OP_PONG, payload))
            return True
        if opcode == ws.OP_CLOSE:
            self._close(conn, int.from_bytes(payload[:2], "big") if len(payload) >= 2 else 1000)
            return False
        return True

    def _on_text(self, conn, payload):
        msg = None
        if conn.text_limit.allow():
            try:
                msg = protocol.parse_control(payload.decode())
            except UnicodeDecodeError:
                pass
        if msg is None:
            return self._strike(conn)
        conn.strikes = 0
        self._send_outs(self.rooms.handle(conn.id, msg))
        return True

    def _strike(self, conn):
        conn.strikes += 1
        if conn.strikes >= MAX_STRIKES:
            self._close(conn, 1008)
            return False
        self._send_json(conn.id, {"op": "error", "code": "bad_msg"})
        return True

    def _on_pose(self, conn, payload):
        slot = self.rooms.slot_of(conn.id)
        if slot is None or not protocol.valid_pose_frame(payload) or not conn.pose_limit.allow():
            return
        frame = ws.encode_frame(ws.OP_BINARY, bytes([slot]) + payload)
        for peer in self.rooms.peers(conn.id):
            target = self.conns.get(peer)
            if target and target.writer.transport.get_write_buffer_size() < WRITE_BACKLOG:
                target.writer.write(frame)

    # ---- отправка ------------------------------------------------------------------------------------------------
    def _send_json(self, cid, message):
        conn = self.conns.get(cid)
        if conn and not conn.closed:
            conn.writer.write(ws.encode_frame(ws.OP_TEXT, json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode()))

    def _send_outs(self, outs):
        for cid, message in outs:
            self._send_json(cid, message)

    def _close(self, conn, code):
        if not conn.closed:
            conn.closed = True
            conn.writer.write(ws.encode_frame(ws.OP_CLOSE, ws.close_payload(code)))
            conn.writer.close()


async def start(host, port, **kw):
    relay = Relay(**kw)
    server = await asyncio.start_server(relay.serve_client, host, port, limit=8192)
    relay.start_ticker()
    return server, relay
