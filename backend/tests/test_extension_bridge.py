def pair_extension(client):
    code_response = client.post("/api/providers/chatgpt/pairing")
    assert code_response.status_code == 201
    code = code_response.json()["code"]
    response = client.post("/api/extension/pair", json={"code": code, "extension_version": "0.1.0"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_pairing_code_is_single_use(client):
    code = client.post("/api/providers/chatgpt/pairing").json()["code"]

    paired = client.post("/api/extension/pair", json={"code": code, "extension_version": "0.1.0"})

    assert paired.status_code == 200
    assert paired.json()["token"]
    repeated = client.post("/api/extension/pair", json={"code": code, "extension_version": "0.1.0"})
    assert repeated.status_code == 401


def test_provider_reports_recent_heartbeat(client):
    headers = pair_extension(client)

    heartbeat = client.post(
        "/api/extension/heartbeat",
        headers=headers,
        json={"state": "ready", "chat_url": "https://chatgpt.com/"},
    )
    body = client.get("/api/providers/chatgpt/status").json()

    assert heartbeat.status_code == 204
    assert body == {
        "paired": True,
        "online": True,
        "state": "ready",
        "chat_url": "https://chatgpt.com/",
        "extension_version": "0.1.0",
    }


def test_extension_endpoint_rejects_missing_token(client):
    assert client.post("/api/extension/heartbeat", json={"state": "ready"}).status_code == 401
