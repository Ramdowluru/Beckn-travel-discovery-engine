from pathlib import Path

from common.server import create_app

app = create_app(Path(__file__).parent)