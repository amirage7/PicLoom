import json
from pathlib import Path


def create_project(client, name: str = "Desktop generation") -> str:
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


def create_task(
    client,
    project_id: str | None,
    parent_image_id: str | None = None,
    prompt: str = "two quiet flowers",
) -> dict:
    response = client.post(
        "/api/generation-tasks",
        json={
            "project_id": project_id,
            "prompt": prompt,
            "parent_image_id": parent_image_id,
        },
    )
    assert response.status_code == 201
    return response.json()


def create_task_with_references(client, project_id: str, reference_image_ids: list[str]) -> dict:
    response = client.post(
        "/api/generation-tasks",
        json={
            "project_id": project_id,
            "prompt": "combine the references",
            "reference_image_ids": reference_image_ids,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def upload_parent(client, image_bytes, project_id: str, format_name: str = "PNG") -> dict:
    response = client.post(
        f"/api/projects/{project_id}/images",
        files={"file": (f"parent.{format_name.lower()}", image_bytes(format_name), f"image/{format_name.lower()}")},
        data={"prompt": "parent", "position_x": "120", "position_y": "80"},
    )
    assert response.status_code == 201
    return response.json()


def complete_batch(
    client,
    task_id: str,
    batch_id: str,
    files: list[tuple],
    suggested_name: str | None = None,
) -> object:
    data = {"batch_id": batch_id, "source_url": "https://chatgpt.com/c/local"}
    if suggested_name is not None:
        data["suggested_name"] = suggested_name
    return client.post(
        f"/api/generation-tasks/{task_id}/complete-batch",
        data=data,
        files=files,
    )


def test_quick_creation_batch_is_saved_unarchived_and_not_on_canvas(client, image_bytes):
    task = create_task(client, None, prompt="a temporary visual idea")

    response = complete_batch(client, task["id"], "quick-batch", [
        ("files", ("idea.png", image_bytes("PNG"), "image/png")),
    ])

    assert response.status_code == 200, response.text
    images = client.get("/api/unarchived/images").json()
    assert len(images) == 1
    assert images[0]["project_id"] is None
    assert images[0]["source_type"] == "generated"
    assert images[0]["is_on_canvas"] is False


def test_complete_batch_prefers_clean_chatgpt_name_and_keeps_unique_suffixes(client, image_bytes):
    project_id = create_project(client)
    task = create_task(client, project_id)

    response = complete_batch(client, task["id"], "named-batch", [
        ("files", ("first.png", image_bytes("PNG"), "image/png")),
        ("files", ("second.webp", image_bytes("WEBP"), "image/webp")),
    ], suggested_name='图片名称：“@草原机甲”')

    assert response.status_code == 200, response.text
    image_ids = response.json()["image_ids"]
    images = client.get(f"/api/projects/{project_id}/images").json()
    imported = [image for image in images if image["id"] in image_ids]
    assert [image["name"] for image in imported] == ["草原机甲", "草原机甲 (2)"]


def test_complete_batch_uses_per_file_names(client, image_bytes):
    project_id = create_project(client)
    task = create_task(client, project_id)

    response = client.post(
        f"/api/generation-tasks/{task['id']}/complete-batch",
        data={
            "batch_id": "per-file-names",
            "source_url": "https://chatgpt.com/c/local",
            "suggested_names": json.dumps(["赤红机甲", "苍蓝机甲"]),
        },
        files=[
            ("files", ("first.png", image_bytes("PNG"), "image/png")),
            ("files", ("second.webp", image_bytes("WEBP"), "image/webp")),
        ],
    )

    assert response.status_code == 200, response.text
    image_ids = response.json()["image_ids"]
    images = client.get(f"/api/projects/{project_id}/images").json()
    imported = [image for image in images if image["id"] in image_ids]
    assert [image["name"] for image in imported] == ["赤红机甲", "苍蓝机甲"]


def test_complete_batch_per_file_names_fall_back_to_prompt(client, image_bytes):
    project_id = create_project(client)
    task = create_task(client, project_id, prompt="a quiet lighthouse")

    response = client.post(
        f"/api/generation-tasks/{task['id']}/complete-batch",
        data={
            "batch_id": "per-file-partial",
            "source_url": "https://chatgpt.com/c/local",
            "suggested_names": json.dumps(["赤红机甲", ""]),
        },
        files=[
            ("files", ("first.png", image_bytes("PNG"), "image/png")),
            ("files", ("second.webp", image_bytes("WEBP"), "image/webp")),
        ],
    )

    assert response.status_code == 200, response.text
    image_ids = response.json()["image_ids"]
    images = client.get(f"/api/projects/{project_id}/images").json()
    imported = [image for image in images if image["id"] in image_ids]
    assert imported[0]["name"] == "赤红机甲"
    assert imported[1]["name"] == "a quiet lighthouse"


def test_complete_batch_fallback_name_removes_mention_markers(client, image_bytes):
    project_id = create_project(client)
    prompt = "把@假面骑士的身体和@喜羊羊的头部组合"
    task = create_task(client, project_id, prompt=prompt)

    response = complete_batch(client, task["id"], "fallback-name", [
        ("files", ("result.png", image_bytes("PNG"), "image/png")),
    ])

    assert response.status_code == 200, response.text
    image_id = response.json()["image_ids"][0]
    image = next(
        image for image in client.get(f"/api/projects/{project_id}/images").json()
        if image["id"] == image_id
    )
    assert image["name"] == "把假面骑士的身体和喜羊羊的头部组合"
    assert "@" not in image["name"]


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
    assert [image["name"] for image in imported] == ["two quiet flowers", "two quiet flowers (2)"]
    assert all(image["position_y"] > parent["position_y"] for image in imported)
    current = client.get(f"/api/generation-tasks/{task['id']}").json()
    assert current["status"] == "completed"
    assert current["image_id"] == result["image_ids"][0]
    assert current["batch_id"] == "batch-two"


def test_generation_task_preserves_deduplicated_reference_order(client, image_bytes):
    project_id = create_project(client)
    first = upload_parent(client, image_bytes, project_id, "PNG")
    second = upload_parent(client, image_bytes, project_id, "JPEG")

    task = create_task_with_references(client, project_id, [first["id"], second["id"], first["id"]])

    assert task["reference_image_ids"] == [first["id"], second["id"]]
    assert task["parent_image_id"] == first["id"]


def test_generation_task_rejects_cross_project_reference(client, image_bytes):
    project_id = create_project(client)
    other_project_id = create_project(client, "Other")
    other = upload_parent(client, image_bytes, other_project_id)

    response = client.post(
        "/api/generation-tasks",
        json={"project_id": project_id, "prompt": "combine", "reference_image_ids": [other["id"]]},
    )

    assert response.status_code == 400


def test_completed_batch_links_each_reference_to_every_output(client, image_bytes):
    project_id = create_project(client)
    first = upload_parent(client, image_bytes, project_id, "PNG")
    second = upload_parent(client, image_bytes, project_id, "JPEG")
    task = create_task_with_references(client, project_id, [first["id"], second["id"]])

    response = complete_batch(client, task["id"], "multi-reference", [
        ("files", ("result.webp", image_bytes("WEBP"), "image/webp")),
    ])

    assert response.status_code == 200, response.text
    output_id = response.json()["image_ids"][0]
    output = next(
        image for image in client.get(f"/api/projects/{project_id}/images").json()
        if image["id"] == output_id
    )
    assert output["source_ids"] == [first["id"], second["id"]]
    assert output["parent_id"] == first["id"]


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


def test_desktop_state_allows_same_state_progress_updates(client):
    project_id = create_project(client)
    task = create_task(client, project_id)

    for state in ("opening_chatgpt", "ready", "sending", "generating", "collecting"):
        response = client.patch(
            f"/api/generation-tasks/{task['id']}/desktop-state",
            json={
                "state": state,
                "message": state,
                "last_page_url": "https://chatgpt.com/c/result",
            },
        )
        assert response.status_code == 200, response.text

    naming = client.patch(
        f"/api/generation-tasks/{task['id']}/desktop-state",
        json={
            "state": "collecting",
            "message": "图片已生成，正在请 ChatGPT 命名。",
            "last_page_url": "https://chatgpt.com/c/result",
        },
    )

    assert naming.status_code == 200, naming.text
    assert naming.json()["status"] == "collecting"
    assert naming.json()["progress_message"] == "图片已生成，正在请 ChatGPT 命名。"


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
