from fastapi.testclient import TestClient


def test_project_crud(client: TestClient) -> None:
    created = client.post("/api/projects", json={"name": "New Project"})
    assert created.status_code == 201
    project_id = created.json()["id"]

    renamed = client.patch(f"/api/projects/{project_id}", json={"name": "Renamed"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"

    listed = client.get("/api/projects")
    assert listed.status_code == 200
    assert all("image_count" in item for item in listed.json())

    assert client.delete(f"/api/projects/{project_id}").status_code == 204


def test_project_names_must_not_be_blank(client: TestClient) -> None:
    assert client.post("/api/projects", json={"name": "   "}).status_code == 422


def test_last_project_cannot_be_deleted(client: TestClient) -> None:
    projects = client.get("/api/projects").json()
    for project in projects[:-1]:
        assert client.delete(f"/api/projects/{project['id']}").status_code == 204

    response = client.delete(f"/api/projects/{projects[-1]['id']}")
    assert response.status_code == 409
    assert response.json()["detail"] == "至少需要保留一个项目"
