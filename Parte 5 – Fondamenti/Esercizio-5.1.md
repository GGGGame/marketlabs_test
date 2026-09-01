## REQUEST:
 
# Esercizio 5.1 – Gestire più cose in parallelo
 
DocuMind deve processare molti documenti contemporaneamente. Rispondi a queste domande:
 
(a) Se hai 100 documenti in coda e un servizio che li processa, come organizzi il lavoro? Usa un solo processo che li fa uno alla volta? Più processi in parallelo? Un mix? Spiega il tuo approccio e perché.
 
(b) Cosa succede se per un errore due worker iniziano ad analizzare lo stesso documento nello stesso momento? Che problemi può causare e come li previeni?
 
(c) Scrivi lo pseudocodice di un "worker" che prende documenti da una coda e li processa. Deve gestire: il fatto che un messaggio potrebbe arrivargli due volte, e lo spegnimento pulito (finisce il lavoro in corso prima di chiudersi).
 
## ANSWER:
 
### (a) Organizzazione del lavoro
 
Uso un **mix**: più istanze del worker (scalabilità orizzontale) e, dentro ogni istanza, più chiamate AI concorrenti (perché il lavoro è I/O-bound, non CPU-bound, il worker passa quasi tutto il tempo ad aspettare la risposta del provider AI).
 
Nel mio `AnalysisService` (Esercizio 3.1) una singola `analyzeDocument` è già `async` e non blocca il processo mentre aspetta `aiClient.complete`. Questo significa che un solo processo Node.js può già gestire più documenti "in volo" contemporaneamente, sfruttando l'event loop. Non ha senso quindi un solo processo che processa un documento alla volta in modo sincrono: sprecherebbe la maggior parte del tempo in attesa.
 
Il design che userei con BullMQ (già scelto in 2.1):
 
- **Concorrenza per worker**: ogni istanza worker consuma dalla coda con un limite di concorrenza (es. `concurrency: 10`), così processa fino a 10 documenti in parallelo senza saturare memoria/CPU.
- **Più istanze**: 2–4 istanze del worker in produzione (scalabili orizzontalmente in base al volume, 500/giorno con picchi a 2.000 non richiede molto, ma il pattern regge anche a crescita futura).
- **Rate limiting verso il provider AI**: BullMQ supporta rate limiter a livello di coda; lo uso per non superare i limiti di richieste/minuto imposti da OpenAI/Anthropic, evitando `429` a raffica.
Perché non "un processo per documento" (tipo fork per ogni job): con 2.000 documenti/giorno il overhead di creare processi OS sarebbe eccessivo rispetto al beneficio; la concorrenza a livello di event loop + poche istanze orizzontali è più efficiente per un carico I/O-bound come questo.
 
### (b) Doppia analisi dello stesso documento
 
**Problemi che può causare:**
- Due `Analysis` create per lo stesso `(document_id, version)`, con conseguente confusione su quale sia quella "vera".
- Doppio costo verso il provider AI (chiamata pagata due volte per lo stesso lavoro).
- Race condition sullo stato del `Document`: entrambi i worker scrivono `state = in_progress` e poi `completed`/`error`, potenzialmente sovrascrivendosi a vicenda in ordine imprevedibile (l'ultimo che scrive "vince", anche se è l'esito sbagliato).
**Come lo prevengo:**
 
1. **Claim atomico del job**: quando un worker prende in carico un documento, esegue un update condizionale invece di un semplice `SELECT` seguito da `UPDATE`:
```sql
   UPDATE analyses
   SET state = 'in_progress', worker_id = $1, started_at = now()
   WHERE id = $2 AND state = 'in_queue'
   RETURNING id;
```
   Se `RETURNING` non restituisce righe, vuol dire che un altro worker ha già preso il job: il worker corrente lo scarta e passa oltre. Questo rende il "claim" atomico grazie alla riga bloccata dalla transazione, senza bisogno di lock espliciti applicativi.
 
2. **`SELECT ... FOR UPDATE SKIP LOCKED`** (alternativa/complemento, utile se si legge un batch di job candidati): permette a più worker di leggere dalla stessa tabella senza contendersi le stesse righe, saltando quelle già bloccate da un'altra transazione.
3. **Idempotency key sul job in coda**: il messaggio BullMQ per un'analisi ha come `jobId` l'`analysis_id` stesso. BullMQ rifiuta job duplicati con lo stesso `jobId` già presente in coda, quindi anche se per un bug il messaggio venisse pubblicato due volte, non finirebbe processato due volte in parallelo.
### (c) Pseudocodice del worker
 
```typescript
// Idempotenza: teniamo traccia (in DB o Redis) degli analysis_id già completati
// per scartare in sicurezza eventuali redelivery del messaggio.
 
let shuttingDown = false;
const inFlightJobs = new Set<string>();
 
async function startWorker(queue: Queue) {
  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
 
  queue.process(CONCURRENCY, async (job) => {
    const { analysisId, documentId } = job.data;
 
    if (shuttingDown) {
      // non accettiamo nuovo lavoro durante lo spegnimento
      throw new Error("Worker in fase di shutdown, job rimesso in coda");
    }
 
    inFlightJobs.add(job.id);
    try {
      // --- Idempotenza: il messaggio potrebbe arrivare più di una volta ---
      const analysis = await db.analyses.findById(analysisId);
 
      if (analysis.state === "completed" || analysis.state === "failed") {
        // già processato in precedenza (redelivery), non rifare il lavoro
        return;
      }
 
      // --- Claim atomico, vedi punto (b) ---
      const claimed = await db.analyses.claim(analysisId, { workerId: WORKER_ID });
      if (!claimed) {
        // un altro worker lo ha già preso in carico
        return;
      }
 
      const document = await db.documents.findById(documentId);
      const result = await analyzeDocument(document.textExtracted, aiClient);
 
      await db.analyses.markCompleted(analysisId, result.clauses);
      await db.documents.updateState(documentId, "completed");
    } catch (err) {
      await handleFailure(analysisId, documentId, err);
    } finally {
      inFlightJobs.delete(job.id);
    }
  });
}
 
async function gracefulShutdown() {
  shuttingDown = true;
 
  // smette di accettare nuovi job dalla coda
  await queue.pause();
 
  // aspetta che i job in corso finiscano, con un timeout di sicurezza
  const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
  while (inFlightJobs.size > 0 && Date.now() < deadline) {
    await sleep(200);
  }
 
  await queue.close();
  process.exit(0);
}
```
 
Punti chiave dello pseudocodice:
- **Redelivery del messaggio**: prima di fare qualsiasi lavoro, controlliamo lo stato reale in DB (`completed`/`failed`) e usciamo subito se il job è già stato gestito, questo rende `process()` idempotente indipendentemente da quante volte la coda ci ridà lo stesso messaggio.
- **Shutdown pulito**: alla `SIGTERM` (es. durante un deploy) il worker smette di accettare nuovi job (`queue.pause()`), ma aspetta che quelli già in corso (`inFlightJobs`) finiscano prima di uscire, con un timeout massimo per evitare di restare appesi indefinitamente.
