"""Сервер с настоящими соединениями: клиенты — маленькие самодельные WebSocket-клиенты на asyncio."""
import asyncio
import json
import os
import unittest
from unittest import mock

from server import relay, ws

POSE = bytes([1]) + bytes(range(1, 24))
KEY = "dGhlIHNhbXBsZSBub25jZQ=="


class Client:
    opened = []                                                # все клиенты теста — закрываются в конце

    def __init__(self, reader, writer):
        self.r, self.w, self.dec = reader, writer, ws.FrameDecoder(expect_masked=False)
        self.pending = []
        Client.opened.append(self)

    @classmethod
    async def open(cls, port):
        return cls(*await asyncio.open_connection("127.0.0.1", port))

    async def handshake(self, **over):
        h = {"Host": "x", "Upgrade": "websocket", "Connection": "Upgrade", "Sec-WebSocket-Key": KEY, "Sec-WebSocket-Version": "13"}
        h.update(over)
        self.w.write(("GET /ws HTTP/1.1\r\n" + "".join(f"{k}: {v}\r\n" for k, v in h.items()) + "\r\n").encode())
        head = await asyncio.wait_for(self.r.readuntil(b"\r\n\r\n"), 2)
        return head.split(b"\r\n")[0].decode()

    @classmethod
    async def connect(cls, port, **over):
        c = await cls.open(port)
        status = await c.handshake(**over)
        assert status.startswith("HTTP/1.1 101"), status
        return c

    def send(self, opcode, payload):
        self.w.write(ws.encode_frame(opcode, payload, mask=os.urandom(4)))

    def send_json(self, d):
        self.send(ws.OP_TEXT, json.dumps(d).encode())

    async def recv(self, timeout=1.0):
        """Следующий кадр (код, данные) или None, если за timeout ничего не пришло / соединение закрыто."""
        while not self.pending:
            try:
                data = await asyncio.wait_for(self.r.read(4096), timeout)
            except asyncio.TimeoutError:
                return None
            if not data:
                return None
            self.pending += self.dec.feed(data)
        return self.pending.pop(0)

    async def recv_json(self, timeout=1.0):
        op, payload = await self.recv(timeout)
        assert op == ws.OP_TEXT, (op, payload)
        return json.loads(payload)

    async def closed_with(self, timeout=1.0):
        """Код закрытия, если сервер закрыл соединение корректно (кадр close), иначе None."""
        while True:
            frame = await self.recv(timeout)
            if frame is None:
                return None
            if frame[0] == ws.OP_CLOSE:
                return int.from_bytes(frame[1][:2], "big")

    def drop(self):
        self.w.close()


class RelayCase(unittest.IsolatedAsyncioTestCase):
    async def start(self, **kw):
        kw.setdefault("tick", 0.05)
        self.server, self.relay = await relay.start("127.0.0.1", 0, **kw)
        self.port = self.server.sockets[0].getsockname()[1]
        self.addAsyncCleanup(self.stop)

    async def stop(self):
        for c in Client.opened:
            c.w.close()
        Client.opened.clear()
        self.server.close()
        await self.server.wait_closed()
        await self.relay.close()

    async def pair(self):
        a = await Client.connect(self.port); a.send_json({"op": "create", "name": "Аня"})
        room = await a.recv_json()
        b = await Client.connect(self.port); b.send_json({"op": "join", "code": room["code"], "name": "Боря"})
        await b.recv_json(); await a.recv_json()               # b увидел комнату, a услышал про b
        return a, b, room["code"]


class Handshake(RelayCase):
    async def test_ping_pong_after_a_good_handshake(self):
        await self.start()
        c = await Client.connect(self.port)
        c.send_json({"op": "ping", "t": 12.5})
        got = await c.recv_json()
        self.assertEqual((got["op"], got["t"]), ("pong", 12.5))

    async def test_bad_handshake_gets_400_and_the_door_closes(self):
        await self.start()
        c = await Client.open(self.port)
        self.assertTrue((await c.handshake(Upgrade="nope")).startswith("HTTP/1.1 400"))
        self.assertIsNone(await c.recv())

    async def test_foreign_origin_is_refused_when_a_list_is_set(self):
        await self.start(origins={"https://game.example"})
        c = await Client.open(self.port)
        self.assertTrue((await c.handshake(Origin="https://evil.example")).startswith("HTTP/1.1 400"))
        ok = await Client.open(self.port)
        self.assertTrue((await ok.handshake(Origin="https://game.example")).startswith("HTTP/1.1 101"))

    async def test_endless_header_without_an_end_gets_400_quickly(self):
        await self.start()
        c = await Client.open(self.port)
        c.w.write(b"GET /ws HTTP/1.1\r\n" + b"X: " + b"a" * 10000)
        head = await asyncio.wait_for(c.r.readuntil(b"\r\n\r\n"), 1)
        self.assertTrue(head.startswith(b"HTTP/1.1 400"))

    async def test_connection_that_never_sends_a_handshake_is_dropped(self):
        await self.start(handshake_timeout=0.2)
        c = await Client.open(self.port)
        head = await asyncio.wait_for(c.r.read(100), 1)
        self.assertTrue(head.startswith(b"HTTP/1.1 400"))

    async def test_connection_cap_gives_503(self):
        await self.start(max_conns=1)
        first = await Client.connect(self.port)
        second = await Client.open(self.port)
        self.assertTrue((await second.handshake()).startswith("HTTP/1.1 503"))
        first.drop()

    async def test_silent_connection_is_closed_after_the_idle_time(self):
        await self.start(idle=0.2)
        c = await Client.connect(self.port)
        self.assertEqual(await c.closed_with(2), 1001)


class Rooms(RelayCase):
    async def test_second_player_joins_and_both_see_two_players(self):
        await self.start()
        a, b, code = await self.pair()
        a.send_json({"op": "ping", "t": 1}); await a.recv_json()
        self.assertRegex(code, "^[A-Z2-9]{4}$")

    async def test_unknown_room_and_garbage_messages_get_errors(self):
        await self.start()
        c = await Client.connect(self.port)
        c.send_json({"op": "join", "code": "ZZZZ", "name": "x"})
        self.assertEqual(await c.recv_json(), {"op": "error", "code": "no_room"})
        c.send(ws.OP_TEXT, b"not json")
        self.assertEqual(await c.recv_json(), {"op": "error", "code": "bad_msg"})
        c.send(ws.OP_TEXT, b"\xff\xfe")
        self.assertEqual(await c.recv_json(), {"op": "error", "code": "bad_msg"})

    async def test_five_bad_messages_in_a_row_close_the_connection(self):
        await self.start()
        c = await Client.connect(self.port)
        for _ in range(5):
            c.send(ws.OP_TEXT, b"{bad")
        self.assertEqual(await c.closed_with(2), 1008)

    async def test_bad_messages_must_be_in_a_row_to_cut_the_connection(self):
        await self.start()
        c = await Client.connect(self.port)
        for _ in range(4):
            c.send(ws.OP_TEXT, b"{bad")
        c.send_json({"op": "ping", "t": 1})
        for _ in range(4):
            c.send(ws.OP_TEXT, b"{bad")
        c.send_json({"op": "ping", "t": 2})
        ops = [(await c.recv_json())["op"] for _ in range(10)]
        self.assertEqual(ops.count("error"), 8); self.assertEqual(ops.count("pong"), 2)

    async def test_text_flood_is_cut_by_the_rate_limit(self):
        await self.start()
        c = await Client.connect(self.port)
        for i in range(30):
            c.send_json({"op": "ping", "t": i})
        seen = []
        while (frame := await c.recv(0.3)) is not None and frame[0] == ws.OP_TEXT:
            seen.append(json.loads(frame[1])["op"])
        self.assertGreaterEqual(seen.count("pong"), 10); self.assertLess(seen.count("pong"), 30)
        self.assertIn("error", seen)

    async def test_when_a_player_drops_the_others_see_him_offline(self):
        await self.start()
        a, b, _ = await self.pair()
        b.drop()
        view = await a.recv_json(2)
        self.assertEqual([(p["name"], p["online"]) for p in view["players"]], [("Аня", True), ("Боря", False)])

    async def test_dropped_player_is_removed_after_the_grace_time(self):
        await self.start(grace=0.15)
        a, b, _ = await self.pair()
        b.drop(); await a.recv_json(2)                         # «не в сети»
        view = await a.recv_json(2)                            # «убран»
        self.assertEqual([p["name"] for p in view["players"]], ["Аня"])


class Poses(RelayCase):
    async def test_pose_reaches_the_other_player_with_the_senders_slot_and_not_the_sender(self):
        await self.start()
        a, b, _ = await self.pair()
        a.send(ws.OP_BINARY, POSE)
        op, payload = await b.recv(2)
        self.assertEqual(op, ws.OP_BINARY)
        self.assertEqual(payload, bytes([0]) + POSE)
        self.assertIsNone(await a.recv(0.2))
        b.send(ws.OP_BINARY, POSE)
        self.assertEqual((await a.recv(2))[1][0], 1)

    async def test_poses_stay_inside_their_room_and_come_only_from_players_in_a_room(self):
        await self.start()
        a, b, _ = await self.pair()
        c = await Client.connect(self.port); c.send_json({"op": "create", "name": "Чужой"}); await c.recv_json()
        stray = await Client.connect(self.port)                # не в комнате
        stray.send(ws.OP_BINARY, POSE)
        c.send(ws.OP_BINARY, POSE)
        self.assertIsNone(await a.recv(0.3)); self.assertIsNone(await b.recv(0.1))
        stray.send_json({"op": "ping", "t": 5})
        self.assertEqual((await stray.recv_json())["op"], "pong")      # посторонний остался на связи: поза без комнаты — не ошибка сервера

    async def test_wrong_size_or_type_binary_frames_are_not_forwarded(self):
        await self.start()
        a, b, _ = await self.pair()
        a.send(ws.OP_BINARY, POSE[:23]); a.send(ws.OP_BINARY, bytes([2]) + POSE[1:]); a.send(ws.OP_BINARY, POSE + b"\0")
        self.assertIsNone(await b.recv(0.3))

    async def test_a_slow_receiver_is_skipped_instead_of_piling_up(self):
        await self.start()
        a, b, _ = await self.pair()
        with mock.patch.object(relay, "WRITE_BACKLOG", 0):
            a.send(ws.OP_BINARY, POSE)
            self.assertIsNone(await b.recv(0.3))
        a.send(ws.OP_BINARY, POSE)
        self.assertIsNotNone(await b.recv(1))

    async def test_pose_flood_is_cut_to_the_burst(self):
        await self.start(pose_rate=1, pose_burst=5)
        a, b, _ = await self.pair()
        for _ in range(40):
            a.send(ws.OP_BINARY, POSE)
        got = 0
        while await b.recv(0.3):
            got += 1
        self.assertGreaterEqual(got, 5); self.assertLessEqual(got, 7)


class Frames(RelayCase):
    async def test_oversized_frame_closes_with_1009(self):
        await self.start()
        c = await Client.connect(self.port)
        c.send(ws.OP_BINARY, bytes(1024))                      # крупнейший допустимый кадр: не поза, молча отброшен, но не закрывает
        c.send_json({"op": "ping", "t": 1})
        self.assertEqual((await c.recv_json())["op"], "pong")
        c.w.write(bytes([0x82, 0x80 | 126, 0x08, 0x00, 1, 2, 3, 4]))
        self.assertEqual(await c.closed_with(2), 1009)

    async def test_websocket_ping_is_answered_with_pong_and_close_is_echoed(self):
        await self.start()
        c = await Client.connect(self.port)
        c.send(ws.OP_PING, b"abc")
        self.assertEqual(await c.recv(1), (ws.OP_PONG, b"abc"))
        c.send(ws.OP_CLOSE, ws.close_payload(1000))
        self.assertEqual(await c.closed_with(1), 1000)


if __name__ == "__main__":
    unittest.main()
