from pathlib import Path

from common.server import create_experience_app


app = create_experience_app(Path(__file__).parent)
