/**
 * Validation schemas for session operations
 */

import Joi from 'joi';

/**
 * Validate list session operation (list history)
 */
export function validateListSession(args: unknown): {
  operation: 'list';
  limit?: number;
} {
  const schema = Joi.object({
    operation: Joi.string().valid('list').required(),
    limit: Joi.number().integer().min(1).max(50).optional()
  }).unknown(false);

  const { error, value } = schema.validate(args);
  if (error) {
    throw new Error(`Validation error: ${error.message}`);
  }

  return value;
}

/**
 * Validate get session operation (get context or variable)
 */
export function validateGetSession(args: unknown): {
  operation: 'get';
  key?: string;
  historyLimit?: number;
  includeResults?: boolean;
} {
  const schema = Joi.object({
    operation: Joi.string().valid('get').required(),
    key: Joi.string().min(1).optional(),
    historyLimit: Joi.number().integer().min(1).max(50).optional(),
    includeResults: Joi.boolean().optional()
  }).unknown(false);

  const { error, value } = schema.validate(args);
  if (error) {
    throw new Error(`Validation error: ${error.message}`);
  }

  return value;
}

/**
 * Validate create session operation (set new variable)
 */
export function validateCreateSession(args: unknown): {
  operation: 'create';
  key: string;
  value: unknown;
} {
  const schema = Joi.object({
    operation: Joi.string().valid('create').required(),
    key: Joi.string().min(1).required(),
    value: Joi.any().required()
  }).unknown(false);

  const { error, value } = schema.validate(args);
  if (error) {
    throw new Error(`Validation error: ${error.message}`);
  }

  return value;
}

/**
 * Validate update session operation (update variable)
 */
export function validateUpdateSession(args: unknown): {
  operation: 'update';
  key: string;
  value: unknown;
} {
  const schema = Joi.object({
    operation: Joi.string().valid('update').required(),
    key: Joi.string().min(1).required(),
    value: Joi.any().required()
  }).unknown(false);

  const { error, value } = schema.validate(args);
  if (error) {
    throw new Error(`Validation error: ${error.message}`);
  }

  return value;
}

/**
 * Validate delete session operation (clear context)
 */
export function validateDeleteSession(args: unknown): {
  operation: 'delete';
  scope?: 'variables' | 'history' | 'results' | 'all';
} {
  const schema = Joi.object({
    operation: Joi.string().valid('delete').required(),
    scope: Joi.string().valid('variables', 'history', 'results', 'all').optional()
  }).unknown(false);

  const { error, value } = schema.validate(args);
  if (error) {
    throw new Error(`Validation error: ${error.message}`);
  }

  return value;
}

