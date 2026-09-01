## REQUEST:

# Esercizio 1.1: Scomporre il sistema in aree

DocuMind fa molte cose diverse: gestisce upload di file, chiama un’AI, salva risultati, mostra dashboard.
Non ha senso mettere tutto insieme in un unico blocco.
Prova a dividere il sistema in 3–5 “aree” (o moduli) che abbiano responsabilità chiare e separate. Per ogni area:

* **Dagli un nome e spiega di cosa si occupa**
* **Elenca i dati principali che gestisce** (es. “qui vivono i documenti e i loro metadati”)
* **Descrivi come comunica con le altre aree** (es. “quando finisce l’analisi, manda un messaggio all’area notifiche”)

## ANSWER:

#### Data Ingestion
* **Di cosa si occupa:** Riceve i documenti caricati dagli utenti o sincronizzati da storage cloud (Google Drive/Dropbox) validando formato e dimensione, estrae il testo in formato raw e salva un backup del file originale
* **Dati principali:** File binari, metadati del documento, testo in formato raw estratto precedentemente
* **Comunicazione:** Una volta completati upload ed estrazione dei dati, mette i dati in queue (utilizzando rabbitMQ/BullMQ/Redis)

#### AI Service
* **Di cosa si occupa:** consuma i dati messi in coda dal *Data Ingestion*, costruisce il prompt, chiama il modello AI, valida e trasforma la risposta secondo la struttura richiesta. Gestisce retry, tiemout ed errori del provider AI
* **Dati Principali:** stato, retry, provider/modello usato, raw response dall'AI, clausole etratte
* **Comunicazione:** legge da *Data Ingestion* tramite queue, scrive le response nell'area storage quando l'analisi è completa o fallita, pubblica degli event analysis.completed-analysis.failed che vengono ascoltate dalla dashboard

#### Data storage
* **Di cosa si occupa:** è la source of truth per i documenti, analisi e clausole. Gestisce il versionamento delle analisi sullo stesso documento (ri-analisi con modelli/prompt diversi) e offre query per confronti storici
* **Dati Principali:** Tables, Clausole, tutto con relazioni al versionamento
* **Comunicazione:** non inizia nessuna comunicazione, viene tutto scritto dall'AI Service e letto dalla dashboard/API, nessuna logica di business, soltanto query e validazioni.

#### Dashboard & Alerting
* **Di cosa si occupa:** mostra all'utente lo stato delle analisi ed i dati in tempo reale, genera alert quando emergono errori o warning.
* **Dati Principali:** views aggregate/denormalizzate per la UI, grafici utilizzando shadcn/ui e Recharts, alert per i tenant, log di notifiche inviate
* **Comunicazione:** listener per gli eventi da AI Service (via websocket per il real-time o polling sullo storage), invia notifiche ed email

#### API Gateway
* **Di cosa si occupa:** espone le API HTTP pubbliche, gestisce autenticazione, autorizzazione e isolamento multi-tenant, rate limiting e validazione dati
* **Dati Principali:** users, tenant, permessi, token/sessioni, API Keys
* **Comunicazione:** è il principale punto d'ingresso delle richieste esterne, instrada le richieste alle altre aree