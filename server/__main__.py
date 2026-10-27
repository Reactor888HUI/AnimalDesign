"""Запуск: python3 -m server [--host 0.0.0.0] [--port 8765] [--origin https://адрес-игры ...]"""
import argparse
import asyncio

from . import relay


async def main():
    ap = argparse.ArgumentParser(description="Сервер игроков «Восьмёрки Баклажан»")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--origin", action="append", help="разрешённый адрес страницы игры (можно несколько); без него пускаем любой")
    args = ap.parse_args()
    server, _ = await relay.start(args.host, args.port, origins=set(args.origin) if args.origin else None)
    print(f"слушаю ws://{args.host}:{server.sockets[0].getsockname()[1]}/ws", flush=True)   # настоящий порт (при --port 0 его выбирает система)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
