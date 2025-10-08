FROM python:3.11-slim

WORKDIR /app

# Instalacja zależności
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Skopiuj kod
COPY app.py .

# Port
EXPOSE 8000

# Uruchom
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
