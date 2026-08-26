def create_project(client):
    return client.post("/api/projects", json={"name": "Generated images"}).json()["id"]


def pair_extension(client):
    code = client.post("/api/providers/chatgpt/pairing").json()["code"]
    token = client.post(
        "/api/extension/pair",
        json={"code": code, "extension_version": "0.1.0"},
    ).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def prepare_downloading_task(client, headers, project_id, reference_image_ids=None):
    task = client.post(
        "/api/generation-tasks",
        json={
            "project_id": project_id,
            "prompt": "quiet tower",
            "reference_image_ids": reference_image_ids or [],
        },
    ).json()
    client.get("/api/extension/tasks/next", headers=headers)
    for state in ("sending", "generating", "downloading"):
        response = client.patch(
            f"/api/extension/tasks/{task['id']}",
            headers=headers,
            json={"status": state, "progress_message": state},
        )
        assert response.status_code == 200
    return task


def test_extension_upload_completes_task_and_creates_image(client, image_bytes, data_root):
    project_id = create_project(client)
    headers = pair_extension(client)
    task = prepare_downloading_task(client, headers, project_id)

    response = client.post(
        f"/api/extension/tasks/{task['id']}/image",
        headers=headers,
        files={"file": ("result.png", image_bytes(), "image/png")},
        data={"chat_url": "https://chatgpt.com/c/example"},
    )

    assert response.status_code == 200
    completed = response.json()
    assert completed["status"] == "completed"
    assert completed["image_id"]
    images = client.get(f"/api/projects/{project_id}/images").json()
    assert len(images) == 1
    assert images[0]["name"] == "quiet tower"
    assert images[0]["prompt"] == "quiet tower"
    assert (data_root / images[0]["image_path"]).is_file()


def test_extension_upload_links_result_to_all_reference_images(client, image_bytes):
    project_id = create_project(client)
    first = client.post(
        f"/api/projects/{project_id}/images",
        files={"file": ("first.png", image_bytes("PNG"), "image/png")},
    ).json()
    second = client.post(
        f"/api/projects/{project_id}/images",
        files={"file": ("second.jpg", image_bytes("JPEG"), "image/jpeg")},
    ).json()
    headers = pair_extension(client)
    task = prepare_downloading_task(
        client, headers, project_id, [first["id"], second["id"]]
    )

    response = client.post(
        f"/api/extension/tasks/{task['id']}/image",
        headers=headers,
        files={"file": ("result.webp", image_bytes("WEBP"), "image/webp")},
        data={"chat_url": "https://chatgpt.com/c/example"},
    )

    assert response.status_code == 200, response.text
    output_id = response.json()["image_id"]
    output = next(
        image for image in client.get(f"/api/projects/{project_id}/images").json()
        if image["id"] == output_id
    )
    assert output["source_ids"] == [first["id"], second["id"]]
    assert output["parent_id"] == first["id"]


def test_extension_rejects_invalid_image_without_completing_task(client):
    project_id = create_project(client)
    headers = pair_extension(client)
    task = prepare_downloading_task(client, headers, project_id)

    response = client.post(
        f"/api/extension/tasks/{task['id']}/image",
        headers=headers,
        files={"file": ("result.png", b"not an image", "image/png")},
        data={"chat_url": "https://chatgpt.com/c/example"},
    )

    assert response.status_code == 400
    current = client.get(f"/api/generation-tasks/{task['id']}").json()
    assert current["status"] == "downloading"
    assert client.get(f"/api/projects/{project_id}/images").json() == []
