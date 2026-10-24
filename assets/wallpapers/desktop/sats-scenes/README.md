# Sats scenes

Prototipo locale delle quattro sezioni Sats per bitcode. Aprire `index.html` nel browser oppure, da questa cartella, eseguire:

```sh
python3 -m http.server 4187 --bind 127.0.0.1
```

L'indirizzo è http://127.0.0.1:4187/. Nessuna compilazione o dipendenza runtime.

## Contenuto

- `index.html`: quattro sezioni in italiano con descrizioni e limiti ripresi dal sito esistente.
- `scenes.css`: composizioni responsive, prospettiva CSS 3D, luci, ombre, ingressi e oscillazione.
- `scenes.js`: parallasse al mouse e allo scroll, navigazione di sezione, pausa persistente e sospensione fuori schermo / scheda nascosta.
- `assets/`: quattro WebP trasparenti derivati dagli originali Sats (circa 553 KiB complessivi), font locali e licenze.

I personaggi sono immagini su piani in profondità, non modelli 3D ruotabili. La pagina non usa servizi esterni, tracking, WebGL o video.

## Accessibilità

Pausa movimento disponibile nell'intestazione; la preferenza resta nel browser. Le preferenze di sistema per il movimento ridotto prevalgono. Senza JavaScript le sezioni restano leggibili. Le illustrazioni sono decorative: nomi, ruoli e descrizioni sono testo HTML.

## Integrazione futura

Il sito principale non è stato modificato. Per integrare il prototipo, trasferire le quattro sezioni nel template del sito, adattare i percorsi degli asset e spostare i testi nei file i18n. Limitare gli stili globali al contenitore Sats; riutilizzare il controllo globale del movimento al posto di quello locale. Mantenere `transform-style: preserve-3d` su `.depth-scene` e applicare ritaglio/opacity al contenitore esterno, non al contenitore dei livelli 3D.
