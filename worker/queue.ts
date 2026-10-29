// Placeholder consumer: this is where the file will be fetched, parsed and stored.
export async function handleImportQueue(batch: MessageBatch<unknown>): Promise<void> {
  for (const message of batch.messages) {
    console.log(JSON.stringify({ msg: 'file received', file: message.body }));
    message.ack();
  }
}
