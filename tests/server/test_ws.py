"""WebSocket (RFC 6455), только то, что нужно игре: короткие кадры, без дробления. Образцы — из текста стандарта."""
import unittest

from server import ws

KEY = "dGhlIHNhbXBsZSBub25jZQ=="          # RFC 6455, п. 1.3


def request(**over):
    h = {"Host": "x", "Upgrade": "websocket", "Connection": "Upgrade", "Sec-WebSocket-Key": KEY, "Sec-WebSocket-Version": "13"}
    h.update(over)
    lines = ["GET /ws HTTP/1.1"] + [f"{k}: {v}" for k, v in h.items() if v is not None]
    return ("\r\n".join(lines) + "\r\n\r\n").encode()


class Handshake(unittest.TestCase):
    def test_accept_key_matches_the_standard(self):
        self.assertEqual(ws.accept_key(KEY), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")

    def test_good_request_gives_the_key_and_a_101_response(self):
        self.assertEqual(ws.parse_handshake(request()), KEY)
        resp = ws.handshake_response(KEY)
        self.assertTrue(resp.startswith(b"HTTP/1.1 101"))
        self.assertIn(b"Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=", resp)
        self.assertTrue(resp.endswith(b"\r\n\r\n"))

    def test_header_names_are_case_insensitive_and_connection_may_list_several_values(self):
        self.assertEqual(ws.parse_handshake(request(Connection="keep-alive, Upgrade", Upgrade="WebSocket")), KEY)
        raw = request().replace(b"Sec-WebSocket-Key", b"sec-websocket-key")
        self.assertEqual(ws.parse_handshake(raw), KEY)

    def test_every_deviation_is_refused(self):
        bad = [request(Upgrade=None), request(Upgrade="h2c"), request(Connection="close"), request(**{"Sec-WebSocket-Version": "8"}),
               request(**{"Sec-WebSocket-Key": None}), request(**{"Sec-WebSocket-Key": "не base64"}), request(**{"Sec-WebSocket-Key": "AAAA"}),
               request().replace(b"GET /ws", b"POST /ws"), request().replace(b"GET /ws", b"GET /other"), "\x00\x01 мусор".encode(), b"GET /ws HTTP/1.1\r\n",
               b"GET /ws HTTP/1.1\r\n" + b"X: " + b"a" * 5000 + b"\r\n\r\n"]
        for raw in bad:
            with self.assertRaises(ws.HandshakeError, msg=raw[:60]):
                ws.parse_handshake(raw)

    def test_otherwise_valid_request_is_refused_when_longer_than_4096_bytes(self):
        long = request(**{"X-Pad": "a" * 4100})
        self.assertGreater(len(long), 4096)
        with self.assertRaises(ws.HandshakeError):
            ws.parse_handshake(long)
        self.assertEqual(ws.parse_handshake(request(**{"X-Pad": "a" * 100})), KEY)

    def test_origin_list_when_given(self):
        ok = request(Origin="https://game.example")
        self.assertEqual(ws.parse_handshake(ok, allowed_origins={"https://game.example"}), KEY)
        with self.assertRaises(ws.HandshakeError):
            ws.parse_handshake(request(Origin="https://evil.example"), allowed_origins={"https://game.example"})
        with self.assertRaises(ws.HandshakeError):
            ws.parse_handshake(request(), allowed_origins={"https://game.example"})          # без Origin при списке — отказ
        self.assertEqual(ws.parse_handshake(request(Origin="https://anything")), KEY)        # списка нет — пускаем всех


class Encode(unittest.TestCase):
    def test_unmasked_hello_matches_the_standard(self):
        self.assertEqual(ws.encode_frame(ws.OP_TEXT, b"Hello"), bytes([0x81, 0x05, 0x48, 0x65, 0x6C, 0x6C, 0x6F]))

    def test_masked_hello_matches_the_standard(self):
        self.assertEqual(ws.encode_frame(ws.OP_TEXT, b"Hello", mask=bytes([0x37, 0xFA, 0x21, 0x3D])),
                         bytes([0x81, 0x85, 0x37, 0xFA, 0x21, 0x3D, 0x7F, 0x9F, 0x4D, 0x51, 0x58]))

    def test_medium_payload_uses_the_16_bit_length(self):
        frame = ws.encode_frame(ws.OP_BINARY, bytes(300))
        self.assertEqual(frame[:4], bytes([0x82, 126, 0x01, 0x2C]))
        self.assertEqual(len(frame), 4 + 300)

    def test_ping_pong_close_helpers(self):
        self.assertEqual(ws.encode_frame(ws.OP_PING, b"a"), bytes([0x89, 0x01, 0x61]))
        self.assertEqual(ws.close_payload(1009, "big"), bytes([0x03, 0xF1]) + b"big")


def client_frame(opcode, payload=b"", fin=True, mask=bytes([1, 2, 3, 4]), rsv=0):
    raw = bytearray(ws.encode_frame(opcode, payload, mask=mask))
    raw[0] = (raw[0] & 0x0F) | (0x80 if fin else 0) | rsv
    return bytes(raw)


class Decode(unittest.TestCase):
    def test_masked_text_frame_from_the_standard(self):
        d = ws.FrameDecoder()
        got = d.feed(bytes([0x81, 0x85, 0x37, 0xFA, 0x21, 0x3D, 0x7F, 0x9F, 0x4D, 0x51, 0x58]))
        self.assertEqual(got, [(ws.OP_TEXT, b"Hello")])

    def test_frame_arriving_in_pieces_and_two_frames_in_one_chunk(self):
        data = client_frame(ws.OP_TEXT, b"one") + client_frame(ws.OP_BINARY, bytes(range(24)))
        d = ws.FrameDecoder(); out = []
        for i in range(0, len(data), 3):
            out += d.feed(data[i:i + 3])
        self.assertEqual(out, [(ws.OP_TEXT, b"one"), (ws.OP_BINARY, bytes(range(24)))])
        self.assertEqual(ws.FrameDecoder().feed(data), out)

    def test_16_bit_length_frames(self):
        self.assertEqual(ws.FrameDecoder().feed(client_frame(ws.OP_BINARY, bytes(500))), [(ws.OP_BINARY, bytes(500))])

    def test_server_side_refuses_unmasked_frames(self):
        with self.assertRaises(ws.FrameError) as e:
            ws.FrameDecoder().feed(ws.encode_frame(ws.OP_TEXT, b"x"))
        self.assertEqual(e.exception.code, 1002)

    def test_client_side_decoder_reads_unmasked_server_frames(self):
        self.assertEqual(ws.FrameDecoder(expect_masked=False).feed(ws.encode_frame(ws.OP_TEXT, b"hello")), [(ws.OP_TEXT, b"hello")])

    def test_fragmented_messages_and_continuations_are_refused(self):
        for raw in (client_frame(ws.OP_TEXT, b"a", fin=False), client_frame(0, b"a")):
            with self.assertRaises(ws.FrameError) as e:
                ws.FrameDecoder().feed(raw)
            self.assertEqual(e.exception.code, 1003)

    def test_reserved_bits_and_unknown_opcodes_are_refused(self):
        for raw in (client_frame(ws.OP_TEXT, b"a", rsv=0x40), client_frame(3, b"a"), client_frame(11, b"")):
            with self.assertRaises(ws.FrameError):
                ws.FrameDecoder().feed(raw)

    def test_payload_over_the_limit_is_refused_before_it_is_read(self):
        head = bytes([0x82, 0x80 | 126, 0x08, 0x00]) + bytes([1, 2, 3, 4])           # заявлено 2048 байт, самих байт ещё нет
        with self.assertRaises(ws.FrameError) as e:
            ws.FrameDecoder().feed(head)
        self.assertEqual(e.exception.code, 1009)
        d = ws.FrameDecoder()
        self.assertEqual(d.feed(client_frame(ws.OP_BINARY, bytes(ws.MAX_PAYLOAD))), [(ws.OP_BINARY, bytes(ws.MAX_PAYLOAD))])
        with self.assertRaises(ws.FrameError):
            ws.FrameDecoder().feed(client_frame(ws.OP_BINARY, bytes(ws.MAX_PAYLOAD + 1)))
        self.assertEqual(ws.MAX_PAYLOAD, 1024)                                       # граница — литералом: поменять можно только осознанно
        self.assertEqual(len(ws.FrameDecoder().feed(client_frame(ws.OP_BINARY, bytes(1024)))[0][1]), 1024)
        with self.assertRaises(ws.FrameError):
            ws.FrameDecoder().feed(client_frame(ws.OP_BINARY, bytes(1025)))

    def test_64_bit_length_is_refused(self):
        with self.assertRaises(ws.FrameError) as e:
            ws.FrameDecoder().feed(bytes([0x82, 0x80 | 127]) + bytes(8) + bytes(4))
        self.assertEqual(e.exception.code, 1009)

    def test_control_frames_must_be_short_and_whole(self):
        with self.assertRaises(ws.FrameError):
            ws.FrameDecoder().feed(client_frame(ws.OP_PING, bytes(126)))
        with self.assertRaises(ws.FrameError):
            ws.FrameDecoder().feed(client_frame(ws.OP_PING, b"a", fin=False))
        self.assertEqual(ws.FrameDecoder().feed(client_frame(ws.OP_PING, b"abc")), [(ws.OP_PING, b"abc")])
        self.assertEqual(ws.FrameDecoder().feed(client_frame(ws.OP_CLOSE, ws.close_payload(1000))), [(ws.OP_CLOSE, bytes([0x03, 0xE8]))])


if __name__ == "__main__":
    unittest.main()
