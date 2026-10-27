"""Граница сервера: чужие данные проверяются один раз здесь; дальше им верят."""
import json
import unittest

from server import protocol


def msg(**kw):
    return json.dumps(kw, ensure_ascii=False)


class ParseControl(unittest.TestCase):
    def test_create_with_name(self):
        self.assertEqual(protocol.parse_control(msg(op="create", name="Миша")), {"op": "create", "name": "Миша"})

    def test_name_is_trimmed_cut_to_16_and_cleaned_of_control_chars(self):
        got = protocol.parse_control(msg(op="create", name="  Очень длинное имя игрока\n\x00 "))
        self.assertLessEqual(len(got["name"]), 16)
        self.assertNotIn("\n", got["name"]); self.assertNotIn("\x00", got["name"])
        self.assertEqual(got["name"], got["name"].strip())

    def test_empty_or_missing_name_gets_a_default_not_an_error(self):
        self.assertEqual(protocol.parse_control(msg(op="create", name="   "))["name"], "Игрок")
        self.assertEqual(protocol.parse_control(msg(op="create"))["name"], "Игрок")

    def test_join_needs_a_well_formed_code_and_uppercases_it(self):
        self.assertEqual(protocol.parse_control(msg(op="join", code="abcd", name="Аня"))["code"], "ABCD")
        for bad in ("ABC", "ABCDE", "AB1O", "ABC!", "", None, 1234, ["ABCD"]):
            self.assertIsNone(protocol.parse_control(msg(op="join", code=bad, name="x")), f"код {bad!r} принят")

    def test_join_may_carry_a_rejoin_token(self):
        got = protocol.parse_control(msg(op="join", code="ABCD", name="Аня", token="a" * 22))
        self.assertEqual(got["token"], "a" * 22)
        for bad in ("короткий", "abc", "a" * 21, "a" * 23, "a" * 21 + "!"):
            self.assertIsNone(protocol.parse_control(msg(op="join", code="ABCD", name="Аня", token=bad)), f"токен {bad!r} принят")

    def test_leave_and_ping(self):
        self.assertEqual(protocol.parse_control(msg(op="leave")), {"op": "leave"})
        self.assertEqual(protocol.parse_control(msg(op="ping", t=12.5)), {"op": "ping", "t": 12.5})
        self.assertIsNone(protocol.parse_control(msg(op="ping", t="сейчас")))
        self.assertIsNone(protocol.parse_control(msg(op="ping", t=True)))              # true — не время
        self.assertIsNone(protocol.parse_control(msg(op="ping", t=float("inf"))))

    def test_garbage_is_rejected(self):
        for bad in ("", "не json", "[]", "42", "null", msg(op="rm -rf"), msg(op=7), msg(name="без операции"), "{" * 1000, None, b"bytes"):
            self.assertIsNone(protocol.parse_control(bad), f"принято: {bad!r}")

    def test_oversized_message_is_rejected_even_if_valid_json(self):
        self.assertIsNone(protocol.parse_control(msg(op="create", name="x", pad="я" * 600)))

    def test_unknown_extra_fields_are_dropped(self):
        self.assertEqual(protocol.parse_control(msg(op="leave", evil="x")), {"op": "leave"})


class PoseFrame(unittest.TestCase):
    def test_only_24_bytes_of_type_1_pass(self):
        good = bytes([1]) + bytes(23)
        self.assertTrue(protocol.valid_pose_frame(good))
        self.assertFalse(protocol.valid_pose_frame(good[:23]))
        self.assertFalse(protocol.valid_pose_frame(good + b"\0"))
        self.assertFalse(protocol.valid_pose_frame(bytes([2]) + bytes(23)))
        self.assertFalse(protocol.valid_pose_frame("строка"))
        self.assertFalse(protocol.valid_pose_frame(None))


class RateLimit(unittest.TestCase):
    def test_burst_then_steady_rate(self):
        t = [0.0]
        rl = protocol.RateLimiter(rate=10, burst=3, now=lambda: t[0])
        self.assertEqual([rl.allow() for _ in range(5)], [True, True, True, False, False])
        t[0] = 0.1                                   # за 0,1 с накапало ровно одно разрешение
        self.assertEqual([rl.allow() for _ in range(3)], [True, False, False])
        t[0] = 100.0                                 # долгая тишина не копит больше burst
        self.assertEqual(sum(rl.allow() for _ in range(10)), 3)


if __name__ == "__main__":
    unittest.main()
