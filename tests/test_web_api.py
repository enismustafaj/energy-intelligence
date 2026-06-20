from fastapi.testclient import TestClient

from darkenergy.web.app import app


def test_households_api_returns_seeded_homes(db_path):
    client = TestClient(app)

    response = client.get("/api/households")

    assert response.status_code == 200
    data = response.json()
    assert [home["household_id"] for home in data["households"]] == [
        "HH-1001",
        "HH-1002",
        "HH-1003",
        "HH-1004",
    ]


def test_household_view_api_returns_client_payload(db_path):
    client = TestClient(app)

    response = client.get("/api/households/HH-1001/view")

    assert response.status_code == 200
    data = response.json()
    assert data["household"]["household_id"] == "HH-1001"
    assert data["hub"]["annual_cost_eur"] > 0
    assert data["nodes"]
    assert data["advice"]
