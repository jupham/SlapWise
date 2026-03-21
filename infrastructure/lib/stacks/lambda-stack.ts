import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';

export interface LambdaStackProps extends cdk.StackProps {
  table: dynamodb.Table;
  snsTopic: sns.Topic;
}

export class LambdaStack extends cdk.Stack {
  public readonly preSignUpFn: lambda.Function;
  public readonly postConfirmationFn: lambda.Function;
  public readonly createGroupFn: lambda.Function;
  public readonly joinGroupFn: lambda.Function;
  public readonly submitResolutionConfirmationFn: lambda.Function;
  public readonly confirmDeliveryFn: lambda.Function;
  public readonly recordGameCallFn: lambda.Function;
  public readonly leaveGroupFn: lambda.Function;
  public readonly notificationDispatcherFn: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { table, snsTopic } = props;

    const commonEnv = {
      TABLE_NAME: table.tableName,
      SNS_TOPIC_ARN: snsTopic.topicArn,
    };

    const lambdaDefaults = {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    } satisfies Partial<lambda.FunctionProps>;

    // Pre-sign-up trigger (username uniqueness check)
    this.preSignUpFn = new lambda.Function(this, 'PreSignUpFn', {
      ...lambdaDefaults,
      functionName: 'slap-tracker-pre-sign-up',
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/pre-sign-up')),
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantReadData(this.preSignUpFn);

    // Post-confirmation trigger (write player profile to DynamoDB)
    this.postConfirmationFn = new lambda.Function(this, 'PostConfirmationFn', {
      ...lambdaDefaults,
      functionName: 'slap-tracker-post-confirmation',
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/post-confirmation')),
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantWriteData(this.postConfirmationFn);

    // createGroup Lambda (invoked via API Gateway)
    this.createGroupFn = new lambda.Function(this, 'CreateGroupFn', {
      ...lambdaDefaults,
      functionName: 'slap-tracker-create-group',
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/create-group')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.createGroupFn);

    // joinGroup Lambda (invoked via API Gateway)
    this.joinGroupFn = new lambda.Function(this, 'JoinGroupFn', {
      ...lambdaDefaults,
      functionName: 'slap-tracker-join-group',
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/join-group')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.joinGroupFn);

    // submitResolutionConfirmation Lambda (AppSync resolver)
    this.submitResolutionConfirmationFn = new lambda.Function(this, 'SubmitResolutionConfirmationFn', {
      ...lambdaDefaults,
      functionName: 'slap-tracker-submit-resolution-confirmation',
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/submit-resolution-confirmation')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.submitResolutionConfirmationFn);
    snsTopic.grantPublish(this.submitResolutionConfirmationFn);

    // confirmDelivery Lambda (AppSync resolver)
    this.confirmDeliveryFn = new lambda.Function(this, 'ConfirmDeliveryFn', {
      ...lambdaDefaults,
      functionName: 'slap-tracker-confirm-delivery',
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/confirm-delivery')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.confirmDeliveryFn);
    snsTopic.grantPublish(this.confirmDeliveryFn);

    // recordGameCall Lambda (AppSync resolver)
    this.recordGameCallFn = new lambda.Function(this, 'RecordGameCallFn', {
      ...lambdaDefaults,
      functionName: 'slap-tracker-record-game-call',
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/record-game-call')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.recordGameCallFn);
    snsTopic.grantPublish(this.recordGameCallFn);

    // leaveGroup Lambda (AppSync resolver)
    this.leaveGroupFn = new lambda.Function(this, 'LeaveGroupFn', {
      ...lambdaDefaults,
      functionName: 'slap-tracker-leave-group',
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/leave-group')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.leaveGroupFn);
    snsTopic.grantPublish(this.leaveGroupFn);

    // notificationDispatcher Lambda
    this.notificationDispatcherFn = new lambda.Function(this, 'NotificationDispatcherFn', {
      ...lambdaDefaults,
      functionName: 'slap-tracker-notification-dispatcher',
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/notification-dispatcher')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.notificationDispatcherFn);
    snsTopic.grantPublish(this.notificationDispatcherFn);

    // Grant Pinpoint publish rights to notification dispatcher
    this.notificationDispatcherFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'mobiletargeting:SendMessages',
        'mobiletargeting:UpdateEndpoint',
        'mobiletargeting:GetEndpoint',
      ],
      resources: ['*'],
    }));
  }
}
