#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CognitoStack } from '../lib/stacks/cognito-stack';
import { DynamoStack } from '../lib/stacks/dynamo-stack';
import { NotificationsStack } from '../lib/stacks/notifications-stack';
import { LambdaStack } from '../lib/stacks/lambda-stack';
import { AppSyncStack } from '../lib/stacks/appsync-stack';
import { ApiGatewayStack } from '../lib/stacks/apigateway-stack';

const app = new cdk.App();

// Stage is passed via CDK context: -c stage=dev|test|prod (defaults to dev)
const stage = (app.node.tryGetContext('stage') as string | undefined) ?? 'dev';

// Tag all resources in every stack for cost tracking
cdk.Tags.of(app).add('Project', 'SlapTracker');
cdk.Tags.of(app).add('Stage', stage);
cdk.Tags.of(app).add('ManagedBy', 'CDK');

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const dynamoStack = new DynamoStack(app, `${stage}-SlapTrackerDynamoStack`, { env, stage });

const notificationsStack = new NotificationsStack(app, `${stage}-SlapTrackerNotificationsStack`, { env, stage });

const lambdaStack = new LambdaStack(app, `${stage}-SlapTrackerLambdaStack`, {
  env,
  stage,
  table: dynamoStack.table,
  snsTopic: notificationsStack.snsTopic,
});

const cognitoStack = new CognitoStack(app, `${stage}-SlapTrackerCognitoStack`, {
  env,
  stage,
  preSignUpFn: lambdaStack.preSignUpFn,
  postConfirmationFn: lambdaStack.postConfirmationFn,
});

const appSyncStack = new AppSyncStack(app, `${stage}-SlapTrackerAppSyncStack`, {
  env,
  stage,
  table: dynamoStack.table,
  userPool: cognitoStack.userPool,
  lambdaStack,
});

const apiGatewayStack = new ApiGatewayStack(app, `${stage}-SlapTrackerApiGatewayStack`, {
  env,
  stage,
  userPool: cognitoStack.userPool,
  createGroupFn: lambdaStack.createGroupFn,
  joinGroupFn: lambdaStack.joinGroupFn,
  getGroupFn: lambdaStack.getGroupFn,
  deleteGroupFn: lambdaStack.deleteGroupFn,
});

// Ensure stacks are deployed in the right order
lambdaStack.addDependency(dynamoStack);
lambdaStack.addDependency(notificationsStack);
cognitoStack.addDependency(lambdaStack);
appSyncStack.addDependency(cognitoStack);
appSyncStack.addDependency(lambdaStack);
apiGatewayStack.addDependency(cognitoStack);
apiGatewayStack.addDependency(lambdaStack);
