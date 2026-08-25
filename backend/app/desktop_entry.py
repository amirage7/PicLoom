from collections.abc import Sequence
import argparse
import os
import sys
from typing import TextIO


def ensure_standard_streams() -> None:
    streams: tuple[tuple[str, str], ...] = (
        ("stdin", "r"),
        ("stdout", "w"),
        ("stderr", "w"),
    )
    for name, mode in streams:
        if getattr(sys, name) is None:
            stream: TextIO = open(os.devnull, mode, encoding="utf-8")
            setattr(sys, name, stream)


ensure_standard_streams()

import uvicorn  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Run the AI Image Canvas local backend.')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', default=8000, type=int)
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    arguments = build_parser().parse_args(argv)
    if arguments.host != '127.0.0.1':
        raise ValueError('The desktop backend may only bind to 127.0.0.1')
    uvicorn.run('app.main:app', host=arguments.host, port=arguments.port)


if __name__ == '__main__':
    main()