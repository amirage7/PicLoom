from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import event

from app.models.entities import Image
from app.services import image_relations


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
    assert body["name"] == "source"
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
    assert copy["name"] == "source 副本"
    assert copy["position_x"] == source["position_x"] + 60
    assert (data_root / copy["image_path"]).exists()
    assert client.delete(f"/api/images/{source['id']}").status_code == 204
    assert not (data_root / source["image_path"]).exists()
    assert (data_root / copy["image_path"]).exists()


def test_image_name_is_editable_and_unique_per_project(client: TestClient, image_bytes) -> None:
    first = upload_image(client, image_bytes, "future-city")
    second = upload_image(client, image_bytes, "future-city")
    other_project = upload_image(client, image_bytes, "architecture")

    renamed = client.patch(f"/api/images/{first['id']}", json={"name": "假面骑士Build"})
    conflict = client.patch(f"/api/images/{second['id']}", json={"name": " 假面骑士build "})
    reused = client.patch(f"/api/images/{other_project['id']}", json={"name": "假面骑士build"})

    assert renamed.status_code == 200
    assert renamed.json()["name"] == "假面骑士Build"
    assert conflict.status_code == 409
    assert "同名" in conflict.json()["detail"]
    assert reused.status_code == 200


def test_image_name_rejects_empty_and_overlong_values(client: TestClient, image_bytes) -> None:
    image = upload_image(client, image_bytes)

    assert client.patch(f"/api/images/{image['id']}", json={"name": "   "}).status_code == 422
    assert client.patch(f"/api/images/{image['id']}", json={"name": "图" * 81}).status_code == 422


def test_list_images_returns_project_only(client: TestClient, image_bytes) -> None:
    future = upload_image(client, image_bytes, "future-city")
    upload_image(client, image_bytes, "architecture")
    response = client.get("/api/projects/future-city/images")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [future["id"]]


def test_list_images_loads_all_source_relations_in_one_query(client: TestClient, image_bytes) -> None:
    first = upload_image(client, image_bytes)
    second = upload_image(client, image_bytes)
    third = upload_image(client, image_bytes)
    assert client.post("/api/image-relations", json={"source_id": first["id"], "target_id": second["id"]}).status_code == 200
    assert client.post("/api/image-relations", json={"source_id": first["id"], "target_id": third["id"]}).status_code == 200

    engine = client.app.state.session_factory.kw["bind"]
    relation_selects = 0

    def count_relation_selects(_connection, _cursor, statement, _parameters, _context, _executemany):
        nonlocal relation_selects
        normalized = statement.lower()
        if normalized.lstrip().startswith("select") and "from image_relations" in normalized:
            relation_selects += 1

    event.listen(engine, "before_cursor_execute", count_relation_selects)
    try:
        response = client.get("/api/projects/future-city/images")
    finally:
        event.remove(engine, "before_cursor_execute", count_relation_selects)

    assert response.status_code == 200
    assert relation_selects == 1


def test_image_relations_support_multiple_sources_and_deletion(client: TestClient, image_bytes) -> None:
    first = upload_image(client, image_bytes, position_x=10)
    second = upload_image(client, image_bytes, position_x=20)
    target = upload_image(client, image_bytes, position_x=30)

    one = client.post("/api/image-relations", json={"source_id": first["id"], "target_id": target["id"]})
    two = client.post("/api/image-relations", json={"source_id": second["id"], "target_id": target["id"]})
    duplicate = client.post("/api/image-relations", json={"source_id": first["id"], "target_id": target["id"]})

    assert one.status_code == 200, one.text
    assert two.status_code == 200, two.text
    assert duplicate.status_code == 200, duplicate.text
    listed = client.get("/api/projects/future-city/images").json()
    current = next(image for image in listed if image["id"] == target["id"])
    assert current["source_ids"] == [first["id"], second["id"]]
    assert current["parent_id"] == first["id"]

    removed = client.delete(f"/api/image-relations/{first['id']}/{target['id']}")
    assert removed.status_code == 204, removed.text
    remaining_ids = {
        image["id"]
        for image in client.get("/api/projects/future-city/images").json()
    }
    assert first["id"] in remaining_ids
    assert target["id"] in remaining_ids
    current = next(
        image for image in client.get("/api/projects/future-city/images").json()
        if image["id"] == target["id"]
    )
    assert current["source_ids"] == [second["id"]]
    assert current["parent_id"] == second["id"]


def test_deleting_source_image_promotes_remaining_source_to_legacy_parent(client: TestClient, image_bytes) -> None:
    first = upload_image(client, image_bytes, position_x=10)
    second = upload_image(client, image_bytes, position_x=20)
    target = upload_image(client, image_bytes, position_x=30)
    assert client.post("/api/image-relations", json={"source_id": first["id"], "target_id": target["id"]}).status_code == 200
    assert client.post("/api/image-relations", json={"source_id": second["id"], "target_id": target["id"]}).status_code == 200

    removed = client.delete(f"/api/images/{first['id']}")

    assert removed.status_code == 204
    target_after = next(
        image for image in client.get("/api/projects/future-city/images").json()
        if image["id"] == target["id"]
    )
    assert target_after["source_ids"] == [second["id"]]
    assert target_after["parent_id"] == second["id"]


def test_relation_unique_conflict_returns_existing_relation(client: TestClient, image_bytes, monkeypatch) -> None:
    source = upload_image(client, image_bytes)
    target = upload_image(client, image_bytes)
    session = client.app.state.session_factory()
    try:
        existing = image_relations.create_relation(session, source["id"], target["id"])
        real_scalar = session.scalar
        scalar_calls = 0

        def racing_scalar(statement):
            nonlocal scalar_calls
            scalar_calls += 1
            if scalar_calls == 1:
                return None
            return real_scalar(statement)

        monkeypatch.setattr(session, "scalar", racing_scalar)
        source_model = session.get(Image, source["id"])
        source_model.prompt = "must survive savepoint conflict"

        recovered = image_relations.create_relation(session, source["id"], target["id"])

        assert recovered.id == existing.id
    finally:
        session.close()
    refreshed = next(
        image for image in client.get("/api/projects/future-city/images").json()
        if image["id"] == source["id"]
    )
    assert refreshed["prompt"] == "must survive savepoint conflict"


def test_image_relation_rejects_cross_project_and_dag_cycles(client: TestClient, image_bytes) -> None:
    first = upload_image(client, image_bytes, "future-city")
    second = upload_image(client, image_bytes, "future-city")
    other = upload_image(client, image_bytes, "architecture")

    assert client.post("/api/image-relations", json={"source_id": other["id"], "target_id": first["id"]}).status_code == 400
    assert client.post("/api/image-relations", json={"source_id": first["id"], "target_id": second["id"]}).status_code == 200
    cycle = client.post("/api/image-relations", json={"source_id": second["id"], "target_id": first["id"]})
    assert cycle.status_code == 400
    assert "循环" in cycle.json()["detail"]


def test_legacy_parent_patch_replaces_all_source_relations(client: TestClient, image_bytes) -> None:
    first = upload_image(client, image_bytes)
    second = upload_image(client, image_bytes)
    target = upload_image(client, image_bytes)
    assert client.post("/api/image-relations", json={"source_id": first["id"], "target_id": target["id"]}).status_code == 200
    assert client.post("/api/image-relations", json={"source_id": second["id"], "target_id": target["id"]}).status_code == 200

    patched = client.patch(f"/api/images/{target['id']}", json={"parent_id": second["id"]})

    assert patched.status_code == 200, patched.text
    assert patched.json()["source_ids"] == [second["id"]]
    assert patched.json()["parent_id"] == second["id"]


def test_download_image_content_by_id(client: TestClient, image_bytes) -> None:
    image = upload_image(client, image_bytes)
    response = client.get(f"/api/images/{image['id']}/content")
    assert response.status_code == 200
    assert response.headers["content-disposition"].endswith('filename="source.png"')
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")


def test_image_asset_can_leave_canvas_without_deleting_file(client: TestClient, image_bytes, data_root: Path) -> None:
    image = upload_image(client, image_bytes)

    updated = client.patch(f"/api/images/{image['id']}", json={"is_on_canvas": False})

    assert updated.status_code == 200, updated.text
    assert updated.json()["is_on_canvas"] is False
    assert (data_root / image["image_path"]).is_file()
    assert client.get("/api/projects/future-city/images").json()[0]["id"] == image["id"]


def test_unarchived_image_can_move_into_project(client: TestClient, image_bytes) -> None:
    created = client.post(
        "/api/unarchived/images",
        files={"file": ("idea.png", image_bytes("PNG"), "image/png")},
    )
    assert created.status_code == 201, created.text
    image = created.json()
    assert image["project_id"] is None
    assert image["is_on_canvas"] is False

    moved = client.patch(f"/api/images/{image['id']}", json={"project_id": "future-city"})

    assert moved.status_code == 200, moved.text
    assert moved.json()["project_id"] == "future-city"
    assert client.get("/api/unarchived/images").json() == []
    assert [item["id"] for item in client.get("/api/projects/future-city/images").json()] == [image["id"]]
