# Vigil Guard API Reference

REST API udostępniane przez backend (`services/web-ui/backend`) służy do logowania użytkowników, zarządzania plikami konfiguracyjnymi oraz pobierania statystyk z ClickHouse. Wszystkie poniższe endpointy zwracają i przyjmują dane w formacie JSON.

## Base URL

- Bezpośrednio z backendu (np. w trybie dev): `http://localhost:8787/api`
- Przez reverse proxy Caddy (frontend na porcie 80): `http://localhost/ui/api`

W przykładach przyjmujemy, że rozmawiamy bezpośrednio z backendem – jeśli korzystasz z Caddy, dodaj prefiks `/ui`.

## Authentication

Backend wymaga aktywnej sesji. Po poprawnym logowaniu otrzymasz token JWT oraz ciasteczko sesyjne. Token trzeba przesyłać w nagłówku `Authorization: Bearer <token>`, a zapytania powinny mieć `credentials: include`.

### `POST /api/auth/login`

```jsonc
// Request body
{
  "username": "admin",
  "password": "admin123"
}

// Response body
{
  "success": true,
  "token": "<JWT>",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@vigilguard.local",
    "role": "admin",
    "can_view_monitoring": true,
    "can_view_configuration": true,
    "can_manage_users": true,
    "force_password_change": false,
    "timezone": "UTC"
  }
}
```

Pozostałe istotne endpointy auth:

| Method | Path                           | Description                              |
|--------|--------------------------------|------------------------------------------|
| `POST` | `/api/auth/logout`             | Unieważnia bieżącą sesję                 |
| `GET`  | `/api/auth/me`                 | Zwraca dane zalogowanego użytkownika     |
| `GET`  | `/api/auth/verify`             | Waliduje token i zwraca jego payload     |
| `POST` | `/api/auth/change-password`    | Zmienia hasło (wymaga pola `currentPassword` i `newPassword`) |
| `PUT`  | `/api/auth/settings`           | Aktualizuje strefę czasową użytkownika   |

Administratorzy mają dodatkowe endpointy do zarządzania listą użytkowników (`/api/auth/users`, `PUT/DELETE /api/auth/users/:id`, `/api/auth/users/:id/toggle-active`, `/api/auth/users/:id/force-password-change`).

## Configuration Files

Backend udostępnia API do przeglądania i edycji plików `.json` i `.conf` znajdujących się w katalogu `TARGET_DIR` (domyślnie `/config` w kontenerze). Działania są zabezpieczone ETagami oraz automatycznym backupem.

| Method | Path                   | Description |
|--------|-----------------------|-------------|
| `GET`  | `/api/files?ext=all`  | Lista plików z etagami i metadanymi (opcjonalnie `json` lub `conf`) |
| `GET`  | `/api/file/:name`     | Pobiera plik w postaci tekstowej |
| `GET`  | `/api/parse/:name`    | Zwraca plik wraz z wstępnie sparsowaną strukturą |
| `POST` | `/api/resolve`        | Na podstawie specyfikacji zmiennych zwraca ich aktualne wartości (maskuje sekrety) |
| `POST` | `/api/save`           | Zapisuje zmiany (JSON path lub pary `section/key` dla plików `.conf`), tworząc kopię `.bak` |

Przykład zapisu zmian:

```jsonc
POST /api/save
{
  "changeTag": "upped-limits",
  "ifMatch": "74bdbf1d",
  "changes": [
    {
      "file": "thresholds.config.json",
      "payloadType": "json",
      "updates": [
        { "path": "limits.requests_per_minute", "value": 120 }
      ]
    }
  ]
}
```

W razie konfliktu etagów backend zwróci `409 Conflict` z informacją o spodziewanym i aktualnym etagu.

## Monitoring

### `GET /api/stats/24h`

Zwraca zagregowane dane z ClickHouse z ostatnich 24 godzin:

```json
{
  "requests_processed": 1245,
  "threats_blocked": 32,
  "content_sanitized": 87
}
```

Domyślnie backend łączy się z hostem `vigil-clickhouse` i bazą `n8n_logs`. Można to zmienić zmiennymi środowiskowymi (`CLICKHOUSE_HOST`, `CLICKHOUSE_PORT` itd.).

## Health Checks

Do podstawowych testów działania usług służą:

- `GET /health` – backend Web UI
- `GET /ui/api/health` – ten sam endpoint przez Caddy
- `GET /ui/api/stats/24h` – weryfikacja połączenia z ClickHouse (wymaga autoryzacji)

## Obsługa błędów

API używa standardowych kodów HTTP. Błędy walidacji i konflikty zapisów zwracają strukturę:

```json
{
  "error": "File changed on disk",
  "expected": "74bdbf1d",
  "actual": "27ce901a"
}
```

Dodatkowe informacje znajdziesz w `README.md`, `QUICKSTART.md` oraz dokumentacji komponentów w katalogu `docs/`.
