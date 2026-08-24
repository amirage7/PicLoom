from pathlib import Path

from fastapi.testclient import TestClient


def upload_image(client: TestClient, image_bytes, project_id: str = "future-city", *, position_x: float = 40, position_y: float = 80) -> dict:
    response = client.post(
        f"/api/projects/{project_id}/images",
        files={"file": ("source.png", image_bytes("PNG"), "image/png")},
        data={"prompt": "City", "position_x": str(position_x), "position_y": str(position_y)},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_upload_persists_verified_png(client: TestClient, image_bytes, data_root: Path) -> None:
    body = upload_image(client, image_bytes)
    assert body["image_url"].startswith("/media/images/future-city/")
    assert body["file_name"] == "source.png"
    assert body["position_x"] == 40
    assert (data_root / body["image_path"]).is_file()
    assert client.get(body["image_url"]).status_code == 200


def test_upload_rejects_disguised_and_oversized_files(client: TestClient, data_root: Path) -> None:
    disguised = client.post("/api/projects/future-city/images", files={"file": ("fake.png", b"not-image", "image/png")})
    assert disguised.status_code == 400
    oversized = client.post("/api/projects/future-city/images", files={"file": ("huge.png", b"x" * (20 * 1024 * 1024 + 1), "image/png")})
    assert oversized.status_code == 413
    assert not [path for path in (data_root / "images").rglob("*.*")]


def test_image_patch_relationship_and_cycle_guard(client: TestClient, image_bytes) -> None:
    parent = upload_image(client, image_bytes, position_x=10)
    child = upload_image(client, image_bytes, position_x=100)
    linked = client.patch(f"/api/images/{child['id']}", json={"parent_id": parent["id"]})
    assert linked.status_code == 200
    assert linked.json()["parent_id"] == parent["id"]
    cycle = client.patch(f"/api/images/{parent['id']}", json={"parent_id": child["id"]})
    assert cycle.status_code == 400
    assert "循环" in cycle.json()["detail"]
    updated = client.patch(f"/api/images/{child['id']}", json={"prompt": "Updated", "tags": ["建筑", "夜景"], "position_x": 220, "position_y": 180})
    assert updated.status_code == 200
    assert updated.json()["tags"] == ["建筑", "夜景"]
    assert updated.json()["position_x"] == 220


def test_cross_project_parent_is_rejected(client: TestClient, image_bytes) -> None:
    source = upload_image(client, image_bytes, "future-city")
    target = upload_image(client, image_bytes, "architecture")
    assert client.patch(f"/api/images/{target['id']}", json={"parent_id": source["id"]}).status_code == 400


def test_duplicate_copies_file_and_delete_cleans_source(client: TestClient, image_bytes, data_root: Path) -> None:
    source = upload_image(client, image_bytes)
    duplicated = client.post(f"/api/images/{source['id']}/duplicate")
    assert duplicated.status_code == 201
    copy = duplicated.json()
    assert copy["id"] != source["id"]
    assert copy["image_path"] != source["image_path"]
    assert copy["position_x"] == source["position_x"] + 60
    assert (data_root / copy["image_path"]).exists()
    assert client.delete(f"/api/images/{source['id']}").status_code == 204
    assert not (data_root / source["image_path"]).exists()
    assert (data_root / copy["image_path"]).exists()


def test_list_images_returns_project_only(client: TestClient, image_bytes) -> None:
    future = upload_image(client, image_bytes, "future-city")
    upload_image(client, image_bytes, "architecture")
    response = client.get("/api/projects/future-city/images")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [future["id"]]
