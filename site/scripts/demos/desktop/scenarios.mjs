// Storyboards for the desktop recordings. Each step acts on the real app; captions
// describe what is on screen and become the WebVTT tracks of the site player.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MODEL = 'ollama/qwen3.6:35b-a3b';
const ollama = { model: MODEL, providers: { ollama: { maxOutputTokens: 8192 } } };

// RGB needs the local nodes from integrations/kaleido: the sender is the one kaleido-mcp
// points at in ~/.bitcode/config.json, the receiver answers at RECEIVER_NODE_URL.
const kaleido = () => JSON.parse(readFileSync(path.join(os.homedir(), '.bitcode/config.json'), 'utf8')).mcp.kaleido;
const rgbEnv = () => ({
  PATH: `${path.join(os.homedir(), '.local/local/bin')}:${process.env.PATH}`,
  RECEIVER_NODE_URL: process.env.RECEIVER_NODE_URL || 'http://localhost:3002',
  RGB_ASSET_ID: process.env.RGB_ASSET_ID,
});

const running = s => s.win.locator('.send.stop').count().then(n => n > 0);
const approval = s => s.win.locator('.approval').first();
const hasApproval = s => approval(s).count().then(n => n > 0);

// Approves every card the run raises, after a pause on its contents, until the run ends.
async function approveAll(s, { poster = false } = {}) {
  await s.until(async () => (await running(s)) || (await hasApproval(s)), { timeout: 30_000, label: 'run start' });
  for (;;) {
    await work(s, 8);
    if (!(await hasApproval(s))) return;
    const card = approval(s);
    await card.scrollIntoViewIfNeeded();
    const label = await card.getAttribute('aria-label');
    const kind = label.includes('file') ? 'file' : label.includes('RGB') ? 'payment' : 'command';
    s.approved = { ...s.approved, [kind]: (s.approved?.[kind] || 0) + 1 };
    if (kind === 'file') {
      s.caption('A proposed edit: read the diff, then approve it once.', 'Una modifica proposta: leggi il diff, poi approvala una volta.');
      if (poster) s.posterAt = s.now() + 1.5;
    } else if (kind === 'payment') {
      s.caption('Another change to the RGB node: it waits for its own yes.', 'Un’altra modifica al nodo RGB: aspetta il suo sì.');
    } else {
      s.caption('A command: it runs in the sandbox with no network, only after your yes.', 'Un comando: gira nella sandbox senza rete, solo dopo il tuo sì.');
    }
    await s.moveTo(card.locator('pre').first());
    await s.wait(2800);
    await s.click(card.getByRole('button', { name: /Approve once/i }), { pause: 500 });
    s.caption('Approved once. The agent continues.', 'Approvato una volta. L’agente continua.');
  }
}

// Settings are a label followed by its control.
const settingControl = (win, label) => win.getByText(label, { exact: true }).first().locator('xpath=following-sibling::*[1]');

// Lets the model work at `speed`, then stops on the next approval card or at the end of the run.
async function work(s, speed) {
  await s.until(async () => (await hasApproval(s)) || !(await running(s)), { speed, label: 'approval or end of run' });
}

export const scenarios = {
  'first-run': {
    title: 'Open it. Pick a local model.',
    model: MODEL,
    launch: { settings: {}, config: { providers: { ollama: { maxOutputTokens: 8192 } } }, project: 'invoice-kit' },
    provenance: 'Real bitcode Desktop build on its first launch with an empty, disposable configuration. The model list comes from the Ollama server running on the recording machine; the answer comes from that local model. Input is scripted with Playwright; the pointer is an overlay. Model thinking time plays back faster where the badge is shown.',
    async run(s) {
      const { win } = s;
      s.caption('First launch on Linux.', 'Primo avvio su Linux.');
      await s.wait(2200);
      s.caption('Pick a model: bitcode lists what this computer already serves.', 'Scegli un modello: bitcode elenca quelli che questo computer già serve.');
      await s.click(win.locator('.btn.pill', { hasText: /^Settings$/ }), { pause: 900 });
      await s.click(settingControl(win, 'Default model'), { pause: 1200 });
      s.caption('Memory needs are shown before you choose.', 'Prima di scegliere vedi quanta memoria serve.');
      await s.click(win.getByText('Only models that fit in memory'), { pause: 1400 });
      await s.click(win.getByText(MODEL.split('/')[1], { exact: true }).last(), { pause: 1200 });
      s.caption('Open a project folder.', 'Apri la cartella di un progetto.');
      await s.click(win.getByText('Open folder…').first(), { pause: 1200 });
      s.caption('Start from a suggestion, or type your own request.', 'Parti da un suggerimento o scrivi la tua richiesta.');
      await s.click(win.locator('.starter', { hasText: 'Explore the codebase' }), { pause: 900 });
      await s.click(win.getByRole('button', { name: /^Send$/i }));
      s.caption('Reading the project needs no approval. Changes and commands do.', 'Leggere il progetto non chiede approvazione. Modifiche e comandi sì.');
      await s.until(() => running(s), { timeout: 30_000, label: 'run start' });
      await s.until(async () => !(await running(s)), { speed: 8, label: 'end of run' });
      if (await hasApproval(s)) throw new Error('Exploration unexpectedly asked for approval');
      s.caption('The answer stays in this chat, on this computer.', 'La risposta resta in questa chat, su questo computer.');
      s.posterAt = s.now();
      await s.wait(4500);
    },
  },

  configuration: {
    title: 'Your models, your limits.',
    model: null,
    launch: { settings: { model: MODEL }, config: ollama, project: 'invoice-kit' },
    provenance: 'Real bitcode Desktop build with a disposable configuration. No model runs in this walkthrough; the model list comes from the Ollama server running on the recording machine. Input is scripted with Playwright; the pointer is an overlay.',
    async run(s) {
      const { win } = s;
      await s.wait(600);
      await s.click(win.getByText('Open folder…').first(), { pause: 900 });
      s.caption('Settings, on this computer only.', 'Impostazioni, solo su questo computer.');
      await s.click(win.getByRole('button', { name: /^Settings$/ }).last(), { pause: 1000 });
      s.caption('Each Sat can run its own model.', 'Ogni Sat può usare il suo modello.');
      await s.click(settingControl(win, 'Model for Hash'), { pause: 1100 });
      await s.click(win.getByText('gemma4:e4b', { exact: true }).last(), { pause: 1200 });
      s.caption('Local only: cloud models are refused, prompts stay here.', 'Solo locale: i modelli cloud sono rifiutati, i prompt restano qui.');
      await s.click(settingControl(win, 'Local models only'), { pause: 1600 });
      s.caption('Cloud keys, if you add any, go to the system keyring.', 'Le chiavi cloud, se ne aggiungi, vanno nel portachiavi di sistema.');
      await s.click(win.getByText('Provider credentials').first(), { pause: 2600 });
      s.caption('Remote access is off unless you turn it on.', 'L’accesso remoto è spento finché non lo accendi.');
      await s.click(win.getByText('Remote access').first(), { pause: 1800 });
      s.caption('With LAN access a phone can chat; approvals and payments stay on this computer.', 'Con l’accesso LAN il telefono può chattare; approvazioni e pagamenti restano su questo computer.');
      await s.click(win.getByText('LAN with password', { exact: true }).first(), { pause: 1200 });
      await s.moveTo(win.getByText(/approvals, payments/).first());
      await s.wait(3200);
      s.caption('Back in a chat: choose how much it may do on its own.', 'Di nuovo in chat: scegli quanto può fare da sola.');
      await s.click(win.getByText('New chat').first(), { pause: 900 });
      const mode = win.getByRole('combobox', { name: /mode/i });
      await s.click(mode, { pause: 300 });
      for (const value of ['manual', 'unattended', 'assisted']) { await mode.selectOption(value); await s.wait(1100); }
      s.posterAt = s.now();
      await s.wait(2000);
    },
  },
  features: {
    title: 'Every change waits for you.',
    model: MODEL,
    launch: { settings: { model: MODEL }, config: ollama, project: 'invoice-kit' },
    provenance: 'Real bitcode Desktop build, real local model through Ollama, real bubblewrap worker and a disposable copy of a small demo project. Input is scripted with Playwright; the pointer is an overlay. Model thinking time plays back faster where the badge is shown.',
    async run(s) {
      const { win } = s;
      await s.wait(900);
      s.caption('Open a project folder.', 'Apri la cartella di un progetto.');
      await s.click(win.getByRole('button', { name: /Open folder/i }).first(), { pause: 900 });
      s.caption('Manual mode: every change and command asks first.', 'Modalità manuale: ogni modifica e ogni comando chiedono prima.');
      await s.click(win.getByRole('combobox', { name: /mode/i }));
      await win.getByRole('combobox', { name: /mode/i }).selectOption('manual');
      await s.wait(700);
      s.caption('Describe the problem in plain words.', 'Descrivi il problema a parole.');
      await s.type(win.locator('#prompt'), 'npm test fails on amounts. Read src/amount.mjs and test/amount.test.mjs, then fix btcToSats without floating point.', { delay: 22 });
      await s.click(win.getByRole('button', { name: /^Send$/i }));
      s.caption('The agent reads the project inside an isolated sandbox.', 'L’agente legge il progetto in una sandbox isolata.');
      await approveAll(s, { poster: true });
      // The model's first fix is not always right; the recording keeps whatever happens
      // and asks again, as a person would, until the suite really passes.
      let passed = false;
      for (let round = 0; round < 3 && !passed; round++) {
        if (round) {
          s.caption('A test still fails. The agent reads the output and corrects its fix.', 'Un test fallisce ancora. L’agente legge l’output e corregge la sua modifica.');
          await s.type(win.locator('#prompt'), 'A test still fails. Fix btcToSats so every test passes.', { delay: 26 });
          await s.click(win.getByRole('button', { name: /^Send$/i }));
          await approveAll(s);
        }
        s.caption('Ask for the proof.', 'Chiedi la prova.');
        await s.type(win.locator('#prompt'), 'Run npm test and give me the result in one line.', { delay: 26 });
        await s.click(win.getByRole('button', { name: /^Send$/i }));
        await approveAll(s);
        try { passed = /\bfail 0\b/.test(execFileSync('node', ['--test'], { cwd: s.root, encoding: 'utf8', stdio: 'pipe' })); } catch { passed = false; }
        if (!passed) s.note(`Round ${round + 1}: node --test on the recorded project copy still failed; the walkthrough asked the agent again.`);
      }
      if (!passed) throw new Error('The recorded fix does not pass the tests');
      s.note('Checked after recording: node --test in the recorded project copy reports 0 failures.');
      if (s.approved.file && s.approved.command) s.caption('Tests pass. The edit and the test run each waited for a yes.', 'I test passano. La modifica e i test hanno aspettato ciascuno un sì.');
      else s.caption('Tests pass.', 'I test passano.');
      await s.wait(3000);
      s.caption('The Changes panel shows exactly what changed on disk.', 'Il pannello Modifiche mostra cosa è cambiato su disco.');
      await s.click(win.getByRole('button', { name: /^Changes$/i }), { pause: 900 });
      await s.click(win.getByRole('button', { name: /Expand all/i }), { pause: 600 });
      await s.wait(3500);
    },
  },
  rgb: {
    title: 'Send an RGB asset. Confirm it yourself.',
    model: MODEL,
    get launch() { return { settings: { model: MODEL }, config: { ...ollama, mcp: { kaleido: kaleido() } }, project: 'rgb-shop', env: rgbEnv() }; },
    provenance: 'Real bitcode Desktop build in an RGB session against two local RGB Lightning Nodes on a test network (the sender through kaleido-mcp, the receiver through the kaleido CLI in the app’s terminal). Real local model through Ollama; the payment is a real test-network transfer. Input is scripted with Playwright; the pointer is an overlay. Model thinking time and chain waits play back faster where the badge is shown.',
    async run(s) {
      const { win } = s;
      if (!process.env.RGB_ASSET_ID) throw new Error('Set RGB_ASSET_ID to the asset the sender holds');
      await s.wait(600);
      await s.click(win.getByText('Open folder…').first(), { pause: 900 });
      s.caption('An RGB session: bitcode first checks that the node runs on a test network.', 'Una sessione RGB: bitcode controlla prima che il nodo sia su una rete di test.');
      await s.click(win.locator('.starter', { hasText: 'RGB session' }), { pause: 500 });
      await s.click(win.getByRole('button', { name: /^Send$/i }), { pause: 2600 });
      s.caption('Ask in plain words. Reading balances needs no approval.', 'Chiedi a parole. Leggere i saldi non chiede approvazione.');
      await s.type(win.locator('#prompt'), 'Which RGB assets does my node hold, and how much of each?', { delay: 26 });
      await s.click(win.getByRole('button', { name: /^Send$/i }));
      await s.until(() => running(s), { timeout: 30_000, label: 'run start' });
      await s.until(async () => !(await running(s)) || (await hasApproval(s)), { speed: 8, label: 'balances' });
      if (await hasApproval(s)) throw new Error('Reading balances unexpectedly asked for approval');
      await s.wait(2500);
      s.mark('request');
      s.caption('The receiving test node issues an invoice, here in the app’s terminal.', 'Il nodo di test che riceve emette una fattura, qui nel terminale dell’app.');
      await s.click(win.getByRole('button', { name: 'Terminal', exact: true }), { pause: 900 });
      await win.locator('.xterm-helper-textarea').first().pressSequentially(`./receive.sh ${process.env.RGB_AMOUNT || '5'}\n`, { delay: 45 });
      await s.wait(3500);
      s.caption('Ask bitcode to pay it.', 'Chiedi a bitcode di pagarla.');
      await s.click(win.locator('#prompt'));
      await s.type(win.locator('#prompt'), 'Pay the RGB invoice saved in invoice.json.', { delay: 26 });
      await s.click(win.getByRole('button', { name: /^Send$/i }));
      await s.until(() => running(s), { timeout: 30_000, label: 'run start' });
      await work(s, 8);
      if (!(await hasApproval(s))) throw new Error('The payment run ended without a payment card');
      const card = approval(s);
      await card.scrollIntoViewIfNeeded();
      if (!(await card.getAttribute('aria-label')).includes('RGB')) throw new Error('First card is not an RGB payment');
      s.mark('card');
      s.caption('Nothing is signed yet: the card spells out amount, asset, recipient and network.', 'Niente è ancora firmato: la card dice importo, asset, destinatario e rete.');
      await s.moveTo(card.locator('.readback').first());
      s.posterAt = s.now() + 1;
      await s.wait(4200);
      await s.click(card.getByRole('button', { name: /Approve once/i }), { pause: 600 });
      s.caption('Approved once. The node sends on the test network.', 'Approvato una volta. Il nodo invia sulla rete di test.');
      s.mark('approved');
      await approveAll(s);
      await s.wait(2500);
      s.caption('The receiver settles the transfer.', 'Chi riceve assesta il trasferimento.');
      await win.locator('.xterm-helper-textarea').first().pressSequentially('./receive.sh refresh\n', { delay: 45 });
      await s.wait(4000);
      s.caption('The RGB tab, read through Tether WDK, lists the transfer.', 'La scheda RGB, letta tramite Tether WDK, mostra il trasferimento.');
      await s.click(win.getByText('Bitcoin', { exact: true }).first(), { pause: 900 });
      await s.click(win.getByRole('tab', { name: /RGB/ }), { pause: 600 });
      await s.until(() => win.locator('text=/settled|Settled/').count().then(n => n > 0), { speed: 4, timeout: 180_000, label: 'settled transfer' });
      s.mark('settled');
      await s.wait(4000);
    },
  },

  // A short silent loop for the desktop section: the workbench around the chat.
  workspace: {
    title: 'The workbench around the chat.',
    model: null,
    launch: { settings: { model: MODEL }, config: ollama, project: 'invoice-kit' },
    provenance: 'Real bitcode Desktop build with a disposable configuration and project copy; the terminal is the app’s own PTY. Input is scripted with Playwright; the pointer is an overlay.',
    async run(s) {
      const { win } = s;
      await s.click(win.getByText('Open folder…').first(), { pause: 600 });
      s.loopFrom = s.now();
      await s.wait(900);
      await s.click(win.getByRole('button', { name: 'Files', exact: true }), { pause: 700 });
      await s.click(win.getByText(/^\W*src$/).first(), { pause: 400 });
      await s.click(win.getByText(/^\W*amount\.mjs$/).first(), { pause: 1800 });
      await s.click(win.getByText('Git', { exact: true }).last(), { pause: 1800 });
      await s.click(win.getByText('Terminal', { exact: true }).last(), { pause: 900 });
      await win.locator('.xterm-helper-textarea').first().pressSequentially('git log --oneline && ls src\n', { delay: 45 });
      await s.wait(1800);
      await s.click(win.getByText('×', { exact: true }).last(), { pause: 1200 });
      s.loopTo = s.now();
    },
  },
};
