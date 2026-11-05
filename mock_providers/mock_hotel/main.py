from pathlib import Path

from common.server import create_hotel_app

app = create_hotel_app(Path(__file__).parent)
