def test_register(client):
    response = client.post("/auth/register", json={
        "email": "new@example.com",
        "password": "password123"
    })
    assert response.status_code == 201
    assert response.json()["email"] == "new@example.com"
    assert "id" in response.json()

def test_login(client):
    client.post("/auth/register", json={
        "email": "login@example.com",
        "password": "password123"
    })
    response = client.post("/auth/login", data={
        "username": "login@example.com",
        "password": "password123"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"
