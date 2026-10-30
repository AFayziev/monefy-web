import { sValidator } from '@hono/standard-validator';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ValidationTargets } from 'hono';

const HTTP_BAD_REQUEST = 400;

/** Validates a request part and answers 400 with the first issue's message when it fails. */
export const validate = <Target extends keyof ValidationTargets, Schema extends StandardSchemaV1>(
  target: Target,
  schema: Schema,
) =>
  sValidator(target, schema, (result, context) => {
    if (!result.success) {
      const [issue] = result.error;
      const path = issue?.path?.map((part) => (typeof part === 'object' ? part.key : part));

      return context.json(
        { error: `invalid ${target}`, field: path?.join('.'), message: issue?.message },
        HTTP_BAD_REQUEST,
      );
    }
  });
