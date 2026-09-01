## REQUEST:

# Esercizio 1.2 – Modellare i dati del cuore del sistema
Concentrati sulla parte centrale: quella che prende un documento, lo manda all’AI e salva i risultati.
Progetta la struttura dati per gestire questo flusso.

In particolare ci interessa vedere:

- Quali “oggetti” servono (es. Documento, Analisi, Clausola…) e che campi hanno
- Come un documento passa attraverso i vari stati: da “appena caricato” a “in analisi” a “completato” (o
“errore”)
- Come gestisci il caso in cui l’AI fallisce a metà analisi (timeout, errore, risposta incomprensibile)

## ANSWER

### Oggetti principali
 
```
Document
- id
- tenant_id
- file_name
- dimension_bytes
- mime_type
- source (uploaded | google_drive | dropbox)
- text_extracted
- state (uploaded | in_progress | completed | error)
- created_at
 
Analysis
- id
- document_id
- version
- ai_model
- prompt_version
- state (in_queue | in_progress | completed | failed)
- attempts
- detailed_error (nullable)
- started_at
- completed_at
 
Clause
- id
- analysis_id
- type (penalty | automatic_renewal | confidentiality | ...)
- extracted_text
- risk_level (low | medium | high)
- offset
```
 
### Ciclo di vita del documento (stati)
 
```
UPLOADED ──► IN_PROGRESS ──► COMPLETED
                 │
                 └────────► ERROR
```
 
- **UPLOADED**: file ricevuto, testo estratto, in attesa che un worker prenda in carico l'analisi.
- **IN_PROGRESS**: un worker sta chiamando l'AI; qui vive anche il contatore `tentativi`.
- **COMPLETED**: almeno un'Analisi collegata è `completata`.
- **ERROR**: tutti i tentativi di analisi sono falliti (dopo i retry).
Nota: **Document** e **Analysis** hanno stati separati di proposito. Un documento può avere più Analisi nel tempo (ri-analisi con modello diverso): lo stato del Documento riflette l'ultima analisi rilevante, ma lo storico resta intatto.
 
### Gestione del fallimento a metà analisi
 
Se l'AI fallisce (timeout, errore HTTP, risposta incomprensibile):
 
1. L'Analisi passa a `fallita` con `errore_dettaglio` popolato (tipo di errore + eventuale risposta raw salvata per debug).
2. Se `tentativi < soglia_massima` (es. 3), si pianifica un retry con backoff crescente, l'Analisi torna a `in_coda`.
3. Se si supera la soglia, l'Analisi resta `fallita` definitivamente e il Documento passa a `errore`, con un alert generato verso l'area Dashboard.
4. La risposta parziale o malformata dell'AI **non viene mai scartata silenziosamente**: viene salvata raw per poter fare debug o riprocessarla in futuro senza richiamare l'AI (risparmio di costi).