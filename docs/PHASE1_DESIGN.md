# Phase 1 — Financial Session Isolation & State Machine Architecture

| Campo | Valore |
| --- | --- |
| Versione documento | `1.1.0` — incorpora [PHASE1_REVIEW.md](PHASE1_REVIEW.md) |
| Aggiornamento | 19 ottobre 2026 |
| Stato | Design revisionato; implementazione da iniziare il 20 ottobre 2026 |
| Baseline osservata | Commit `98b2a0c`, package `0.3.0`; worktree con modifiche preesistenti |
| Schema previsto | `phase1-ledger-v2`, da implementare e migrare |
| Documento operativo | Questo file, incluso il prompt nella sezione 12 |

## 1. Obiettivo, scope e limiti

Phase 1 estende il percorso finanziario esistente di Bitcode con autorizzazione deterministica, ledger durevole, signer isolato dal processo agente e recovery senza duplicare pagamenti. L'approvazione riguarda sempre una proposta concreta; l'apertura di una sessione non autorizza da sola alcun trasferimento.

Lo scope comprende Bitcoin on-chain tramite PSBT e Lightning tramite LND, con adapter distinti e test end-to-end su regtest locale. Sono esclusi fondi reali, chiavi di produzione, nuovi rail, cambio automatico di asset/rail, RGB, integrazione QVAC e WDK. Il provider locale esistente resta utilizzabile per il percorso di proposta.

La piattaforma iniziale per la garanzia OS è Linux con systemd e isolamento verificato. Su piattaforme o runtime senza le protezioni richieste l'esecuzione protetta deve essere rifiutata. La normale automazione di coding mantiene il proprio comportamento; non acquisisce la certificazione finanziaria.

Il lavoro del 19 ottobre è limitato alla documentazione. Checklist e prompt seguenti descrivono il lavoro successivo e non sono evidenza di funzionalità implementate.

### Invarianti

1. Il modello può osservare dati minimizzati e proporre, mai approvare, firmare, inviare o modificare policy.
2. Nessun segreto di firma, credenziale LND, bearer token o payload firmato trasmissibile è accessibile al processo agente o restituito nei suoi risultati.
3. L'executor richiede sessione attiva, proposta immutabile, approvazione umana monouso e policy valida al momento dell'esecuzione.
4. Stato, prenotazioni, consumo dell'approvazione e audit vengono salvati atomicamente prima dell'effetto irreversibile.
5. Timeout e crash non dimostrano fallimento: un risultato ambiguo resta vincolato fino alla riconciliazione.
6. Nessun retry crea un nuovo pagamento o cambia rail dopo un risultato ambiguo.
7. Stato autorevole e credenziali restano fuori da workspace, checkpoint e `/undo`.
8. Nessuna dipendenza non verificata: inventario anche di binari, runtime, download e comportamento di rete.

## 2. Baseline e integrazione con Bitcode

| Componente attuale | Decisione per Phase 1 |
| --- | --- |
| `src/finance/agent.mjs`, ramo `--finance` in `src/cli.mjs` | Conservare catalogo con soli `finance_status` e `finance_prepare`, prompt nuovo, nessuna estensione, fallback o trascrizione |
| `bitcode finance policy/prepare/status/execute/reconcile/recover/unlock` | Evolvere questi comandi come client del confine protetto; nessun executor parallelo |
| `src/finance/store.mjs` | Migrare il JSON con lock/fsync a SQLite preservando operazioni, prenotazioni e audit |
| `src/finance/bitcoin.mjs` | Separare preparazione pubblica, autorizzazione, firma, broadcast e riconciliazione dietro il servizio |
| `src/bitcoin/wallet.mjs` | Riutilizzare primitive PSBT nel signer; preparazione e scansione protette usano descriptor/xpub watch-only, senza derivare chiavi private nell'agente |
| `src/lightning/lnd.mjs` | Estendere l'adapter REST con tracking dei pagamenti uscenti; non introdurre gRPC senza un bisogno verificato |
| `src/bitcoin/network.mjs` | Aggiungere supporto regtest esplicito, inclusa codifica indirizzi, chain identity e backend locali |
| Desktop e tool legacy | Nessun accesso diretto ai nuovi wallet protetti; eventuali client devono usare gli stessi gate del servizio |

`--finance` resta il flag canonico. Non viene introdotto il duplicato `--financial-session-mode`. Il comando umano `finance execute` può aprire una sessione di revisione: la presenza di un flag non costituisce autorizzazione.

Il tag `v0.1.0-phase0-signoff` citato nella versione precedente non è stato trovato localmente e non è un prerequisito verificato. All'avvio del lavoro registrare commit, stato del worktree e dipendenze effettive. Non creare un tag che simuli una revisione pregressa e non includere modifiche estranee al lavoro.

## 3. Threat model e isolamento

### Identità e confini

```text
Modello locale + agente confinato (identità OS agente)
    | socket proposal: stato minimizzato / preparazione
    v
Servizio finanziario (identità OS executor)
    | ledger SQLite + policy + approvazioni + adapter
    | chiavi Bitcoin / credenziali LND solo qui
    v
Bitcoin Core + indexer locale / LND regtest

Terminale umano attendibile (identità OS reviewer)
    | socket control: review / policy / approvazione / recovery
    +------------------> Servizio finanziario
```

Le identità agente, executor e reviewer sono distinte. Il processo agente e gli eventuali suoi subprocess non appartengono al gruppo del socket control. Il reviewer è attendibile; root, kernel compromesso e un processo arbitrario già in possesso dell'identità reviewer sono fuori dal threat model. Un processo agente non confinato non può essere presentato come protetto.

Nel percorso protetto non caricare plugin o MCP, non esporre shell, letture arbitrarie, RPC generico, tool legacy di firma/broadcast, delegazione o comandi `/plan`, `/build`, `/undo`. Le credenziali del wallet protetto non devono comparire in config, ambiente o file leggibili dalla normale automazione. I wallet legacy restano fuori dalle garanzie: nessuna importazione automatica di seed o fondi.

### Policy OS da implementare e provare

- Utenti/gruppi separati, directory segreti e ledger `0700`, file `0600`, nessuna ereditarietà di credenziali o file descriptor verso l'agente.
- Servizi e relativi eseguibili/configurazioni non modificabili dall'agente. Ambiente del processo agente costruito con allowlist, senza `BITCODE_MNEMONIC`, macaroons o credenziali di altri provider.
- systemd con `NoNewPrivileges=true`, `ProtectSystem=strict`, `PrivateTmp=true`, protezione della home e allowlist dei percorsi scrivibili/visibili; filtraggio syscall e restrizioni di process inspection coerenti con il runtime scelto.
- Applicare restrizioni anche al processo agente e al runtime di inferenza. Il solo hardening dell'executor non protegge copie di segreti altrove. `ProtectSystem` in sola lettura non sostituisce il diniego di lettura.
- Egress limitato ai backend regtest e all'inferenza verificata; nessun DNS/proxy/indexer pubblico o download automatico durante i test. Un URL loopback non prova inferenza locale se il server può inoltrare richieste altrove.
- Verificare all'avvio l'effettiva disponibilità dei confini richiesti. Nessun downgrade silenzioso a esecuzione non isolata.

Compaction, resume, export e salvataggio della conversazione restano disabilitati per `--finance` in Phase 1. L'eventuale riabilitazione richiede test dedicati. Sanitizzazione e risultati strutturati minimali sono difese aggiuntive, non la protezione primaria delle chiavi.

### IPC locale e autorizzazioni

Usare due Unix domain socket pathname in una directory runtime controllata dal servizio:

| Socket | Accesso filesystem | Operazioni |
| --- | --- | --- |
| `proposal.sock` | `0660`, executor + gruppo client agente dedicato | Stato redatto, preparazione; nessuna mutazione di policy o esecuzione |
| `control.sock` | `0660`, executor + gruppo reviewer dedicato | Sessione umana, review, policy, approvazione ed esecuzione, recovery |

Verificare permessi e appartenenze effettive; ogni directory del percorso deve permettere solo l'accesso previsto e impedire sostituzioni/symlink. `0600` sotto un altro UID impedirebbe l'accesso alla CLI: non usare quel modello senza un broker equivalente.

Per questo trasporto locale l'autorizzazione di base usa i confini OS e le capacità distinte dei due socket. Il precedente requisito cumulativo mTLS/HMAC viene sostituito da questo contratto: non aggiungere segreti condivisi al processo agente. Nessun listener TCP per il servizio finanziario. Un futuro trasporto remoto richiederà un design separato di autenticazione, provisioning, rotazione e revoca.

Protocollo versionato con messaggi JSON delimitati, limite 64 KiB per richiesta, schema rigido, deadline e request ID. Contenuti binari/preparazioni grandi restano nel servizio. Chiave di idempotenza con stessa richiesta restituisce lo stesso risultato; riuso con contenuto diverso produce `IDEMPOTENCY_CONFLICT`. L'autenticazione del client non equivale al consenso umano.

## 4. Sessioni, proposta e approvazione

Una sessione contiene ID, account, rail, rete, policy version, istante apertura/scadenza e stato `ACTIVE`, `FROZEN` o `CLOSED`. La durata iniziale è 15 minuti, accorciabile dalla policy, senza rinnovo automatico. La chiusura impedisce nuove esecuzioni ma non cancella operazioni pendenti o prenotazioni.

Introdurre comandi umani `finance session open|status|close` sul socket control. Il reviewer apre la sessione prima della preparazione e può fornire all'assistente il suo ID pubblico: quell'ID seleziona il contesto ma non autorizza un pagamento. Il socket proposal accetta preparazioni soltanto per una sessione attiva sul conto richiesto. `finance execute` può aprire la review di una proposta nella sua sessione ancora attiva; non può riassegnare una proposta a una nuova sessione per aggirarne la scadenza.

Una proposta comprende almeno:

- versione della serializzazione, proposal ID e digest canonico;
- sessione, account/wallet stabile, asset `BTC`, rail `bitcoin` o `lightning`, chain environment e identità backend verificata;
- destinatario risolto, importo atomico, fee massima, eventuale fee esatta, payload digest;
- per Bitcoin: PSBT, outpoint, output destinatario/resto e fee verificata;
- per Lightning: invoice completa nel servizio, payment hash, importo e scadenza validati;
- policy version, creazione/scadenza, versione dello stato e chiave di idempotenza.

Definire una serializzazione canonica testata, con interi serializzati senza perdita e ordinamento deterministico. Il digest vincola tutti i campi economici, il payload e la scadenza. Snapshot di saldo e risultati della riconciliazione sono evidenze separate, mai autorità fornita dal modello.

Il reviewer legge dal servizio una proposta preparata, inclusi account/rete/rail, destinatario, importo, fee massima, scadenza, policy version e digest. La CLI richiede terminale interattivo e digitazione dell'intero proposal ID. Il modello, `--yolo`, `--allow-payments`, un tool argument o il testo «Pay» non possono soddisfare questo gate.

L'approvazione è un record interno con proposal digest, sessione, reviewer, scadenza, nonce e stato di consumo; nessun bearer token passa al modello. La scadenza è il minimo tra sessione, proposta e invoice. L'executor ricontrolla orario corrente, policy, fondi, payload e stato immediatamente prima del consumo. Cambiare un campo vincolato richiede nuova proposta e nuova review.

Il signer verifica input, output, resto, fee e rete del PSBT effettivo. Per LND verifica invoice/hash/importo/fee limit effettivamente inviati. Nessuna fiducia esclusiva nella descrizione JSON. Non esporre un'API generica «firma questi byte».

## 5. Policy, asset e contabilità

Il ledger è applicativo, composto da operazioni e prenotazioni. Gli UTXO identificano risorse Bitcoin; non modellano un pagamento Lightning. Il conto on-chain e quello Lightning hanno liquidità distinta, anche quando appartengono allo stesso nodo. Nessuno spostamento automatico tra conti.

La policy è impostata dal reviewer, versionata e immutabile per versione. Richiede limiti espliciti di importo per pagamento, budget 24 ore, fee massima e riserva per account; nessun valore monetario mancante viene inventato dal modello. Per Phase 1 la riserva minima configurabile è 800 sats; il reviewer può imporre un valore maggiore. È una scelta di questa versione del design, non un valore ereditato dalla baseline.

Usare aritmetica intera esatta. Bitcoin usa sats; Lightning usa msat internamente, con `1 sat = 1000 msat` e conversioni controllate. Importi positivi; fee non negative. Le API JSON serializzano come stringhe decimali gli interi non rappresentabili esattamente.

```text
fee_max_sats = min(policy.maxFeeSats, floor(amount_sats / 20), 1000)
fee_max_msat = min(policy.maxFeeSats * 1000, floor(amount_msat / 20), 1000000)
```

Il 5% si riferisce all'importo inviato, esclusa la fee. Per Bitcoin si verifica la fee esatta del PSBT; per Lightning si prenota il massimo e si impone lo stesso limite in `SendPaymentV2`. Solo alla liquidazione si libera la differenza rispetto alla fee effettiva. Se il tetto risultante è zero, si accetta soltanto una fee effettivamente nulla, senza arrotondare in eccesso per far passare il pagamento.

### Budget e riserva

- Finestra mobile `(now - 24h, now]`, in UTC, distinta dal giorno calendario della versione attuale.
- Un pagamento concluso conta importo + fee effettiva con timestamp dell'intenzione di esecuzione persistita. Le operazioni ancora attive, incluso `UNKNOWN`, impegnano importo + fee massima senza scadenza automatica dopo 24 ore. Non contare due volte una stessa operazione.
- Prima di preparare e prima di eseguire, verificare budget 24 ore più prenotazioni. Politiche di conto e limite aggregato, se configurato, vengono controllati nella stessa transazione.
- Il saldo verificato deve rappresentare fondi spendibili: UTXO confermati secondo policy, liquidità Lightning in uscita al netto degli impegni del nodo. Non sommare saldo on-chain e canali.
- Sottrarre le prenotazioni non già riflesse nello snapshot backend. L'adapter deve attribuire per identificatore gli addebiti già osservati, evitando doppia sottrazione dopo broadcast. Se l'attribuzione è incerta, congelare il conto invece di stimare disponibilità.
- Riserva rispettata anche dopo importo e fee massima; outpoint Bitcoin prenotato in modo esclusivo. Preparazioni scadute mai inviate possono liberare risorse; esiti ignoti no.
- Riconciliare movimenti esterni sul conto dedicato. Entrate e conferme spiegabili aggiornano il saldo; addebiti non attribuiti richiedono riconciliazione/blocco, senza dichiarare automaticamente fallito un pagamento.
- Rilevare rollback dell'orologio persistendo il massimo timestamp osservato: congelare nuove esecuzioni su regressioni non spiegate; non rinnovare TTL o budget al riavvio.

Una modifica di policy invalida preparazioni e approvazioni non consumate. Non riscrive limiti storici, spesa o esiti dei pagamenti già partiti. Le operazioni pendenti restano riconciliabili e impegnano budget.

## 6. Stato durevole e transazioni

### Stati dell'operazione

```text
PREPARED --human review--> APPROVED --consume approval--> EXECUTING
    |                         |                             |
    +--> REJECTED / EXPIRED <--+                             +--> SUBMITTED (Bitcoin)
                                                            +--> IN_FLIGHT (LND)
                                                            +--> CONFIRMED
                                                            +--> FAILED / UNKNOWN

EXECUTING / SUBMITTED / IN_FLIGHT / UNKNOWN --reconciliation-->
    SUBMITTED / IN_FLIGHT / CONFIRMED / UNKNOWN
    FAILED, solo con prova definitiva
CONFIRMED --reorg o perdita della prova di settlement--> UNKNOWN + freeze
```

`PREPARED` prenota già fondi e budget durante la review, con TTL e numero di proposte attive limitati dalla policy. `APPROVED` contiene consenso non consumato; `EXECUTING` contiene l'intenzione durevole e il consenso consumato. `CONFIRMED` significa conferma on-chain sufficiente secondo policy oppure `SUCCEEDED` LND. `FAILED` significa fallimento definitivo dimostrato; `UNKNOWN` conserva il dubbio e la prenotazione. Un'operazione confermata può tornare sotto riconciliazione in caso di reorg: congelare il conto, senza reinvio.

Stato della sessione e stato dell'operazione sono separati: un pagamento può riuscire mentre la sessione è congelata. Tutte le transizioni richiedono stato/versione attesi e un evento audit nella stessa transazione; quelle non elencate sono rifiutate.

### Contratto dello schema `phase1-ledger-v2`

La migrazione implementerà DDL con foreign key, vincoli e indici corrispondenti a questo contratto. Il vecchio SQL incompleto non è una migrazione valida.

| Entità | Campi/vincoli minimi |
| --- | --- |
| `schema_migrations` | Versione univoca, checksum, data applicazione |
| `accounts` | ID stabile, asset, rail, chain identity, backend identity, stato del conto |
| `policies` | Versione immutabile, scope/account, limiti interi, TTL, regole conferma, digest, autore/data |
| `sessions` | ID, account/rail/rete, policy version, apertura/scadenza, stato e motivo blocco |
| `proposals` | ID/digest, session/account, economic fields canonici, payload digest/riferimento protetto, state/version, date, idempotency scope/key e request digest |
| `approvals` | Proposal digest e sessione, reviewer, nonce univoco, scadenza, consumption timestamp e tentativo associato |
| `reservations` | Proposal/account, importo + fee massima, stato attivo/convertito/rilasciato, motivo e date |
| `reserved_outpoints` | Account, txid/vout, proposal; un solo proprietario attivo per outpoint |
| `execution_attempts` | Proposal, ID tentativo, backend ID, txid/payment hash, digest richiesta, intenzione persistita, invio/esito, codice errore redatto |
| `ledger_entries` | Addebiti/fee effettivi o esterni riconciliati, account, backend event ID univoco, execution timestamp e settlement timestamp |
| `audit_events` | Sequenza, attore, evento, proposal/session/policy IDs, stato precedente/successivo, timestamp, digest dei dettagli minimali |

Importi e versioni hanno vincoli di tipo/range; gli stati sono enumerati e includono `REJECTED` ed `EXPIRED`. Unicità per richiesta idempotente, nonce e identità pagamento LND impedisce replay anche con chiavi di richiesta diverse. Per Bitcoin un pagamento intenzionalmente ripetuto richiede una nuova proposta e review; non basta uguaglianza destinatario/importo per deduplicare.

### Persistenza e concorrenza

- SQLite su filesystem locale: verificare `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`; timeout busy limitato e gestione esplicita degli errori.
- Writer unico nel servizio, transazioni `BEGIN IMMEDIATE`, compare-and-swap su versione/stato. I client non aprono direttamente il database.
- Preparazione: acquisire snapshot verificato, poi transazione di controllo policy/versione, budget e risorse, inserimento proposta/prenotazioni/audit. Ricontrollare disponibilità prima dell'esecuzione.
- Esecuzione: ricalcolare scadenze/policy/fondi, verificare payload, consumare approvazione e salvare `EXECUTING`, identificatore recuperabile e audit in una transazione. Solo dopo il commit può partire firma/invio.
- Nessuna transazione SQLite resta aperta durante I/O di rete. Il pagamento e il database non hanno un commit distribuito: l'intervallo viene gestito con intenzione durevole e recovery.
- Se il commit preventivo fallisce, non firmare/inviare. Se il salvataggio dell'esito fallisce dopo l'invio, bloccare nuove esecuzioni e riconciliare; non dichiarare «nessun fondo mosso».
- Directory ledger `0700`, database e sidecar WAL/SHM `0600`; backup coerente e restore solo in manutenzione, con riconciliazione obbligatoria prima della riapertura. L'audit non contiene segreti o payload firmati; non si dichiara resistente a root o all'alterazione da parte dell'executor compromesso.

### Migrazione del JSON attuale

Eseguire in manutenzione, senza writer legacy attivi, con backup protetto e migrazione idempotente. Mapping: `prepared -> PREPARED`, `executing -> UNKNOWN`, `submitted -> SUBMITTED`, `confirmed -> CONFIRMED`, `unknown -> UNKNOWN`, `rejected -> REJECTED`. Ricostruire impegni e importare audit/provenienza senza inventare approvazioni mancanti.

I record storici confermati contribuiscono al budget in modo conservativo quando manca un execution timestamp verificabile; documentare l'attribuzione e bloccare l'esecuzione se non è possibile ricostruire il limite. Le proposte non eseguite importate richiedono nuova preparazione/review sotto la nuova policy; non eseguirle automaticamente. Anche un record legacy `executing` senza txid richiede audit: l'assenza del campo non è da sola prova di mancato invio.

Una volta attivato il nuovo ledger, rifiutare scritture del vecchio percorso per gli account protetti. Nessun ritorno automatico a JSON; migrazioni non riconosciute o incomplete impediscono l'esecuzione.

## 7. Recovery e riconciliazione

All'avvio acquisire ownership esclusiva del servizio, verificare schema/policy/clock e riconciliare operazioni pendenti prima di accettare esecuzioni. Il conto interessato resta congelato finché manca un risultato attendibile.

| Punto di interruzione | Comportamento richiesto |
| --- | --- |
| Preparazione o approvazione, nessuna intenzione di invio | Nessuna esecuzione automatica; scadenza/nuova review, rilascio solo quando l'assenza di tentativi è provata |
| `EXECUTING`, invio possibile | Interrogare backend tramite identificatore persistito; mantenere impegno e impedire secondo invio |
| Bitcoin accettato ma senza conferme | `SUBMITTED`; monitorare txid, input/output e fee, senza creare un'altra transazione |
| LND in corso | `IN_FLIGHT`; seguire lo stesso payment hash, senza richiamare l'invio |
| Esito esterno riuscito, commit locale perso | Recuperare e verificare lo stesso txid/hash, poi registrare esito e audit |
| Risposta assente, `not found`, backend offline o dati incoerenti | `UNKNOWN`, conto congelato; mantenere prenotazioni e nessun retry |
| Fallimento definitivo verificato | `FAILED`, contabilizzare eventuali costi reali e rilasciare soltanto risorse certamente disponibili |
| Conferma Bitcoin persa/reorg | Congelare e riconciliare; non ricreare pagamento né disponibilità dal solo stato locale |

Per Bitcoin il servizio conserva il PSBT e, dopo firma, txid e payload firmato in storage protetto prima del broadcast; il payload non esce verso agente/log. Per LND il payment hash è ricavato dall'invoice e persistito prima di `SendPaymentV2`; usare `TrackPaymentV2` per i pagamenti uscenti. La chiave di idempotenza applicativa non è un identificatore riconosciuto automaticamente da LND.

Il recovery umano mostra evidenze e incongruenze, consente una riconciliazione e registra autore/motivo/esito. Non esiste un override «marca fallito e libera fondi» senza prova. Un freeze non cancella l'esito di pagamenti che nel frattempo si sono conclusi. Revoca/scadenza della sessione non impedisce lettura e riconciliazione delle operazioni già avviate.

## 8. Regtest, dipendenze e isolamento dello stato

### Harness riproducibile

Usare esclusivamente wallet/seed sintetici nuovi, Bitcoin Core regtest, indexer Esplora compatibile locale per Bitcoin e due nodi LND regtest con canale finanziato per Lightning. Verificare chain identity reale di tutti i backend, non soltanto URL o etichetta `regtest`. Nessun uso delle configurazioni personali o dei daemon di produzione.

L'harness prepara coinbase mature, fondi spendibili e canali, attende readiness/sync, genera invoice positive, esegue pagamenti e osserva il destinatario. I pagamenti devono avere valore positivo di monete regtest; mock e test a valore zero non soddisfano SC-07. Includere mining/conferme, error injection, riavvio dei processi e cleanup anche su failure.

Il workspace può contenere fixture pubbliche e script, non lo stato autorevole. Il root di test deve essere temporaneo esterno al progetto, con sottodirectory separate per home CLI, signer, ledger e nodi. Determinare il path tramite un parametro di harness esplicito e validato; nessun default verso `~/.bitcode` personale. Non usare `.test-state/phase1/` nel workspace come ledger. Aggiungere eventuali directory generate alla `.gitignore`, senza considerarla una barriera a checkpoint o letture.

### Scelta e inventario delle dipendenze

Preferire primitive Node esistenti, adapter REST LND e `node:sqlite` se disponibile e verificato nel runtime selezionato. Il package attuale dichiara Node `>=22.0.0`: non assumere che ogni versione soddisfi il nuovo requisito. Prima del primo codice fissare e registrare il minimo runtime protetto effettivamente testato, le API SQLite e la versione SQLite incorporata; rifiutare capability mancanti invece di usare uno store meno durevole. Un eventuale cambio del requisito globale deve essere esplicito e validato.

Registrare versioni esatte di Node/SQLite, Core, LND, indexer e sistema/servizi; licenze, provenienza/checksum dei binari, piattaforme, porte, download e comportamento di rete. Installare nuovi componenti solo quando il bisogno è documentato; modelli e binari già scaricati devono consentire esecuzione offline dell'harness. Non installare gRPC o un driver SQLite per abitudine se le interfacce scelte non lo richiedono.

La selezione concreta delle versioni è il primo deliverable dell'implementazione, non una compatibilità già provata da questo documento. Se una componente necessaria non è disponibile, riportare il gate incompleto; non sostituire il test reale con un mock dichiarandolo passato.

## 9. Matrice di verifica e criteri di accettazione

| ID | Scenario | Evidenza/risultato richiesto |
| --- | --- | --- |
| SC-01 | Esecuzione senza sessione/approvazione o con flag di automazione | Rifiuto deterministico sul servizio da CLI, API e qualsiasi client desktop presente; `--yolo`/`--allow-payments` non autorizzano; nessun accesso legacy ai wallet protetti |
| SC-02 | Riserva di 800 sats, fee, pending e concorrenza | Accettazione al confine esatto, rifiuto sotto soglia con `INSUFFICIENT_RESERVE`; nessun outpoint/budget impegnato due volte |
| SC-03 | Limiti fee percentuale/assoluto/policy | Casi sotto/uguale/sopra entrambi i tetti, arrotondamenti, msat e payload mutato; rifiuto prima dell'invio |
| SC-04 | IPC non autorizzato e replay | UID/gruppo agente non può aprire control o leggere credenziali; richieste malformate/ripetute non duplicano effetti; nonce consumato non riutilizzabile |
| SC-05 | Cambio policy, scadenza o tentativo di fallback | Nuova review per campi cambiati; nessun cambio rail; mancato invio soltanto se provabile, altrimenti `UNKNOWN` e freeze |
| SC-06 | Crash prima/dopo ogni commit, firma e invio | Riavvio e riconciliazione dello stesso identificatore; nessun doppio pagamento, consenso riusato o rilascio prematuro; due processi non eseguono la stessa proposta |
| SC-07 | Flusso positivo reale su Bitcoin e Lightning regtest | Review umana nel flusso, fondi ricevuti, tx confermata secondo policy / LND `SUCCEEDED`, fee reali e ledger coerenti; fixture di approvazione automatica solo nel harness, mai nel percorso installato |
| SC-08 | Segreti sintetici in ambiente/file/errori | Diniego OS di lettura dal processo agente; assenza in prompt, risultati, log, history, export e diagnostica; niente fallback cloud, resume o delegazione |
| SC-09 | Stato fuori workspace, `/undo` e isolamento rete | Checkpoint/undo non possono ripristinare budget/consenso/stato; nessuna modifica ai wallet personali o contatto con reti pubbliche |

Test aggiuntivi obbligatori: finestra rolling ai confini di 24 ore e mezzanotte, rollback clock, invoice scaduta/rete errata, input speso esternamente, saldo cambiato, reorg, errori disco/audit e `SQLITE_BUSY`, backup/restore, migrazione ripetuta/interrotta, avvio senza isolamento o backend disponibile.

I test unitari con adapter simulati non provano l'harness reale né il confine OS. Ogni scenario deve riportare comando, ambiente/versioni, risultato, evidenze redatte e motivi di eventuale blocco. Un test saltato o manuale non eseguito non è passato.

## 10. Checklist di implementazione, in ordine

- [ ] Registrare baseline effettiva e inventario versioni/runtime, verificando compatibilità SQLite, Core/LND/indexer e isolamento Linux.
- [ ] Definire policy di test esplicita, provisioning delle identità OS/socket e configurazioni separate dai dati personali.
- [ ] Preparare harness/stato esterno al workspace e supporto regtest esplicito con verifica chain identity.
- [ ] Implementare migrazioni SQLite, ledger transazionale, concorrenza, audit e importazione JSON con test di crash/restore.
- [ ] Implementare policy rolling, prenotazioni, digest canonico e proposta verificabile per ciascun rail.
- [ ] Implementare sessioni/review attendibile, approvazione monouso e verifica del payload nell'executor.
- [ ] Implementare signer protetto, preparazione watch-only, client IPC con capacità distinte e dinieghi OS; rimuovere i bypass verso account protetti.
- [ ] Collegare Bitcoin PSBT/broadcast e LND REST/send/tracking, recovery e gestione di freeze/reorg senza retry economico.
- [ ] Integrare CLI esistente senza regressioni del coding; verificare qualsiasi percorso desktop che esponga il nuovo servizio.
- [ ] Eseguire test mirati, controlli repository richiesti e SC-01–SC-09 per entrambi i rail, includendo evidenze OS e ricezione reale regtest.
- [ ] Aggiornare documentazione operativa, limiti residui e report finale, distinguendo test eseguiti da gate incompleti.
- [ ] Richiedere revisione umana dell'implementazione prima di Phase 2 o qualsiasi estensione verso fondi reali.

Nessun passaggio è completato dalla sola approvazione del design. La consegna Phase 1 richiede tutti i gate applicabili soddisfatti; un adapter simulato o un solo rail non completa lo scope.

## 11. Evidenza disponibile e fonti

Nella revisione del 19 ottobre: `tests/finance.test.mjs` 9/9 e `tests/cli.test.mjs` 12/12 passati. Le prove finanziarie usano adapter simulati; le prove CLI usano server locali. Non dimostrano SQLite, isolamento OS o trasferimenti regtest di questa Phase 1. I risultati vanno rieseguiti sulla nuova implementazione.

Fonti dei contratti tecnici:

- [SQLite WAL: concorrenza e durabilità](https://www.sqlite.org/wal.html).
- [systemd.exec: filesystem e isolamento](https://www.freedesktop.org/software/systemd/man/260/systemd.exec.html).
- [Unix socket: permessi pathname](https://man7.org/linux/man-pages/man7/unix.7.html).
- [LND SendPaymentV2: fee limit e lifecycle](https://lightning.engineering/api-docs/api/lnd/router/send-payment-v2/).
- [LND TrackPaymentV2: tracking per payment hash](https://lightning.engineering/api-docs/api/lnd/router/track-payment-v2/).

Le API devono essere confermate sulle versioni effettivamente selezionate. [PHASE1_REVIEW.md](PHASE1_REVIEW.md) conserva la revisione della versione `1.0.0`; questo documento la supera come piano operativo.

## 12. Prompt operativo per l'implementazione successiva

> Implementa Phase 1 seguendo `docs/PHASE1_DESIGN.md` versione `1.1.0`, partendo dal worktree effettivo e preservando le modifiche estranee. Non assumere l'esistenza del tag storico e non creare una seconda architettura parallela a `src/finance/`.
>
> Esegui la checklist della sezione 10 nell'ordine delle dipendenze. Il primo deliverable è l'inventario verificato di runtime, dipendenze, identità OS, rete e policy di test. Nessun fondo reale, seed personale, endpoint pubblico o daemon di produzione. Stato e segreti sintetici fuori dal workspace, senza stamparli in prompt, log o commit.
>
> Mantieni `--finance` come percorso di proposta locale con catalogo ristretto. L'esecuzione passa esclusivamente dal servizio isolato con review umana, policy corrente, approvazione vincolata e monouso, ledger atomico e recovery. Nessuna modalità automatica o chiamata diretta può aggirare i gate.
>
> Completa Bitcoin e Lightning regtest con adapter reali. Testa SC-01–SC-09 e i casi aggiuntivi della sezione 9, inclusi concorrenza, crash injection e dinieghi OS. Non riportare un mock, un test saltato o un risultato locale indiretto come prova di un pagamento o di una garanzia completa.
>
> Consegna diff, comandi e risultati riproducibili, evidenze redatte di invio/ricezione e riconciliazione, inventario dipendenze, migrazione/backup e limiti residui. Se manca un gate, dichiaralo incompleto senza ridurre lo scope. Prima di passare alla Phase 2 richiedi revisione umana del risultato concreto.
