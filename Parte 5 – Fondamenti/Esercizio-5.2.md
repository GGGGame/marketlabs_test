# Esercizio 5.2 – Progettare il database
 
Progetta lo schema del database per salvare i risultati delle analisi. In particolare:
 
(a) Useresti un database relazionale (SQL tipo PostgreSQL) o un database documentale (tipo MongoDB)? Perché? Considera come verranno cercati i dati in pratica.
 
(b) Definisci le tabelle/collezioni principali: Documento, Analisi, Clausola. Per ciascuna indica i campi, i tipi, e le relazioni tra loro.
 
(c) Lo stesso documento può essere ri-analizzato più volte (con modelli AI diversi o prompt aggiornati). Come gestisci questo storico?
 
## ANSWER:
 
### (a) Relazionale (PostgreSQL) vs documentale
 
Confermo la scelta già fatta in Esercizio 2.1: **PostgreSQL**.
 
Il motivo principale è **come verranno interrogati i dati in pratica**: la dashboard deve rispondere a query come "tutte le clausole ad alto rischio per il tenant X", "confronta l'ultima analisi con quella precedente sullo stesso documento", "quanti documenti sono in stato `error` nelle ultime 24h". Queste sono query relazionali per natura: filtri incrociati su più entità collegate (`Document` → `Analysis` → `Clause`), aggregazioni, join. Un database documentale renderebbe questi pattern più scomodi (o richiederebbe denormalizzazione manuale che poi va tenuta sincronizzata).
 
Inoltre:
- **Consistenza forte sullo stato**: lo stato di un `Document`/`Analysis` deve essere affidabile (vedi il claim atomico del punto 5.1b), le transazioni ACID di PostgreSQL sono la base di quella garanzia.
- **Multi-tenant con Row-Level Security**: PostgreSQL supporta RLS nativamente, un buon meccanismo per garantire isolamento tra tenant a livello di database, non solo applicativo.
- **Schema abbastanza stabile**: i campi di `Document`/`Analysis`/`Clause` non cambiano forma da un record all'altro (a differenza di, ad esempio, dati veramente eterogenei dove un documento avrebbe senso).
L'unico dato "semi-strutturato" è la risposta raw dell'AI in caso di errore (utile per debug, vedi 1.2), per quello uso una colonna `jsonb`, che PostgreSQL gestisce bene senza dover rinunciare al modello relazionale per il resto.
 
### (b) Tabelle principali
 
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
 
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  dimension_bytes INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('uploaded', 'google_drive', 'dropbox')),
  storage_path TEXT NOT NULL,        -- posizione nell'Object Storage (S3/R2)
  text_extracted TEXT,
  state TEXT NOT NULL CHECK (state IN ('uploaded', 'in_progress', 'completed', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
 
CREATE INDEX idx_documents_tenant ON documents(tenant_id);
CREATE INDEX idx_documents_tenant_state ON documents(tenant_id, state);
 
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  version INTEGER NOT NULL,          -- 1, 2, 3... incrementale per ri-analisi
  ai_model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('in_queue', 'in_progress', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  detailed_error TEXT,
  raw_response JSONB,                -- risposta grezza AI, per debug/riprocessamento
  worker_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 
  UNIQUE (document_id, version)
);
 
CREATE INDEX idx_analyses_document ON analyses(document_id);
CREATE INDEX idx_analyses_state ON analyses(state);
 
CREATE TABLE clauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analyses(id),
  type TEXT NOT NULL CHECK (type IN ('penalty', 'automatic_renewal', 'confidentiality', 'other')),
  extracted_text TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  text_offset INTEGER,               -- posizione nel testo originale, utile per evidenziare in UI
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
 
CREATE INDEX idx_clauses_analysis ON clauses(analysis_id);
CREATE INDEX idx_clauses_risk ON clauses(risk_level);
```
 
**Relazioni:**
- `documents.tenant_id → tenants.id` (many-to-one): isolamento multi-tenant.
- `analyses.document_id → documents.id` (many-to-one): un documento può avere più analisi nel tempo.
- `clauses.analysis_id → analyses.id` (many-to-one): le clausole appartengono a una singola analisi specifica, non al documento in generale, questo è ciò che rende possibile confrontare due versioni senza mischiare i risultati.
Nota sugli indici: `idx_documents_tenant_state` e `idx_analyses_state` sono pensati esplicitamente per le query più frequenti della dashboard ("documenti in errore per questo tenant", "analisi ancora in coda") e per gli alert automatici (Esercizio 4.2).
 
### (c) Storico delle ri-analisi
 
Lo storico è gestito così:
 
1. **Mai sovrascrivere**: ogni ri-analisi crea una nuova riga in `analyses` con `version` incrementale, invece di aggiornare la riga esistente. Il vincolo `UNIQUE (document_id, version)` impedisce duplicati accidentali.
2. **`Document.state` riflette solo l'ultima analisi rilevante**: quando una nuova `Analysis` va a `completed`, aggiorniamo `documents.state = 'completed'`, ma le `Analysis` precedenti restano intatte con il loro stato originale, non vengono toccate.
3. **Confronto tra versioni**: per la dashboard, una query tipo
```sql
   SELECT a.version, a.ai_model, a.prompt_version, c.type, c.risk_level, count(*)
   FROM analyses a
   JOIN clauses c ON c.analysis_id = a.id
   WHERE a.document_id = $1
   GROUP BY a.version, a.ai_model, a.prompt_version, c.type, c.risk_level
   ORDER BY a.version;
```
   permette di vedere come sono cambiate le clausole rilevate tra un modello/prompt e l'altro, senza bisogno di una tabella "diff" dedicata, la differenza si calcola a runtime dalle righe storiche.
4. **"Analisi corrente"**: la definisco come la `Analysis` con `state = 'completed'` e `version` massima per quel `document_id`. Non serve un flag `is_current` ridondante: basta una query con `ORDER BY version DESC LIMIT 1`, che evita il rischio di un flag non sincronizzato.
 