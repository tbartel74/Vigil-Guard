# Hardware Sizing — Profile skalowania (Dell PowerEdge)

Last updated: 2026-08-24

Podstawa wyliczeń: `docs/ARCHITECTURE.md` (Resource Usage: 5–10 rdzeni / 10–20 GB RAM,
latencja pipeline 2–4 s), `docs/CLICKHOUSE_RETENTION.md` (10–20 GB/rok @ 5k promptów/dzień),
`docs/operations/installation.md` (~30 GB na modele i cache).

**Wszystkie modele działają na CPU** (`prompt-guard-api/app.py`: `device=-1`,
semantic-service: multilingual-e5-small-int8, 384-dim). **GPU nie jest wymagane
w żadnym profilu.** Kluczowe dla wydajności: wysoki takt bazowy, AVX-512/AVX2, NVMe.

---

## Podsumowanie profili

| Profil | Obciążenie | Model Dell | CPU | RAM | Dyski danych | Sieć | HA |
|---|---|---|---|---|---|---|---|
| **P1 – Pilot / Small** | ≤ 5 tys. promptów/dobę, ≤ 2 równoległe | PowerEdge **R360** (1U) | 1× Xeon E-2488, 8C/16T, 3.2 GHz | 64 GB DDR5 ECC | 2× 1.92 TB SSD RAID1 | 2× 1 GbE | brak |
| **P2 – Standard / Departmental** | 25–75 tys./dobę, 8–10 rps peak | PowerEdge **R660** (1U) | 1× Xeon Gold 6526Y, 16C/32T, 2.8 GHz | 128 GB DDR5 ECC | 4× 1.92 TB NVMe RAID10 | 2× 25 GbE | N+1 (cold spare) |
| **P3 – Enterprise / HA** | 250–500 tys./dobę, 25–50 rps | 3× **R6615** + 2× **R7615** | 3× EPYC 9354P 32C + 2× EPYC 9454P 48C | 3× 192 GB + 2× 384 GB | app 2× 1.92 TB RAID1; DB 8× 3.84 TB RAID10 | 2× 25 GbE / węzeł | pełne (klaster) |

---

## P1 — Pilot / Small (PoC, jeden zespół)

**Dell PowerEdge R360, 1U, 8× 2.5"**

| Element | Konfiguracja |
|---|---|
| CPU | 1× Intel Xeon E-2488 (8C/16T, 3.2 GHz base / 5.2 turbo, 95 W) |
| RAM | 64 GB — 4× 16 GB DDR5-4400 UDIMM ECC |
| Boot | BOSS-N1, 2× 960 GB NVMe M.2, RAID1 |
| Dane | 2× 1.92 TB SSD SATA Mixed Use (RAID1, ~1.9 TB użytkowe) |
| RAID | PERC H355 |
| Sieć | 2× 1 GbE BCM5720 onboard |
| Zasilanie | 2× 700 W Hot-Plug redundantne |
| Zarządzanie | iDRAC9 Enterprise |
| Wsparcie | ProSupport NBD 3 lata |

Alokacja: 8 vCPU / 64 GB pokrywa cały stack docker-compose (n8n, heuristics,
semantic, prompt-guard, presidio, language-detector, ClickHouse, Grafana, web-ui, Caddy)
z zapasem ~2× na peaki. Dysk: ~30 GB modele + ~20 GB ClickHouse/rok + rezerwa.

---

## P2 — Standard / Departmental (produkcja, jedna organizacja)

**Dell PowerEdge R660, 1U, 10× 2.5" NVMe**

| Element | Konfiguracja |
|---|---|
| CPU | 1× Intel Xeon Gold 6526Y (16C/32T, 2.8 GHz base / 3.5 all-core, 195 W) |
| RAM | 128 GB — 8× 16 GB DDR5-5600 RDIMM (8 kanałów obsadzonych) |
| Boot | BOSS-N1, 2× 960 GB NVMe M.2, RAID1 |
| Dane | 4× 1.92 TB NVMe U.2 Mixed Use (RAID10, ~3.8 TB użytkowe) |
| RAID | PERC H965i (NVMe RAID) |
| Sieć | 2× 25 GbE SFP28 (Broadcom 57414) + 2× 1 GbE OCP |
| Zasilanie | 2× 1100 W Titanium redundantne |
| Zarządzanie | iDRAC9 Datacenter |
| Wsparcie | ProSupport Plus 4h Mission Critical, 3 lata |

Alokacja: 2 repliki prompt-guard-api (po 4 vCPU), 2 repliki semantic-service,
2 workery n8n, ClickHouse 4 vCPU / 16 GB. Zapas pod wzrost do ~100 tys./dobę
przez dołożenie drugiego procesora (socket wolny) i RAM do 256 GB.

**Wariant N+1:** drugi identyczny R660 jako węzeł zapasowy + replikacja ClickHouse.

---

## P3 — Enterprise / HA (multi-tenant, SLA)

Rozdzielenie warstwy detekcji od warstwy danych. Minimum 5 serwerów.

### Węzły aplikacyjne / detekcji — 3× Dell PowerEdge R6615 (1U)

| Element | Konfiguracja (na węzeł) |
|---|---|
| CPU | 1× AMD EPYC 9354P (32C/64T, 3.25 GHz base / 3.8 boost, 280 W) |
| RAM | 192 GB — 12× 16 GB DDR5-4800 RDIMM (wszystkie 12 kanałów) |
| Boot | BOSS-N1, 2× 960 GB NVMe M.2, RAID1 |
| Dane | 2× 1.92 TB NVMe U.2 Read Intensive (RAID1) — modele, cache, logi lokalne |
| Sieć | 2× 25 GbE SFP28 (LACP) + 1 GbE OOB |
| Zasilanie | 2× 1400 W Titanium |
| Zarządzanie | iDRAC9 Datacenter |

### Węzły ClickHouse — 2× Dell PowerEdge R7615 (2U, 24× NVMe)

| Element | Konfiguracja (na węzeł) |
|---|---|
| CPU | 1× AMD EPYC 9454P (48C/96T, 2.75 GHz, 290 W) |
| RAM | 384 GB — 12× 32 GB DDR5-4800 RDIMM |
| Boot | BOSS-N1, 2× 960 GB NVMe M.2, RAID1 |
| Dane | 8× 3.84 TB NVMe U.2 Mixed Use (RAID10, ~15 TB użytkowe) |
| Sieć | 2× 25 GbE SFP28 (LACP) |
| Zasilanie | 2× 1800 W Titanium |
| Wsparcie | ProSupport Plus 4h Mission Critical, 5 lat |

Konfiguracja: ClickHouse 2 shardy × 2 repliki (lub 1 shard × 2 repliki + Keeper
na węzłach aplikacyjnych). 15 TB pokrywa ~500 tys. promptów/dobę przy TTL 90/365 dni
z ~3× zapasem.

### Sieć

- 2× Dell PowerSwitch **S5248F-ON** (48× 25 GbE SFP28, 4× 100 GbE) w VLT
- 1× Dell PowerSwitch **N3208PX-ON** dla iDRAC/OOB

---

## Uwagi wspólne

- **Bez GPU** — dodanie akceleratora nie przyspieszy pipeline'u bez zmian w kodzie
  (`device=-1` wymusza CPU w prompt-guard-api).
- **Wszystkie dyski danych ≥ 1.92 TB**; nośniki boot BOSS-N1 (960 GB M.2) to
  największa opcja Dell dla tego kontrolera i nie przechowują danych aplikacji.
- **Endurance:** dla ClickHouse wymagane dyski Mixed Use (≥ 3 DWPD) — logi zdarzeń
  generują stały zapis; Read Intensive tylko dla wolumenów modeli.
- **Wirtualizacja:** profile P1/P2 działają też jako VM o identycznych parametrach
  (8 vCPU/64 GB, 16 vCPU/128 GB) — wymagane przekazanie AVX2/AVX-512 do gościa.
- **Backup:** wolumeny `vigil_data`, `clickhouse-data`, `grafana-data` + katalog
  modeli `../vigil-llm-models/`.
