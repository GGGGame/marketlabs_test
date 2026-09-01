## REQUEST:

# Esercizio 2.1 – Disegna l'architettura

Disegna (o descrivi) l’architettura complessiva di DocuMind. Il sistema deve supportare:
- Upload di documenti fino a 50 MB
- L’analisi AI richiede 5–30 secondi per documento (non puoi far aspettare l’utente)
- Una dashboard che mostra lo stato delle analisi in tempo reale
- Volume: circa 500 documenti al giorno, con picchi fino a 2.000
- Più aziende-cliente usano lo stesso sistema (multi-tenant)

Per ogni componente del tuo disegno, spiega brevemente: cosa fa, quale tecnologia useresti (linguaggio,
database, servizio cloud…), e perché quella scelta.

## ANSWER:

### Requisiti da soddisfare
 
- Upload fino a 50 MB
- Analisi AI: 5–30 secondi per documento (no attesa sincrona per l'utente)
- Dashboard con stato in tempo reale
- Volume: ~500 documenti/giorno, picchi fino a 2.000
- Multi-tenant (più aziende sullo stesso sistema)
### Schema a blocchi
 
```
[Client Web/Mobile]
        │
        ▼
  [API Gateway] ──── auth, rate limit, isolamento tenant
        │
        ├──► [Data Ingestion] ──► [Object Storage: S3/R2]
        │           │                  (file originali)
        │           ▼
        │     [Queue: SQS/BullMQ+Redis]
        │           │
        │           ▼
        │     [AI Service (worker pool)] ──► [Provider AI: OpenAI/Anthropic]
        │           │
        │           ▼
        │     [Data storage: PostgreSQL]
        │           │
        │           ▼
        └──► [Dashboard & Alerting] ◄── WebSocket/SSE per real-time
```
 
### Componenti, tecnologia e motivazione
 
**API Gateway**
- Tecnologia: Node.js/TypeScript con Fastify
- Perché: basso overhead, buon supporto a validazione schema-based (utile per validare input multi-tenant), coerente con uno stack già production-ready per API ad alto throughput
**Data Ingestion**
- Tecnologia: servizio Node.js dedicato, upload diretto a Object Storage tramite presigned URL
- Perché: il presigned URL evita di far transitare i 50MB di file dal proprio backend, riducendo carico e latenza; l'estrazione testo (es. con `pdf-parse` o Textract) avviene come step asincrono dopo l'upload
**Queue**
- Tecnologia: Redis + BullMQ
- Perché: disaccoppia Ingestion da AI Service, l'analisi richiede 5-30s, quindi va gestita in background; la coda assorbe anche i picchi (2.000 documenti/giorno) senza sovraccaricare i worker
**AI Service**
- Tecnologia: worker pool Node.js, scalabile orizzontalmente (più istanze che consumano dalla stessa coda)
- Perché: essendo I/O-bound (attesa risposta AI), più istanze leggere sono più efficienti di poche istanze pesanti; la scalabilità orizzontale assorbe i picchi di volume
**Data storage**
- Tecnologia: PostgreSQL
- Perché: i dati sono fortemente relazionali (Document → Analysis → Clause) e serve consistenza forte sullo stato delle analisi; il multi-tenant si gestisce con `tenant_id` su ogni tabella + row-level security
**Dashboard & Alerting**
- Tecnologia: frontend con WebSocket (o SSE) per aggiornamenti in tempo reale, alimentato da eventi pubblicati da AI Service
- Perché: il polling continuo sprecherebbe risorse con 2.000 documenti/giorno; un canale push aggiorna la UI solo quando cambia davvero qualcosa
**Cache (aggiuntivo)**
- Tecnologia: Redis (già presente per la coda)
- Perché: per la dashboard multi-tenant, cache delle viste aggregate più richieste riduce il carico su PostgreSQL nei picchi
