import io

def upload_csv_helper(client, headers, content: bytes, filename: str):
    file = {"file": (filename, io.BytesIO(content), "text/csv")}
    response = client.post("/datasets/upload", files=file, headers=headers)
    assert response.status_code == 201
    return response.json()
