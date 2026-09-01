## REQUEST:
 
# Esercizio 5.3 – Domande rapide
 
Rispondi brevemente (2–4 frasi per ognuna):
 
(a) Cos'è un sistema "eventualmente consistente"? In quale parte di DocuMind accetteresti che i dati non siano aggiornati istantaneamente?
 
(b) Che differenza c'è tra autenticazione ("chi sei?") e autorizzazione ("cosa puoi fare?")? Come le gestiresti in DocuMind, sapendo che più aziende usano lo stesso sistema?
 
(c) Cos'è un circuit breaker? Perché è importante in un sistema che dipende da API esterne come quelle dei modelli AI?
 
## ANSWER:
 
### (a) Eventual consistency
 
Un sistema "eventualmente consistente" garantisce che, se non arrivano nuovi scritture, prima o poi (non subito) tutti i lettori vedranno lo stesso dato aggiornato, a differenza della consistenza forte, dove ogni lettura riflette immediatamente l'ultima scrittura. In DocuMind accetterei questo compromesso per le **viste aggregate della dashboard** (es. contatori tipo "documenti analizzati oggi", cache Redis delle viste denormalizzate menzionata in 2.1): un ritardo di qualche secondo nell'aggiornamento di un contatore non ha impatto pratico, mentre pretendere consistenza forte lì aumenterebbe inutilmente il carico su PostgreSQL nei picchi. Non lo accetterei invece sullo stato di una singola `Analysis` (es. il claim del job in 5.1b), dove serve consistenza forte per evitare doppia elaborazione.
 
### (b) Autenticazione vs autorizzazione
 
L'autenticazione verifica **chi sta facendo la richiesta** (es. "questo token JWT appartiene davvero all'utente Mario di Acme Corp"), l'autorizzazione verifica **cosa quell'utente può fare** una volta identificato (es. "Mario può leggere le clausole ma non eliminare un template"). In DocuMind, all'API Gateway (Esercizio 1.1) gestirei l'autenticazione con JWT/sessioni contenenti `tenant_id` e `user_id`, e l'autorizzazione con un controllo a due livelli: **isolamento tenant** (ogni query filtra sempre per `tenant_id`, rinforzato da Row-Level Security su PostgreSQL come già indicato in 5.2a) e **ruoli** all'interno del tenant stesso (es. `admin` può gestire i template, `viewer` può solo consultare i risultati).
 
### (c) Circuit breaker
 
Un circuit breaker è un meccanismo che monitora i fallimenti verso un servizio esterno e, superata una soglia, "apre il circuito" smettendo temporaneamente di inviargli richieste, restituendo subito un errore controllato invece di continuare a provare (e ad aspettare timeout) su un servizio che sappiamo già essere in difficoltà. È importante per DocuMind perché l'AI Service dipende da provider esterni (OpenAI/Anthropic, o il gateway centralizzato scelto in 2.2): se il provider ha un disservizio, senza circuit breaker ogni worker continuerebbe a intasarsi con richieste destinate a fallire/andare in timeout, ritardando anche il retry di documenti che magari sarebbero processabili appena il provider torna disponibile. Con il circuit breaker aperto, i job possono invece essere rimessi in coda più rapidamente e riprovati quando il circuito torna a chiudersi (dopo un periodo di raffreddamento in cui vengono fatte richieste di test).