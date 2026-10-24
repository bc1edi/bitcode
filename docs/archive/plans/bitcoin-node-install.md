# Piano: installare e gestire un full node Bitcoin da CLI e desktop

> **Stato:** Bozza da approvare
> **Data:** 2026-10-16
> **Fasi:** 1 Bitcoin Core verificato · 1b Esplora · 2 Mutinynet (sperimentale)
> **Principio:** nessun binario eseguito senza verifica; nessun `curl | sh`; sudo mai richiesto.

---

## 0. Decisioni prese

| Tema | Decisione |
|---|---|
| Reti | mainnet completo, mainnet pruned, signet, testnet4 (fase 1); Mutinynet (fase 2) |
| Implementazione | Bitcoin Core ufficiale, binari Guix da bitcoincore.org |
| Verifica | chiavi dei builder Guix fissate nel repo, soglia di firme valide, verifica in JS (niente gpg di sistema) |
| Indicizzatore | Esplora = Blockstream/electrs compilato da commit fissato; lightmode su mainnet, indice completo sulle reti di test |
| Esecuzione | servizio utente systemd, senza sudo |
| Dati | cartella scelta all'installazione, default `~/.bitcoin`; controllo dello spazio libero |
| Mutinynet | fase 2, segnato in UI come «non verificato da Guix» |

Oggi `commands/btc/node-install.md` e `commands/ln/node-install.md` sono istruzioni per il modello: i passi li improvvisa l'LLM. Questo piano sostituisce il primo con codice deterministico; il comando Markdown resta come rimando a `bitcode node install`.

---

## 1. Fonti ufficiali (verificate il 2026-10-16)

| Cosa | Fonte | Note |
|---|---|---|
| Elenco release | https://bitcoincore.org/en/releases/ | ultima stabile **31.1**; 32.0 prevista per il 2026-10-10, non ancora pubblicata |
| Binari e firme | `https://bitcoincore.org/bin/bitcoin-core-<v>/` | `bitcoin-<v>-x86_64-linux-gnu.tar.gz`, `aarch64-…`, `SHA256SUMS`, `SHA256SUMS.asc` |
| Chiavi builder | https://github.com/bitcoin-core/guix.sigs/tree/main/builder-keys | 40 file `.gpg` |
| Procedura di riferimento | `contrib/verify-binaries/verify.py` in bitcoin/bitcoin | firma prima, hash dopo; soglia di firme valide |
| Esplora | https://github.com/Blockstream/electrs, branch `new-index` | nessun binario; tag fermi a v0.4.1; HEAD al 2026-10-16: `16b61e13d8d05bfb2ccfde0923ddb33106520d25` |
| Mutinynet | https://github.com/BlockSpaces/mutiny-net | fork di bitcoind (blocchi da 30 s, soft fork extra), da compilare |

**Controllo fatto su 31.1:** `SHA256SUMS.asc` contiene 11 firme; con le chiavi di guix.sigs **10 sono valide** (achow101, benthecarman, fanquake, guggero, hebasto, marcofleon, pinheadmz, sedited, Sjors, willcl-ark) e **1 è fatta con chiave scaduta** (Emzy). L'installatore deve contare solo le firme valide con chiave non scaduta e non revocata, e non trattare la scaduta come errore fatale.

**Versioni bloccate:** 30.0 e 30.1 (bug nella migrazione dei wallet che può cancellare file nella cartella wallet). La lista vive in `src/node/releases.json` insieme alla versione minima supportata.

---

## 2. Verifica dei binari

1. Scarica `SHA256SUMS` e `SHA256SUMS.asc` (HTTPS, nessun mirror), poi l'archivio per `os/arch`.
2. Verifica le firme di `SHA256SUMS.asc` su `SHA256SUMS` con le chiavi fissate in `src/node/builder-keys/` (copiate da guix.sigs a un commit indicato in `builder-keys/SOURCE`, con le impronte in `fingerprints.json`).
3. Conta le firme valide di chiavi distinte, non scadute e non revocate. **Soglia di default 3**, configurabile verso l'alto, mai sotto 2. Sotto la soglia → stop.
4. Solo dopo: SHA256 dell'archivio confrontato con la riga corrispondente di `SHA256SUMS`. Diverso → stop, file cancellato.
5. Estrazione in una cartella temporanea, controllo che contenga solo i percorsi attesi (`bin/bitcoind`, `bin/bitcoin-cli`, …), poi spostamento atomico in `~/.bitcode/bin/bitcoin-core-<v>/`.
6. Le chiavi si aggiornano solo con una release di bitcode (diff revisionabile), mai scaricandole a runtime.

**Libreria PGP (da decidere prima dell'implementazione):**
- `openpgp` (OpenPGP.js): matura e completa, ma licenza **LGPL-3.0-or-later**, quindi va valutata accanto alla licenza MIT di bitcode. Usata come dipendenza npm non modificata.
- In alternativa, una verifica minima di firme v4 (RSA PKCS#1 v1.5 + Ed25519) scritta su `@noble/*`: niente LGPL, ma è codice di sicurezza scritto da noi e richiede vettori di test.
- **Raccomandazione:** OpenPGP.js con versione esatta e controllo di integrità del lockfile.

---

## 3. Reti, porte e spazio

| Rete | RPC | P2P | Esplora HTTP | Spazio indicativo bitcoind | Esplora |
|---|---|---|---|---|---|
| mainnet completo | 8332 | 8333 | 3100 | ~750 GB e in crescita | lightmode, centinaia di GB |
| mainnet pruned | 8332 | 8333 | — | `prune` default 10 GB + chainstate ~12 GB | non disponibile (Esplora richiede i blocchi completi) |
| signet | 38332 | 38333 | 3103 | decine di GB | indice completo |
| testnet4 | 48332 | 48333 | 3104 | decine di GB | indice completo (supporto testnet4 in Blockstream/electrs da verificare) |

- Le porte Esplora usano l'intervallo 3100+ perché 3001 e 3002 sono occupate dai nodi RGB locali.
- Mainnet completo e mainnet pruned sono esclusivi tra loro sulla stessa cartella; reti diverse possono girare insieme.
- Prima dell'installazione: spazio libero sulla cartella scelta ≥ stima della rete + 10 % di margine; altrimenti stop con il numero mancante. Le stime vengono da `releases.json` e si aggiornano a ogni release di bitcode.
- In fase di test: misurare `size_on_disk` reale di signet e testnet4 e aggiornare la tabella.

---

## 4. Installazione, configurazione ed esecuzione

**Struttura**
```
~/.bitcode/bin/bitcoin-core-31.1/          binari verificati (sola lettura dopo l'installazione)
~/.bitcode/bin/bitcoin-core -> bitcoin-core-31.1   link aggiornato solo a verifica riuscita
<datadir>/bitcoin.conf                      generato, con sezione per rete
~/.config/systemd/user/bitcode-bitcoind-<rete>.service
~/.bitcode/node.json                        reti installate, datadir, versione, stato
```

**`bitcoin.conf` generato:** `server=1`, autenticazione cookie (nessuna password in chiaro), `rpcbind=127.0.0.1`, `rpcallowip=127.0.0.1`, `prune=` per la variante pruned, `dbcache` proporzionato alla RAM (max 4 GB). Se il file esiste già, bitcode non lo sovrascrive: mostra le differenze e chiede.

**systemd utente:** `Type=simple`, `ExecStart=…/bitcoind -conf=… -datadir=… -<rete>`, `Restart=on-failure`, `TimeoutStopSec=600` (lo shutdown di bitcoind scrive su disco), `Nice=10`. Per farlo partire anche senza login: `loginctl enable-linger $USER`, proposto ma non obbligatorio (su alcune distribuzioni richiede l'autorizzazione di polkit).

**Configurazione di bitcode:** dopo il primo avvio, `bitcoin.rpc` in `~/.bitcode/config.json` punta al `cookieFile` corretto e alla porta della rete. Gli strumenti `bitcoin_rpc` e chain lo usano senza altri passaggi.

**Aggiornamento:** controlla l'elenco ufficiale delle release, ripete download e verifica, ferma il servizio, sposta il link, riavvia. La versione precedente resta su disco fino al successivo aggiornamento riuscito (rollback con `bitcode node rollback`).

**Disinstallazione:** rimuove servizio e binari; la cartella dati si cancella solo con conferma esplicita e digitando il nome della rete.

---

## 5. Interfacce

**CLI**
```
bitcode node install  --network <mainnet|mainnet-pruned|signet|testnet4> [--datadir DIR] [--min-sigs N]
bitcode node status   [--network …] [--json]      versione, servizio, blocchi, % IBD, peer, spazio
bitcode node start|stop|restart --network …
bitcode node update   [--network …]
bitcode node rollback --network …
bitcode node uninstall --network … [--delete-data]
bitcode esplora install|status|start|stop|uninstall --network …   (fase 1b)
```
Ogni passo stampa cosa sta facendo; la verifica stampa le firme valide per nome del builder. `--json` per gli script. Nessuna installazione in modalità one-shot senza `--yes`.

**Desktop:** sezione «Nodo» nella tab Bitcoin dell'area finanziaria.
- Elenco reti con stato (non installato, installazione, sincronizzazione %, attivo, fermo, errore).
- Installazione: scelta di rete e cartella, stima dello spazio, avanzamento di download e verifica con l'elenco delle firme, poi avanzamento della sincronizzazione.
- L'installazione gira nel **controller**, non nel worker in sandbox, ed è un metodo *human-only* con approvazione dedicata (`kind: 'install'`), come `session.deleteMany`.
- Quando Esplora è attivo su una rete di test, il desktop lo registra come Esplora locale: gli invii Bitcoin di test si sbloccano.

**Agente:** i Sats non installano nodi. L'agente può leggere `node status` ma installare, aggiornare o disinstallare resta una scelta dell'utente.

---

## 6. Fase 1b: Esplora

1. Prerequisiti: `cargo`/`rustc` (versione minima dal `rust-toolchain` del repo), `clang`, `cmake`. Se mancano, bitcode dice esattamente cosa installare e si ferma (niente sudo).
2. Sorgente: `git clone` di Blockstream/electrs, checkout del **commit fissato** in `src/node/releases.json`; controllo che `git rev-parse HEAD` coincida.
3. Build: `cargo build --locked --release`, in `~/.bitcode/build/electrs-<commit>`; binario copiato in `~/.bitcode/bin/electrs-<commit>/`.
4. Servizio `bitcode-esplora-<rete>.service`, `After=` e `BindsTo=` il bitcoind della stessa rete; `--lightmode` su mainnet; `--http-addr 127.0.0.1:<porta>`; indice in `<datadir>/esplora/<rete>`.
5. Stato: altezza indicizzata vs altezza del nodo; il desktop lo considera pronto solo quando coincidono.
6. Aggiornare il commit fissato è una modifica revisionata in bitcode, come le chiavi.

---

## 7. Fase 2: Mutinynet (sperimentale)

- Compilazione del fork indicato da BlockSpaces/mutiny-net a un commit fissato, con lo stesso schema della fase 1b.
- `bitcoin.conf` con `signet=1` fuori dalla sezione, `[signet]` con `signetchallenge`, `addnode`, `dnsseed=0`, `signetblocktime=30` (da riverificare sulla documentazione del progetto prima di implementare).
- In CLI e desktop: badge «non verificato da Guix», con spiegazione.
- Opzionale: puntare i nodi RGB locali (kaleido) al bitcoind e all'Esplora locali invece di quelli remoti.

---

## 8. Test

**Unitari (senza rete)**
- Verifica firme con i file reali di 31.1 salvati come fixture: 10 valide, 1 scaduta ignorata, soglia rispettata.
- `SHA256SUMS` alterato di un byte → firme non valide → stop, nessun file estratto.
- Archivio alterato con firme valide → hash diverso → stop.
- Soglia non raggiunta (chiavi fidate ridotte a 2 con soglia 3) → stop.
- Versione bloccata (30.0) rifiutata; architettura non supportata rifiutata.
- Archivio con percorsi inattesi (`../`, link simbolici) rifiutato.
- Generazione di `bitcoin.conf` e delle unit systemd per ogni rete; nessuna sovrascrittura silenziosa.
- Controllo spazio: datadir con spazio insufficiente → errore con il numero mancante.
- Desktop: `node.install` rifiutato da origini non UI; approvazione obbligatoria.

**Prove reali**
- Signet: installazione completa, sincronizzazione completa, `bitcoin_rpc getblockchaininfo` da bitcode, Esplora indicizzato, invio di test dal desktop.
- Testnet4: installazione e avvio, sincronizzazione parziale.
- Mainnet completo e pruned: installazione, avvio, primi blocchi, arresto pulito (la sincronizzazione completa richiede giorni e resta fuori dalla prova).
- Riavvio del PC: i servizi ripartono; con e senza linger.

---

## 9. Stima e ordine di lavoro

| Passo | Stima |
|---|---|
| Scelta libreria PGP, fixture 31.1, chiavi fissate | 1 h |
| Download, verifica, installazione, conf, systemd (`src/node/`) | 2 h |
| CLI `bitcode node …` | 1 h |
| Desktop: metodi controller, approvazione, sezione Nodo | 1,5 h |
| Test e prova reale su signet | 1,5 h + sincronizzazione |
| Fase 1b Esplora | 2–3 h + compilazione e indicizzazione |
| Fase 2 Mutinynet | 1–2 h + compilazione |

---

## 10. Punti aperti

1. Libreria PGP: OpenPGP.js (LGPL) o verifica minima su `@noble/*`?
2. Soglia di firme: 3 come default va bene?
3. `loginctl enable-linger`: proporlo sempre o solo per mainnet?
4. Supporto testnet4 in Blockstream/electrs: da verificare; se manca, Esplora solo su signet e mainnet.
5. macOS: fuori da questo piano (niente systemd); da trattare dopo.
