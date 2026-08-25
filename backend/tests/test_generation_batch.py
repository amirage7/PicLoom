from pathlib import Path


def create_project(client, name: str = "Desktop generation") -> str:
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


def create_task(client, project_id: str, parent_image_id: str | None = None) -> dict:
    response = client.post(
        "/api/generation-tasks",
        json={
            "project_id": project_id,
            "prompt": "two quiet flowers",
            "parent_image_id": parent_image_id,
        },
    )
    assert response.status_code == 201
    return response.json()


def upload_parent(client, image_bytes, project_id: str, format_name: str = "PNG") -> dict:
    response = client.post(
        f"/api/projects/{project_id}/images",
        files={"file": (f"parent.{format_name.lower()}", image_bytes(format_name), f"image/{format_name.lower()}")},
        data={"prompt": "parent", "position_x": "120", "position_y": "80"},
    )
    assert response.status_code == 201
    return response.json()


def complete_batch(client, task_id: str, batch_id: str, files: list[tuple]) -> object:
    return client.post(
        f"/api/generation-tasks/{task_id}/complete-batch",
        data={"batch_id": batch_id, "source_url": "https://chatgpt.com/c/local"},
        files=files,
    )


def test_complete_batch_imports_all_images_in_order_with_parent(client, image_bytes):
    project_id = create_project(client)
    parent = upload_parent(client, image_bytes, project_id, "JPEG")
    task = create_task(client, project_id, parent["id"])

    response = complete_batch(client, task["id"], "batch-two", [
        ("files", ("first.png", image_bytes("PNG"), "image/png")),
        ("files", ("second.webp", image_bytes("WEBP"), "image/webp")),
    ])

    assert response.status_code == 200, response.text
    result = response.json()
    assert len(result["image_ids"]) == 2
    images = client.get(f"/api/projects/{project_id}/images").json()
    imported = [image for image in images if image["id"] in result["image_ids"]]
    assert [image["id"] for image in imported] == result["image_ids"]
    assert {image["parent_id"] for image in imported} == {parent["id"]}
    assert {image["prompt"] for image in imported} == {"two quiet flowers"}
    assert all(image["position_y"] > parent["position_y"] for image in imported)
    current = client.get(f"/api/generation-tasks/{task['id']}").json()
    assert current["status"] == "completed"
    assert current["image_id"] == result["image_ids"][0]
    assert current["batch_id"] == "batch-two"


def test_batch_deduplicates_existing_and_repeated_bytes(client, image_bytes):
    project_id = create_project(client)
    existing = upload_parent(client, image_bytes, project_id)
    task = create_task(client, project_id)
    content = image_bytes("PNG")

    response = complete_batch(client, task["id"], "batch-dedupe", [
        ("files", ("one.png", content, "image/png")),
        ("files", ("same.png", content, "image/png")),
    ])

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["image_ids"] == [existing["id"], existing["id"]]
    assert result["deduplicated_count"] == 2
    assert len(client.get(f"/api/projects/{project_id}/images").json()) == 1


def test_invalid_member_rolls_back_entire_batch(client, image_bytes, data_root: Path):
    project_id = create_project(client)
    task = create_task(client, project_id)

    response = complete_batch(client, task["id"], "batch-invalid", [
        ("files", ("good.png", image_bytes("PNG"), "image/png")),
        ("files", ("bad.png", b"not an image", "image/png")),
    ])

    assert response.status_code == 400
    assert client.get(f"/api/projects/{project_id}/images").json() == []
    assert not list((data_root / "images" / project_id).glob("*.*"))
    assert client.get(f"/api/generation-tasks/{task['id']}").json()["status"] == "queued"


def test_completing_same_batch_twice_is_idempotent(client, image_bytes):
    project_id = create_project(client)
    task = create_task(client, project_id)
    files = [("files", ("result.jpg", image_bytes("JPEG"), "image/jpeg"))]

    first = complete_batch(client, task["id"], "batch-stable", files)
    second = complete_batch(client, task["id"], "batch-stable", files)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["image_ids"] == first.json()["image_ids"]
    assert len(client.get(f"/api/projects/{project_id}/images").json()) == 1


def test_desktop_state_endpoint_enforces_transitions(client):
    project_id = create_project(client)
    task = create_task(client, project_id)

    for state in ("opening_chatgpt", "login_required", "ready", "sending", "generating", "collecting", "importing"):
        response = client.patch(
            f"/api/generation-tasks/{task['id']}/desktop-state",
            json={
                "state": state,
                "message": state,
                "last_page_url": "https://chatgpt.com/",
            },
        )
        assert response.status_code == 200, response.text

    backward = client.patch(
        f"/api/generation-tasks/{task['id']}/desktop-state",
        json={"state": "opening_chatgpt", "message": "backward"},
    )

    cancelled = client.post(f"/api/generation-tasks/{task['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert backward.status_code == 409


def test_desktop_state_allows_page_changed_while_chatgpt_is_opening(client):
    project_id = create_project(client)
    task = create_task(client, project_id)

    opening = client.patch(
        f"/api/generation-tasks/{task['id']}/desktop-state",
        json={"state": "opening_chatgpt", "message": "opening"},
    )
    changed = client.patch(
        f"/api/generation-tasks/{task['id']}/desktop-state",
        json={"state": "page_changed", "message": "composer missing"},
    )

    assert opening.status_code == 200
    assert changed.status_code == 200, changed.text
    assert changed.json()["status"] == "page_changed"
