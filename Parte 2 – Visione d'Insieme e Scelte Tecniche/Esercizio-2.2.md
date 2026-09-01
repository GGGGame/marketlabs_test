## REQUEST:

# Esercizio 2.2 – Una scelta da motivare: Opzione A vs B

Il tuo team deve decidere come collegare DocuMind ai modelli AI (OpenAI, Anthropic, ecc.). Ci sono due
opzioni:

**Opzione A – Chiamata diretta:** ogni parte del sistema che ha bisogno dell’AI chiama direttamente le API
del provider.

**Opzione B – Gateway centralizzato:** costruisci un servizio intermedio che fa da “ponte” verso i provider AI
e gestisce tutto in un punto: scelta del modello, retry, tracking dei costi, cambio provider.

Quale scegli? Spiega il perché considerando: costi, complessità di sviluppo, cosa succede se vuoi
cambiare provider in futuro, e facilità di debug quando qualcosa non funziona.

## ANSWER:

**Scelgo l'Opzione B — Gateway centralizzato.**
 
### Motivazione
 
**Costi:** un gateway centralizzato permette di tracciare i costi per tenant/richiesta in un punto solo, cosa impossibile da fare in modo affidabile se ogni servizio chiama direttamente OpenAI/Anthropic con la propria API key. Con 500-2.000 documenti/giorno, i costi AI diventano rapidamente una voce da monitorare da vicino, e serve un unico punto per farlo.
 
**Complessità di sviluppo:** nel breve termine l'Opzione A è più veloce da implementare (nessun servizio intermedio da costruire). Ma con più aree che useranno l'AI nel tempo (es. AI Service oggi, ma domani magari un servizio di summary o di Q&A sui contratti), duplicare retry logic, gestione errori e parsing risposte in ogni punto del sistema è più complesso a lungo termine di mantenerne uno solo.
 
**Cambio provider:** con l'Opzione B, cambiare da OpenAI ad Anthropic (o usarli entrambi con fallback) richiede una modifica in un solo posto. Con l'Opzione A, ogni servizio che chiama l'AI direttamente andrebbe modificato singolarmente, con rischio di dimenticarne qualcuno o di introdurre comportamenti diversi tra servizi.
 
**Debug:** con un gateway centralizzato, tutte le chiamate AI passano da un unico log/tracing point — se qualcosa non funziona (timeout, risposta malformata), è più facile isolare il problema. Con chiamate dirette sparse nel sistema, il debug richiede controllare più servizi.
 
**Contro da considerare:** il gateway centralizzato introduce un punto singolo di fallimento (se cade, tutta l'AI del sistema si ferma) e un hop di rete in più (piccola latenza aggiuntiva). Va quindi progettato con alta disponibilità (più istanze, circuit breaker verso i provider) — ma dato che DocuMind è già pensato per background processing (l'utente non aspetta la risposta AI in sincrono), questa latenza aggiuntiva è trascurabile rispetto ai benefici di controllo centralizzato.