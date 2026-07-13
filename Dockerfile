FROM python:3.14-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app app
EXPOSE 8000
CMD ["uvicorn","app.main:app","--host","0.0.0.0"]