"""Комнаты: чистая логика без сети. Игрок для комнат — любой хешируемый идентификатор соединения."""
import random
import unittest

from server.rooms import Rooms, MAX_PLAYERS


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def new_rooms(clock=None, grace=30.0):
    return Rooms(now=clock or Clock(), rng=random.Random(7), grace=grace)


def to(outs, conn):
    """Сообщения, адресованные одному соединению."""
    return [m for c, m in outs if c == conn]


def create(rooms, conn, name="Хозяин"):
    outs = rooms.handle(conn, {"op": "create", "name": name})
    return to(outs, conn)[-1]


def join(rooms, conn, code, name="Гость", token=None):
    msg = {"op": "join", "code": code, "name": name}
    if token:
        msg["token"] = token
    return rooms.handle(conn, msg)


class CreateAndJoin(unittest.TestCase):
    def test_creator_gets_slot_0_host_and_a_code_and_a_token(self):
        r = new_rooms()
        room = create(r, "a")
        self.assertEqual(room["op"], "room")
        self.assertEqual((room["you"], room["host"]), (0, 0))
        self.assertRegex(room["code"], r"^[A-Z2-9]{4}$")
        self.assertEqual(len(room["token"]), 22)
        self.assertEqual([p["name"] for p in room["players"]], ["Хозяин"])

    def test_joiner_gets_next_slot_and_everyone_hears_about_it(self):
        r = new_rooms(); code = create(r, "a")["code"]
        outs = join(r, "b", code, "Аня")
        mine = to(outs, "b")[-1]
        self.assertEqual(mine["you"], 1)
        self.assertEqual(sorted(p["name"] for p in mine["players"]), ["Аня", "Хозяин"])
        host_view = to(outs, "a")[-1]
        self.assertEqual(len(host_view["players"]), 2)
        self.assertNotIn("token", host_view)               # чужой токен не раздаём

    def test_unknown_room_is_an_error_not_a_crash(self):
        r = new_rooms()
        self.assertEqual(to(join(r, "b", "ZZZZ"), "b"), [{"op": "error", "code": "no_room"}])

    def test_room_holds_at_most_seven_players(self):
        self.assertEqual(MAX_PLAYERS, 7)                      # число из ТЗ, не из кода: изменить можно только осознанно
        r = new_rooms(); code = create(r, "c0")["code"]
        for i in range(1, 7):
            self.assertEqual(to(join(r, f"c{i}", code), f"c{i}")[-1]["op"], "room")
        self.assertEqual(to(join(r, "late", code), "late"), [{"op": "error", "code": "full"}])

    def test_codes_are_unique_between_rooms(self):
        r = new_rooms()
        codes = {create(r, f"c{i}")["code"] for i in range(200)}
        self.assertEqual(len(codes), 200)

    def test_second_room_never_gets_a_code_that_is_already_taken(self):
        class Rng(random.Random):                                 # код «AAAA», «AAAA», «BBBB»; остальное (токены) — как обычно
            def __init__(self):
                super().__init__(1); self.queue = list("AAAAAAAABBBB")
            def choice(self, seq):
                return self.queue.pop(0) if len(seq) == 31 and self.queue else super().choice(seq)
        r = Rooms(now=Clock(), rng=Rng())
        self.assertEqual(create(r, "a")["code"], "AAAA")
        self.assertEqual(create(r, "b")["code"], "BBBB")

    def test_a_connection_in_a_room_cannot_create_or_join_another(self):
        r = new_rooms(); a = create(r, "a"); other = create(r, "x")
        self.assertEqual(to(r.handle("a", {"op": "create", "name": "x"}), "a"), [{"op": "error", "code": "already_in_room"}])
        self.assertEqual(to(join(r, "a", other["code"]), "a"), [{"op": "error", "code": "already_in_room"}])
        self.assertEqual(r.handle("a", {"op": "create", "name": "x"}) and r.slot_of("a"), a["you"])


class Idempotence(unittest.TestCase):
    def test_joining_the_same_room_twice_does_not_duplicate_the_player(self):
        r = new_rooms(); code = create(r, "a")["code"]
        join(r, "b", code, "Аня")
        again = to(join(r, "b", code, "Аня"), "b")[-1]
        self.assertEqual(len(again["players"]), 2)
        self.assertEqual(again["you"], 1)

    def test_leaving_twice_is_harmless(self):
        r = new_rooms(); code = create(r, "a")["code"]; join(r, "b", code)
        r.handle("b", {"op": "leave"})
        self.assertEqual(r.handle("b", {"op": "leave"}), [])
        self.assertEqual(r.disconnect("b"), [])


class HostAndLeaving(unittest.TestCase):
    def test_when_host_leaves_the_lowest_remaining_slot_becomes_host(self):
        r = new_rooms(); code = create(r, "a")["code"]; join(r, "b", code, "Б"); join(r, "c", code, "В")
        outs = r.handle("a", {"op": "leave"})
        self.assertEqual(to(outs, "b")[-1]["host"], 1)
        self.assertEqual(to(outs, "c")[-1]["host"], 1)

    def test_empty_room_disappears_and_its_code_stops_working(self):
        r = new_rooms(); code = create(r, "a")["code"]
        r.handle("a", {"op": "leave"})
        self.assertEqual(to(join(r, "b", code), "b"), [{"op": "error", "code": "no_room"}])

    def test_slot_zero_is_reused_too_when_the_first_player_leaves(self):
        r = new_rooms(); code = create(r, "a")["code"]; join(r, "b", code)
        r.handle("a", {"op": "leave"})
        self.assertEqual(to(join(r, "c", code), "c")[-1]["you"], 0)

    def test_freed_slot_is_reused_by_the_next_joiner(self):
        r = new_rooms(); code = create(r, "a")["code"]; join(r, "b", code); join(r, "c", code)
        r.handle("b", {"op": "leave"})
        self.assertEqual(to(join(r, "d", code), "d")[-1]["you"], 1)


class DroppedConnection(unittest.TestCase):
    def test_dropped_player_is_shown_offline_and_keeps_the_slot_during_grace(self):
        clock = Clock(); r = new_rooms(clock, grace=30); code = create(r, "a")["code"]; join(r, "b", code, "Аня")
        outs = r.disconnect("b")
        view = to(outs, "a")[-1]
        self.assertEqual([(p["slot"], p["online"]) for p in view["players"]], [(0, True), (1, False)])
        clock.t += 29
        self.assertEqual(r.tick(), [])                       # место ещё держим
        self.assertEqual(to(join(r, "x", code), "x")[-1]["you"], 2)   # чужой получает следующее, не занятое

    def test_nothing_is_ever_addressed_to_an_offline_player(self):
        r = new_rooms(); code = create(r, "a")["code"]; join(r, "b", code); join(r, "c", code)
        outs = r.disconnect("b") + join(r, "d", code) + r.handle("c", {"op": "leave"})
        self.assertTrue(all(conn is not None for conn, _ in outs))

    def test_player_returns_with_token_to_the_same_slot(self):
        clock = Clock(); r = new_rooms(clock); a = create(r, "a"); code = a["code"]
        token = to(join(r, "b", code, "Аня"), "b")[-1]["token"]
        r.disconnect("b"); clock.t += 10
        back = to(join(r, "b2", code, "Аня", token=token), "b2")[-1]
        self.assertEqual(back["you"], 1)
        self.assertEqual([p["online"] for p in back["players"]], [True, True])
        self.assertEqual(r.slot_of("b2"), 1); self.assertIsNone(r.slot_of("b"))

    def test_token_of_another_room_or_a_player_still_online_does_not_steal_a_slot(self):
        r = new_rooms(); code = create(r, "a")["code"]
        token = to(join(r, "b", code), "b")[-1]["token"]
        res = to(join(r, "thief", code, token=token), "thief")[-1]
        self.assertEqual(res["you"], 2)                      # b ещё в сети: токен не работает, вход как новый

    def test_after_grace_the_player_is_removed_and_room_hears_it(self):
        clock = Clock(); r = new_rooms(clock, grace=30); code = create(r, "a")["code"]; join(r, "b", code)
        r.disconnect("b"); clock.t += 31
        outs = r.tick()
        self.assertEqual([p["slot"] for p in to(outs, "a")[-1]["players"]], [0])
        self.assertEqual(r.tick(), [])                       # второй раз — ничего

    def test_host_passes_to_an_online_player_when_host_drops(self):
        r = new_rooms(); code = create(r, "a")["code"]; join(r, "b", code)
        outs = r.disconnect("a")
        self.assertEqual(to(outs, "b")[-1]["host"], 1)

    def test_returning_host_does_not_take_the_role_back(self):
        r = new_rooms(); a = create(r, "a"); code = a["code"]; join(r, "b", code)
        r.disconnect("a")
        back = to(join(r, "a2", code, token=a["token"]), "a2")[-1]
        self.assertEqual((back["you"], back["host"]), (0, 1))

    def test_room_with_everyone_offline_is_deleted_after_grace(self):
        clock = Clock(); r = new_rooms(clock, grace=30); code = create(r, "a")["code"]
        r.disconnect("a"); clock.t += 31; r.tick()
        self.assertEqual(to(join(r, "b", code), "b"), [{"op": "error", "code": "no_room"}])


class RelayTargets(unittest.TestCase):
    def test_peers_are_the_other_online_players_of_the_same_room_only(self):
        r = new_rooms(); code = create(r, "a")["code"]; join(r, "b", code); join(r, "c", code)
        other = create(r, "x")["code"]; join(r, "y", other)
        self.assertEqual(sorted(r.peers("a")), ["b", "c"])
        self.assertEqual(r.peers("x"), ["y"])
        r.disconnect("c")
        self.assertEqual(r.peers("a"), ["b"])
        self.assertEqual(r.peers("nobody"), [])

    def test_slot_of_gives_the_sender_number_for_relayed_frames(self):
        r = new_rooms(); code = create(r, "a")["code"]; join(r, "b", code)
        self.assertEqual((r.slot_of("a"), r.slot_of("b"), r.slot_of("zzz")), (0, 1, None))


class Ping(unittest.TestCase):
    def test_pong_returns_the_clients_time_and_the_server_time(self):
        clock = Clock(); r = new_rooms(clock)
        out = to(r.handle("a", {"op": "ping", "t": 5.5}), "a")
        self.assertEqual(out, [{"op": "pong", "t": 5.5, "srv": clock.t}])


if __name__ == "__main__":
    unittest.main()
