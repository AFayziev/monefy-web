import * as valibot from 'valibot';
import { createDb } from './db';
import { downloadDriveFile } from './google';
import { importCsv } from './import/run';
import { CsvFormatError } from './import/parse';
import { DriveFile } from './schemas';

const CSV_MIME_TYPE = 'text/csv';
const CSV_FILE_NAME = /\.csv$/i;

const isCsv = (file: DriveFile) =>
  file.mimeType === CSV_MIME_TYPE || CSV_FILE_NAME.test(file.name ?? '');

export async function handleImportQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  const db = createDb(env.DB);

  for (const message of batch.messages) {
    const parsed = valibot.safeParse(DriveFile, message.body);

    if (!parsed.success || !isCsv(parsed.output)) {
      console.log(JSON.stringify({ msg: 'skipped file', file: message.body }));
      message.ack();

      continue;
    }

    const file = parsed.output;

    let importId: number | undefined;

    try {
      importId = await db.imports.start(file.id, file.name ?? null);

      const csv = await downloadDriveFile(env.GOOGLE_SERVICE_ACCOUNT, file.id);
      const result = await importCsv(db, csv);

      await db.imports.finish(importId, result);

      console.log(JSON.stringify({ msg: 'import', file: file.name, ...result }));

      // The diff is recomputed against the database, so a follow-up pass resumes where this stopped.
      if (result.more) {
        await env.IMPORT_QUEUE.send(file);
      }

      message.ack();
    } catch (error) {
      console.error(
        JSON.stringify({ msg: 'import failed', file: file.name, error: String(error) }),
      );

      // Recording the failure is best effort: it must not abort the rest of the batch.
      try {
        if (importId !== undefined) {
          await db.imports.fail(importId, error);
        }
      } catch (recordError) {
        console.error(
          JSON.stringify({ msg: 'could not record failure', error: String(recordError) }),
        );
      }

      // A malformed file fails the same way every time, so don't retry it.
      if (error instanceof CsvFormatError) {
        message.ack();
      } else {
        message.retry();
      }
    }
  }
}
