/**
 * Send one email through Gmail's SMTP, with nothing but Node's TLS socket.
 *
 * The sync job runs without an npm install, so no mailer dependency: this is
 * the dozen SMTP lines Gmail needs (implicit TLS on 465, AUTH PLAIN with an
 * App Password, one DATA block). Plain text only; that is all a sale notice
 * needs and it lands in every inbox.
 */
import { connect } from 'node:tls';

export function sendMail({ user, pass, to, subject, text, from = user }) {
  const rcpts = (Array.isArray(to) ? to : String(to).split(/[,;\s]+/)).map((s) => s.trim()).filter(Boolean);
  if (!rcpts.length) throw new Error('no recipients');
  return new Promise((resolve, reject) => {
    const sock = connect({ host: 'smtp.gmail.com', port: 465, servername: 'smtp.gmail.com' });
    let buf = '';
    const steps = [];
    const expect = (code, line) => new Promise((res, rej) => steps.push({ code, line, res, rej }));
    const fail = (err) => { clearTimeout(timer); try { sock.destroy(); } catch { /* closed */ } reject(err); };
    // Never let a silent server hold the sync job: 25 s for the whole exchange.
    const timer = setTimeout(() => fail(new Error(`SMTP timed out waiting after "${steps[0]?.line || 'connect'}"; buffered: ${buf.trim().slice(0, 120)}`)), 25_000);
    sock.on('close', () => { if (steps.length) fail(new Error(`SMTP connection closed waiting after "${steps[0].line}"; buffered: ${buf.trim().slice(0, 120)}`)); });
    sock.setEncoding('utf8');
    sock.on('error', fail);
    sock.on('data', (chunk) => {
      buf += chunk;
      // A reply is lines of "250-…" ending with one "250 …" (space, not
      // hyphen). Walk complete lines; the final line closes the reply.
      for (;;) {
        const lines = buf.split('\r\n');
        lines.pop(); // whatever follows the last CRLF is not a complete line yet
        const end = lines.findIndex((l) => /^\d{3} /.test(l));
        if (end < 0) break;
        const reply = lines.slice(0, end + 1).join('\r\n') + '\r\n';
        buf = buf.slice(reply.length);
        const step = steps.shift();
        if (!step) break;
        if (reply.startsWith(String(step.code))) step.res(reply);
        else step.rej(new Error(`SMTP expected ${step.code} after "${step.line}", got: ${reply.trim().slice(0, 160)}`));
      }
    });
    const send = (line, code) => { const p = expect(code, line.startsWith('AUTH') ? 'AUTH' : line); sock.write(line + '\r\n'); return p; };
    const date = new Date().toUTCString();
    const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@tourarchive.us>`;
    const message = [
      `From: Tour Archive <${from}>`,
      `To: ${rcpts.join(', ')}`,
      `Subject: ${subject.replace(/[\r\n]+/g, ' ')}`,
      `Date: ${date}`,
      `Message-ID: ${msgId}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..'),
      '.',
    ].join('\r\n');
    (async () => {
      await expect(220, 'greeting');
      await send('EHLO tourarchive.us', 250);
      await send(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`).toString('base64')}`, 235);
      await send(`MAIL FROM:<${from}>`, 250);
      for (const r of rcpts) await send(`RCPT TO:<${r}>`, 250);
      await send('DATA', 354);
      await send(message, 250);
      await send('QUIT', 221);
      clearTimeout(timer);
      sock.end();
      resolve(rcpts);
    })().catch(fail);
  });
}
