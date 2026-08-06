import json
from pathlib import Path

from PIL import Image


root = Path(__file__).resolve().parents[1] / "assets" / "items"
catalog_path = root / "catalog.json"
catalog = json.loads(catalog_path.read_text(encoding="utf-8"))

for item in catalog["items"]:
    anchors = {}
    for grade, relative_path in item["grades"].items():
        image = Image.open(root / Path(relative_path.replace("\\", "/"))).convert("RGBA")
        bounds = image.getchannel("A").getbbox()
        if not bounds:
            anchors[grade] = {"x": 0, "y": 0}
            continue
        center_x = (bounds[0] + bounds[2]) / 2
        center_y = (bounds[1] + bounds[3]) / 2
        anchors[grade] = {
            "x": round((image.width / 2 - center_x) / image.width * 100, 1),
            "y": round((image.height / 2 - center_y) / image.height * 100, 1),
        }
    item["sprite_anchors"] = anchors

catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
