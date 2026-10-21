# Bitcode Desktop: workbench

Stato delle funzioni del workbench di Bitcode Desktop: chat, pannelli di
progetto, pagine e integrazione con il sistema. Tutto è scritto per i vincoli
di Bitcode: worker isolato in bubblewrap, approvazioni sempre nella finestra,
pagamenti solo su rete di test, modelli locali come prima scelta. Solo Linux.

## Stato

Legenda: ✅ fatto · 🔜 prossima ondata · 🧭 più avanti · ⛔ escluso o da riprogettare.

### Shell desktop (Linux)

| Funzione | In Bitcode | Stato |
|---|---|---|
| Avvio all'accesso, chiusura nel tray | Impostazioni → Sistema, `--hidden` | ✅ |
| Tray con sessioni e richieste | Tray con attività e richieste (approvazione solo in finestra) | ✅ |
| Keep-awake | Automatico solo mentre un'attività è in corso | ✅ |
| Geometria finestra, recupero crash renderer | Ripristino su schermo valido; due ricariche, poi chiede | ✅ |
| Notifiche che aprono la sessione | Clic → chat o Attività | ✅ |
| CLI nel pacchetto | `/usr/bin/bitcode` con il Node dell'app | ✅ |
| Aggiornamenti | Controllo su richiesta in Sistema; installazione manuale con apt (piano 7A) | ✅ |
| Quake mode, scorciatoie globali, mini chat | Mini chat (con «tieni in primo piano»), quake mode; dove Wayland rifiuta le scorciatoie globali, una scorciatoia di sistema su `bitcode-desktop --quake` / `--mini-chat` | ✅ |

### Chat e sessioni

| Funzione | In Bitcode | Stato |
|---|---|---|
| Draft starters | Suggerimenti di coding + Bitcoin (wallet di test, sessione RGB) | ✅ |
| Command palette (Ctrl+P) | Azioni, pannelli, progetti, chat, archivio, comandi `/` | ✅ |
| Archivio sessioni | Archivia/ripristina, vista Archivio, scadenza invariata | ✅ |
| Cronologia input (↑/↓) | Prompt di questa chat | ✅ |
| Coda messaggi durante l'esecuzione | Invio durante un'attività → coda; parte dopo un esito riuscito | ✅ |
| Indicatore uso del contesto + compattazione | Chip ≈ token; clic → riassunto dei turni vecchi col modello della chat | ✅ |
| Rinomina con AI, sposta chat in altro progetto, fork | Menu ⋯ della chat | ✅ |
| Timeline e revert del turno | Timeline della chat; annulla le scritture di un turno se i file non sono cambiati dopo (i comandi shell non sono tracciati) | ✅ |
| Dialog output strumenti | Pulsante sotto le chiamate | ✅ |
| Todo dell'agente, traccia del ragionamento | Strumento `todo_write` nel worker (solo visualizzazione) e ragionamento in diretta dai provider compatibili OpenAI | ✅ |
| Menzione file `@` | Autocompletamento dai file del progetto | ✅ |
| Skill `$`, snippet `#` | `$skill` aggiunge le istruzioni della skill al messaggio; `#nome` inserisce uno snippet | ✅ |
| Goal di sessione | ◎ nel composer; aggiunto alle istruzioni di ogni esecuzione | ✅ |
| Multirun (stesso prompt a più modelli) | ⚖ Confronta modelli: chat parallele in modalità manuale, risposte affiancate | ✅ |
| Dettatura vocale | 🎙 nel composer: microfono → modello di trascrizione scelto in Impostazioni (compatibile OpenAI, anche locale); permesso solo audio per le finestre di Bitcode | ✅ (adattato) |

### Pannelli di progetto

| Funzione | In Bitcode | Stato |
|---|---|---|
| Files, Git, Terminale | Già presenti | ✅ |
| Changes (diff per file espandibile) | Pannello Modifiche | ✅ |
| Project knowledge (note, todo, piani) | Pannello Conoscenza; piani da `/plan` | ✅ |
| Git: branch, history, stash, push/pull | Cambio/creazione ramo, ↑↓ upstream, fetch/pull (ff-only)/push con conferma, cronologia e dettaglio commit, stash | ✅ |
| Files: quick open, vai alla riga, anteprima Markdown | File nella Ctrl+P, Ctrl+G, Anteprima per .md | ✅ |
| Walkthrough delle modifiche (LLM, su richiesta) | Pulsante nel pannello Modifiche, con conferma | ✅ |
| Browser e preview dei dev server locali | Pannello Anteprima: server su loopback, aperti nel browser di sistema (niente webview incorporata) | ✅ (adattato) |

### Pagine e impostazioni

| Funzione | In Bitcode | Stato |
|---|---|---|
| Stats (periodo, progetto, modello) | Statistiche da un registro locale delle esecuzioni | ✅ |
| Impostazioni con barra laterale e ricerca | Indice delle sezioni + filtro | ✅ |
| Agents, Commands, MCP, Skills | Libreria in sola lettura (si modificano i file condivisi con la CLI) | ✅ |
| Snippets, Magic prompts | Snippet in Impostazioni; i suggerimenti iniziali coprono i magic prompts | ✅ |
| Notifiche configurabili | Attività e approvazioni | ✅ |
| Scheduled tasks | Attività pianificate (ora, giorno, settimana) in chat manuali: le modifiche aspettano l'approvazione | ✅ |
| Integrations catalog | Integrazioni: server MCP scelti (KaleidoSwap RGB, GitHub, Context7, Playwright, …) aggiunti alla config condivisa | ✅ |
| Accesso remoto | Accesso remoto: modalità solo locale / solo SSH / LAN con password (HTTPS su un solo indirizzo locale, password scrypt, dal telefono solo chat: approvazioni e pagamenti restano sul desktop), con raccomandazione del Sat Hash applicata dall'utente; terminali SSH verso altri computer con la CLI bitcode | ✅ |
| Issues e PR/MR GitHub e GitLab | Vista Issue e PR dal remoto origin GitHub o GitLab (sola lettura, token facoltativo nel portachiavi), «Lavoraci» crea il prompt | ✅ |

## Ondata 1 (consegnata)

Suggerimenti, command palette, pannelli Modifiche e Conoscenza, Statistiche,
Archivio, cronologia dell'input. API nuove del controller: `usage.stats`,
`notes.get`, `notes.set` (solo origine umana), `plans.list`, campo `archived`
in `session.update`. Il registro `~/.bitcode/desktop/usage.jsonl` contiene una
riga per esecuzione conclusa: modello, progetto, stato e token, mai il testo.

## Ondata 2 (consegnata)

Coda dei messaggi, indicatore del contesto con compattazione, menu della chat
(rinomina con AI, duplica, sposta), menzioni `@file`, Git completo per l'uso
quotidiano, file nella command palette, vai alla riga, anteprima Markdown,
impostazioni con indice e ricerca, notifiche configurabili, libreria, output
degli strumenti, controllo aggiornamenti su richiesta. API nuove:
`session.fork|move|rename.ai|compact`, `fs.files`, `git.branches|checkout|log|show|stashes|stash|remote`,
`library.list`; le operazioni che modificano stato accettano solo origine umana.

## Ondata 3 (consegnata)

Timeline con annullamento del turno, walkthrough, obiettivo di sessione,
confronto tra modelli, attività pianificate, integrazioni MCP, snippet `#`,
skill `$`, pannello Anteprima. API nuove: `session.timeline`, `run.revert`,
`review.walkthrough`, `schedule.list|save|delete|runNow`, `mcp.catalog|add|remove`,
`skill.read`, `preview.servers` (processo principale).

## Verifica

Pacchetto `bitcode-desktop_0.2.0_amd64.deb` installato e provato con una home
isolata e la sandbox di Chromium attiva: avvio, command palette, esecuzione
dell'agente nel worker bubblewrap con scrittura di un file, Timeline con
annullamento, tutte le pagine, accesso LAN (login HTTPS dalla rete locale,
spegnimento con la modalità «Solo locale»), CLI `/usr/bin/bitcode` 0.3.0.
