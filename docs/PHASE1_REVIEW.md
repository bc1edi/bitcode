# Analisi del piano Phase 1 per Bitcode

Questa revisione riguarda il piano `1.0.0`. Le correzioni sono state incorporate il 19 ottobre 2026 in [PHASE1_DESIGN.md](PHASE1_DESIGN.md) versione `1.1.0`, che è il riferimento per l'implementazione successiva. Le osservazioni sul testo originario restano qui come motivazione delle decisioni.

Data: 19 ottobre 2026. Piano esaminato: [PHASE1_DESIGN.md](PHASE1_DESIGN.md).
Base osservata: commit `98b2a0c`, package `0.3.0`, Node dichiarato `>=22.0.0`.
Il worktree contiene modifiche preesistenti, anche desktop/provider: questa analisi riguarda i file effettivamente presenti, non certifica uno snapshot di release.

## Valutazione

La direzione è valida: esecuzione separata dal modello, policy deterministica, approvazione umana, stato durevole e riconciliazione prima di ripetere operazioni ambigue. Il documento però non è ancora una specifica implementabile delle garanzie dichiarate. Va revisionato prima di usare il prompt operativo incluso.

Il problema principale è la distanza tra invarianti e meccanismi: una finestra di sessione non autorizza una transazione specifica; WAL non definisce prenotazioni e consumo del budget; sandboxare il signer non impedisce al processo agente di leggere le copie preesistenti delle chiavi.

Questa è una revisione del piano, non l'esecuzione del suo prompt. Non sono stati modificati runtime, policy o wallet, né avviati pagamenti o daemon finanziari.

## Base attuale e riuso

Il piano non parte da zero. Esiste già un percorso finanziario circoscritto:

| Area | Evidenza attuale | Implicazione per Phase 1 |
| --- | --- | --- |
| Assistente finanziario | `src/cli.mjs:310–320`, `src/finance/agent.mjs`: `--finance`, prompt nuovo, endpoint modello loopback, due tool di stato/preparazione, nessun fallback e nessuna trascrizione salvata da questo percorso | Preservare queste restrizioni prima di estendere l'interazione |
| Revisione umana | `src/cli.mjs:419–437`: comando separato `finance execute`, terminale interattivo e digitazione dell'intero proposal ID | Riutilizzare il flusso, spostando la verifica di autorizzazione nel confine protetto |
| Proposte e limiti | `src/finance/bitcoin.mjs:38–115`, `src/finance/store.mjs:96–111`: hash della proposta, scadenza, policy versionata, input prenotati, limiti e stato prima del broadcast | Definire una migrazione, evitando un secondo ledger indipendente |
| Persistenza | `src/finance/store.mjs:24–81`: JSON atomico con fsync e lock esclusivo, fuori dal workspace | SQLite sostituirebbe un meccanismo esistente; servono importazione e gestione delle operazioni pendenti |
| Riconciliazione | `src/finance/bitcoin.mjs:119–144`: txid, verifica del destinatario/importo/fee e recupero manuale | Non equivale a recovery automatico LND o a isolamento OS |
| Reti finanziarie protette | `src/finance/bitcoin.mjs:6–12`: signet/testnet/testnet4, Esplora HTTP locale | Il percorso attuale non accetta regtest |
| Lightning | `src/lightning/lnd.mjs`: adapter REST con invio e lookup invoice; nessun tracking degli outgoing payment | gRPC e tracking sono lavoro aggiuntivo, da motivare e stimare |

`docs/reference.md:119–123` esplicita già i limiti del percorso: nessun signer isolato OS e nessuna proposta Lightning. L'audit `ARCHITECTURE.md` resta utile per gli invarianti, ma descrive una baseline storica diversa dal codice attuale.

Il tag richiesto `v0.1.0-phase0-signoff` non risulta tra i tag locali. Questo non prova che sia assente dal remoto. Il flag proposto `--financial-session-mode` non esiste nel parser attuale, che espone `--finance`. Il piano deve scegliere se estendere quel percorso o introdurre una modalità distinta, e descrivere compatibilità e migrazione. La dicitura `Approved / Active` nel documento non costituisce evidenza di un'approvazione esterna.

## Correzioni bloccanti

### 1. Completare il confine di sicurezza

Il piano protegge il servizio signer, ma non specifica come togliere all'agente l'accesso ai segreti attuali. `src/bitcoin/wallet.mjs:40–55` carica il mnemonic da ambiente/file e deriva chiavi private; anche la scansione UTXO usa quel percorso. Il signer isolato dovrà possedere le sole copie operative delle credenziali, mentre preparazione e lettura del saldo dovranno usare dati pubblici/watch-only.

Definire esplicitamente:

- identità OS e permessi di agente, signer e interfaccia umana;
- percorsi, ambiente, ereditarietà dei file descriptor e credenziali LND accessibili a ciascun processo;
- esclusione dei percorsi legacy di firma, RPC arbitrario, broadcast, plugin, MCP e subprocess quando si dichiara la garanzia protetta;
- endpoint di inferenza ammessi e restrizioni di rete; un endpoint loopback, da solo, potrebbe essere un proxy verso un servizio remoto;
- trattamento di history, resume, compaction, export, log ed errori prima della prima inferenza.

SC-08 verifica soltanto un sanitizer: non dimostra che shell, plugin o letture di file non possano recuperare i segreti. Servono prove di diniego di accesso dal processo agente, con segreti sintetici.

Le direttive elencate non bastano a sostenere tutta la garanzia: `ProtectSystem=strict` rende il filesystem in sola lettura, senza renderlo inaccessibile. Servono anche un progetto dei permessi e dei percorsi visibili. Documentare inoltre le directory scrivibili per SQLite e la disponibilità effettiva delle restrizioni sul sistema supportato. [Documentazione systemd](https://www.freedesktop.org/software/systemd/man/260/systemd.exec.html).

### 2. Legare l'approvazione alla proposta esatta

Una finestra temporale approvata abilita una sessione; non prova il consenso a ogni pagamento che arriva al socket. Il documento non definisce come venga raccolta un'approvazione attendibile e come il signer la distingua da un messaggio generato dal modello.

L'approvazione deve riferirsi a un digest canonico con almeno wallet/account, destinatario o invoice, importo, asset, rete, rail, fee massima, scadenza e versione della policy. Deve essere consumata una volta sola e invalidata se cambiano i dati vincolanti. Il signer deve verificare anche il payload effettivo, non fidarsi soltanto della descrizione della proposta.

Per Bitcoin questo richiede verifica di input, output, resto e fee del PSBT. Per Lightning richiede invoice validata, payment hash, importo, scadenza e fee massima, senza ricostruire una finta fase di firma PSBT.

### 3. Rendere il ledger transazionale, non soltanto il salvataggio dello stato

Le due tabelle proposte non rappresentano sessioni, policy versionate, approvazioni, prenotazioni o tentativi di esecuzione. Mancano anche il digest del payload e gli identificatori backend necessari al recovery. `idempotency_key UNIQUE` evita righe duplicate con la stessa chiave, ma non definisce il comportamento delle richieste ripetute né impedisce di creare due operazioni economiche equivalenti con chiavi diverse.

Specificare una transazione che controlli policy e budget correnti, prenoti fondi/budget, consumi l'approvazione e registri l'evento prima dell'effetto irreversibile. Definire transizioni ammesse, controlli concorrenziali, rilascio delle prenotazioni e trattamento degli errori di scrittura. Non tenere aperta la transazione SQLite durante la chiamata di rete: persistere prima l'intenzione di esecuzione e poi riconciliare il risultato esterno.

WAL resta una scelta ragionevole, ma non rende atomico il pagamento insieme al database. Vanno fissati driver/versioni compatibili con il runtime minimo, migrazioni, foreign key, durabilità, gestione di `SQLITE_BUSY`, backup e permessi di database/WAL/SHM. SQLite documenta un solo writer alla volta e una diversa durabilità al power loss tra `synchronous=NORMAL` e `FULL`. [Documentazione SQLite WAL](https://www.sqlite.org/wal.html).

Correzione immediata: il diagramma contiene `REJECTED`, ma il vincolo SQL non lo ammette. Mancano inoltre vincoli sugli importi positivi e sulle fee non negative. `signature_proof` opzionale non specifica né una prova di consenso umano né la resistenza dell'audit alle alterazioni.

### 4. Separare stato dell'operazione e blocco della sessione

`FAILED`, `UNKNOWN` e sessione congelata hanno significati diversi. Un timeout dopo l'invio non prova il fallimento. SC-05 non può imporre sempre `FAILED` se l'effetto esterno potrebbe essere già avvenuto.

Per ogni punto di crash definire l'evidenza persistita, la query backend, lo stato risultante e la sorte della prenotazione:

- prima dell'invio, quando la mancata esecuzione è dimostrabile;
- durante la chiamata, con esito ancora in corso o sconosciuto;
- dopo il successo esterno ma prima dell'aggiornamento locale;
- durante registrazione audit, riconciliazione e riavvio concorrente.

Persistire il payment hash/txid, o i dati per ricavarlo, prima della possibile perdita della risposta. Per i pagamenti Lightning uscenti, specificare il tracking per payment hash: l'API LND `TrackPaymentV2` espone proprio quel flusso di aggiornamenti. Una chiave applicativa non viene automaticamente riconosciuta da LND. [Documentazione LND](https://lightning.engineering/api-docs/api/lnd/router/track-payment-v2/).

Un override umano non deve trasformare un pagamento sconosciuto in fondi nuovamente spendibili senza evidenza. Definire una procedura di riconciliazione e sblocco con audit, senza reinvio automatico. La scansione all'avvio deve completarsi prima di accettare nuove esecuzioni.

## Altre decisioni necessarie

| Punto del piano | Problema | Correzione proposta |
| --- | --- | --- |
| Socket `0600` del nuovo utente isolato | Il normale processo CLI, con un altro UID, non avrebbe accesso al socket su Linux | Definire ACL/gruppo controllato o un broker e verificare le identità dei peer. Rendere il socket utilizzabile non deve dare accesso ai segreti. [unix(7)](https://man7.org/linux/man-pages/man7/unix.7.html) |
| mTLS + HMAC + fingerprint | Non sono definiti provisioning, distribuzione, rotazione, revoca, framing o protezione dai replay | Precisare quali minacce copra ogni meccanismo. L'autenticazione del client resta separata dall'approvazione del pagamento |
| Ledger UTXO per Bitcoin e Lightning | Il lifecycle dei pagamenti Lightning non coincide con il coin selection on-chain | Ledger applicativo di operazioni/prenotazioni con adapter specifici; UTXO solo dove pertinenti |
| LND come unico backend | Non copre automaticamente il PSBT del wallet Bitcode attuale | Scegliere esplicitamente lo scope dei rail e preservare il percorso Bitcoin con una migrazione documentata |
| Riserva di 800 sats | Non sono specificati account, saldo confermato/spendibile o liquidità in uscita | Policy esplicita per account/asset; sottrarre fee e prenotazioni. Giustificare 800 come valore scelto, senza attribuirlo alla baseline |
| Budget giornaliero | Manca il valore del limite; «24 ore rolling» cambia la finestra UTC a giorno calendario attuale | Parametro obbligatorio, timestamp di addebito definito, fee incluse e regole per pending/unknown. Testare cambio giorno, 24 ore e variazioni dell'orologio |
| Fee 5% / 1.000 sats | Denominatore, arrotondamento e precisione non sono esplicitati | Definire, per esempio, `fee_max_sats = min(floor(amount_sats / 20), 1000)` se il riferimento è l'importo inviato; distinguere limite approvato e costo effettivo. Per Lightning disciplinare i millisatoshi |
| Qualsiasi variazione del saldo congela la sessione | Entrate, conferme, canali e azioni esterne autorizzate possono cambiare il saldo | Riconciliare eventi identificati e definire quali discrepanze richiedano davvero un blocco |
| `.test-state/phase1/` | Il percorso nel workspace è rifiutato dal finance store attuale; `.gitignore` non lo sottrae ai checkpoint | Separare fixture da stato autorevole e mantenere quest'ultimo fuori dal workspace. `src/checkpoint.mjs:8–23` esclude solo `.git` e `node_modules` dalla scansione |
| Solo regtest | Richiede supporto esplicito e harness nuovi; non basta una directory o un endpoint localhost | Fissare versioni, identità chain, configurazione node/indexer, canali, funding, blocchi, readiness e cleanup |
| Zero-value/regtest | Un test senza valore non dimostra il trasferimento completo; `amountSats=0` è rifiutato dal percorso attuale | Test end-to-end con importi positivi di monete regtest e conferma osservata dal destinatario |
| Dipendenze «zero non verificate» | LND gRPC, SQLite e runtime nativi non hanno una scelta concreta | Inventario di versioni, licenze, binari, download e piattaforme; riusare REST se soddisfa il contratto prima di aggiungere un altro client |

## Copertura della matrice SC-01–SC-09

Gli scenari sono una base, non ancora una dimostrazione completa degli invarianti.

| Scenario | Completamento necessario |
| --- | --- |
| SC-01 | Stabilire se il rifiuto senza flag valga per il solo executor protetto o per ogni percorso Bitcode; includere CLI, API dirette, desktop e strumenti legacy nel perimetro dichiarato |
| SC-02 | Confine esatto di 800, fee incluse, saldo non spendibile, prenotazioni e due richieste concorrenti |
| SC-03 | Entrambi i tetti, uguaglianza, arrotondamenti, precisione e variazione della fee dopo la review |
| SC-04 | UID non autorizzato, credenziale revocata, replay e tentativo di accesso diretto a wallet/LND |
| SC-05 | Policy cambiata prima/dopo approvazione e durante l'esecuzione; nessun fallback di rail; esito ambiguo conservato |
| SC-06 | Crash injection prima/dopo ogni commit e invio; nessun pagamento duplicato o budget liberato prematuramente |
| SC-07 | Pagamento positivo su regtest, risultato backend e ricezione verificata, non solo successione degli stati locali |
| SC-08 | Segreti sintetici in file/ambiente/errori e verifica di prompt, tool result, log, history, export, fallback e delegazione; diniego OS effettivo |
| SC-09 | Stato separato dal workspace, test `/undo`, nessuna risurrezione di autorizzazioni/budget e nessun contatto con reti pubbliche |

Aggiungere test di approvazione scaduta o riusata, doppia esecuzione tra processi, invoice scaduta/rete errata, errori disco/audit, budget rolling, migrazione dello store e avvio senza sandbox. Il servizio deve rifiutare l'esecuzione se una protezione richiesta non è disponibile.

## Ordine di lavoro proposto

1. Revisionare il contratto: scope Bitcoin/Lightning, baseline verificabile, threat model, policy, semantica degli stati e piattaforme supportate. Correggere il Markdown e rendere coerenti i nomi degli artefatti: il prompt richiama `PHASE1_DESIGN_DOCUMENT.md`, mentre il file attuale incorpora entrambi gli artefatti con fence annidate.
2. Definire l'integrazione con `src/finance/`, la migrazione dello store e un unico proprietario dell'esecuzione. Separare stato di test e workspace.
3. Specificare approvazioni vincolate, prenotazioni atomiche, idempotenza e recovery. Implementare e verificare questi contratti senza fondi reali.
4. Realizzare il confine OS completo, includendo accesso del client e rimozione dei segreti dal processo agente; provare i dinieghi.
5. Collegare gli adapter dello scope approvato e completare l'harness regtest con crash injection e ricezione verificata.
6. Registrare risultati, dipendenze effettive e limiti residui. La revisione umana richiesta prima della Phase 2 resta un gate della futura implementazione, non un'autorizzazione da chiedere per questa analisi.

## Verifica svolta

- Letti integralmente il piano e i moduli `src/finance/`, confrontati con CLI, wallet, adapter LND, checkpoint e documentazione attuale.
- Eseguito `/usr/bin/node tests/finance.test.mjs`: **9 test passati su 9**. Sono test con wallet/API simulati, non gli scenari SC-01–SC-09 né pagamenti LND reali.
- Eseguito `/usr/bin/node tests/cli.test.mjs`: **12 test passati su 12**, incluso il catalogo ristretto di `--finance` e l'assenza di trascrizioni salvate. La prima esecuzione nella sandbox falliva all'apertura dei socket locali con `EPERM`; la riesecuzione autorizzata fuori sandbox ha completato la suite.
- Controllate le fonti primarie citate per WAL, tracking LND, permessi socket e significato delle direttive systemd.
- Nessuna implementazione delle checklist del piano è implicata da questi risultati. Il documento richiede una revisione dei contratti prima del via all'implementazione.
