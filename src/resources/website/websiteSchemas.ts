/**
 * Website validation schemas
 */

import Joi from 'joi';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const batchOptionsSchema = Joi.object({
  maxConcurrent: Joi.number().min(1).max(50).optional(),
  continueOnError: Joi.boolean().optional(),
  dryRun: Joi.boolean().optional()
}).optional();

export function validateListWebsites(args: unknown) {
  const schema = Joi.object({
    operation: Joi.string().valid('list').required(),
    filter: Joi.string().optional(),
    size: Joi.number().min(1).max(1000).optional(),
    offset: Joi.number().min(0).optional(),
    fields: Joi.string().optional(),
    autoPaginate: Joi.boolean().optional(),
    collectorIds: Joi.string().optional()
  }).unknown(false);

  const { error, value } = schema.validate(args);
  if (error) {
    throw new McpError(ErrorCode.InvalidParams, `Validation error: ${error.message}`);
  }
  return value;
}

export function validateGetWebsite(args: unknown) {
  const schema = Joi.object({
    operation: Joi.string().valid('get').required(),
    id: Joi.number().optional(),
    websiteId: Joi.number().optional(),
    fields: Joi.string().optional()
  }).unknown(false);

  const { error, value } = schema.validate(args);
  if (error) {
    throw new McpError(ErrorCode.InvalidParams, `Validation error: ${error.message}`);
  }
  return value;
}

export function validateCreateWebsite(args: unknown) {
  const singleWebsiteSchema = Joi.object({
    name: Joi.string().required(),
    domain: Joi.string().required(),
    type: Joi.string().valid('webcheck', 'pingcheck').required(),
    groupId: Joi.number().required(),
    description: Joi.string().optional(),
    disableAlerting: Joi.boolean().optional(),
    stopMonitoring: Joi.boolean().optional(),
    useDefaultAlertSetting: Joi.boolean().optional(),
    useDefaultLocationSetting: Joi.boolean().optional(),
    pollingInterval: Joi.number().optional(),
    properties: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        value: Joi.string().required()
      })
    ).optional(),
    steps: Joi.array().items(
      Joi.object({
        type: Joi.string().optional(),
        name: Joi.string().optional(),
        description: Joi.string().allow('').optional(),
        enable: Joi.boolean().optional(),
        label: Joi.string().allow('').optional(),
        HTTPHeaders: Joi.string().allow('').optional(),
        followRedirection: Joi.boolean().optional(),
        HTTPBody: Joi.string().allow('').optional(),
        HTTPMethod: Joi.string().optional(),
        postDataEditType: Joi.any().optional(),
        fullpageLoad: Joi.boolean().optional(),
        requireAuth: Joi.boolean().optional(),
        auth: Joi.any().optional(),
        timeout: Joi.number().optional(),
        HTTPVersion: Joi.string().optional(),
        schema: Joi.string().optional(),
        url: Joi.string().allow('').optional(),
        matchType: Joi.string().optional(),
        keyword: Joi.string().allow('').optional(),
        path: Joi.string().allow('').optional(),
        invertMatch: Joi.boolean().optional(),
        statusCode: Joi.string().allow('').optional(),
        reqScript: Joi.string().allow('').optional(),
        reqType: Joi.string().optional(),
        respType: Joi.string().optional(),
        respScript: Joi.string().allow('').optional(),
        useDefaultRoot: Joi.boolean().optional()
      }).unknown(true)
    ).optional()
  }).unknown(true);

  const schema = Joi.object({
    operation: Joi.string().valid('create').required(),
    name: Joi.string().when('websites', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required()
    }),
    domain: Joi.string().when('websites', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required()
    }),
    type: Joi.string().valid('webcheck', 'pingcheck').when('websites', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required()
    }),
    groupId: Joi.number().when('websites', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required()
    }),
    description: Joi.string().optional(),
    disableAlerting: Joi.boolean().optional(),
    stopMonitoring: Joi.boolean().optional(),
    useDefaultAlertSetting: Joi.boolean().optional(),
    useDefaultLocationSetting: Joi.boolean().optional(),
    pollingInterval: Joi.number().optional(),
    properties: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        value: Joi.string().required()
      })
    ).optional(),
    steps: Joi.array().optional(),
    websites: Joi.array().items(singleWebsiteSchema).min(1).optional(),
    batchOptions: batchOptionsSchema
  }).unknown(true);

  const { error, value } = schema.validate(args);
  if (error) {
    throw new McpError(ErrorCode.InvalidParams, `Validation error: ${error.message}`);
  }
  return value;
}

export function validateUpdateWebsite(args: unknown) {
  const schema = Joi.object({
    operation: Joi.string().valid('update').required(),
    id: Joi.number().optional(),
    websiteId: Joi.number().optional(),
    name: Joi.string().optional(),
    description: Joi.string().optional(),
    disableAlerting: Joi.boolean().optional(),
    stopMonitoring: Joi.boolean().optional(),
    useDefaultAlertSetting: Joi.boolean().optional(),
    useDefaultLocationSetting: Joi.boolean().optional(),
    pollingInterval: Joi.number().optional(),
    properties: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        value: Joi.string().required()
      })
    ).optional(),
    websites: Joi.array().optional(),
    updates: Joi.object().optional(),
    applyToPrevious: Joi.string().optional(),
    filter: Joi.string().optional(),
    batchOptions: batchOptionsSchema
  }).unknown(true);

  const { error, value } = schema.validate(args);
  if (error) {
    throw new McpError(ErrorCode.InvalidParams, `Validation error: ${error.message}`);
  }
  return value;
}

export function validateDeleteWebsite(args: unknown) {
  const schema = Joi.object({
    operation: Joi.string().valid('delete').required(),
    id: Joi.number().optional(),
    websiteId: Joi.number().optional(),
    websites: Joi.array().optional(),
    applyToPrevious: Joi.string().optional(),
    filter: Joi.string().optional(),
    batchOptions: batchOptionsSchema
  }).unknown(false);

  const { error, value } = schema.validate(args);
  if (error) {
    throw new McpError(ErrorCode.InvalidParams, `Validation error: ${error.message}`);
  }
  return value;
}

