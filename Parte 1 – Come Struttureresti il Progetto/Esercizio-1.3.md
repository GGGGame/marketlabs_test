## REQUEST:

# Esercizio 1.3 – Glossario

In un progetto software, dare nomi chiari e condivisi alle cose è fondamentale. Immagina di dover scrivere
un piccolo glossario per il team di DocuMind.

Scrivi almeno 8 termini chiave del progetto con una definizione breve e precisa. Includi almeno un caso in
cui lo stesso termine potrebbe avere significati diversi in parti diverse del sistema (es. “documento”
potrebbe significare cose diverse per chi gestisce l’upload e per chi gestisce l’analisi).

## ANSWER:
 
| Termine | Definizione |
|---|---|
| **Document** | Vedi nota sotto: ha due significati diversi a seconda del contesto. |
| **Analysis** | Un singolo tentativo (con esito) di far processare un Document dal modello AI; un Document può avere più Analysis nel tempo. |
| **Clause** | Un segmento di testo estratto da un documento legale, classificato per tipo e livello di rischio. |
| **Tenant** | Un'azienda cliente che usa DocuMind; confine di isolamento dei dati nel sistema multi-tenant. |
| **Risk level** | Etichetta (basso/medio/alto) assegnata a una clausola in base a quanto è critica per chi legge il contratto. |
| **Analysis job** | L'unità di lavoro messa in coda per essere processata da un worker; corrisponde 1:1 a un'Analysis in stato `in_queue`/`in_progress`. |
| **Alert** | Notifica generata automaticamente quando viene rilevata una clausola ad alto rischio o un'analisi bloccata/fallita. |
| **Prompt version** | Identificativo della versione del prompt usato per un'Analysis, utile per confrontare risultati tra versioni diverse del prompt nel tempo. |
 
### Ambiguità del termine "Documento"
 
- **Per l'area Data Ingestion**, "documento" significa il **file raw caricato** (PDF/Word) più i suoi metadati tecnici (dimensione, mime_type, sorgente) — non gli interessa il contenuto legale.
- **Per l'area AI Service**, "documento" significa il **testo estratto** che va dato in pasto al modello AI — non gli interessa più il file binario originale, solo il contenuto testuale.
Questa distinzione va esplicitata nel team, perché un bug tipico è che qualcuno assuma che "documento" includa sempre il file binario, quando invece dopo la Data Ingestion il resto del sistema lavora solo con testo.