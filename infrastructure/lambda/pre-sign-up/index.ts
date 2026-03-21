import { PreSignUpTriggerHandler } from 'aws-lambda';

// No username uniqueness check needed — email-only registration
export const handler: PreSignUpTriggerHandler = async (event) => {
  return event;
};
