## Esercizio 3.2 – Progettare le API

### `POST /v1/documents`
Carica un documento e avvia l'analisi.

**Request:** `multipart/form-data`
```
file: <binary>
```

**Response 202 Accepted**
```json
{
  "documentId": "doc_8f3a2b",
  "state": "uploaded",
  "createdAt": "2026-09-01T10:00:00Z"
}
```

**Errori:** `400` (file mancante/formato non supportato), `413` (oltre 50MB), `401`/`403` (auth/tenant)

---

### `GET /v1/documents/:documentId/analysis`
Controlla lo stato dell'analisi in corso.

**Response 200**
```json
{
  "documentId": "doc_8f3a2b",
  "analysisId": "an_1a2b3c",
  "state": "in_progress",
  "attempts": 1,
  "startedAt": "2026-09-01T10:00:05Z"
}
```

**Errori:** `404` (documento non trovato o non appartenente al tenant)

---

### `GET /v1/documents/:documentId/clauses`
Recupera i risultati, con filtro e paginazione.

**Query params:** `?riskLevel=high&type=penalty&page=1&pageSize=20`

**Response 200**
```json
{
  "data": [
    {
      "clauseId": "cl_9f8e7d",
      "type": "penalty",
      "extractedText": "Penale di 500€ in caso di ritardo",
      "riskLevel": "high"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 4 }
}
```

**Errori:** `404` (documento inesistente), `422` (parametri filtro non validi)

---

### Template di analisi

`POST /v1/templates` crea un template
```json
{ "name": "Contratto fornitura standard", "promptOverride": "..." }
```

`PATCH /v1/templates/:templateId` modifica un template

`DELETE /v1/templates/:templateId` elimina un template

**Response 201 (create)**
```json
{ "templateId": "tpl_4d5e6f", "name": "Contratto fornitura standard" }
```

**Errori comuni a tutti e tre:** `400` (payload non valido), `404` (template inesistente), `409` (nome duplicato su create)