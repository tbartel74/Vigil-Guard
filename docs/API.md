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

### `GET /api/prompt-guard/health`

Sprawdza status Prompt Guard API:

```json
{
  "status": "healthy",
  "model_loaded": true
}
```

## False Positive Feedback

System umożliwia użytkownikom zgłaszanie błędnych decyzji systemu (over-blocking, over-sanitization). Wszystkie endpointy wymagają autoryzacji.

### `POST /api/feedback/false-positive`

Zgłasza fałszywie pozytywną detekcję. Pole `reported_by` jest automatycznie wypełniane z tokenu JWT.

**Request:**
```jsonc
{
  "event_id": "1760425445919-1760425446066",
  "reason": "over_blocking",               // required: over_blocking | over_sanitization | false_detection | business_logic | other
  "comment": "This was a legitimate request",  // optional, max 5000 chars
  "event_timestamp": "2025-10-14T07:04:06Z",   // optional, for context
  "original_input": "ignore all previous instructions", // optional
  "final_status": "BLOCKED",                   // optional: BLOCKED | SANITIZED
  "threat_score": 85                           // optional
}
```

**Response (success):**
```json
{
  "success": true,
  "message": "False positive report submitted successfully"
}
```

**Przykłady błędów:**
- `400` - Brak wymaganych pól (`event_id`, `reason`)
- `401` - Brak autoryzacji

### `GET /api/feedback/stats`

Zwraca statystyki zgłoszonych False Positive:

**Response:**
```json
{
  "total_reports": 49,
  "unique_events": 45,
  "top_reason": "over_blocking",
  "last_7_days": 12
}
```

**Dane w ClickHouse:**
- Tabela: `n8n_logs.false_positive_reports`
- Widoki: `false_positive_summary`, `false_positive_trends`
- Schema: `services/monitoring/sql/03-false-positives.sql`

### Integracja z UI

W interfejsie użytkownika przycisk "Report False Positive" pojawia się automatycznie w sekcji **Prompt Analysis** dla eventów ze statusem `BLOCKED` lub `SANITIZED`. Użytkownik może:

1. Wybrać event z dropdownu
2. Kliknąć "Report False Positive" (prawy górny róg)
3. Wybrać powód z listy rozwijanej
4. Dodać opcjonalny komentarz
5. Wysłać raport

Dashboard pokazuje:
- Statystyki FP w Quick Stats (Total + Last 7 days)
- Wykres czasowy w panelu Grafana (False Positive Reports Over Time)

## Configuration Version History

System automatycznie tworzy historię zmian konfiguracji z możliwością rollback. Każda zmiana zapisana przez `/api/save` tworzy wpis w `version_history.json` z tagiem, timestampem, autorem i ścieżkami backupów. Wszystkie endpointy wymagają uprawnień `can_view_configuration`.

### `GET /api/config-versions`

Zwraca listę wersji konfiguracji (maksymalnie 50 ostatnich).

**Response:**
```json
{
  "versions": [
    {
      "tag": "2025-10-14_12-05-30-admin",
      "timestamp": "2025-10-14T12:05:30.123Z",
      "author": "admin",
      "files": ["unified_config.json"],
      "backups": ["unified_config__2025-10-14_12-05-30__updated-limits.json.bak"]
    },
    {
      "tag": "2025-10-14_11-30-15-admin",
      "timestamp": "2025-10-14T11:30:15.456Z",
      "author": "admin",
      "files": ["thresholds.config.json"],
      "backups": ["thresholds.config__2025-10-14_11-30-15__threshold-tuning.json.bak"]
    }
  ]
}
```

### `GET /api/config-version/:tag`

Zwraca szczegóły konkretnej wersji.

**Parametry:**
- `tag` - Tag wersji (URL-encoded)

**Response:**
```json
{
  "tag": "2025-10-14_12-05-30-admin",
  "timestamp": "2025-10-14T12:05:30.123Z",
  "author": "admin",
  "files": ["unified_config.json"],
  "backups": ["unified_config__2025-10-14_12-05-30__updated-limits.json.bak"]
}
```

**Błędy:**
- `404` - Wersja nie została znaleziona

### `POST /api/config-rollback/:tag`

Przywraca konfigurację do określonej wersji. Przed rollback system tworzy backup obecnego stanu.

**Parametry:**
- `tag` - Tag wersji do przywrócenia (URL-encoded)

**Response (success):**
```json
{
  "success": true,
  "restoredFiles": ["unified_config.json"]
}
```

**Błędy:**
- `404` - Wersja nie została znaleziona lub pliki backup nie istnieją
- `500` - Błąd podczas rollback

### Integracja z UI

W sekcji **Configuration** dostępny jest przycisk "Version History" w dolnej części lewego panelu nawigacyjnego. Modal pokazuje:

1. Listę wszystkich wersji z timestampem i autorem
2. Listę zmodyfikowanych plików dla każdej wersji
3. Przycisk "Rollback" przy każdej wersji
4. Dialog potwierdzenia przed wykonaniem rollback
5. Automatyczne odświeżenie strony po udanym rollback

**Format tagu wersji:** `YYYYMMDD_HHMMSS-username`

**Lokalizacja plików:**
- Historia: `TARGET_DIR/version_history.json`
- Backupy: `TARGET_DIR/{filename}__{timestamp}__{changeTag}.{ext}.bak`

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
