import { appendFile } from 'node:fs/promises';

const temporaryFailures = new Set();

/** Records final delivery attempts for the spawned HTTP integration API. */
export async function sendPush(subscription, payload) {
  await appendFile(process.env.BORA_PUSH_TRANSPORT_LOG, `${JSON.stringify({ endpoint: subscription.endpoint, payload })}\n`);
  if (subscription.endpoint.includes('/stale')) throw Object.assign(new Error('stale subscription'), { statusCode: 410 });
  if (subscription.endpoint.includes('/temporary') && !temporaryFailures.has(subscription.endpoint)) {
    temporaryFailures.add(subscription.endpoint);
    throw new Error('temporary push provider failure');
  }
}
