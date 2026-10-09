/**
 * A failed workflow run tells the team, instead of sitting in the Actions tab.
 *
 * Runs as the last step of a workflow with `if: failure()`. Reads the run's
 * identity from the GitHub environment and sends one plain email to
 * SALE_EMAILS from the Tour Archive Gmail. On 9 Oct 2026 every deploy
 * failed for a day and the site kept showing sold pieces for sale; nobody
 * was told. This is the fix for the "nobody was told" half.
 */
import { sendMail } from './lib/mail.mjs';

const { SALE_MAIL_USER, SALE_MAIL_PASS, SALE_EMAILS, GITHUB_WORKFLOW, GITHUB_RUN_ID, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_EVENT_NAME, GITHUB_SHA, FAILED_STEP } = process.env;
if (!SALE_MAIL_USER || !SALE_MAIL_PASS || !SALE_EMAILS) {
  console.log('mail not configured (SALE_MAIL_USER, SALE_MAIL_PASS, SALE_EMAILS); cannot alert');
  process.exitCode = 0;
} else {
  const url = `${GITHUB_SERVER_URL || 'https://github.com'}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
  const what = GITHUB_WORKFLOW || 'a workflow';
  const text = [
    `The GitHub job "${what}" failed${FAILED_STEP ? ` at the step "${FAILED_STEP}"` : ''}.`,
    '',
    what.toLowerCase().includes('deploy')
      ? 'Until a deploy succeeds the live site keeps whatever it last published, so pieces sold since may still show as for sale and new pieces may be missing.'
      : 'Until a sync run succeeds, sales and price changes may not reach the site or the other channel.',
    '',
    `Run: ${url}`,
    `Trigger: ${GITHUB_EVENT_NAME || '?'} · commit ${(GITHUB_SHA || '').slice(0, 7)}`,
    '',
    'What to do: open the run, read the red step, and tell Karen. A later run that succeeds clears the problem; nothing needs resetting.',
  ].join('\n');
  try {
    const rcpts = await sendMail({ user: SALE_MAIL_USER, pass: SALE_MAIL_PASS, to: SALE_EMAILS, subject: `Tour Archive: "${what}" failed`, text });
    console.log(`alert sent to ${rcpts.join(', ')}`);
  } catch (err) {
    console.log(`alert could not be sent: ${err.message}`);
    process.exitCode = 1;
  }
}
