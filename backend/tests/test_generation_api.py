def create_project(client):
    response = client.post("/api/projects", json={"name": "Generation project"})
    assert response.status_code == 201
    return response.json()["id"]


def pair_extension(client):
    code = client.post("/api/providers/chatgpt/pairing").json()["code"]
    token = client.post(
        "/api/extension/pair",
        json={"code": code, "extension_version": "0.1.0"},
    ).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_webui_creates_reads_and_cancels_task(client):
    project_id = create_project(client)

    created = client.post(
        "/api/generation-tasks",
        json={"project_id": project_id, "prompt": "glass pavilion"},
    )

    assert created.status_code == 201
    task_id = created.json()["id"]
    assert client.get(f"/api/generation-tasks/{task_id}").json()["status"] == "queued"
    cancelled = client.post(f"/api/generation-tasks/{task_id}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


def test_extension_claims_only_one_task(client):
    project_id = create_project(client)
    headers = pair_extension(client)
    first = client.post(
        "/api/generation-tasks",
        json={"project_id": project_id, "prompt": "first"},
    ).json()
    client.post(
        "/api/generation-tasks",
        json={"project_id": project_id, "prompt": "second"},
    )

    claimed = client.get("/api/extension/tasks/next", headers=headers)
    repeated = client.get("/api/extension/tasks/next", headers=headers)

    assert claimed.status_code == 200
    assert claimed.json()["id"] == first["id"]
    assert claimed.json()["status"] == "connecting"
    assert repeated.json()["id"] == first["id"]


def test_extension_reports_valid_progress(client):
    project_id = create_project(client)
    headers = pair_extension(client)
    task = client.post(
        "/api/generation-tasks",
        json={"project_id": project_id, "prompt": "quiet station"},
    ).json()
    client.get("/api/extension/tasks/next", headers=headers)

    response = client.patch(
        f"/api/extension/tasks/{task['id']}",
        headers=headers,
        json={"status": "sending", "progress_message": "正在发送"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "sending"


def test_extension_rejects_invalid_progress_transition(client):
    project_id = create_project(client)
    headers = pair_extension(client)
    task = client.post(
        "/api/generation-tasks",
        json={"project_id": project_id, "prompt": "quiet station"},
    ).json()
    client.get("/api/extension/tasks/next", headers=headers)

    response = client.patch(
        f"/api/extension/tasks/{task['id']}",
        headers=headers,
        json={"status": "completed", "progress_message": "done"},
    )

    assert response.status_code == 409
