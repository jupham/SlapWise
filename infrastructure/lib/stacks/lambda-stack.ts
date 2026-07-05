import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';

export interface LambdaStackProps extends cdk.StackProps {
  stage: string;
  table: dynamodb.Table;
  snsTopic: sns.Topic;
}

export class LambdaStack extends cdk.Stack {
  public readonly preSignUpFn: lambda.Function;
  public readonly postConfirmationFn: lambda.Function;
  public readonly createGroupFn: lambda.Function;
  public readonly joinGroupFn: lambda.Function;
  public readonly getGroupFn: lambda.Function;
  public readonly getGroupsFn: lambda.Function;
  public readonly deleteGroupFn: lambda.Function;
  public readonly createChallengeFn: lambda.Function;
  public readonly submitResolutionConfirmationFn: lambda.Function;
  public readonly confirmDeliveryFn: lambda.Function;
  public readonly recordGameCallFn: lambda.Function;
  public readonly regenerateInviteCodeFn: lambda.Function;
  public readonly voidDebtFn: lambda.Function;
  public readonly leaveGroupFn: lambda.Function;
  public readonly notificationDispatcherFn: lambda.Function;
  public readonly grogResolverFn: lambda.Function;
  public readonly confirmReadInFn: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { stage, table, snsTopic } = props;

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
      functionName: `${stage}-slap-tracker-pre-sign-up`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/pre-sign-up')),
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantReadData(this.preSignUpFn);

    // Post-confirmation trigger (write player profile to DynamoDB)
    this.postConfirmationFn = new lambda.Function(this, 'PostConfirmationFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-post-confirmation`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/post-confirmation')),
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantWriteData(this.postConfirmationFn);

    // createGroup Lambda (invoked via API Gateway)
    this.createGroupFn = new lambda.Function(this, 'CreateGroupFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-create-group`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/create-group')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.createGroupFn);

    // joinGroup Lambda (invoked via API Gateway)
    this.joinGroupFn = new lambda.Function(this, 'JoinGroupFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-join-group`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/join-group')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.joinGroupFn);

    // getGroup Lambda (invoked via API Gateway)
    this.getGroupFn = new lambda.Function(this, 'GetGroupFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-get-group`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/get-group')),
      environment: commonEnv,
    });
    table.grantReadData(this.getGroupFn);

    // getGroups Lambda (invoked via API Gateway — queries GSI1 for all groups the caller belongs to)
    this.getGroupsFn = new lambda.Function(this, 'GetGroupsFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-get-groups`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/get-groups')),
      environment: commonEnv,
    });
    table.grantReadData(this.getGroupsFn);

    // deleteGroup Lambda (invoked via API Gateway)
    this.deleteGroupFn = new lambda.Function(this, 'DeleteGroupFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-delete-group`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/delete-group')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.deleteGroupFn);

    // createChallenge Lambda (AppSync resolver — TransactWrite for GSI4 fan-out)
    this.createChallengeFn = new lambda.Function(this, 'CreateChallengeFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-create-challenge`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/create-challenge')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.createChallengeFn);

    // submitResolutionConfirmation Lambda (AppSync resolver)
    this.submitResolutionConfirmationFn = new lambda.Function(this, 'SubmitResolutionConfirmationFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-submit-resolution-confirmation`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/submit-resolution-confirmation')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.submitResolutionConfirmationFn);
    snsTopic.grantPublish(this.submitResolutionConfirmationFn);

    // confirmDelivery Lambda (AppSync resolver)
    this.confirmDeliveryFn = new lambda.Function(this, 'ConfirmDeliveryFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-confirm-delivery`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/confirm-delivery')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.confirmDeliveryFn);
    snsTopic.grantPublish(this.confirmDeliveryFn);

    // recordGameCall Lambda (AppSync resolver)
    this.recordGameCallFn = new lambda.Function(this, 'RecordGameCallFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-record-game-call`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/record-game-call')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.recordGameCallFn);
    snsTopic.grantPublish(this.recordGameCallFn);

    // regenerateInviteCode Lambda (AppSync resolver)
    this.regenerateInviteCodeFn = new lambda.Function(this, 'RegenerateInviteCodeFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-regenerate-invite-code`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/regenerate-invite-code')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.regenerateInviteCodeFn);

    // voidDebt Lambda (AppSync resolver — hard-delete DEBT + 2× PLAYERDEBT)
    this.voidDebtFn = new lambda.Function(this, 'VoidDebtFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-void-debt`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/void-debt')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.voidDebtFn);

    // leaveGroup Lambda (AppSync resolver)
    this.leaveGroupFn = new lambda.Function(this, 'LeaveGroupFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-leave-group`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/leave-group')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.leaveGroupFn);
    snsTopic.grantPublish(this.leaveGroupFn);

    // notificationDispatcher Lambda
    this.notificationDispatcherFn = new lambda.Function(this, 'NotificationDispatcherFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-notification-dispatcher`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/notification-dispatcher')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.notificationDispatcherFn);
    snsTopic.grantPublish(this.notificationDispatcherFn);

    // grogResolver Lambda (AppSync resolver — all grog mutations)
    this.grogResolverFn = new lambda.Function(this, 'GrogResolverFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-grog-resolver`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/grog-resolver')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.grogResolverFn);
    snsTopic.grantPublish(this.grogResolverFn);

    // confirmReadIn Lambda (AppSync resolver — sets isReadIn=true + notifies existing read-in players)
    this.confirmReadInFn = new lambda.Function(this, 'ConfirmReadInFn', {
      ...lambdaDefaults,
      functionName: `${stage}-slap-tracker-confirm-read-in`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../dist/lambda/confirm-read-in')),
      environment: commonEnv,
    });
    table.grantReadWriteData(this.confirmReadInFn);
    snsTopic.grantPublish(this.confirmReadInFn);

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
