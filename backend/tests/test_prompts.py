from fastapi.testclient import TestClient


def test_prompt_crud_and_duplicate(client: TestClient) -> None:
    created = client.post(
        "/api/prompts",
        json={"title": "Studio", "content": "Soft light", "category": "摄影"},
    )
    assert created.status_code == 201
    prompt_id = created.json()["id"]

    updated = client.patch(
        f"/api/prompts/{prompt_id}",
        json={"title": "Studio Light", "content": "Directional soft light"},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Studio Light"

    duplicated = client.post(f"/api/prompts/{prompt_id}/duplicate")
    assert duplicated.status_code == 201
    assert duplicated.json()["id"] != prompt_id
    assert duplicated.json()["title"] == "Studio Light 副本"

    assert client.delete(f"/api/prompts/{prompt_id}").status_code == 204


def test_prompt_fields_must_not_be_blank(client: TestClient) -> None:
    response = client.post(
        "/api/prompts",
        json={"title": " ", "content": " ", "category": " "},
    )
    assert response.status_code == 422
